import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../../db/index.js";
import { toCamel } from "../../lib/crud.js";
import { pageResult, paginate, paginationSchema } from "../../lib/pagination.js";
import { requireAdmin } from "../../plugins/auth.js";

export default async function auditRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: requireAdmin }, async (request) => {
    const p = paginationSchema.extend({ entityType: z.string().optional(), entityId: z.string().optional() }).parse(request.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (p.entityType) { params.push(p.entityType); where.push(`entity_type = $${params.length}`); }
    if (p.entityId) { params.push(p.entityId); where.push(`entity_id = $${params.length}`); }
    if (p.search) {
      params.push(`%${p.search}%`);
      const i = params.length;
      where.push(`(actor_name ILIKE $${i} OR action ILIKE $${i} OR entity_id ILIKE $${i})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { limit, offset } = paginate(p);
    const rows = await query(
      `SELECT * FROM audit_logs ${whereSql} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    const count = await query(`SELECT count(*)::int AS total FROM audit_logs ${whereSql}`, params);
    return pageResult(rows.rows.map((r) => toCamel(r)), count.rows[0]?.total ?? 0, p);
  });
}
