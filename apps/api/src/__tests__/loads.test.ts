import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { pool } from "../db/index.js";
import { ADMIN, auth, createTestApp, login, tenantQuery as query } from "./helpers.js";

const stamp = Date.now();
const DRIVER_ID = `TST_D_${stamp}`;
const TRUCK_ID = `TST_T_${stamp}`;
const TRAILER_ID = `TST_R_${stamp}`;
const UNIT = `TST-${stamp}`;
const TRAILER_NUMBER = `TST-TRL-${stamp}`;
const createdLoads: string[] = [];

describe("load lifecycle and dispatch workflow", () => {
  let app: FastifyInstance;
  let token: string;
  let customerId: string;
  let routeId: string;
  let loadId: string;
  let conflictLoadId: string;

  const call = (
    method: "GET" | "POST" | "PATCH",
    url: string,
    payload?: unknown,
  ) =>
    app.inject({
      method,
      url,
      headers: auth(token),
      payload: payload as never,
    });

  const action = (id: string, payload: Record<string, unknown>) =>
    call("POST", `/api/loads/${id}/actions`, payload);

  beforeAll(async () => {
    app = await createTestApp();
    token = await login(app, ADMIN);

    const customer = await query<{ customer_id: string }>(
      "SELECT customer_id FROM customers WHERE account_status = 'Active' ORDER BY customer_id LIMIT 1",
    );
    const route = await query<{ route_id: string }>(
      "SELECT route_id FROM routes WHERE is_active = TRUE ORDER BY route_id LIMIT 1",
    );
    customerId = customer.rows[0]!.customer_id;
    routeId = route.rows[0]!.route_id;

    await query(
      `INSERT INTO drivers (driver_id, first_name, last_name, employment_status) VALUES ($1, 'Test', 'Driver', 'Active')`,
      [DRIVER_ID],
    );
    await query(
      `INSERT INTO trucks (truck_id, unit_number, make, status) VALUES ($1, $2, 'Freightliner', 'Active')`,
      [TRUCK_ID, UNIT],
    );
    await query(
      `INSERT INTO trailers (trailer_id, trailer_number, trailer_type, status) VALUES ($1, $2, 'Dry Van', 'Active')`,
      [TRAILER_ID, TRAILER_NUMBER],
    );
  });

  afterAll(async () => {
    for (const id of createdLoads) {
      await query(
        "DELETE FROM audit_logs WHERE entity_type = 'load' AND entity_id = $1",
        [id],
      );
    }
    if (createdLoads.length) {
      await query("DELETE FROM loads WHERE load_id = ANY($1::text[])", [
        createdLoads,
      ]);
    }
    await query("DELETE FROM drivers WHERE driver_id = $1", [DRIVER_ID]);
    await query("DELETE FROM trucks WHERE truck_id = $1", [TRUCK_ID]);
    await query("DELETE FROM trailers WHERE trailer_id = $1", [TRAILER_ID]);
    await app.close();
    await pool.end();
  });

  it("creates a draft load with commercially derived pricing", async () => {
    const response = await call("POST", "/api/loads", {
      customerId,
      routeId,
      loadType: "Dry Van",
      weightLbs: 42_000,
      bookingType: "Spot",
      notes: `Lifecycle test ${stamp}`,
    });
    expect(response.statusCode).toBe(201);
    const load = response.json();
    loadId = load.loadId;
    createdLoads.push(loadId);
    expect(load.loadStatus).toBe("DRAFT");
    expect(Number(load.revenue)).toBeGreaterThan(0);
  });

  it("blocks out-of-order transitions with the allowed actions attached", async () => {
    const response = await action(loadId, { action: "dispatch" });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      code: "UNPROCESSABLE",
      details: { currentStatus: "DRAFT" },
    });
    expect(response.json().details.allowedActions).toContain("book");
  });

  it("books a load", async () => {
    const response = await action(loadId, { action: "book" });
    expect(response.statusCode).toBe(200);
    expect(response.json().loadStatus).toBe("BOOKED");
  });

  it("requires driver, truck and trailer before planning", async () => {
    const response = await action(loadId, { action: "plan" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/driver, truck and trailer/i);
  });

  it("assigns available resources and creates a trip", async () => {
    const response = await action(loadId, {
      action: "plan",
      driverId: DRIVER_ID,
      truckId: TRUCK_ID,
      trailerId: TRAILER_ID,
    });
    expect(response.statusCode).toBe(200);
    const load = response.json();
    expect(load.loadStatus).toBe("PLANNED");
    expect(load).toMatchObject({
      driverId: DRIVER_ID,
      truckId: TRUCK_ID,
      trailerId: TRAILER_ID,
      tripStatus: "PLANNED",
    });
  });

  it("prevents double-booking the same driver, truck or trailer", async () => {
    const create = await call("POST", "/api/loads", {
      customerId,
      routeId,
      book: true,
    });
    expect(create.statusCode).toBe(201);
    conflictLoadId = create.json().loadId;
    createdLoads.push(conflictLoadId);

    const response = await action(conflictLoadId, {
      action: "plan",
      driverId: DRIVER_ID,
      truckId: TRUCK_ID,
      trailerId: TRAILER_ID,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("CONFLICT");
    expect(response.json().details).toMatchObject({ loadId });
  });

  it("moves through dispatch, transit, exception recovery, delivery and completion", async () => {
    expect(
      (await action(loadId, { action: "dispatch" })).json().loadStatus,
    ).toBe("DISPATCHED");
    expect(
      (await action(loadId, { action: "start_transit" })).json().loadStatus,
    ).toBe("IN_TRANSIT");

    const noReason = await action(loadId, { action: "flag_exception" });
    expect(noReason.statusCode).toBe(400);

    const flagged = await action(loadId, {
      action: "flag_exception",
      reason: "Receiver dock closed",
    });
    expect(flagged.json().loadStatus).toBe("EXCEPTION");
    expect(flagged.json().exceptionReason).toBe("Receiver dock closed");

    const resolved = await action(loadId, { action: "resolve_exception" });
    expect(resolved.json().loadStatus).toBe("PLANNED");
    expect(resolved.json().exceptionReason).toBeNull();

    expect(
      (await action(loadId, { action: "dispatch" })).json().loadStatus,
    ).toBe("DISPATCHED");
    expect(
      (await action(loadId, { action: "start_transit" })).json().loadStatus,
    ).toBe("IN_TRANSIT");
    expect(
      (await action(loadId, { action: "mark_delivered" })).json().loadStatus,
    ).toBe("DELIVERED");
    expect(
      (await action(loadId, { action: "complete" })).json().loadStatus,
    ).toBe("COMPLETED");
  });

  it("records pickup and delivery events automatically through the lifecycle", async () => {
    const detail = await call("GET", `/api/loads/${loadId}`);
    expect(detail.statusCode).toBe(200);
    const load = detail.json();
    expect(
      load.events.filter(
        (event: { eventType: string }) => event.eventType === "Pickup",
      ),
    ).toHaveLength(1);
    expect(
      load.events.filter(
        (event: { eventType: string }) => event.eventType === "Delivery",
      ),
    ).toHaveLength(1);
    const actions = load.timeline.map(
      (entry: { action: string }) => entry.action,
    );
    for (const expected of [
      "CREATE",
      "BOOK",
      "PLAN",
      "DISPATCH",
      "START_TRANSIT",
      "FLAG_EXCEPTION",
      "RESOLVE_EXCEPTION",
      "MARK_DELIVERED",
      "COMPLETE",
    ]) {
      expect(actions).toContain(expected);
    }
    expect(load.trip.tripStatus).toBe("COMPLETED");
  });

  it("refuses transitions from a terminal state", async () => {
    const response = await action(loadId, { action: "cancel" });
    expect(response.statusCode).toBe(422);
    expect(response.json().details.allowedActions).toEqual([]);
  });
});
