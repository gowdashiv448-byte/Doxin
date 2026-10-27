import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { pool, withTenant } from "../db/index.js";
import {
  ADMIN,
  PLATFORM_ADMIN,
  auth,
  createPlatformTenant,
  createTestApp,
  login,
  tenantQuery,
  type CreatedTenant,
} from "./helpers.js";

const stamp = Date.now();

describe("tenant-scoped operations", () => {
  let app: FastifyInstance;
  let defaultToken: string;
  let platformToken: string;
  let tenant: CreatedTenant;
  let tenantToken: string;
  let firstLoadId: string;
  let secondLoadId: string;

  const call = (token: string, method: "GET" | "POST", url: string, payload?: unknown) =>
    app.inject({ method, url, headers: auth(token), payload: payload as never });

  beforeAll(async () => {
    app = await createTestApp();
    defaultToken = await login(app, ADMIN);
    platformToken = await login(app, PLATFORM_ADMIN);
    tenant = await createPlatformTenant(app, platformToken, {
      name: `Scoping Tenant ${stamp}`,
      config: { rateLimit: { max: 300, timeWindowSeconds: 60 } },
    });
    tenantToken = await login(app, {
      email: tenant.adminEmail,
      password: tenant.adminPassword,
    });

    await withTenant(tenant.id, async (client) => {
      await client.query(
        `INSERT INTO customers (customer_id, customer_name, customer_type, account_status)
         VALUES ('CUST00001', 'Scoping Customer', 'Contract', 'Active')`,
      );
      await client.query(
        `INSERT INTO routes (route_id, origin_city, origin_state, destination_city, destination_state,
                             typical_distance_miles, base_rate_per_mile, fuel_surcharge_rate, typical_transit_days)
         VALUES ('RTE00001', 'Chicago', 'IL', 'Columbus', 'OH', 355, 2.15, 0.24, 1)`,
      );
      await client.query(
        `INSERT INTO drivers (driver_id, first_name, last_name, employment_status)
         VALUES ('DRV00001', 'Scoping', 'Driver', 'Active')`,
      );
      await client.query(
        `INSERT INTO trucks (truck_id, unit_number, make, status)
         VALUES ('TRK00001', 'SCOPE-1', 'Freightliner', 'Active')`,
      );
      await client.query(
        `INSERT INTO trailers (trailer_id, trailer_number, trailer_type, status)
         VALUES ('TRL00001', 'SCOPE-TRL-1', 'Dry Van', 'Active')`,
      );
    });

    // The default tenant already has an active trip using these same business
    // keys. RLS must hide it from the new tenant while still enforcing
    // double-booking inside the new tenant.
    const defaultBusy = await tenantQuery(
      `SELECT 1 FROM trips
       WHERE driver_id = 'DRV00001' AND truck_id = 'TRK00001' AND trailer_id = 'TRL00001'
         AND trip_status IN ('PLANNED','DISPATCHED','IN_TRANSIT') LIMIT 1`,
    );
    expect(defaultBusy.rowCount).toBeGreaterThan(0);

    const first = await call(tenantToken, "POST", "/api/loads", {
      customerId: "CUST00001",
      routeId: "RTE00001",
      book: true,
      notes: `Scoping first ${stamp}`,
    });
    expect(first.statusCode).toBe(201);
    firstLoadId = first.json().loadId;

    const plan = await call(tenantToken, "POST", `/api/loads/${firstLoadId}/actions`, {
      action: "plan",
      driverId: "DRV00001",
      truckId: "TRK00001",
      trailerId: "TRL00001",
    });
    expect(plan.statusCode).toBe(200);

    const second = await call(tenantToken, "POST", "/api/loads", {
      customerId: "CUST00001",
      routeId: "RTE00001",
      book: true,
      notes: `Scoping second ${stamp}`,
    });
    expect(second.statusCode).toBe(201);
    secondLoadId = second.json().loadId;
  });

  afterAll(async () => {
    if (tenant) {
      await app.inject({
        method: "DELETE",
        url: `/api/platform/tenants/${tenant.id}`,
        headers: auth(platformToken),
      });
    }
    await app.close();
    await pool.end();
  });

  it("does not treat another tenant's active trip as a double-booking", async () => {
    const response = await call(tenantToken, "POST", `/api/loads/${secondLoadId}/actions`, {
      action: "plan",
      driverId: "DRV00001",
      truckId: "TRK00001",
      trailerId: "TRL00001",
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("CONFLICT");
    expect(response.json().details.loadId).toBe(firstLoadId);
  });

  it("serves analytics from only the current tenant", async () => {
    const overview = await call(tenantToken, "GET", "/api/analytics/overview");
    expect(overview.statusCode).toBe(200);
    expect(overview.json().loads).toBe(2);

    const defaultOverview = await call(defaultToken, "GET", "/api/analytics/overview");
    expect(defaultOverview.statusCode).toBe(200);
    expect(defaultOverview.json().loads).toBeGreaterThan(2);

    const lanes = await call(tenantToken, "GET", "/api/analytics/lanes");
    expect(lanes.statusCode).toBe(200);
    expect(lanes.json().data).toHaveLength(1);
    expect(lanes.json().data[0]).toMatchObject({ routeId: "RTE00001", loads: 2 });
  });

  it("serves dashboard counts from only the current tenant", async () => {
    const summary = await call(tenantToken, "GET", "/api/dashboard/summary");
    expect(summary.statusCode).toBe(200);
    expect(summary.json().activeLoads).toBe(2);

    const defaultSummary = await call(defaultToken, "GET", "/api/dashboard/summary");
    expect(defaultSummary.statusCode).toBe(200);
    expect(defaultSummary.json().activeLoads).toBeGreaterThan(2);
  });

  it("scopes audit entries to the tenant that performed the action", async () => {
    const audit = await call(tenantToken, "GET", `/api/audit?entityId=${firstLoadId}`);
    expect(audit.statusCode).toBe(200);
    expect(audit.json().total).toBeGreaterThan(0);
    for (const entry of audit.json().data) {
      expect(entry.tenantId).toBe(tenant.id);
    }

    const defaultAudit = await call(defaultToken, "GET", `/api/audit?entityId=${firstLoadId}`);
    expect(defaultAudit.statusCode).toBe(200);
    for (const entry of defaultAudit.json().data) {
      expect(entry.tenantId).not.toBe(tenant.id);
    }
  });
});
