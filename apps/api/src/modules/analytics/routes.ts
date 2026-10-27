import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../../db/index.js";
import { toCamel } from "../../lib/crud.js";
import { authenticate } from "../../plugins/auth.js";

const rangeSchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(15),
});

function rangeParams(from?: string, to?: string) {
  return {
    from: from ?? "1900-01-01",
    to: to ?? "2999-12-31",
  };
}

export default async function analyticsRoutes(app: FastifyInstance) {
  app.get("/overview", { preHandler: authenticate }, async (request) => {
    const q = rangeSchema.parse(request.query);
    const { from, to } = rangeParams(q.from, q.to);
    const { rows } = await query(
      `SELECT
        count(DISTINCT l.load_id)::int AS loads,
        COALESCE(sum(l.revenue),0) AS linehaul_revenue,
        COALESCE(sum(l.fuel_surcharge),0) AS fuel_surcharge,
        COALESCE(sum(l.accessorial_charges),0) AS accessorial,
        COALESCE(sum(l.revenue + l.fuel_surcharge + l.accessorial_charges),0) AS total_revenue,
        COALESCE(sum(t.actual_distance_miles),0)::int AS miles,
        COALESCE(round(avg(t.average_mpg)::numeric, 2), 0) AS avg_mpg,
        COALESCE(sum(fp.cost),0) AS fuel_cost,
        (SELECT COALESCE(sum(mt.total_cost),0) FROM maintenance_records mt
          WHERE mt.status = 'COMPLETED' AND mt.maintenance_date BETWEEN $1 AND $2) AS maintenance_cost,
        (SELECT COALESCE(round(avg(e.on_time_flag::int)::numeric * 100, 1), 0)
           FROM delivery_events e WHERE e.event_type = 'Delivery' AND e.actual_datetime::date BETWEEN $1 AND $2) AS on_time_rate,
        (SELECT count(*) FROM safety_incidents i WHERE i.incident_date::date BETWEEN $1 AND $2)::int AS incidents,
        (SELECT COALESCE(sum(i.claim_amount),0) FROM safety_incidents i WHERE i.incident_date::date BETWEEN $1 AND $2) AS claims
       FROM loads l
       LEFT JOIN trips t ON t.load_id = l.load_id
       LEFT JOIN (SELECT trip_id, sum(total_cost) AS cost FROM fuel_purchases GROUP BY trip_id) fp ON fp.trip_id = t.trip_id
       WHERE l.load_date BETWEEN $1 AND $2 AND l.load_status NOT IN ('CANCELLED')`,
      [from, to],
    );
    const overview = toCamel<Record<string, number>>(rows[0] ?? {});
    const totalCost = Number(overview.fuelCost ?? 0) + Number(overview.maintenanceCost ?? 0);
    const totalRevenue = Number(overview.totalRevenue ?? 0);
    return {
      ...overview,
      margin: totalRevenue - totalCost,
      marginPct: totalRevenue ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 1000) / 10 : 0,
      revenuePerMile: overview.miles ? Math.round((totalRevenue / Number(overview.miles)) * 100) / 100 : 0,
      costPerMile: overview.miles ? Math.round((totalCost / Number(overview.miles)) * 100) / 100 : 0,
      from,
      to,
    };
  });

  app.get("/monthly", { preHandler: authenticate }, async (request) => {
    const q = rangeSchema.parse(request.query);
    const { from, to } = rangeParams(q.from, q.to);
    const { rows } = await query(
      `SELECT to_char(date_trunc('month', l.load_date), 'YYYY-MM') AS month,
              count(*)::int AS loads,
              COALESCE(sum(l.revenue + l.fuel_surcharge + l.accessorial_charges),0) AS revenue,
              COALESCE(sum(t.actual_distance_miles),0)::int AS miles,
              COALESCE(round(avg(t.average_mpg)::numeric,2),0) AS avg_mpg,
              COALESCE(sum(fp.cost),0) AS fuel_cost
       FROM loads l LEFT JOIN trips t ON t.load_id = l.load_id
       LEFT JOIN (SELECT trip_id, sum(total_cost) AS cost FROM fuel_purchases GROUP BY trip_id) fp ON fp.trip_id = t.trip_id
       WHERE l.load_date BETWEEN $1 AND $2
       GROUP BY 1 ORDER BY 1`,
      [from, to],
    );
    return { data: rows.map((r) => toCamel(r)) };
  });

  app.get("/lanes", { preHandler: authenticate }, async (request) => {
    const q = rangeSchema.parse(request.query);
    const { from, to } = rangeParams(q.from, q.to);
    const { rows } = await query(
      `SELECT r.route_id, r.origin_city, r.origin_state, r.destination_city, r.destination_state,
              count(l.load_id)::int AS loads,
              COALESCE(sum(l.revenue + l.fuel_surcharge + l.accessorial_charges),0) AS revenue,
              COALESCE(sum(t.actual_distance_miles),0)::int AS miles,
              COALESCE(sum(fp.cost),0) AS fuel_cost,
              COALESCE(round(avg(t.average_mpg)::numeric,2),0) AS avg_mpg
       FROM loads l JOIN routes r ON r.route_id = l.route_id
       LEFT JOIN trips t ON t.load_id = l.load_id
       LEFT JOIN (SELECT trip_id, sum(total_cost) AS cost FROM fuel_purchases GROUP BY trip_id) fp ON fp.trip_id = t.trip_id
       WHERE l.load_date BETWEEN $1 AND $2
       GROUP BY r.route_id, r.origin_city, r.origin_state, r.destination_city, r.destination_state ORDER BY revenue DESC LIMIT $3`,
      [from, to, q.limit],
    );
    return {
      data: rows.map((r) => {
        const row = toCamel<Record<string, number>>(r);
        const revenue = Number(row.revenue ?? 0);
        const fuel = Number(row.fuelCost ?? 0);
        return { ...row, margin: revenue - fuel, marginPct: revenue ? Math.round(((revenue - fuel) / revenue) * 1000) / 10 : 0 };
      }),
    };
  });

  app.get("/customers", { preHandler: authenticate }, async (request) => {
    const q = rangeSchema.parse(request.query);
    const { from, to } = rangeParams(q.from, q.to);
    const { rows } = await query(
      `SELECT c.customer_id, c.customer_name, c.customer_type, c.account_status,
              count(l.load_id)::int AS loads,
              COALESCE(sum(l.revenue + l.fuel_surcharge + l.accessorial_charges),0) AS revenue,
              COALESCE(sum(t.actual_distance_miles),0)::int AS miles,
              COALESCE(sum(fp.cost),0) AS fuel_cost,
              (SELECT round(avg(e.on_time_flag::int)::numeric * 100, 1) FROM delivery_events e
                JOIN loads l2 ON l2.load_id = e.load_id WHERE l2.customer_id = c.customer_id AND e.event_type = 'Delivery') AS on_time_rate
       FROM customers c LEFT JOIN loads l ON l.customer_id = c.customer_id AND l.load_date BETWEEN $1 AND $2
       LEFT JOIN trips t ON t.load_id = l.load_id
       LEFT JOIN (SELECT trip_id, sum(total_cost) AS cost FROM fuel_purchases GROUP BY trip_id) fp ON fp.trip_id = t.trip_id
       GROUP BY c.customer_id, c.customer_name, c.customer_type, c.account_status ORDER BY revenue DESC LIMIT $3`,
      [from, to, q.limit],
    );
    return {
      data: rows.map((r) => {
        const row = toCamel<Record<string, number>>(r);
        const revenue = Number(row.revenue ?? 0);
        const fuel = Number(row.fuelCost ?? 0);
        return { ...row, margin: revenue - fuel };
      }),
    };
  });

  app.get("/drivers", { preHandler: authenticate }, async (request) => {
    const q = rangeSchema.parse(request.query);
    const { from, to } = rangeParams(q.from, q.to);
    const { rows } = await query(
      `SELECT d.driver_id, d.first_name || ' ' || d.last_name AS driver_name, d.employment_status, d.home_terminal,
              count(t.trip_id)::int AS trips,
              COALESCE(sum(t.actual_distance_miles),0)::int AS miles,
              COALESCE(sum(l.revenue + l.fuel_surcharge + l.accessorial_charges),0) AS revenue,
              COALESCE(round(avg(t.average_mpg)::numeric,2),0) AS avg_mpg,
              COALESCE(round(avg(t.idle_time_hours)::numeric,2),0) AS avg_idle_hours,
              COALESCE(sum(fp.cost),0) AS fuel_cost,
              (SELECT count(*) FROM safety_incidents i WHERE i.driver_id = d.driver_id AND i.incident_date::date BETWEEN $1 AND $2)::int AS incidents,
              (SELECT round(avg(e.on_time_flag::int)::numeric * 100, 1) FROM delivery_events e
                JOIN trips t2 ON t2.trip_id = e.trip_id WHERE t2.driver_id = d.driver_id AND e.event_type = 'Delivery') AS on_time_rate
       FROM drivers d
       LEFT JOIN trips t ON t.driver_id = d.driver_id AND t.dispatch_date BETWEEN $1 AND $2
       LEFT JOIN loads l ON l.load_id = t.load_id
       LEFT JOIN (SELECT trip_id, sum(total_cost) AS cost FROM fuel_purchases GROUP BY trip_id) fp ON fp.trip_id = t.trip_id
       GROUP BY d.driver_id, d.first_name, d.last_name, d.employment_status, d.home_terminal ORDER BY miles DESC LIMIT $3`,
      [from, to, q.limit],
    );
    return {
      data: rows.map((r) => {
        const row = toCamel<Record<string, number>>(r);
        const miles = Number(row.miles ?? 0);
        const revenue = Number(row.revenue ?? 0);
        const fuel = Number(row.fuelCost ?? 0);
        return { ...row, revenuePerMile: miles ? Math.round((revenue / miles) * 100) / 100 : 0, margin: revenue - fuel };
      }),
    };
  });

  app.get("/fleet", { preHandler: authenticate }, async (request) => {
    const q = rangeSchema.parse(request.query);
    const { from, to } = rangeParams(q.from, q.to);
    const { rows } = await query(
      `SELECT tr.truck_id, tr.unit_number, tr.make, tr.model_year, tr.status, tr.home_terminal,
              count(t.trip_id)::int AS trips,
              COALESCE(sum(t.actual_distance_miles),0)::int AS miles,
              COALESCE(sum(l.revenue + l.fuel_surcharge + l.accessorial_charges),0) AS revenue,
              COALESCE(round(avg(t.average_mpg)::numeric,2),0) AS avg_mpg,
              COALESCE(sum(fp.cost),0) AS fuel_cost,
              COALESCE(sum(m.cost),0) AS maintenance_cost,
              COALESCE(sum(m.downtime_hours),0) AS downtime_hours
       FROM trucks tr
       LEFT JOIN trips t ON t.truck_id = tr.truck_id AND t.dispatch_date BETWEEN $1 AND $2
       LEFT JOIN loads l ON l.load_id = t.load_id
       LEFT JOIN (SELECT trip_id, sum(total_cost) AS cost FROM fuel_purchases GROUP BY trip_id) fp ON fp.trip_id = t.trip_id
       LEFT JOIN (SELECT truck_id, sum(total_cost) AS cost, sum(downtime_hours) AS downtime_hours
                  FROM maintenance_records WHERE status = 'COMPLETED' GROUP BY truck_id) m ON m.truck_id = tr.truck_id
       GROUP BY tr.truck_id, tr.unit_number, tr.make, tr.model_year, tr.status, tr.home_terminal ORDER BY miles DESC LIMIT $3`,
      [from, to, q.limit],
    );
    return {
      data: rows.map((r) => {
        const row = toCamel<Record<string, number>>(r);
        const revenue = Number(row.revenue ?? 0);
        const cost = Number(row.fuelCost ?? 0) + Number(row.maintenanceCost ?? 0);
        return { ...row, margin: revenue - cost, costPerMile: row.miles ? Math.round((cost / Number(row.miles)) * 100) / 100 : 0 };
      }),
    };
  });

  app.get("/safety", { preHandler: authenticate }, async (request) => {
    const q = rangeSchema.parse(request.query);
    const { from, to } = rangeParams(q.from, q.to);
    const byType = await query(
      `SELECT incident_type, count(*)::int AS incidents,
              count(*) FILTER (WHERE preventable_flag)::int AS preventable,
              count(*) FILTER (WHERE injury_flag)::int AS injuries,
              COALESCE(sum(claim_amount),0) AS claims
       FROM safety_incidents WHERE incident_date::date BETWEEN $1 AND $2
       GROUP BY incident_type ORDER BY incidents DESC`,
      [from, to],
    );
    const byMonth = await query(
      `SELECT to_char(date_trunc('month', incident_date), 'YYYY-MM') AS month, count(*)::int AS incidents,
              COALESCE(sum(claim_amount),0) AS claims
       FROM safety_incidents WHERE incident_date::date BETWEEN $1 AND $2
       GROUP BY 1 ORDER BY 1`,
      [from, to],
    );
    return { byType: byType.rows.map((r) => toCamel(r)), byMonth: byMonth.rows.map((r) => toCamel(r)) };
  });
}
