import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../../db/index.js";
import { toCamel } from "../../lib/crud.js";
import { notFound } from "../../lib/errors.js";
import { pageResult, paginate, paginationSchema } from "../../lib/pagination.js";
import { authenticate, requireAdmin } from "../../plugins/auth.js";

const createSchema = z.object({
  truckId: z.string().min(1),
  maintenanceDate: z.string().date().optional(),
  maintenanceType: z.enum(["Preventive", "Repair", "Inspection", "Tire", "Brake", "Engine", "Transmission"]),
  odometerReading: z.coerce.number().int().min(0).optional(),
  laborHours: z.coerce.number().min(0).default(0),
  laborCost: z.coerce.number().min(0).default(0),
  partsCost: z.coerce.number().min(0).default(0),
  totalCost: z.coerce.number().min(0).optional(),
  facilityLocation: z.string().max(150).optional(),
  downtimeHours: z.coerce.number().min(0).default(0),
  serviceDescription: z.string().max(2000).optional(),
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).default("COMPLETED"),
});

const statusSchema = z.object({ status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) });

export default async function maintenanceRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: authenticate }, async (request) => {
    const p = paginationSchema
      .extend({ truckId: z.string().optional(), status: z.string().optional(), type: z.string().optional(), from: z.string().date().optional(), to: z.string().date().optional() })
      .parse(request.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (p.truckId) { params.push(p.truckId); where.push(`m.truck_id = $${params.length}`); }
    if (p.status && p.status !== "ALL") { params.push(p.status); where.push(`m.status = $${params.length}`); }
    if (p.type && p.type !== "ALL") { params.push(p.type); where.push(`m.maintenance_type = $${params.length}`); }
    if (p.from) { params.push(p.from); where.push(`m.maintenance_date >= $${params.length}`); }
    if (p.to) { params.push(p.to); where.push(`m.maintenance_date <= $${params.length}`); }
    if (p.search) {
      params.push(`%${p.search}%`);
      const i = params.length;
      where.push(`(m.maintenance_id ILIKE $${i} OR m.truck_id ILIKE $${i} OR t.unit_number ILIKE $${i} OR m.service_description ILIKE $${i})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { limit, offset } = paginate(p);
    const rows = await query(
      `SELECT m.*, t.unit_number AS truck_unit, t.make AS truck_make
       FROM maintenance_records m JOIN trucks t ON t.truck_id = m.truck_id
       ${whereSql} ORDER BY m.maintenance_date DESC, m.maintenance_id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    const count = await query(
      `SELECT count(*)::int AS total FROM maintenance_records m JOIN trucks t ON t.truck_id = m.truck_id ${whereSql}`,
      params,
    );
    const stats = await query(
      `SELECT COALESCE(sum(m.total_cost),0) AS total_cost, COALESCE(sum(m.downtime_hours),0) AS downtime_hours,
              count(*)::int AS events FROM maintenance_records m JOIN trucks t ON t.truck_id = m.truck_id ${whereSql}`,
      params,
    );
    return {
      ...pageResult(rows.rows.map((r) => toCamel(r)), count.rows[0]?.total ?? 0, p),
      summary: toCamel(stats.rows[0] ?? {}),
    };
  });

  app.get("/due", { preHandler: authenticate }, async () => {
    const { rows } = await query(
      `SELECT t.truck_id, t.unit_number, t.make, t.model_year, t.status, t.home_terminal,
              t.last_service_date, t.next_service_due, t.current_odometer,
              (SELECT max(m.maintenance_date) FROM maintenance_records m WHERE m.truck_id = t.truck_id AND m.status = 'COMPLETED') AS last_completed,
              (SELECT count(*) FROM maintenance_records m WHERE m.truck_id = t.truck_id AND m.status IN ('SCHEDULED','IN_PROGRESS'))::int AS open_records
       FROM trucks t
       WHERE t.status <> 'Inactive'
         AND (t.status = 'Maintenance' OR t.next_service_due <= CURRENT_DATE + 14
              OR COALESCE(t.last_service_date, t.acquisition_date, CURRENT_DATE - 200) < CURRENT_DATE - 90)
       ORDER BY COALESCE(t.next_service_due, CURRENT_DATE) ASC`,
    );
    return { data: rows.map((r) => toCamel(r)) };
  });

  app.post("/", { preHandler: requireAdmin }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const total = body.totalCost ?? Math.round((body.laborCost + body.partsCost) * 100) / 100;
    const { rows } = await query(
      `INSERT INTO maintenance_records (truck_id, maintenance_date, maintenance_type, odometer_reading,
        labor_hours, labor_cost, parts_cost, total_cost, facility_location, downtime_hours, service_description, status, created_by)
       VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [body.truckId, body.maintenanceDate ?? null, body.maintenanceType, body.odometerReading ?? null, body.laborHours, body.laborCost, body.partsCost, total, body.facilityLocation ?? null, body.downtimeHours, body.serviceDescription ?? null, body.status, request.user.id],
    );
    if (body.status === "IN_PROGRESS") {
      await query("UPDATE trucks SET status = 'Maintenance' WHERE truck_id = $1", [body.truckId]);
    }
    await query(
      `INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, details)
       VALUES ($1,$2,'CREATE','maintenance',$3,$4)`,
      [request.user.id, request.user.name, rows[0]!.maintenance_id, JSON.stringify({ truckId: body.truckId, totalCost: total })],
    );
    reply.status(201);
    return toCamel(rows[0]!);
  });

  app.patch("/:id/status", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const body = statusSchema.parse(request.body);
    const { rows } = await query("UPDATE maintenance_records SET status = $1, updated_at = now() WHERE maintenance_id = $2 RETURNING *", [body.status, id]);
    if (!rows[0]) throw notFound("Maintenance record");
    const record = rows[0] as { truck_id: string; maintenance_date: string; odometer_reading: number | null };
    if (body.status === "IN_PROGRESS") {
      await query("UPDATE trucks SET status = 'Maintenance' WHERE truck_id = $1", [record.truck_id]);
    }
    if (body.status === "COMPLETED") {
      await query(
        `UPDATE trucks SET status = 'Active', last_service_date = $1::date, current_odometer = GREATEST(COALESCE(current_odometer,0), COALESCE($2,0)),
         next_service_due = ($1::date + INTERVAL '90 days')::date WHERE truck_id = $3`,
        [record.maintenance_date, record.odometer_reading, record.truck_id],
      );
    }
    await query(
      `INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, details)
       VALUES ($1,$2,$3,'maintenance',$4,$5)`,
      [request.user.id, request.user.name, `MAINTENANCE_${body.status}`, id, JSON.stringify({ truckId: record.truck_id })],
    );
    return toCamel(rows[0]);
  });
}
