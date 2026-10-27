import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { query } from "../../db/index.js";
import { audit } from "../../lib/audit.js";
import { conflict, notFound } from "../../lib/errors.js";
import { pageResult, paginate, paginationSchema } from "../../lib/pagination.js";
import { toCamel } from "../../lib/crud.js";
import { requireAdmin } from "../../plugins/auth.js";

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(150),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

const select = "id, email, name, role, is_active, last_login_at, created_at";

export default async function userRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: requireAdmin }, async (request) => {
    const p = paginationSchema.parse(request.query);
    const { limit, offset } = paginate(p);
    const search = p.search ? `%${p.search}%` : null;
    const where = search ? "WHERE email ILIKE $1 OR name ILIKE $1" : "";
    const params = search ? [search] : [];
    const rows = await query(
      `SELECT ${select} FROM users ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    const count = await query(`SELECT count(*)::int AS total FROM users ${where}`, params);
    return pageResult(rows.rows.map((r) => toCamel(r)), count.rows[0]?.total ?? 0, p);
  });

  app.post("/", { preHandler: requireAdmin }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const exists = await query("SELECT 1 FROM users WHERE email = $1", [body.email]);
    if (exists.rowCount) throw conflict("A user with that email already exists");
    const hash = await bcrypt.hash(body.password, 12);
    const { rows } = await query(
      `INSERT INTO users (email, name, password_hash, role) VALUES ($1,$2,$3,'ADMIN') RETURNING ${select}`,
      [body.email, body.name, hash],
    );
    await audit(request, { action: "CREATE", entityType: "user", entityId: rows[0]!.id });
    reply.status(201);
    return toCamel(rows[0]!);
  });

  app.patch("/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateSchema.parse(request.body);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.name !== undefined) { params.push(body.name); sets.push(`name = $${params.length}`); }
    if (body.isActive !== undefined) { params.push(body.isActive); sets.push(`is_active = $${params.length}`); }
    if (body.password) { params.push(await bcrypt.hash(body.password, 12)); sets.push(`password_hash = $${params.length}`); }
    if (!sets.length) throw conflict("No changes supplied");
    params.push(id);
    const { rows } = await query(
      `UPDATE users SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length} RETURNING ${select}`,
      params,
    );
    if (!rows[0]) throw notFound("User");
    await audit(request, { action: "UPDATE", entityType: "user", entityId: id });
    return toCamel(rows[0]);
  });
}
