import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { DEFAULT_TENANT_ID, pool } from "../db/index.js";
import { ADMIN, auth, createTestApp, login, tenantQuery as query } from "./helpers.js";

describe("authentication and administrator access", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    await query("UPDATE users SET theme_color = 'orange' WHERE email = $1", [ADMIN.email]);
    adminToken = await login(app, ADMIN);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("rejects invalid credentials without leaking which field failed", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: ADMIN.email, password: "not-the-password" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED",
      error: "Invalid email or password",
    });
  });

  it("protects private routes", async () => {
    const response = await app.inject({ method: "GET", url: "/api/loads" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects the removed non-administrator accounts", async () => {
    for (const email of [
      "dispatcher@doxin.com",
      "fleet@doxin.com",
      "safety@doxin.com",
      "finance@doxin.com",
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email, password: "Doxin@2026" },
      });
      expect(response.statusCode).toBe(401);
    }
  });

  it("returns the signed-in administrator session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: auth(adminToken),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({
      email: ADMIN.email,
      role: "ADMIN",
      themeColor: "orange",
      tenantId: DEFAULT_TENANT_ID,
      tenantName: "Doxin",
    });
  });

  it("persists the accent color preference and rejects unknown colors", async () => {
    const update = await app.inject({
      method: "PATCH",
      url: "/api/auth/preferences",
      headers: auth(adminToken),
      payload: { themeColor: "green" },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().user.themeColor).toBe("green");

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: auth(adminToken),
    });
    expect(me.json().user.themeColor).toBe("green");

    const invalid = await app.inject({
      method: "PATCH",
      url: "/api/auth/preferences",
      headers: auth(adminToken),
      payload: { themeColor: "red" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().code).toBe("VALIDATION_ERROR");

    const reset = await app.inject({
      method: "PATCH",
      url: "/api/auth/preferences",
      headers: auth(adminToken),
      payload: { themeColor: "orange" },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json().user.themeColor).toBe("orange");
  });

  it("allows the administrator to write operational and fleet data", async () => {
    const truck = await app.inject({
      method: "POST",
      url: "/api/trucks",
      headers: auth(adminToken),
      payload: { unitNumber: `AUTH-TEST-${Date.now()}`, make: "Freightliner", status: "Active" },
    });
    expect(truck.statusCode).toBe(201);
    await query("DELETE FROM trucks WHERE truck_id = $1", [truck.json().truckId]);
    await query("DELETE FROM audit_logs WHERE entity_type = 'Truck' AND entity_id = $1", [truck.json().truckId]);
  });
});
