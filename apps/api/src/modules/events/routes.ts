import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../../db/index.js";
import { toCamel } from "../../lib/crud.js";
import { pageResult, paginate, paginationSchema } from "../../lib/pagination.js";
import { authenticate, requireAdmin } from "../../plugins/auth.js";

const createSchema = z.object({
  loadId: z.string().min(1),
  eventType: z.enum(["Pickup", "Delivery"]),
  facilityId: z.string().nullable().optional(),
  scheduledDatetime: z.string().datetime({ offset: true }).nullable().optional(),
  actualDatetime: z.string().datetime({ offset: true }).nullable().optional(),
  detentionMinutes: z.coerce.number().int().min(0).max(10_000).optional(),
  notes: z.string().max(2000).optional(),
});

const SELECT = `
  e.event_id, e.load_id, e.trip_id, e.event_type, e.facility_id, f.facility_name,
  e.scheduled_datetime, e.actual_datetime, e.detention_minutes, e.on_time_flag,
  e.location_city, e.location_state, e.notes, e.created_at,
  c.customer_name, r.origin_city, r.destination_city
`;
const FROM = `
  FROM delivery_events e
  JOIN loads l ON l.load_id = e.load_id
  JOIN customers c ON c.customer_id = l.customer_id
  JOIN routes r ON r.route_id = l.route_id
  LEFT JOIN facilities f ON f.facility_id = e.facility_id
`;

export default async function eventRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: authenticate }, async (request) => {
    const p = paginationSchema
      .extend({
        loadId: z.string().optional(),
        type: z.string().optional(),
        onTime: z.enum(["true", "false"]).optional(),
        from: z.string().date().optional(),
        to: z.string().date().optional(),
      })
      .parse(request.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (p.loadId) { params.push(p.loadId); where.push(`e.load_id = $${params.length}`); }
    if (p.type && p.type !== "ALL") { params.push(p.type); where.push(`e.event_type = $${params.length}`); }
    if (p.onTime) { params.push(p.onTime === "true"); where.push(`e.on_time_flag = $${params.length}`); }
    if (p.from) { params.push(p.from); where.push(`e.actual_datetime >= $${params.length}`); }
    if (p.to) { params.push(p.to); where.push(`e.actual_datetime < ($${params.length}::date + 1)`); }
    if (p.search) {
      params.push(`%${p.search}%`);
      const i = params.length;
      where.push(`(e.load_id ILIKE $${i} OR e.event_id ILIKE $${i} OR c.customer_name ILIKE $${i} OR e.location_city ILIKE $${i})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { limit, offset } = paginate(p);
    const rows = await query(
      `SELECT ${SELECT} ${FROM} ${whereSql} ORDER BY e.actual_datetime DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    const count = await query(`SELECT count(*)::int AS total ${FROM} ${whereSql}`, params);
    const stats = await query(
      `SELECT count(*) FILTER (WHERE e.on_time_flag) AS on_time, count(*) FILTER (WHERE e.on_time_flag IS FALSE) AS late,
              COALESCE(avg(e.detention_minutes),0) AS avg_detention
       ${FROM} ${whereSql}`,
      params,
    );
    return {
      ...pageResult(rows.rows.map((r) => toCamel(r)), count.rows[0]?.total ?? 0, p),
      stats: toCamel(stats.rows[0] ?? {}),
    };
  });

  app.post("/", { preHandler: requireAdmin }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const trip = await query<{ trip_id: string }>("SELECT trip_id FROM trips WHERE load_id = $1", [body.loadId]);
    const actual = body.actualDatetime ? new Date(body.actualDatetime) : new Date();
    const scheduled = body.scheduledDatetime ? new Date(body.scheduledDatetime) : null;
    const onTime = scheduled ? actual.getTime() <= scheduled.getTime() + 15 * 60_000 : null;
    const { rows } = await query(
      `INSERT INTO delivery_events (load_id, trip_id, event_type, facility_id, scheduled_datetime, actual_datetime,
        detention_minutes, on_time_flag, location_city, location_state, notes, recorded_by)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,f.city,f.state,$9,$10
       FROM (SELECT 1) x LEFT JOIN facilities f ON f.facility_id = $4
       ON CONFLICT (tenant_id, event_id) DO NOTHING RETURNING event_id`,
      [body.loadId, trip.rows[0]?.trip_id ?? null, body.eventType, body.facilityId ?? null, scheduled, actual, body.detentionMinutes ?? 0, onTime, body.notes ?? null, request.user.id],
    );
    await query(
      `INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, details)
       VALUES ($1,$2,$3,'load',$4,$5)`,
      [request.user.id, request.user.name, `EVENT_${body.eventType.toUpperCase()}`, body.loadId, JSON.stringify({ eventId: rows[0]?.event_id })],
    );
    reply.status(201);
    return { eventId: rows[0]?.event_id, onTime };
  });
}
