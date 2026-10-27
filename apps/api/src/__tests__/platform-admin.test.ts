import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import AdmZip from "adm-zip";
import { pool } from "../db/index.js";
import {
  ADMIN,
  PLATFORM_ADMIN,
  auth,
  createPlatformTenant,
  createTestApp,
  login,
  type CreatedTenant,
} from "./helpers.js";

const stamp = Date.now();

const EXPORT_TABLES = [
  "customers",
  "facilities",
  "routes",
  "drivers",
  "trucks",
  "trailers",
  "loads",
  "trips",
  "delivery_events",
  "fuel_purchases",
  "maintenance_records",
  "safety_incidents",
  "driver_monthly_metrics",
  "truck_utilization_metrics",
  "users",
  "audit_logs",
  "tenant_counters",
];

describe("platform administrator", () => {
  let app: FastifyInstance;
  let platformToken: string;
  let defaultToken: string;
  let tenant: CreatedTenant;
  let tenantToken: string;
  let rateTenant: CreatedTenant;
  let rateToken: string;

  const call = (token: string, method: "GET" | "POST" | "DELETE", url: string, payload?: unknown) =>
    app.inject({ method, url, headers: auth(token), payload: payload as never });

  beforeAll(async () => {
    app = await createTestApp();
    platformToken = await login(app, PLATFORM_ADMIN);
    defaultToken = await login(app, ADMIN);
    tenant = await createPlatformTenant(app, platformToken, {
      name: `Platform Lifecycle ${stamp}`,
      config: { timezone: "UTC" },
    });
    tenantToken = await login(app, {
      email: tenant.adminEmail,
      password: tenant.adminPassword,
    });
    rateTenant = await createPlatformTenant(app, platformToken, {
      name: `Rate Limited ${stamp}`,
      config: { rateLimit: { max: 2, timeWindowSeconds: 60 } },
    });
    rateToken = await login(app, {
      email: rateTenant.adminEmail,
      password: rateTenant.adminPassword,
    });
  });

  afterAll(async () => {
    for (const id of [tenant?.id, rateTenant?.id].filter(Boolean)) {
      await app.inject({
        method: "DELETE",
        url: `/api/platform/tenants/${id}`,
        headers: auth(platformToken),
      });
    }
    await app.close();
    await pool.end();
  });

  it("creates, lists and reads a tenant with its first administrator", async () => {
    const list = await call(platformToken, "GET", "/api/platform/tenants");
    expect(list.statusCode).toBe(200);
    expect(list.json().tenants.map((row: { id: string }) => row.id)).toContain(tenant.id);

    const get = await call(platformToken, "GET", `/api/platform/tenants/${tenant.id}`);
    expect(get.statusCode).toBe(200);
    expect(get.json().tenant).toMatchObject({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: "ACTIVE",
    });
    expect(get.json().tenant.config.rateLimit).toEqual({ max: 300, timeWindowSeconds: 60 });

    const me = await call(tenantToken, "GET", "/api/auth/me");
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({
      email: tenant.adminEmail,
      role: "ADMIN",
      tenantId: tenant.id,
      tenantName: tenant.name,
    });

    const tenantOnPlatform = await call(tenantToken, "GET", "/api/platform/tenants");
    expect(tenantOnPlatform.statusCode).toBe(403);

    const platformOnTenant = await call(platformToken, "GET", "/api/customers");
    expect(platformOnTenant.statusCode).toBe(403);
  });

  it("rejects duplicate slugs and emails without creating a partial tenant", async () => {
    const duplicateSlug = await call(platformToken, "POST", "/api/platform/tenants", {
      name: "Duplicate Slug",
      slug: tenant.slug,
      adminEmail: `other-${stamp}@example.test`,
      adminName: "Other Admin",
      adminPassword: "OtherPass@2026",
    });
    expect(duplicateSlug.statusCode).toBe(409);

    const duplicateEmailSlug = `duplicate-email-${stamp}`;
    const duplicateEmail = await call(platformToken, "POST", "/api/platform/tenants", {
      name: "Duplicate Email",
      slug: duplicateEmailSlug,
      adminEmail: tenant.adminEmail,
      adminName: "Other Admin",
      adminPassword: "OtherPass@2026",
    });
    expect(duplicateEmail.statusCode).toBe(409);

    const list = await call(platformToken, "GET", "/api/platform/tenants");
    expect(
      list.json().tenants.some((row: { slug: string }) => row.slug === duplicateEmailSlug),
    ).toBe(false);
  });

  it("streams a ZIP export containing every table CSV and a manifest", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/platform/tenants/${tenant.id}/export`,
      headers: auth(platformToken),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/zip");
    const raw = response.rawPayload;
    expect(Buffer.isBuffer(raw)).toBe(true);
    expect(raw.subarray(0, 2).toString()).toBe("PK");

    const zip = new AdmZip(raw);
    const names = zip.getEntries().map((entry) => entry.entryName);
    expect(names).toContain(`${tenant.slug}/manifest.json`);
    for (const table of EXPORT_TABLES) {
      expect(names).toContain(`${tenant.slug}/${table}.csv`);
    }
    expect(names).toHaveLength(EXPORT_TABLES.length + 1);

    const manifest = JSON.parse(zip.readAsText(`${tenant.slug}/manifest.json`));
    expect(manifest.tenant).toMatchObject({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: "ACTIVE",
    });
    expect(manifest.tables).toHaveLength(EXPORT_TABLES.length);
    const byName = new Map(
      manifest.tables.map((table: { name: string; rows: number }) => [table.name, table.rows]),
    );
    expect(byName.get("users")).toBeGreaterThanOrEqual(1);
    expect(byName.get("customers")).toBe(0);

    const customersCsv = zip.readAsText(`${tenant.slug}/customers.csv`);
    expect(customersCsv.split("\n")[0]).toContain("tenant_id");
    expect(customersCsv.split("\n")[0]).toContain("customer_id");
  });

  it("suspends, reactivates and soft-deletes a tenant without affecting others", async () => {
    const suspended = await call(platformToken, "POST", `/api/platform/tenants/${tenant.id}/suspend`);
    expect(suspended.statusCode).toBe(200);
    expect(suspended.json().tenant.status).toBe("SUSPENDED");

    const blocked = await call(tenantToken, "GET", "/api/auth/me");
    expect(blocked.statusCode).toBe(403);
    const defaultStillWorks = await call(defaultToken, "GET", "/api/auth/me");
    expect(defaultStillWorks.statusCode).toBe(200);

    const reactivated = await call(
      platformToken,
      "POST",
      `/api/platform/tenants/${tenant.id}/reactivate`,
    );
    expect(reactivated.statusCode).toBe(200);
    expect(reactivated.json().tenant.status).toBe("ACTIVE");
    const allowed = await call(tenantToken, "GET", "/api/auth/me");
    expect(allowed.statusCode).toBe(200);

    const deleted = await call(platformToken, "DELETE", `/api/platform/tenants/${tenant.id}`);
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().tenant.status).toBe("DELETED");
    const deletedBlocked = await call(tenantToken, "GET", "/api/auth/me");
    expect(deletedBlocked.statusCode).toBe(403);

    const exportDeleted = await call(
      platformToken,
      "GET",
      `/api/platform/tenants/${tenant.id}/export`,
    );
    expect(exportDeleted.statusCode).toBe(400);
  });

  it("enforces rate limits per tenant from tenants.config", async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await call(rateToken, "GET", "/api/auth/me");
      expect(response.statusCode).toBe(200);
    }
    const limited = await call(rateToken, "GET", "/api/auth/me");
    expect(limited.statusCode).toBe(429);
    expect(limited.json().code).toBe("RATE_LIMITED");

    const defaultStillWorks = await call(defaultToken, "GET", "/api/auth/me");
    expect(defaultStillWorks.statusCode).toBe(200);
  });
});
