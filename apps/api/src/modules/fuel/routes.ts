import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../../db/index.js";
import { toCamel } from "../../lib/crud.js";
import { pageResult, paginate, paginationSchema } from "../../lib/pagination.js";
import { authenticate, requireAdmin } from "../../plugins/auth.js";

const createSchema = z.object({
  tripId: z.string().nullable().optional(),
  truckId: z.string().min(1),
  driverId: z.string().nullable().optional(),
  purchaseDate: z.string().datetime({ offset: true }).optional(),
  locationCity: z.string().max(100).optional(),
  locationState: z.string().length(2).optional(),
  gallons: z.coerce.number().positive(),
  pricePerGallon: z.coerce.number().positive(),
  totalCost: z.coerce.number().positive().optional(),
  fuelCardNumber: z.string().max(50).optional(),
});

export default async function fuelRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: authenticate }, async (request) => {
    const p = paginationSchema
      .extend({ truckId: z.string().optional(), driverId: z.string().optional(), from: z.string().date().optional(), to: z.string().date().optional() })
      .parse(request.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (p.truckId) { params.push(p.truckId); where.push(`f.truck_id = $${params.length}`); }
    if (p.driverId) { params.push(p.driverId); where.push(`f.driver_id = $${params.length}`); }
    if (p.from) { params.push(p.from); where.push(`f.purchase_date >= $${params.length}`); }
    if (p.to) { params.push(p.to); where.push(`f.purchase_date < ($${params.length}::date + 1)`); }
    if (p.search) {
      params.push(`%${p.search}%`);
      const i = params.length;
      where.push(`(f.fuel_purchase_id ILIKE $${i} OR f.truck_id ILIKE $${i} OR f.location_city ILIKE $${i})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { limit, offset } = paginate(p);
    const rows = await query(
      `SELECT f.*, t.unit_number AS truck_unit, (d.first_name || ' ' || d.last_name) AS driver_name
       FROM fuel_purchases f LEFT JOIN trucks t ON t.truck_id = f.truck_id
       LEFT JOIN drivers d ON d.driver_id = f.driver_id
       ${whereSql} ORDER BY f.purchase_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    const count = await query(`SELECT count(*)::int AS total FROM fuel_purchases f ${whereSql}`, params);
    const sum = await query(
      `SELECT COALESCE(sum(f.total_cost),0) AS total_cost, COALESCE(sum(f.gallons),0) AS gallons,
              COALESCE(avg(f.price_per_gallon),0) AS avg_price FROM fuel_purchases f ${whereSql}`,
      params,
    );
    return {
      ...pageResult(rows.rows.map((r) => toCamel(r)), count.rows[0]?.total ?? 0, p),
      summary: toCamel(sum.rows[0] ?? {}),
    };
  });

  app.post("/", { preHandler: requireAdmin }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const total = body.totalCost ?? Math.round(body.gallons * body.pricePerGallon * 100) / 100;
    const { rows } = await query(
      `INSERT INTO fuel_purchases (trip_id, truck_id, driver_id, purchase_date, location_city, location_state, gallons, price_per_gallon, total_cost, fuel_card_number)
       VALUES ($1,$2,$3,COALESCE($4::timestamptz, now()),$5,$6,$7,$8,$9,$10) RETURNING *`,
      [body.tripId ?? null, body.truckId, body.driverId ?? null, body.purchaseDate ?? null, body.locationCity ?? null, body.locationState ?? null, body.gallons, body.pricePerGallon, total, body.fuelCardNumber ?? null],
    );
    reply.status(201);
    return toCamel(rows[0]!);
  });
}
