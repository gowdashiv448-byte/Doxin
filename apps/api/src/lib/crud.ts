import type { FastifyInstance, FastifyRequest } from "fastify";
import type { z } from "zod";
import { audit } from "./audit.js";
import { notFound } from "./errors.js";
import { paginate, pageResult, paginationSchema, safeSort } from "./pagination.js";
import { query } from "../db/index.js";
import { authenticate, requireAdmin } from "../plugins/auth.js";

interface CrudOptions {
  entity: string;
  table: string;
  idColumn: string;
  idPrefix: string;
  idSequence: string;
  idWidth: number;
  select: string;
  searchColumns: string[];
  sortColumns: Record<string, string>;
  createSchema: z.ZodTypeAny;
  updateSchema: z.ZodTypeAny;
  filters?: Record<string, string>;
}

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Rows leave the API camel-cased and JSON-safe. */
export function toCamel<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [camel(k), v])) as T;
}

export function registerCrudRoutes(app: FastifyInstance, opts: CrudOptions) {
  app.get("/", { preHandler: authenticate }, async (request) => {
    const p = paginationSchema.parse(request.query);
    const params: unknown[] = [];
    const where: string[] = [];
    if (p.search && opts.searchColumns.length) {
      params.push(`%${p.search}%`);
      where.push(`(${opts.searchColumns.map((c) => `${c} ILIKE $${params.length}`).join(" OR ")})`);
    }
    const q = request.query as Record<string, unknown>;
    for (const [param, column] of Object.entries(opts.filters ?? {})) {
      const value = q[param];
      if (typeof value === "string" && value && value !== "ALL") {
        params.push(value);
        where.push(`${column} = $${params.length}`);
      }
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const sort = safeSort(p.sort, opts.sortColumns, opts.sortColumns.created_at ?? opts.idColumn);
    const { limit, offset } = paginate(p);
    params.push(limit, offset);
    const sql = `SELECT ${opts.select} FROM ${opts.table} ${whereSql}
      ORDER BY ${sort} ${p.order.toUpperCase()} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const rows = await query(sql, params);
    const count = await query(`SELECT count(*)::int AS total FROM ${opts.table} ${whereSql}`, params.slice(0, -2));
    return pageResult(rows.rows.map((r) => toCamel(r)), count.rows[0]?.total ?? 0, p);
  });

  app.get("/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const { rows } = await query(`SELECT ${opts.select} FROM ${opts.table} WHERE ${opts.idColumn} = $1`, [id]);
    if (!rows[0]) throw notFound(opts.entity);
    return toCamel(rows[0]);
  });

  app.post("/", { preHandler: requireAdmin }, async (request, reply) => {
    const parsedBody = opts.createSchema.parse(request.body) as Record<string, unknown>;
    const body = Object.fromEntries(Object.entries(parsedBody).map(([k, v]) => [snake(k), v]));
    const id = body[opts.idColumn]
      ? String(body[opts.idColumn])
      : (
          await query<{ id: string }>(
            `SELECT next_tenant_id($1, $2, $3) AS id`,
            [opts.idPrefix, opts.idSequence, opts.idWidth],
          )
        ).rows[0]!.id;
    const record = { ...body, [opts.idColumn]: id };
    const cols = Object.keys(record);
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const { rows } = await query(
      `INSERT INTO ${opts.table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING ${opts.select}`,
      cols.map((c) => record[c]),
    );
    const created = toCamel(rows[0]!);
    await audit(request, { action: "CREATE", entityType: opts.entity, entityId: id });
    reply.status(201);
    return created;
  });

  app.patch("/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const parsedBody = opts.updateSchema.parse(request.body) as Record<string, unknown>;
    const body = Object.fromEntries(Object.entries(parsedBody).map(([k, v]) => [snake(k), v]));
    const cols = Object.keys(body);
    if (!cols.length) {
      const { rows } = await query(`SELECT ${opts.select} FROM ${opts.table} WHERE ${opts.idColumn} = $1`, [id]);
      if (!rows[0]) throw notFound(opts.entity);
      return toCamel(rows[0]);
    }
    const sets = cols.map((c, i) => `${c} = $${i + 1}`);
    const { rows } = await query(
      `UPDATE ${opts.table} SET ${sets.join(", ")}, updated_at = now()
       WHERE ${opts.idColumn} = $${cols.length + 1} RETURNING ${opts.select}`,
      [...cols.map((c) => body[c]), id],
    );
    if (!rows[0]) throw notFound(opts.entity);
    await audit(request, { action: "UPDATE", entityType: opts.entity, entityId: id, details: body });
    return toCamel(rows[0]);
  });

  app.delete("/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const { rowCount } = await query(`DELETE FROM ${opts.table} WHERE ${opts.idColumn} = $1`, [id]);
    if (!rowCount) throw notFound(opts.entity);
    await audit(request as FastifyRequest, { action: "DELETE", entityType: opts.entity, entityId: id });
    return { ok: true };
  });
}
