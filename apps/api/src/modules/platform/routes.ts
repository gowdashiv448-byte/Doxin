import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ZipArchive, type Archiver } from "archiver";
import { to as copyTo } from "pg-copy-streams";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { PlatformTenant } from "@doxin/shared";
import { requirePlatformAdmin } from "../../plugins/auth.js";
import {
  query,
  systemQuery,
  withPlatformAdmin,
  withTenant,
} from "../../db/index.js";
import { audit } from "../../lib/audit.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers and hyphens");

const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  adminEmail: z.string().trim().toLowerCase().email(),
  adminName: z.string().trim().min(2).max(120),
  adminPassword: z.string().min(8, "Password must be at least 8 characters"),
  config: z.record(z.unknown()).optional(),
});

const tenantIdSchema = z.object({ id: z.string().uuid() });

interface TenantDbRow {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  shard_key: string | null;
  config: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

function toPlatformTenant(row: TenantDbRow): PlatformTenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    shardKey: row.shard_key,
    config: row.config,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function findTenant(id: string): Promise<TenantDbRow | undefined> {
  const { rows } = await systemQuery<TenantDbRow>(
    `SELECT id, name, slug, status, shard_key, config, created_at, updated_at
     FROM tenants WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function auditPlatform(
  request: Parameters<typeof audit>[0],
  input: Parameters<typeof audit>[1],
): Promise<void> {
  await withPlatformAdmin(request.user.id, async () => audit(request, input));
}

const EXPORT_TABLES: { name: string; columns: string[] }[] = [
  {
    name: "customers",
    columns: [
      "tenant_id", "customer_id", "customer_name", "customer_type", "credit_terms_days",
      "primary_freight_type", "account_status", "contract_start_date",
      "annual_revenue_potential", "contact_name", "contact_email", "contact_phone",
      "billing_address", "notes", "created_at", "updated_at",
    ],
  },
  {
    name: "facilities",
    columns: [
      "tenant_id", "facility_id", "facility_name", "facility_type", "city", "state",
      "latitude", "longitude", "dock_doors", "operating_hours", "address",
      "contact_name", "contact_phone", "created_at", "updated_at",
    ],
  },
  {
    name: "routes",
    columns: [
      "tenant_id", "route_id", "origin_city", "origin_state", "destination_city",
      "destination_state", "typical_distance_miles", "base_rate_per_mile",
      "fuel_surcharge_rate", "typical_transit_days", "is_active", "created_at", "updated_at",
    ],
  },
  {
    name: "drivers",
    columns: [
      "tenant_id", "driver_id", "first_name", "last_name", "hire_date",
      "termination_date", "license_number", "license_state", "date_of_birth",
      "home_terminal", "employment_status", "cdl_class", "years_experience", "phone",
      "email", "emergency_contact", "notes", "created_at", "updated_at",
    ],
  },
  {
    name: "trucks",
    columns: [
      "tenant_id", "truck_id", "unit_number", "make", "model_year", "vin",
      "acquisition_date", "acquisition_mileage", "current_odometer", "fuel_type",
      "tank_capacity_gallons", "status", "home_terminal", "last_service_date",
      "next_service_due", "created_at", "updated_at",
    ],
  },
  {
    name: "trailers",
    columns: [
      "tenant_id", "trailer_id", "trailer_number", "trailer_type", "length_feet",
      "model_year", "vin", "acquisition_date", "status", "current_location",
      "created_at", "updated_at",
    ],
  },
  {
    name: "loads",
    columns: [
      "tenant_id", "load_id", "customer_id", "route_id", "load_date", "load_type",
      "weight_lbs", "pieces", "revenue", "fuel_surcharge", "accessorial_charges",
      "load_status", "booking_type", "po_number", "notes", "exception_reason",
      "target_delivery_date", "created_by", "assigned_at", "dispatched_at",
      "delivered_at", "completed_at", "created_at", "updated_at",
    ],
  },
  {
    name: "trips",
    columns: [
      "tenant_id", "trip_id", "load_id", "driver_id", "truck_id", "trailer_id",
      "dispatch_date", "actual_distance_miles", "actual_duration_hours",
      "fuel_gallons_used", "average_mpg", "idle_time_hours", "odometer_start",
      "odometer_end", "trip_status", "completed_at", "created_at", "updated_at",
    ],
  },
  {
    name: "delivery_events",
    columns: [
      "tenant_id", "event_id", "load_id", "trip_id", "event_type", "facility_id",
      "scheduled_datetime", "actual_datetime", "detention_minutes", "on_time_flag",
      "location_city", "location_state", "notes", "recorded_by", "created_at",
    ],
  },
  {
    name: "fuel_purchases",
    columns: [
      "tenant_id", "fuel_purchase_id", "trip_id", "truck_id", "driver_id",
      "purchase_date", "location_city", "location_state", "gallons",
      "price_per_gallon", "total_cost", "fuel_card_number", "created_at",
    ],
  },
  {
    name: "maintenance_records",
    columns: [
      "tenant_id", "maintenance_id", "truck_id", "maintenance_date",
      "maintenance_type", "odometer_reading", "labor_hours", "labor_cost",
      "parts_cost", "total_cost", "facility_location", "downtime_hours",
      "service_description", "status", "created_by", "created_at", "updated_at",
    ],
  },
  {
    name: "safety_incidents",
    columns: [
      "tenant_id", "incident_id", "trip_id", "truck_id", "driver_id",
      "incident_date", "incident_type", "location_city", "location_state",
      "at_fault_flag", "injury_flag", "vehicle_damage_cost", "cargo_damage_cost",
      "claim_amount", "preventable_flag", "description", "status", "recorded_by",
      "created_at",
    ],
  },
  {
    name: "driver_monthly_metrics",
    columns: [
      "tenant_id", "driver_id", "month", "trips_completed", "total_miles",
      "total_revenue", "average_mpg", "total_fuel_gallons", "on_time_delivery_rate",
      "average_idle_hours",
    ],
  },
  {
    name: "truck_utilization_metrics",
    columns: [
      "tenant_id", "truck_id", "month", "trips_completed", "total_miles",
      "total_revenue", "average_mpg", "maintenance_events", "maintenance_cost",
      "downtime_hours", "utilization_rate",
    ],
  },
  {
    name: "users",
    columns: [
      "tenant_id", "id", "email", "name", "role", "theme_color", "is_active",
      "last_login_at", "created_at", "updated_at",
    ],
  },
  {
    name: "audit_logs",
    columns: [
      "tenant_id", "id", "actor_id", "actor_name", "action", "entity_type",
      "entity_id", "details", "created_at",
    ],
  },
  {
    name: "tenant_counters",
    columns: ["tenant_id", "name", "value"],
  },
];

function csvFilename(slug: string, table: string): string {
  return `${slug}/${table}.csv`;
}

async function appendTable(
  archive: Archiver,
  client: import("pg").PoolClient,
  tenantSlug: string,
  table: { name: string; columns: string[] },
  manifestTable: { name: string; file: string; rows: number },
): Promise<void> {
  const count = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table.name}`);
  manifestTable.rows = Number(count.rows[0]?.count ?? 0);

  const copy = client.query(
    copyTo(
      `COPY (SELECT ${table.columns.join(",")} FROM ${table.name}) TO STDOUT WITH (FORMAT csv, HEADER true)`,
    ) as unknown as string,
  ) as unknown as import("node:stream").Readable;
  const pass = new PassThrough();
  archive.append(pass, { name: csvFilename(tenantSlug, table.name) });
  await pipeline(copy, pass);
}

async function streamTenantExport(
  archive: Archiver,
  tenant: TenantDbRow,
): Promise<void> {
  const manifest: {
    tenant: {
      id: string;
      name: string;
      slug: string;
      status: string;
      shardKey: string | null;
      config: Record<string, unknown>;
    };
    exportedAt: string;
    tables: { name: string; file: string; rows: number }[];
  } = {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      shardKey: tenant.shard_key,
      config: tenant.config,
    },
    exportedAt: new Date().toISOString(),
    tables: EXPORT_TABLES.map((table) => ({
      name: table.name,
      file: csvFilename(tenant.slug, table.name),
      rows: 0,
    })),
  };

  await withTenant(tenant.id, async (client) => {
    for (let index = 0; index < EXPORT_TABLES.length; index += 1) {
      await appendTable(archive, client, tenant.slug, EXPORT_TABLES[index]!, manifest.tables[index]!);
    }
  });

  archive.append(JSON.stringify(manifest, null, 2), {
    name: `${tenant.slug}/manifest.json`,
  });
}

export default async function platformRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requirePlatformAdmin);

  app.get("/tenants", async () => {
    const { rows } = await systemQuery<TenantDbRow>(
      `SELECT id, name, slug, status, shard_key, config, created_at, updated_at
       FROM tenants ORDER BY created_at, id`,
    );
    return { tenants: rows.map(toPlatformTenant) };
  });

  app.get("/tenants/:id", async (request) => {
    const { id } = tenantIdSchema.parse(request.params);
    const tenant = await findTenant(id);
    if (!tenant) throw notFound("Tenant");
    return { tenant: toPlatformTenant(tenant) };
  });

  app.post("/tenants", async (request, reply) => {
    const body = createTenantSchema.parse(request.body);
    const existing = await systemQuery("SELECT 1 FROM tenants WHERE slug = $1", [body.slug]);
    if (existing.rowCount) throw conflict("That tenant slug is already in use");

    const tenantId = randomUUID();
    const passwordHash = await bcrypt.hash(body.adminPassword, 12);
    const config = {
      rateLimit: { max: 300, timeWindowSeconds: 60 },
      ...(body.config ?? {}),
    };

    await withTenant(tenantId, async (client) => {
      const tenant = await client.query<TenantDbRow>(
        `INSERT INTO tenants (id, name, slug, status, config)
         VALUES ($1,$2,$3,'ACTIVE',$4)
         ON CONFLICT (slug) DO NOTHING
         RETURNING id, name, slug, status, shard_key, config, created_at, updated_at`,
        [tenantId, body.name, body.slug, JSON.stringify(config)],
      );
      if (!tenant.rows[0]) throw conflict("That tenant slug is already in use");

      const admin = await client.query(
        `INSERT INTO users (tenant_id, email, name, password_hash, role)
         VALUES ($1,$2,$3,$4,'ADMIN')
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [tenantId, body.adminEmail, body.adminName, passwordHash],
      );
      if (!admin.rows[0]) throw conflict("That administrator email is already in use");
    });

    const tenant = await findTenant(tenantId);
    if (!tenant) throw new Error("Tenant creation failed");
    await auditPlatform(request, {
      action: "TENANT_CREATED",
      entityType: "tenant",
      entityId: tenantId,
      details: { slug: tenant.slug, adminEmail: body.adminEmail },
    });
    reply.code(201);
    return { tenant: toPlatformTenant(tenant) };
  });

  app.post("/tenants/:id/suspend", async (request) => {
    const { id } = tenantIdSchema.parse(request.params);
    const { rows } = await systemQuery<TenantDbRow>(
      `UPDATE tenants SET status = 'SUSPENDED', updated_at = now()
       WHERE id = $1 RETURNING id, name, slug, status, shard_key, config, created_at, updated_at`,
      [id],
    );
    if (!rows[0]) throw notFound("Tenant");
    await auditPlatform(request, {
      action: "TENANT_SUSPENDED",
      entityType: "tenant",
      entityId: id,
    });
    return { tenant: toPlatformTenant(rows[0]) };
  });

  app.post("/tenants/:id/reactivate", async (request) => {
    const { id } = tenantIdSchema.parse(request.params);
    const { rows } = await systemQuery<TenantDbRow>(
      `UPDATE tenants SET status = 'ACTIVE', updated_at = now()
       WHERE id = $1 RETURNING id, name, slug, status, shard_key, config, created_at, updated_at`,
      [id],
    );
    if (!rows[0]) throw notFound("Tenant");
    await auditPlatform(request, {
      action: "TENANT_REACTIVATED",
      entityType: "tenant",
      entityId: id,
    });
    return { tenant: toPlatformTenant(rows[0]) };
  });

  app.delete("/tenants/:id", async (request) => {
    const { id } = tenantIdSchema.parse(request.params);
    const { rows } = await systemQuery<TenantDbRow>(
      `UPDATE tenants SET status = 'DELETED', updated_at = now()
       WHERE id = $1 RETURNING id, name, slug, status, shard_key, config, created_at, updated_at`,
      [id],
    );
    if (!rows[0]) throw notFound("Tenant");
    await auditPlatform(request, {
      action: "TENANT_DELETED",
      entityType: "tenant",
      entityId: id,
    });
    return { tenant: toPlatformTenant(rows[0]) };
  });

  app.get("/tenants/:id/export", async (request, reply) => {
    const { id } = tenantIdSchema.parse(request.params);
    const tenant = await findTenant(id);
    if (!tenant) throw notFound("Tenant");
    if (tenant.status === "DELETED") throw badRequest("Deleted tenants cannot be exported");

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("warning", (error: Error) => request.log.warn({ err: error }, "Export archive warning"));
    archive.on("error", (error: Error) => request.log.error({ err: error }, "Export archive error"));

    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${tenant.slug}-export-${new Date()
        .toISOString()
        .slice(0, 10)}.zip"`,
      "cache-control": "no-store",
    });
    archive.pipe(reply.raw);

    try {
      await streamTenantExport(archive, tenant);
      await archive.finalize();
      await auditPlatform(request, {
        action: "TENANT_EXPORTED",
        entityType: "tenant",
        entityId: tenant.id,
      });
    } catch (error) {
      request.log.error({ err: error, tenantId: tenant.id }, "Tenant export failed");
      archive.abort();
      reply.raw.destroy(error as Error);
    }
    return reply;
  });
}
