import type { FastifyInstance } from "fastify";
import { query } from "../../db/index.js";
import { toCamel } from "../../lib/crud.js";
import { authenticate } from "../../plugins/auth.js";

export default async function dashboardRoutes(app: FastifyInstance) {
  app.get("/summary", { preHandler: authenticate }, async () => {
    // The tenant-aware query helper uses one transaction-bound client. Run the
    // dashboard queries sequentially; issuing concurrent queries on the same
    // pg client is deprecated and can corrupt protocol ordering.
    const summary = await query(
      `SELECT
        (SELECT count(*) FROM loads WHERE load_date = CURRENT_DATE)::int AS loads_today,
        (SELECT count(*) FROM loads WHERE load_status IN ('BOOKED','PLANNED','DISPATCHED','IN_TRANSIT'))::int AS active_loads,
        (SELECT count(*) FROM loads WHERE load_status = 'IN_TRANSIT')::int AS in_transit,
        (SELECT count(*) FROM loads WHERE load_status = 'DELIVERED' AND delivered_at::date = CURRENT_DATE)::int AS delivered_today,
        (SELECT count(*) FROM loads WHERE load_status = 'EXCEPTION')::int AS exceptions,
        (SELECT COALESCE(sum(revenue + fuel_surcharge + accessorial_charges),0) FROM loads WHERE load_date = CURRENT_DATE) AS revenue_today,
        (SELECT COALESCE(sum(total_cost),0) FROM fuel_purchases WHERE purchase_date >= now() - interval '30 days') AS "fuelSpend30d",
        (SELECT count(*) FROM trucks WHERE status = 'Maintenance')::int
          + (SELECT count(*) FROM maintenance_records WHERE status = 'SCHEDULED' AND maintenance_date <= CURRENT_DATE + 7)::int AS maintenance_due,
        (SELECT count(*) FROM drivers WHERE employment_status = 'Active')::int AS active_drivers,
        (SELECT count(*) FROM trucks WHERE status = 'Active')::int AS available_trucks,
        (SELECT COALESCE(round(avg(on_time_flag::int)::numeric * 100, 1), 0)
           FROM delivery_events WHERE event_type = 'Delivery' AND actual_datetime >= now() - interval '30 days') AS on_time_rate,
        (SELECT COALESCE(round(avg(utilization_rate)::numeric * 100, 1), 0)
           FROM truck_utilization_metrics
           WHERE month = (SELECT max(month) FROM truck_utilization_metrics)) AS utilization_rate`,
    );
    const trend = await query(
      `WITH days AS (
        SELECT generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day')::date AS day
      )
      SELECT d.day::text AS date,
             count(l.load_id)::int AS loads,
             COALESCE(sum(l.revenue + l.fuel_surcharge + l.accessorial_charges),0) AS revenue,
             COALESCE(round(avg(e.on_time::int)::numeric * 100, 1), 0) AS on_time_rate
      FROM days d
      LEFT JOIN loads l ON l.load_date = d.day
      LEFT JOIN LATERAL (
        SELECT bool_and(on_time_flag) AS on_time FROM delivery_events ev
        WHERE ev.load_id = l.load_id AND ev.event_type = 'Delivery'
      ) e ON true
      GROUP BY d.day ORDER BY d.day`,
    );
    const recent = await query(
      `SELECT l.load_id, l.load_status, l.load_date, l.revenue, l.booking_type,
              c.customer_name, r.origin_city, r.origin_state, r.destination_city, r.destination_state,
              t.trip_id, (d.first_name || ' ' || d.last_name) AS driver_name, tr.unit_number AS truck_unit
       FROM loads l JOIN customers c ON c.customer_id = l.customer_id JOIN routes r ON r.route_id = l.route_id
       LEFT JOIN trips t ON t.load_id = l.load_id
       LEFT JOIN drivers d ON d.driver_id = t.driver_id
       LEFT JOIN trucks tr ON tr.truck_id = t.truck_id
       WHERE l.load_status IN ('BOOKED','PLANNED','DISPATCHED','IN_TRANSIT','EXCEPTION')
       ORDER BY l.load_date ASC, l.created_at DESC LIMIT 6`,
    );
    const exceptions = await query(
      `SELECT l.load_id, l.exception_reason, l.load_date, c.customer_name,
              r.origin_city, r.destination_city, l.load_status
       FROM loads l JOIN customers c ON c.customer_id = l.customer_id JOIN routes r ON r.route_id = l.route_id
       WHERE l.load_status = 'EXCEPTION' ORDER BY l.updated_at DESC LIMIT 5`,
    );
    const maintenance = await query(
      `SELECT t.truck_id, t.unit_number, t.status, t.next_service_due, t.last_service_date
       FROM trucks t
       WHERE t.status = 'Maintenance'
          OR t.next_service_due <= CURRENT_DATE + 14
          OR COALESCE(t.last_service_date, t.acquisition_date, CURRENT_DATE - 200) < CURRENT_DATE - 90
       ORDER BY COALESCE(t.next_service_due, CURRENT_DATE) ASC LIMIT 5`,
    );
    return {
      asOf: new Date().toISOString(),
      ...toCamel<Record<string, unknown>>(summary.rows[0] ?? {}),
      trend: trend.rows.map((r) => toCamel(r)),
      recentLoads: recent.rows.map((r) => toCamel(r)),
      exceptionsList: exceptions.rows.map((r) => toCamel(r)),
      maintenance: maintenance.rows.map((r) => toCamel(r)),
    };
  });

  app.get("/alerts", { preHandler: authenticate }, async () => {
    const exceptions = await query(
      `SELECT l.load_id, l.exception_reason AS message, c.customer_name, l.updated_at
       FROM loads l JOIN customers c ON c.customer_id = l.customer_id
       WHERE l.load_status = 'EXCEPTION' ORDER BY l.updated_at DESC LIMIT 10`,
    );
    const late = await query(
      `SELECT e.event_id, e.load_id, e.event_type, e.actual_datetime, e.scheduled_datetime,
              c.customer_name, e.location_city
       FROM delivery_events e JOIN loads l ON l.load_id = e.load_id JOIN customers c ON c.customer_id = l.customer_id
       WHERE e.on_time_flag = false AND e.actual_datetime >= now() - interval '7 days'
       ORDER BY e.actual_datetime DESC LIMIT 10`,
    );
    const maintenance = await query(
      `SELECT truck_id, unit_number, status, next_service_due FROM trucks
       WHERE status = 'Maintenance' OR next_service_due <= CURRENT_DATE + 14
       ORDER BY next_service_due ASC LIMIT 10`,
    );
    const expiring = await query(
      `SELECT truck_id, unit_number, last_service_date, next_service_due FROM trucks
       WHERE next_service_due IS NOT NULL AND next_service_due <= CURRENT_DATE + 30
       ORDER BY next_service_due ASC LIMIT 10`,
    );
    return {
      exceptions: exceptions.rows.map((r) => toCamel(r)),
      lateDeliveries: late.rows.map((r) => toCamel(r)),
      maintenanceDue: maintenance.rows.map((r) => toCamel(r)),
      serviceWindow: expiring.rows.map((r) => toCamel(r)),
    };
  });
}
