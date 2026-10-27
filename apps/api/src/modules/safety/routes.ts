import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../../db/index.js";
import { toCamel } from "../../lib/crud.js";
import { pageResult, paginate, paginationSchema } from "../../lib/pagination.js";
import { authenticate, requireAdmin } from "../../plugins/auth.js";

const createSchema = z.object({
  tripId: z.string().nullable().optional(),
  truckId: z.string().nullable().optional(),
  driverId: z.string().nullable().optional(),
  incidentDate: z.string().datetime({ offset: true }).optional(),
  incidentType: z.enum(["Accident", "Moving Violation", "DOT Violation", "Equipment Damage", "Customer Complaint"]),
  locationCity: z.string().max(100).optional(),
  locationState: z.string().length(2).optional(),
  atFaultFlag: z.boolean().default(false),
  injuryFlag: z.boolean().default(false),
  vehicleDamageCost: z.coerce.number().min(0).default(0),
  cargoDamageCost: z.coerce.number().min(0).default(0),
  claimAmount: z.coerce.number().min(0).default(0),
  preventableFlag: z.boolean().default(false),
  description: z.string().max(4000).optional(),
});

const statusSchema = z.object({ status: z.enum(["OPEN", "UNDER_REVIEW", "CLOSED"]) });

export default async function safetyRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: authenticate }, async (request) => {
    const p = paginationSchema
      .extend({ driverId: z.string().optional(), type: z.string().optional(), status: z.string().optional(), from: z.string().date().optional(), to: z.string().date().optional() })
      .parse(request.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (p.driverId) { params.push(p.driverId); where.push(`i.driver_id = $${params.length}`); }
    if (p.type && p.type !== "ALL") { params.push(p.type); where.push(`i.incident_type = $${params.length}`); }
    if (p.status && p.status !== "ALL") { params.push(p.status); where.push(`i.status = $${params.length}`); }
    if (p.from) { params.push(p.from); where.push(`i.incident_date >= $${params.length}`); }
    if (p.to) { params.push(p.to); where.push(`i.incident_date < ($${params.length}::date + 1)`); }
    if (p.search) {
      params.push(`%${p.search}%`);
      const i = params.length;
      where.push(`(i.incident_id ILIKE $${i} OR i.description ILIKE $${i} OR d.last_name ILIKE $${i} OR tr.unit_number ILIKE $${i})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { limit, offset } = paginate(p);
    const rows = await query(
      `SELECT i.*, (d.first_name || ' ' || d.last_name) AS driver_name, tr.unit_number AS truck_unit, t.load_id
       FROM safety_incidents i
       LEFT JOIN drivers d ON d.driver_id = i.driver_id
       LEFT JOIN trucks tr ON tr.truck_id = i.truck_id
       LEFT JOIN trips t ON t.trip_id = i.trip_id
       ${whereSql} ORDER BY i.incident_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    const count = await query(
      `SELECT count(*)::int AS total FROM safety_incidents i
       LEFT JOIN drivers d ON d.driver_id = i.driver_id LEFT JOIN trucks tr ON tr.truck_id = i.truck_id ${whereSql}`,
      params,
    );
    const stats = await query(
      `SELECT count(*)::int AS incidents, count(*) FILTER (WHERE i.injury_flag)::int AS injuries,
              count(*) FILTER (WHERE i.preventable_flag)::int AS preventable,
              COALESCE(sum(i.claim_amount),0) AS claim_total,
              COALESCE(sum(i.vehicle_damage_cost + i.cargo_damage_cost),0) AS damage_total
       FROM safety_incidents i LEFT JOIN drivers d ON d.driver_id = i.driver_id
       LEFT JOIN trucks tr ON tr.truck_id = i.truck_id ${whereSql}`,
      params,
    );
    return {
      ...pageResult(rows.rows.map((r) => toCamel(r)), count.rows[0]?.total ?? 0, p),
      summary: toCamel(stats.rows[0] ?? {}),
    };
  });

  app.post("/", { preHandler: requireAdmin }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const { rows } = await query(
      `INSERT INTO safety_incidents (trip_id, truck_id, driver_id, incident_date, incident_type, location_city,
        location_state, at_fault_flag, injury_flag, vehicle_damage_cost, cargo_damage_cost, claim_amount,
        preventable_flag, description, recorded_by)
       VALUES ($1,$2,$3,COALESCE($4::timestamptz, now()),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [body.tripId ?? null, body.truckId ?? null, body.driverId ?? null, body.incidentDate ?? null, body.incidentType, body.locationCity ?? null, body.locationState ?? null, body.atFaultFlag, body.injuryFlag, body.vehicleDamageCost, body.cargoDamageCost, body.claimAmount, body.preventableFlag, body.description ?? null, request.user.id],
    );
    reply.status(201);
    return toCamel(rows[0]!);
  });

  app.patch("/:id/status", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const body = statusSchema.parse(request.body);
    const { rows } = await query("UPDATE safety_incidents SET status = $1 WHERE incident_id = $2 RETURNING *", [body.status, id]);
    return toCamel(rows[0]!);
  });
}
