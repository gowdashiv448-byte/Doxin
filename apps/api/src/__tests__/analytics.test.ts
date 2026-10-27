import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { pool } from "../db/index.js";
import { ADMIN, auth, createTestApp, login } from "./helpers.js";

describe("analytics", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    token = await login(app, ADMIN);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it.each(["overview", "monthly", "lanes", "customers", "drivers", "fleet", "safety"])(
    "serves the %s report",
    async (report) => {
      const response = await app.inject({
        method: "GET",
        url: `/api/analytics/${report}`,
        headers: auth(token),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toBeTypeOf("object");
      if (report !== "overview" && report !== "monthly" && report !== "safety") {
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBeGreaterThan(0);
      }
    },
  );

  it("returns fleet costs, margin and cost per mile", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/analytics/fleet?limit=5",
      headers: auth(token),
    });
    expect(response.statusCode).toBe(200);
    const row = response.json().data[0];
    expect(row).toMatchObject({
      truckId: expect.any(String),
      unitNumber: expect.any(String),
    });
    expect(row).toHaveProperty("maintenanceCost");
    expect(row).toHaveProperty("fuelCost");
    expect(row).toHaveProperty("margin");
    expect(row).toHaveProperty("costPerMile");
  });

  it("rejects malformed date filters", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/analytics/overview?from=not-a-date",
      headers: auth(token),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
  });
});
