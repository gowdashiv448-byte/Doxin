import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { pool } from "../db/index.js";
import { ADMIN, auth, createTestApp, login, tenantQuery as query } from "./helpers.js";

const stamp = Date.now();
const createdIds: string[] = [];

describe("master data CRUD", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    token = await login(app, ADMIN);
  });

  afterAll(async () => {
    if (createdIds.length)
      await query("DELETE FROM customers WHERE customer_id = ANY($1::text[])", [
        createdIds,
      ]);
    await query(
      "DELETE FROM audit_logs WHERE entity_type = 'Customer' AND entity_id = ANY($1::text[])",
      [createdIds],
    );
    await app.close();
    await pool.end();
  });

  it("creates, updates, searches and deletes a customer", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/customers",
      headers: auth(token),
      payload: {
        customerName: `CRUD Test ${stamp}`,
        customerType: "Contract",
        creditTermsDays: 30,
        primaryFreightType: "General",
        accountStatus: "Active",
      },
    });
    expect(create.statusCode).toBe(201);
    const customer = create.json();
    createdIds.push(customer.customerId);
    expect(customer.customerId).toMatch(/^CUST\d{5}$/);
    expect(customer.customerName).toBe(`CRUD Test ${stamp}`);

    const patch = await app.inject({
      method: "PATCH",
      url: `/api/customers/${customer.customerId}`,
      headers: auth(token),
      payload: { creditTermsDays: 45, contactName: "Dana Ops" },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({
      creditTermsDays: 45,
      contactName: "Dana Ops",
    });

    const search = await app.inject({
      method: "GET",
      url: `/api/customers?search=${encodeURIComponent(`CRUD Test ${stamp}`)}`,
      headers: auth(token),
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().data).toHaveLength(1);

    const remove = await app.inject({
      method: "DELETE",
      url: `/api/customers/${customer.customerId}`,
      headers: auth(token),
    });
    expect(remove.statusCode).toBe(200);
    createdIds.length = 0;

    const missing = await app.inject({
      method: "GET",
      url: `/api/customers/${customer.customerId}`,
      headers: auth(token),
    });
    expect(missing.statusCode).toBe(404);
  });

  it("lets the database allocate a master id when SQL omits it", async () => {
    const { rows } = await query<{ customer_id: string }>(
      "INSERT INTO customers (customer_name, customer_type) VALUES ($1, 'Spot') RETURNING customer_id",
      [`DB Default ${stamp}`],
    );
    const id = rows[0]!.customer_id;
    createdIds.push(id);
    expect(id).toMatch(/^CUST\d{5}$/);
  });
});
