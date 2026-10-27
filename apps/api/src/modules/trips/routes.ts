import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../../db/index.js";
import { toCamel } from "../../lib/crud.js";
import { notFound } from "../../lib/errors.js";
import { pageResult, paginate, paginationSchema } from "../../lib/pagination.js";
import { authenticate, requireAdmin } from "../../plugins/auth.js";

const completeSchema = z.object({
  actualDistanceMiles: z.coerce.number().int().min(0).optional(),
  actualDurationHours: z.coerce.number().min(0).optional(),
  fuelGallonsUsed: z.coerce.number().min(0).optional(),
  averageMpg: z.coerce.number().min(0).optional(),
  idleTimeHours: z.coerce.number().min(0).optional(),
  odometerStart: z.coerce.number().int().min(0).optional(),
  odometerEnd: z.coerce.number().int().min(0).optional(),
});

const TRIP_SELECT = `
  t.trip_id, t.load_id, t.driver_id, (d.first_name || ' ' || d.last_name) AS driver_name,
  t.truck_id, tr.unit_number AS truck_unit, t.trailer_id, tl.trailer_number,
  t.dispatch_date, t.actual_distance_miles, t.actual_duration_hours, t.fuel_gallons_used,
  t.average_mpg, t.idle_time_hours, t.trip_status, t.completed_at, t.created_at,
  l.customer_id, c.customer_name, l.revenue, l.fuel_surcharge, l.accessorial_charges,
  l.load_status, r.origin_city, r.origin_state, r.destination_city, r.destination_state
`;

const TRIP_FROM = `
  FROM trips t
  JOIN loads l ON l.load_id = t.load_id
  JOIN customers c ON c.customer_id = l.customer_id
  JOIN routes r ON r.route_id = l.route_id
  LEFT JOIN drivers d ON d.driver_id = t.driver_id
  LEFT JOIN trucks tr ON tr.truck_id = t.truck_id
  LEFT JOIN trailers tl ON tl.trailer_id = t.trailer_id
`;

export default async function tripRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: authenticate }, async (request) => {
    const p = paginationSchema.extend({ status: z.string().optional(), driverId: z.string().optional() }).parse(request.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (p.status && p.status !== "ALL") {
      params.push(p.status);
      where.push(`t.trip_status = $${params.length}`);
    }
    if (p.driverId) {
      params.push(p.driverId);
      where.push(`t.driver_id = $${params.length}`);
    }
    if (p.search) {
      params.push(`%${p.search}%`);
      const i = params.length;
      where.push(`(t.trip_id ILIKE $${i} OR t.load_id ILIKE $${i} OR c.customer_name ILIKE $${i} OR tr.unit_number ILIKE $${i})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { limit, offset } = paginate(p);
    const rows = await query(
      `SELECT ${TRIP_SELECT} ${TRIP_FROM} ${whereSql} ORDER BY t.dispatch_date DESC, t.trip_id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    const count = await query(`SELECT count(*)::int AS total ${TRIP_FROM} ${whereSql}`, params);
    return pageResult(rows.rows.map((r) => toCamel(r)), count.rows[0]?.total ?? 0, p);
  });

  app.get("/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const { rows } = await query(`SELECT ${TRIP_SELECT} ${TRIP_FROM} WHERE t.trip_id = $1`, [id]);
    if (!rows[0]) throw notFound("Trip");
    const fuel = await query("SELECT * FROM fuel_purchases WHERE trip_id = $1 ORDER BY purchase_date DESC", [id]);
    const events = await query("SELECT * FROM delivery_events WHERE trip_id = $1 ORDER BY created_at ASC", [id]);
    const incidents = await query("SELECT * FROM safety_incidents WHERE trip_id = $1 ORDER BY incident_date DESC", [id]);
    return {
      ...toCamel<Record<string, unknown>>(rows[0]),
      fuelPurchases: fuel.rows.map((r) => toCamel(r)),
      events: events.rows.map((r) => toCamel(r)),
      incidents: incidents.rows.map((r) => toCamel(r)),
    };
  });

  app.patch("/:id/complete", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const body = completeSchema.parse(request.body ?? {});
    const fields: Record<string, unknown> = {};
    if (body.actualDistanceMiles !== undefined) fields.actual_distance_miles = body.actualDistanceMiles;
    if (body.actualDurationHours !== undefined) fields.actual_duration_hours = body.actualDurationHours;
    if (body.fuelGallonsUsed !== undefined) fields.fuel_gallons_used = body.fuelGallonsUsed;
    if (body.averageMpg !== undefined) fields.average_mpg = body.averageMpg;
    if (body.idleTimeHours !== undefined) fields.idle_time_hours = body.idleTimeHours;
    if (body.odometerStart !== undefined) fields.odometer_start = body.odometerStart;
    if (body.odometerEnd !== undefined) fields.odometer_end = body.odometerEnd;
    const cols = Object.keys(fields);
    const sets = cols.map((c, i) => `${c} = $${i + 1}`);
    const { rows } = await query(
      `UPDATE trips SET ${sets.length ? `${sets.join(", ")},` : ""} trip_status = 'COMPLETED', completed_at = now(), updated_at = now()
       WHERE trip_id = $${cols.length + 1} RETURNING trip_id`,
      [...cols.map((c) => fields[c]), id],
    );
    if (!rows[0]) throw notFound("Trip");
    await query("UPDATE loads SET load_status = 'COMPLETED', completed_at = now() WHERE load_id = (SELECT load_id FROM trips WHERE trip_id = $1)", [id]);
    return { ok: true };
  });
}
