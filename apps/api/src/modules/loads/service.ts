import type pg from "pg";
import { LOAD_ACTIONS, type LoadAction, type LoadStatus } from "@doxin/shared";
import { query, withTransaction } from "../../db/index.js";
import { badRequest, conflict, notFound, unprocessable } from "../../lib/errors.js";
import { paginate, pageResult, type Pagination } from "../../lib/pagination.js";
import { toCamel } from "../../lib/crud.js";

export interface LoadListQuery extends Pagination {
  status?: string;
  customerId?: string;
  driverId?: string;
  bookingType?: string;
  from?: string;
  to?: string;
  unassigned?: string | boolean;
  exceptions?: string | boolean;
}

const LIST_SELECT = `
  l.load_id, l.customer_id, c.customer_name, l.route_id,
  r.origin_city, r.origin_state, r.destination_city, r.destination_state, r.typical_distance_miles,
  l.load_date, l.load_type, l.weight_lbs, l.pieces, l.revenue, l.fuel_surcharge, l.accessorial_charges,
  (l.revenue + l.fuel_surcharge + l.accessorial_charges) AS total_revenue,
  l.load_status, l.booking_type, l.target_delivery_date, l.exception_reason, l.notes,
  l.assigned_at, l.dispatched_at, l.delivered_at, l.completed_at, l.created_at,
  t.trip_id, t.driver_id, (d.first_name || ' ' || d.last_name) AS driver_name,
  t.truck_id, tr.unit_number AS truck_unit, t.trailer_id, t.dispatch_date,
  t.actual_distance_miles, t.trip_status, t.idle_time_hours, t.average_mpg,
  pickup.scheduled_datetime AS pickup_scheduled, pickup.actual_datetime AS pickup_actual, pickup.on_time_flag AS pickup_on_time,
  delivery.scheduled_datetime AS delivery_scheduled, delivery.actual_datetime AS delivery_actual, delivery.on_time_flag AS delivery_on_time,
  COALESCE(fuel.fuel_cost, 0) AS fuel_cost
`;

const LIST_FROM = `
  FROM loads l
  JOIN customers c ON c.customer_id = l.customer_id
  JOIN routes r ON r.route_id = l.route_id
  LEFT JOIN trips t ON t.load_id = l.load_id
  LEFT JOIN drivers d ON d.driver_id = t.driver_id
  LEFT JOIN trucks tr ON tr.truck_id = t.truck_id
  LEFT JOIN LATERAL (
    SELECT scheduled_datetime, actual_datetime, on_time_flag
    FROM delivery_events e WHERE e.load_id = l.load_id AND e.event_type = 'Pickup'
    ORDER BY e.created_at ASC LIMIT 1
  ) pickup ON true
  LEFT JOIN LATERAL (
    SELECT scheduled_datetime, actual_datetime, on_time_flag
    FROM delivery_events e WHERE e.load_id = l.load_id AND e.event_type = 'Delivery'
    ORDER BY e.created_at DESC LIMIT 1
  ) delivery ON true
  LEFT JOIN (
    SELECT fp.trip_id, sum(fp.total_cost) AS fuel_cost FROM fuel_purchases fp GROUP BY fp.trip_id
  ) fuel ON fuel.trip_id = t.trip_id
`;

const SORT: Record<string, string> = {
  loadDate: "l.load_date",
  createdAt: "l.created_at",
  revenue: "total_revenue",
  status: "l.load_status",
  customer: "c.customer_name",
  delivery: "delivery.scheduled_datetime",
};

function buildWhere(filters: LoadListQuery) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: (i: number) => string, value: unknown) => {
    params.push(value);
    where.push(sql(params.length));
  };
  if (filters.status && filters.status !== "ALL") {
    if (filters.status === "ACTIVE") {
      where.push("l.load_status IN ('BOOKED','PLANNED','DISPATCHED','IN_TRANSIT','EXCEPTION')");
    } else if (filters.status === "HISTORY") {
      where.push("l.load_status IN ('COMPLETED','CANCELLED','DELIVERED')");
    } else {
      add((i) => `l.load_status = $${i}`, filters.status);
    }
  }
  if (filters.customerId) add((i) => `l.customer_id = $${i}`, filters.customerId);
  if (filters.bookingType && filters.bookingType !== "ALL") add((i) => `l.booking_type = $${i}`, filters.bookingType);
  if (filters.from) add((i) => `l.load_date >= $${i}`, filters.from);
  if (filters.to) add((i) => `l.load_date <= $${i}`, filters.to);
  if (filters.driverId) add((i) => `t.driver_id = $${i}`, filters.driverId);
  if (filters.unassigned === "true" || filters.unassigned === true) {
    where.push("t.trip_id IS NULL AND l.load_status IN ('DRAFT','BOOKED','PLANNED')");
  }
  if (filters.exceptions === "true" || filters.exceptions === true) {
    where.push("l.load_status = 'EXCEPTION'");
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    const i = params.length;
    where.push(
      `(l.load_id ILIKE $${i} OR c.customer_name ILIKE $${i} OR t.trip_id ILIKE $${i}
        OR r.origin_city ILIKE $${i} OR r.destination_city ILIKE $${i} OR d.last_name ILIKE $${i})`,
    );
  }
  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

export async function listLoads(filters: LoadListQuery) {
  const { whereSql, params } = buildWhere(filters);
  const sort = SORT[filters.sort ?? ""] ?? "l.load_date";
  const order = filters.order === "asc" ? "ASC" : "DESC";
  const { limit, offset } = paginate(filters);
  const sql = `SELECT ${LIST_SELECT} ${LIST_FROM} ${whereSql}
    ORDER BY ${sort} ${order}, l.load_id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const countSql = `SELECT count(*)::int AS total ${LIST_FROM} ${whereSql}`;
  const rows = await query(sql, [...params, limit, offset]);
  const count = await query(countSql, params);
  return pageResult(rows.rows.map((r) => toCamel(r)), count.rows[0]?.total ?? 0, filters);
}

export async function getLoadDetail(id: string): Promise<Record<string, unknown>> {
  const { rows } = await query(`SELECT ${LIST_SELECT} ${LIST_FROM} WHERE l.load_id = $1`, [id]);
  if (!rows[0]) throw notFound("Load");
  const load = toCamel<Record<string, unknown>>(rows[0]);
  const events = await query(
    `SELECT e.event_id, e.event_type, e.facility_id, f.facility_name, e.scheduled_datetime, e.actual_datetime,
            e.detention_minutes, e.on_time_flag, e.location_city, e.location_state, e.notes
     FROM delivery_events e LEFT JOIN facilities f ON f.facility_id = e.facility_id
     WHERE e.load_id = $1 ORDER BY e.created_at ASC`,
    [id],
  );
  const fuel = await query(
    `SELECT fuel_purchase_id, purchase_date, location_city, location_state, gallons, price_per_gallon, total_cost
     FROM fuel_purchases WHERE trip_id = (SELECT trip_id FROM trips WHERE load_id = $1) ORDER BY purchase_date DESC`,
    [id],
  );
  const incidents = await query(
    `SELECT incident_id, incident_date, incident_type, claim_amount, injury_flag, status
     FROM safety_incidents WHERE trip_id = (SELECT trip_id FROM trips WHERE load_id = $1) ORDER BY incident_date DESC`,
    [id],
  );
  const trip = await query(
    `SELECT t.*, d.first_name || ' ' || d.last_name AS driver_name, d.phone AS driver_phone,
            tr.unit_number AS truck_unit, tr.make AS truck_make, tr.current_odometer,
            tl.trailer_number, tl.trailer_type
     FROM trips t LEFT JOIN drivers d ON d.driver_id = t.driver_id
     LEFT JOIN trucks tr ON tr.truck_id = t.truck_id
     LEFT JOIN trailers tl ON tl.trailer_id = t.trailer_id
     WHERE t.load_id = $1`,
    [id],
  );
  const timeline = await query(
    `SELECT a.id, a.action, a.actor_name, a.details, a.created_at
     FROM audit_logs a WHERE a.entity_type = 'load' AND a.entity_id = $1 ORDER BY a.created_at DESC LIMIT 30`,
    [id],
  );
  return {
    ...load,
    events: events.rows.map((r) => toCamel(r)),
    fuelPurchases: fuel.rows.map((r) => toCamel(r)),
    incidents: incidents.rows.map((r) => toCamel(r)),
    trip: trip.rows[0] ? toCamel(trip.rows[0]) : null,
    timeline: timeline.rows.map((r) => toCamel(r)),
  };
}

export interface CreateLoadInput {
  customerId: string;
  routeId: string;
  loadDate?: string;
  loadType?: string;
  weightLbs?: number;
  pieces?: number;
  revenue?: number;
  fuelSurcharge?: number;
  accessorialCharges?: number;
  bookingType?: "Spot" | "Contract" | "Dedicated";
  poNumber?: string;
  notes?: string;
  targetDeliveryDate?: string;
  book?: boolean;
}

export async function createLoad(input: CreateLoadInput, userId: string) {
  return withTransaction(async (client) => {
    const customer = await client.query<{ account_status: string; customer_type: string; credit_terms_days: number }>(
      "SELECT account_status, customer_type, credit_terms_days FROM customers WHERE customer_id = $1",
      [input.customerId],
    );
    if (!customer.rows[0]) throw badRequest("Select a valid customer");
    if (customer.rows[0].account_status !== "Active") throw unprocessable("This customer account is inactive");

    const route = await client.query<{
      typical_distance_miles: number;
      base_rate_per_mile: string;
      fuel_surcharge_rate: string;
      typical_transit_days: number;
      is_active: boolean;
    }>("SELECT * FROM routes WHERE route_id = $1", [input.routeId]);
    const r = route.rows[0];
    if (!r) throw badRequest("Select a valid lane");
    if (!r.is_active) throw unprocessable("This lane is inactive");

    const loadDate = input.loadDate ?? new Date().toISOString().slice(0, 10);
    const distance = r.typical_distance_miles;
    const revenue = input.revenue ?? Math.round(distance * Number(r.base_rate_per_mile) * 100) / 100;
    const fuelSurcharge =
      input.fuelSurcharge ?? Math.round(distance * Number(r.fuel_surcharge_rate) * 100) / 100;
    const target =
      input.targetDeliveryDate ??
      new Date(new Date(`${loadDate}T00:00:00Z`).getTime() + r.typical_transit_days * 86_400_000)
        .toISOString()
        .slice(0, 10);

    const { rows } = await client.query(
      `INSERT INTO loads (customer_id, route_id, load_date, load_type, weight_lbs, pieces, revenue,
                          fuel_surcharge, accessorial_charges, booking_type, po_number, notes,
                          target_delivery_date, load_status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING load_id`,
      [
        input.customerId,
        input.routeId,
        loadDate,
        input.loadType ?? "Dry Van",
        input.weightLbs ?? null,
        input.pieces ?? null,
        revenue,
        fuelSurcharge,
        input.accessorialCharges ?? 0,
        input.bookingType ?? customer.rows[0].customer_type,
        input.poNumber ?? null,
        input.notes ?? null,
        target,
        input.book ? "BOOKED" : "DRAFT",
        userId,
      ],
    );
    const loadId = rows[0]!.load_id as string;
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'CREATE', 'load', $2, $3)`,
      [userId, loadId, JSON.stringify({ status: input.book ? "BOOKED" : "DRAFT", revenue })],
    );
    return getLoadDetailTx(client, loadId);
  });
}

async function getLoadDetailTx(client: pg.PoolClient, id: string) {
  const { rows } = await client.query(`SELECT ${LIST_SELECT} ${LIST_FROM} WHERE l.load_id = $1`, [id]);
  return toCamel(rows[0]!);
}

export interface PlanInput {
  driverId: string;
  truckId: string;
  trailerId: string;
}

async function assertResourcesAvailable(client: pg.PoolClient, input: PlanInput, loadId: string) {
  const driver = await client.query<{ employment_status: string }>(
    "SELECT employment_status FROM drivers WHERE driver_id = $1",
    [input.driverId],
  );
  if (!driver.rows[0]) throw badRequest("Select a valid driver");
  if (driver.rows[0].employment_status !== "Active") throw unprocessable("Driver is not active");

  const truck = await client.query<{ status: string }>("SELECT status FROM trucks WHERE truck_id = $1", [input.truckId]);
  if (!truck.rows[0]) throw badRequest("Select a valid truck");
  if (truck.rows[0].status !== "Active") throw unprocessable("Truck is not available");

  const trailer = await client.query<{ status: string }>("SELECT status FROM trailers WHERE trailer_id = $1", [
    input.trailerId,
  ]);
  if (!trailer.rows[0]) throw badRequest("Select a valid trailer");
  if (trailer.rows[0].status !== "Active") throw unprocessable("Trailer is not available");

  const busy = await client.query(
    `SELECT t.trip_id, t.load_id FROM trips t
     JOIN loads l ON l.load_id = t.load_id
     WHERE t.load_id <> $4
       AND t.trip_status IN ('PLANNED','DISPATCHED','IN_TRANSIT')
       AND (t.driver_id = $1 OR t.truck_id = $2 OR t.trailer_id = $3)
     LIMIT 1`,
    [input.driverId, input.truckId, input.trailerId, loadId],
  );
  if (busy.rows[0]) {
    throw conflict("One of the selected resources is already assigned to an active trip", {
      tripId: busy.rows[0].trip_id,
      loadId: busy.rows[0].load_id,
    });
  }
}

export async function updateLoad(
  id: string,
  input: Partial<CreateLoadInput> & { notes?: string; targetDeliveryDate?: string; loadType?: string; weightLbs?: number; pieces?: number; poNumber?: string },
) {
  return withTransaction(async (client) => {
    const current = await client.query<{ load_status: string }>("SELECT load_status FROM loads WHERE load_id = $1 FOR UPDATE", [id]);
    if (!current.rows[0]) throw notFound("Load");
    if (!["DRAFT", "BOOKED", "PLANNED"].includes(current.rows[0].load_status)) {
      throw unprocessable("Commercial fields can only be edited before dispatch");
    }
    const fields: Record<string, unknown> = {};
    if (input.customerId) fields.customer_id = input.customerId;
    if (input.routeId) fields.route_id = input.routeId;
    if (input.loadDate) fields.load_date = input.loadDate;
    if (input.loadType) fields.load_type = input.loadType;
    if (input.weightLbs !== undefined) fields.weight_lbs = input.weightLbs;
    if (input.pieces !== undefined) fields.pieces = input.pieces;
    if (input.revenue !== undefined) fields.revenue = input.revenue;
    if (input.fuelSurcharge !== undefined) fields.fuel_surcharge = input.fuelSurcharge;
    if (input.accessorialCharges !== undefined) fields.accessorial_charges = input.accessorialCharges;
    if (input.bookingType) fields.booking_type = input.bookingType;
    if (input.poNumber !== undefined) fields.po_number = input.poNumber;
    if (input.notes !== undefined) fields.notes = input.notes;
    if (input.targetDeliveryDate !== undefined) fields.target_delivery_date = input.targetDeliveryDate;
    const cols = Object.keys(fields);
    if (cols.length) {
      const sets = cols.map((c, i) => `${c} = $${i + 1}`);
      await client.query(
        `UPDATE loads SET ${sets.join(", ")}, updated_at = now() WHERE load_id = $${cols.length + 1}`,
        [...cols.map((c) => fields[c]), id],
      );
    }
    return getLoadDetailTx(client, id);
  });
}

export interface ActionInput {
  action: LoadAction;
  driverId?: string;
  truckId?: string;
  trailerId?: string;
  reason?: string;
  notes?: string;
}

export async function transitionLoad(id: string, input: ActionInput, actor: { id: string; name: string }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ load_status: LoadStatus }>(
      "SELECT load_status FROM loads WHERE load_id = $1 FOR UPDATE",
      [id],
    );
    const load = rows[0];
    if (!load) throw notFound("Load");
    const rule = LOAD_ACTIONS[input.action];
    if (!rule) throw badRequest("Unknown action");
    if (!rule.from.includes(load.load_status)) {
      throw unprocessable(`Cannot ${input.action.replaceAll("_", " ")} a load that is ${load.load_status.toLowerCase()}`, {
        currentStatus: load.load_status,
        allowedActions: Object.entries(LOAD_ACTIONS)
          .filter(([, r]) => r.from.includes(load.load_status))
          .map(([name]) => name),
      });
    }

    const trip = await client.query<{ trip_id: string; trip_status: string }>(
      "SELECT trip_id, trip_status FROM trips WHERE load_id = $1",
      [id],
    );
    const existingTrip = trip.rows[0];
    let newStatus: LoadStatus = rule.to;

    switch (input.action) {
      case "book": {
        const customer = await client.query<{ account_status: string }>(
          `SELECT c.account_status FROM customers c JOIN loads l ON l.customer_id = c.customer_id WHERE l.load_id = $1`,
          [id],
        );
        if (customer.rows[0]?.account_status !== "Active") throw unprocessable("Customer account is inactive");
        break;
      }
      case "plan": {
        if (!input.driverId || !input.truckId || !input.trailerId) {
          throw badRequest("Driver, truck and trailer are required to plan a load");
        }
        await assertResourcesAvailable(client, input as PlanInput, id);
        if (existingTrip) {
          await client.query(
            `UPDATE trips SET driver_id = $1, truck_id = $2, trailer_id = $3, trip_status = 'PLANNED',
             dispatch_date = COALESCE((SELECT load_date FROM loads WHERE load_id = $4), CURRENT_DATE), updated_at = now()
             WHERE trip_id = $5`,
            [input.driverId, input.truckId, input.trailerId, id, existingTrip.trip_id],
          );
        } else {
          await client.query(
            `INSERT INTO trips (load_id, driver_id, truck_id, trailer_id, dispatch_date, trip_status)
             SELECT $1, $2, $3, $4, load_date, 'PLANNED' FROM loads WHERE load_id = $1`,
            [id, input.driverId, input.truckId, input.trailerId],
          );
        }
        await client.query("UPDATE loads SET assigned_at = COALESCE(assigned_at, now()) WHERE load_id = $1", [id]);
        break;
      }
      case "dispatch": {
        if (!existingTrip) throw unprocessable("Assign a driver, truck and trailer before dispatch");
        await client.query(
          `UPDATE trips SET trip_status = 'DISPATCHED', dispatch_date = CURRENT_DATE, updated_at = now() WHERE trip_id = $1`,
          [existingTrip.trip_id],
        );
        await client.query("UPDATE loads SET dispatched_at = now() WHERE load_id = $1", [id]);
        break;
      }
      case "start_transit": {
        if (!existingTrip) throw unprocessable("No trip exists for this load");
        await client.query(
          "UPDATE trips SET trip_status = 'IN_TRANSIT', updated_at = now() WHERE trip_id = $1",
          [existingTrip.trip_id],
        );
        await client.query(
          `INSERT INTO delivery_events (load_id, trip_id, event_type, facility_id, scheduled_datetime, actual_datetime,
            on_time_flag, location_city, location_state)
           SELECT l.load_id, t.trip_id, 'Pickup', f.facility_id, now(), now(), true, r.origin_city, r.origin_state
           FROM loads l
           JOIN trips t ON t.load_id = l.load_id
           JOIN routes r ON r.route_id = l.route_id
           LEFT JOIN LATERAL (SELECT facility_id FROM facilities WHERE city = r.origin_city LIMIT 1) f ON true
           WHERE l.load_id = $1 AND NOT EXISTS (
             SELECT 1 FROM delivery_events e WHERE e.load_id = l.load_id AND e.event_type = 'Pickup'
           )`,
          [id],
        );
        break;
      }
      case "mark_delivered": {
        if (!existingTrip) throw unprocessable("No trip exists for this load");
        await client.query(
          "UPDATE trips SET trip_status = 'DELIVERED', updated_at = now() WHERE trip_id = $1",
          [existingTrip.trip_id],
        );
        await client.query("UPDATE loads SET delivered_at = now() WHERE load_id = $1", [id]);
        // Delivery is the event that drives on-time analytics. Record it
        // automatically unless dispatch already captured a manual delivery.
        await client.query(
          `INSERT INTO delivery_events (load_id, trip_id, event_type, facility_id, scheduled_datetime, actual_datetime,
             on_time_flag, location_city, location_state)
           SELECT l.load_id, t.trip_id, 'Delivery', f.facility_id,
                  COALESCE((l.target_delivery_date + time '17:00')::timestamptz, now()),
                  now(),
                  CASE WHEN l.target_delivery_date IS NULL THEN true
                       ELSE now() <= (l.target_delivery_date + time '17:00')::timestamptz + interval '15 minutes' END,
                  r.destination_city, r.destination_state
           FROM loads l
           JOIN trips t ON t.load_id = l.load_id
           JOIN routes r ON r.route_id = l.route_id
           LEFT JOIN LATERAL (SELECT facility_id FROM facilities WHERE city = r.destination_city LIMIT 1) f ON true
           WHERE l.load_id = $1 AND NOT EXISTS (
             SELECT 1 FROM delivery_events e WHERE e.load_id = l.load_id AND e.event_type = 'Delivery'
           )`,
          [id],
        );
        break;
      }
      case "complete": {
        if (existingTrip) {
          await client.query(
            `UPDATE trips SET trip_status = 'COMPLETED', completed_at = now(), updated_at = now() WHERE trip_id = $1`,
            [existingTrip.trip_id],
          );
        }
        await client.query("UPDATE loads SET completed_at = now() WHERE load_id = $1", [id]);
        break;
      }
      case "cancel": {
        if (existingTrip) {
          await client.query(
            "UPDATE trips SET trip_status = 'CANCELLED', updated_at = now() WHERE trip_id = $1",
            [existingTrip.trip_id],
          );
        }
        break;
      }
      case "flag_exception": {
        if (!input.reason?.trim()) throw badRequest("An exception reason is required");
        await client.query("UPDATE loads SET exception_reason = $1 WHERE load_id = $2", [input.reason.trim(), id]);
        if (existingTrip) {
          await client.query("UPDATE trips SET trip_status = 'IN_TRANSIT', updated_at = now() WHERE trip_id = $1 AND trip_status = 'PLANNED'", [existingTrip.trip_id]);
        }
        break;
      }
      case "resolve_exception": {
        newStatus = existingTrip ? "PLANNED" : "BOOKED";
        await client.query("UPDATE loads SET exception_reason = NULL WHERE load_id = $1", [id]);
        break;
      }
    }

    if (input.action === "plan" || input.action === "dispatch") {
      // assignment state already applied above
    }
    await client.query("UPDATE loads SET load_status = $1, updated_at = now() WHERE load_id = $2", [newStatus, id]);
    await client.query(
      `INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, 'load', $4, $5)`,
      [
        actor.id,
        actor.name,
        input.action.toUpperCase(),
        id,
        JSON.stringify({ from: load.load_status, to: newStatus, ...input }),
      ],
    );
    return getLoadDetailTx(client, id);
  });
}

export async function recordEvent(
  loadId: string,
  input: {
    eventType: "Pickup" | "Delivery";
    facilityId?: string | null;
    scheduledDatetime?: string | null;
    actualDatetime?: string | null;
    detentionMinutes?: number;
    notes?: string;
    recordedBy?: string;
  },
) {
  return withTransaction(async (client) => {
    const load = await client.query<{ trip_id: string | null; route_id: string }>(
      `SELECT t.trip_id, l.route_id FROM loads l LEFT JOIN trips t ON t.load_id = l.load_id WHERE l.load_id = $1`,
      [loadId],
    );
    if (!load.rows[0]) throw notFound("Load");
    const tripId = load.rows[0].trip_id;
    const actual = input.actualDatetime ? new Date(input.actualDatetime) : new Date();
    const scheduled = input.scheduledDatetime ? new Date(input.scheduledDatetime) : null;
    const onTime = scheduled ? actual.getTime() <= scheduled.getTime() + 15 * 60 * 1000 : null;
    const { rows } = await client.query(
      `INSERT INTO delivery_events (load_id, trip_id, event_type, facility_id, scheduled_datetime, actual_datetime,
        detention_minutes, on_time_flag, location_city, location_state, notes, recorded_by)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, f.city, f.state, $9, $10
       FROM (SELECT 1) x LEFT JOIN facilities f ON f.facility_id = $4
       RETURNING event_id`,
      [
        loadId,
        tripId,
        input.eventType,
        input.facilityId ?? null,
        scheduled,
        actual,
        input.detentionMinutes ?? 0,
        onTime,
        input.notes ?? null,
        input.recordedBy ?? null,
      ],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'load', $3, $4)`,
      [input.recordedBy ?? null, `EVENT_${input.eventType.toUpperCase()}`, loadId, JSON.stringify({ eventId: rows[0]!.event_id })],
    );
    return { eventId: rows[0]!.event_id, onTime };
  });
}
