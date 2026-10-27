import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  NORTHWIND_TENANT_ID,
  ownerQuery,
  pool,
  systemQuery,
  withTenant,
} from "../db/index.js";
import {
  ADMIN,
  NORTHWIND_ADMIN,
  auth,
  createTestApp,
  login,
  northwindQuery,
  tenantQuery,
} from "./helpers.js";

const stamp = Date.now();
const NW_CUSTOMER_ID = `TST_NW_C_${stamp}`;
const NW_FACILITY_ID = `TST_NW_F_${stamp}`;
const NW_ROUTE_ID = `TST_NW_RTE_${stamp}`;
const NW_ONLY_LOAD_ID = `TST_NW_LOAD_${stamp}`;
const NW_ONLY_TRIP_ID = `TST_NW_TRIP_${stamp}`;
const NW_DRIVER_ID = `TST_NW_D_${stamp}`;
const NW_TRUCK_ID = `TST_NW_T_${stamp}`;
const NW_TRAILER_ID = `TST_NW_R_${stamp}`;
const NW_UNIT = `TST-NW-${stamp}`;
const NW_TRAILER_NUMBER = `TST-NW-TRL-${stamp}`;
const createdNorthwindLoads: string[] = [];

const TENANT_TABLES = [
  "users",
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
  "audit_logs",
  "tenant_counters",
];

const NOT_NULL_TENANT_TABLES = TENANT_TABLES.filter(
  (table) => table !== "users" && table !== "audit_logs",
);

describe("tenant isolation", () => {
  let app: FastifyInstance;
  let defaultToken: string;
  let northwindToken: string;
  let defaultIds: Record<string, string>;
  let northwindIds: Record<string, string>;
  let northwindLoadId: string;
  let northwindTripId: string;

  const call = (token: string, method: "GET" | "POST", url: string, payload?: unknown) =>
    app.inject({ method, url, headers: auth(token), payload: payload as never });

  async function pickDefaultIdNotInNorthwind(
    table: string,
    idColumn: string,
    order: "ASC" | "DESC" = "ASC",
    limit = 500,
  ): Promise<string> {
    const { rows } = await tenantQuery<Record<string, string>>(
      `SELECT ${idColumn} FROM ${table} ORDER BY ${idColumn} ${order} LIMIT ${limit}`,
    );
    for (const row of rows) {
      const exists = await northwindQuery(
        `SELECT 1 FROM ${table} WHERE ${idColumn} = $1`,
        [row[idColumn]],
      );
      if (!exists.rowCount) return row[idColumn]!;
    }
    throw new Error(`No default ${table} id is absent from Northwind`);
  }

  beforeAll(async () => {
    app = await createTestApp();
    defaultToken = await login(app, ADMIN);
    northwindToken = await login(app, NORTHWIND_ADMIN);

    const [customerId, facilityId, routeId, driverId, truckId, trailerId] = await Promise.all([
      pickDefaultIdNotInNorthwind("customers", "customer_id"),
      pickDefaultIdNotInNorthwind("facilities", "facility_id"),
      pickDefaultIdNotInNorthwind("routes", "route_id"),
      pickDefaultIdNotInNorthwind("drivers", "driver_id"),
      pickDefaultIdNotInNorthwind("trucks", "truck_id"),
      pickDefaultIdNotInNorthwind("trailers", "trailer_id"),
    ]);
    const [loadId, tripId] = await Promise.all([
      pickDefaultIdNotInNorthwind("loads", "load_id", "DESC", 50),
      pickDefaultIdNotInNorthwind("trips", "trip_id", "DESC", 50),
    ]);
    defaultIds = {
      customer: customerId,
      facility: facilityId,
      route: routeId,
      driver: driverId,
      truck: truckId,
      trailer: trailerId,
      load: loadId,
      trip: tripId,
    };

    northwindIds = {
      customer: NW_CUSTOMER_ID,
      facility: NW_FACILITY_ID,
      route: NW_ROUTE_ID,
      driver: NW_DRIVER_ID,
      truck: NW_TRUCK_ID,
      trailer: NW_TRAILER_ID,
    };

    await northwindQuery(
      `INSERT INTO customers (customer_id, customer_name, customer_type, account_status)
       VALUES ($1, 'Isolation Customer', 'Contract', 'Active')`,
      [NW_CUSTOMER_ID],
    );
    await northwindQuery(
      `INSERT INTO facilities (facility_id, facility_name, facility_type, city, state)
       VALUES ($1, 'Isolation Facility', 'Terminal', 'Chicago', 'IL')`,
      [NW_FACILITY_ID],
    );
    await northwindQuery(
      `INSERT INTO routes (route_id, origin_city, origin_state, destination_city, destination_state,
                           typical_distance_miles, base_rate_per_mile, fuel_surcharge_rate, typical_transit_days)
       VALUES ($1, 'Chicago', 'IL', 'Columbus', 'OH', 355, 2.15, 0.24, 1)`,
      [NW_ROUTE_ID],
    );
    await northwindQuery(
      `INSERT INTO drivers (driver_id, first_name, last_name, employment_status)
       VALUES ($1, 'Isolation', 'Driver', 'Active')`,
      [NW_DRIVER_ID],
    );
    await northwindQuery(
      `INSERT INTO trucks (truck_id, unit_number, make, status)
       VALUES ($1, $2, 'Freightliner', 'Active')`,
      [NW_TRUCK_ID, NW_UNIT],
    );
    await northwindQuery(
      `INSERT INTO trailers (trailer_id, trailer_number, trailer_type, status)
       VALUES ($1, $2, 'Dry Van', 'Active')`,
      [NW_TRAILER_ID, NW_TRAILER_NUMBER],
    );
    const create = await call(northwindToken, "POST", "/api/loads", {
      customerId: northwindIds.customer,
      routeId: northwindIds.route,
      book: true,
      notes: `Tenant isolation ${stamp}`,
    });
    expect(create.statusCode).toBe(201);
    northwindLoadId = create.json().loadId;
    createdNorthwindLoads.push(northwindLoadId);

    const plan = await call(northwindToken, "POST", `/api/loads/${northwindLoadId}/actions`, {
      action: "plan",
      driverId: NW_DRIVER_ID,
      truckId: NW_TRUCK_ID,
      trailerId: NW_TRAILER_ID,
    });
    expect(plan.statusCode).toBe(200);
    northwindTripId = plan.json().tripId;
    expect(northwindTripId).toBeTruthy();

    // A second, Northwind-only load/trip whose business keys do not exist in
    // the default tenant. This lets the 404 assertions distinguish a real
    // cross-tenant lookup from a legitimate duplicate business key.
    await northwindQuery(
      `INSERT INTO loads (load_id, customer_id, route_id, load_date, load_status, booking_type)
       VALUES ($1, $2, $3, CURRENT_DATE, 'PLANNED', 'Contract')`,
      [NW_ONLY_LOAD_ID, NW_CUSTOMER_ID, NW_ROUTE_ID],
    );
    await northwindQuery(
      `INSERT INTO trips (trip_id, load_id, driver_id, truck_id, trailer_id, dispatch_date, trip_status)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'PLANNED')`,
      [NW_ONLY_TRIP_ID, NW_ONLY_LOAD_ID, NW_DRIVER_ID, NW_TRUCK_ID, NW_TRAILER_ID],
    );

  });

  afterAll(async () => {
    if (createdNorthwindLoads.length) {
      await northwindQuery(
        "DELETE FROM audit_logs WHERE entity_type = 'load' AND entity_id = ANY($1::text[])",
        [createdNorthwindLoads],
      );
      await northwindQuery("DELETE FROM loads WHERE load_id = ANY($1::text[])", [
        createdNorthwindLoads,
      ]);
    }
    await northwindQuery("DELETE FROM loads WHERE load_id = $1", [NW_ONLY_LOAD_ID]);
    await northwindQuery("DELETE FROM customers WHERE customer_id = $1", [NW_CUSTOMER_ID]);
    await northwindQuery("DELETE FROM facilities WHERE facility_id = $1", [NW_FACILITY_ID]);
    await northwindQuery("DELETE FROM routes WHERE route_id = $1", [NW_ROUTE_ID]);
    await northwindQuery("DELETE FROM drivers WHERE driver_id = $1", [NW_DRIVER_ID]);
    await northwindQuery("DELETE FROM trucks WHERE truck_id = $1", [NW_TRUCK_ID]);
    await northwindQuery("DELETE FROM trailers WHERE trailer_id = $1", [NW_TRAILER_ID]);
    await app.close();
    await pool.end();
  });

  it("forces RLS with zero rows when no tenant context exists", async () => {
    for (const table of ["customers", "loads", "trips", "delivery_events", "fuel_purchases"]) {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${table}`,
      );
      expect(rows[0]!.count).toBe("0");
    }
    const tenants = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM tenants");
    expect(Number(tenants.rows[0]!.count)).toBeGreaterThanOrEqual(2);
  });

  it("marks every tenant-owned table as FORCE ROW LEVEL SECURITY", async () => {
    const { rows } = await systemQuery<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relname, relrowsecurity, relforcerowsecurity
       FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1::text[])`,
      [TENANT_TABLES],
    );
    expect(rows).toHaveLength(TENANT_TABLES.length);
    for (const row of rows) {
      expect(row.relrowsecurity, `${row.relname} must enable RLS`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} must force RLS`).toBe(true);
    }
  });

  it("uses a non-superuser app role and a dedicated lookup role", async () => {
    const { rows } = await systemQuery<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcanlogin: boolean;
    }>(
      `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
       FROM pg_roles WHERE rolname IN ('doxin_app', 'doxin_auth_lookup') ORDER BY rolname`,
    );
    expect(rows).toHaveLength(2);
    const appRole = rows.find((row) => row.rolname === "doxin_app")!;
    const lookupRole = rows.find((row) => row.rolname === "doxin_auth_lookup")!;
    expect(appRole).toMatchObject({ rolsuper: false, rolbypassrls: false, rolcanlogin: true });
    expect(lookupRole).toMatchObject({ rolsuper: false, rolbypassrls: true, rolcanlogin: false });
  });

  it("keeps tenant_id NOT NULL on every tenant-owned table", async () => {
    const { rows } = await systemQuery<{ table_name: string; is_nullable: string }>(
      `SELECT table_name, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'tenant_id'`,
    );
    const byTable = new Map(rows.map((row) => [row.table_name, row.is_nullable]));
    for (const table of NOT_NULL_TENANT_TABLES) {
      expect(byTable.get(table), `${table}.tenant_id must be NOT NULL`).toBe("NO");
    }
    expect(byTable.get("users")).toBe("YES");
    expect(byTable.get("audit_logs")).toBe("YES");
  });

  it("backfilled every required tenant row without losing archived volume", async () => {
    const nulls = await ownerQuery<Record<string, string>>(
      `SELECT
        (SELECT count(*) FROM customers WHERE tenant_id IS NULL) AS customers,
        (SELECT count(*) FROM loads WHERE tenant_id IS NULL) AS loads,
        (SELECT count(*) FROM trips WHERE tenant_id IS NULL) AS trips,
        (SELECT count(*) FROM delivery_events WHERE tenant_id IS NULL) AS delivery_events,
        (SELECT count(*) FROM fuel_purchases WHERE tenant_id IS NULL) AS fuel_purchases,
        (SELECT count(*) FROM trailers WHERE tenant_id IS NULL) AS trailers`,
    );
    for (const [table, count] of Object.entries(nulls.rows[0]!)) {
      expect(count, `${table} has NULL tenant_id rows`).toBe("0");
    }

    const counts = await ownerQuery<Record<string, string>>(
      `SELECT
        (SELECT count(*) FROM loads WHERE tenant_id = $1) AS loads,
        (SELECT count(*) FROM trips WHERE tenant_id = $1) AS trips,
        (SELECT count(*) FROM delivery_events WHERE tenant_id = $1) AS delivery_events,
        (SELECT count(*) FROM fuel_purchases WHERE tenant_id = $1) AS fuel_purchases`,
      ["00000000-0000-0000-0000-000000000001"],
    );
    // The archive contains 85,410 loads and trips, 170,820 delivery events and
    // 196,442 fuel purchases. The seed adds live operations on top, so assert
    // the archive baseline rather than a count tied to the seed's current date.
    expect(Number(counts.rows[0]!.loads)).toBeGreaterThanOrEqual(85_410);
    expect(Number(counts.rows[0]!.trips)).toBeGreaterThanOrEqual(85_410);
    expect(Number(counts.rows[0]!.delivery_events)).toBeGreaterThanOrEqual(170_820);
    expect(Number(counts.rows[0]!.fuel_purchases)).toBeGreaterThanOrEqual(196_442);

    const cleanup = await ownerQuery<{ count: string }>(
      "SELECT count(*)::text AS count FROM migration_data_cleanup WHERE migration = '005' AND table_name = 'trailers'",
    );
    expect(cleanup.rows[0]!.count).toBe("4");
    const duplicates = await ownerQuery<{ count: string }>(
      `SELECT count(*)::text AS count FROM (
         SELECT tenant_id, trailer_number FROM trailers GROUP BY tenant_id, trailer_number HAVING count(*) > 1
       ) duplicates`,
    );
    expect(duplicates.rows[0]!.count).toBe("0");
  });

  it("allows the same business key in different tenants", async () => {
    const def = await call(defaultToken, "GET", "/api/customers/CUST00001");
    const nw = await call(northwindToken, "GET", "/api/customers/CUST00001");
    expect(def.statusCode).toBe(200);
    expect(nw.statusCode).toBe(200);
    expect(def.json().customerName).toBe("Metro Wholesale");
    expect(nw.json().customerName).toBe("Northwind Retail");
    expect(def.json().customerId).toBe(nw.json().customerId);

    const defSearch = await call(defaultToken, "GET", "/api/customers?search=Northwind%20Retail");
    expect(defSearch.statusCode).toBe(200);
    expect(defSearch.json().total).toBe(0);
  });

  it("returns 404 for cross-tenant ID lookups in every module that exposes one", async () => {
    const endpoints = [
      ["customer", "/api/customers"],
      ["facility", "/api/facilities"],
      ["route", "/api/routes"],
      ["driver", "/api/drivers"],
      ["truck", "/api/trucks"],
      ["trailer", "/api/trailers"],
      ["load", "/api/loads"],
      ["trip", "/api/trips"],
    ] as const;

    for (const [key, base] of endpoints) {
      const response = await call(northwindToken, "GET", `${base}/${defaultIds[key]}`);
      expect(response.statusCode, `${base} leaked a default-tenant row`).toBe(404);
    }
    const activity = await call(northwindToken, "GET", `/api/trucks/${defaultIds.truck}/activity`);
    expect(activity.statusCode).toBe(404);

    for (const [key, base] of endpoints) {
      const id =
        key === "load" ? NW_ONLY_LOAD_ID : key === "trip" ? NW_ONLY_TRIP_ID : northwindIds[key];
      const response = await call(defaultToken, "GET", `${base}/${id}`);
      expect(response.statusCode, `${base} leaked a Northwind row`).toBe(404);
    }
    const nwActivity = await call(defaultToken, "GET", `/api/trucks/${northwindIds.truck}/activity`);
    expect(nwActivity.statusCode).toBe(404);
  });

  it("filters list-only modules by tenant", async () => {
    const checks = [
      ["/api/fuel", "truckId", northwindIds.truck, defaultToken],
      ["/api/fuel", "truckId", defaultIds.truck, northwindToken],
      ["/api/maintenance", "truckId", northwindIds.truck, defaultToken],
      ["/api/maintenance", "truckId", defaultIds.truck, northwindToken],
      ["/api/safety", "driverId", northwindIds.driver, defaultToken],
      ["/api/safety", "driverId", defaultIds.driver, northwindToken],
      ["/api/events", "loadId", NW_ONLY_LOAD_ID, defaultToken],
      ["/api/events", "loadId", defaultIds.load, northwindToken],
    ] as const;
    for (const [url, param, value, token] of checks) {
      const response = await call(token, "GET", `${url}?${param}=${encodeURIComponent(value)}`);
      expect(response.statusCode, `${url}?${param}=${value}`).toBe(200);
      expect(response.json().data, `${url} leaked rows`).toHaveLength(0);
    }

    const defaultAudit = await call(defaultToken, "GET", `/api/audit?entityId=${northwindLoadId}`);
    expect(defaultAudit.statusCode).toBe(200);
    expect(defaultAudit.json().total).toBe(0);

    const nwAudit = await call(northwindToken, "GET", `/api/audit?entityId=${northwindLoadId}`);
    expect(nwAudit.statusCode).toBe(200);
    expect(nwAudit.json().total).toBeGreaterThan(0);
    for (const entry of nwAudit.json().data) {
      expect(entry.tenantId).toBe(NORTHWIND_TENANT_ID);
    }
  });

  it("rejects cross-tenant writes at the composite foreign key", async () => {
    const defaultCustomer = defaultIds.customer;
    const defaultRoute = defaultIds.route;
    const defaultTruck = defaultIds.truck;

    await expect(
      withTenant(NORTHWIND_TENANT_ID, (client) =>
        client.query(
          "INSERT INTO loads (customer_id, route_id, load_date) VALUES ($1,$2,CURRENT_DATE)",
          [defaultCustomer, defaultRoute],
        ),
      ),
    ).rejects.toMatchObject({ code: "23503" });

    const defaultUser = await tenantQuery<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [ADMIN.email],
    );
    await expect(
      withTenant(NORTHWIND_TENANT_ID, (client) =>
        client.query(
          `INSERT INTO audit_logs (tenant_id, actor_id, actor_name, action, entity_type, entity_id)
           VALUES ($1, $2, 'Cross tenant', 'TEST', 'test', 'cross-tenant-actor')`,
          [NORTHWIND_TENANT_ID, defaultUser.rows[0]!.id],
        ),
      ),
    ).rejects.toMatchObject({ code: "23503" });

    const fuel = await call(northwindToken, "POST", "/api/fuel", {
      truckId: defaultTruck,
      gallons: 10,
      pricePerGallon: 4,
    });
    expect(fuel.statusCode).toBe(409);
    expect(fuel.json().code).toBe("REFERENCE");

    const event = await call(northwindToken, "POST", "/api/events", {
      loadId: defaultIds.load,
      eventType: "Pickup",
    });
    expect(event.statusCode).toBe(409);
    expect(event.json().code).toBe("REFERENCE");

    const leakedFuel = await northwindQuery(
      "SELECT 1 FROM fuel_purchases WHERE truck_id = $1",
      [defaultTruck],
    );
    expect(leakedFuel.rowCount).toBe(0);
    const leakedEvent = await northwindQuery(
      "SELECT 1 FROM delivery_events WHERE load_id = $1",
      [defaultIds.load],
    );
    expect(leakedEvent.rowCount).toBe(0);
  });

  it("rejects tampered and forged tenant claims", async () => {
    const me = await call(defaultToken, "GET", "/api/auth/me");
    expect(me.statusCode).toBe(200);
    const user = me.json().user;

    const forged = app.jwt.sign({
      id: user.id,
      email: user.email,
      name: user.name,
      role: "ADMIN",
      themeColor: "orange",
      tenantId: NORTHWIND_TENANT_ID,
      tenantName: "Northwind Logistics",
      tid: NORTHWIND_TENANT_ID,
    });
    const forgedResponse = await call(forged, "GET", "/api/auth/me");
    expect(forgedResponse.statusCode).toBe(401);

    const last = defaultToken.slice(-1);
    const tampered = `${defaultToken.slice(0, -1)}${last === "a" ? "b" : "a"}`;
    const tamperedResponse = await call(tampered, "GET", "/api/auth/me");
    expect(tamperedResponse.statusCode).toBe(401);

    const noTenantClaim = app.jwt.sign({
      id: user.id,
      email: user.email,
      name: user.name,
      role: "ADMIN",
      themeColor: "orange",
      tenantId: user.tenantId,
      tenantName: user.tenantName,
    });
    const noTenantResponse = await call(noTenantClaim, "GET", "/api/auth/me");
    expect(noTenantResponse.statusCode).toBe(401);

    const stillValid = await call(defaultToken, "GET", "/api/auth/me");
    expect(stillValid.statusCode).toBe(200);
  });
});
