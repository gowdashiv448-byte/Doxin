import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { pool } from "../db/index.js";
import { ADMIN, NORTHWIND_ADMIN, auth, createTestApp, login, tenantQuery as query } from "./helpers.js";

const stamp = Date.now();
const createdIds: string[] = [];

describe("contact book CRUD & tenant isolation", () => {
  let app: FastifyInstance;
  let defaultToken: string;
  let secondTenantToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    defaultToken = await login(app, ADMIN);
    secondTenantToken = await login(app, NORTHWIND_ADMIN);
  });

  afterAll(async () => {
    if (createdIds.length) {
      await query("DELETE FROM contacts WHERE contact_id = ANY($1::text[])", [createdIds]);
      await query("DELETE FROM audit_logs WHERE entity_type = 'Contact' AND entity_id = ANY($1::text[])", [createdIds]);
    }
    await app.close();
    await pool.end();
  });

  it("creates, updates, searches and deletes a contact in tenant context", async () => {
    // 1. Create
    const createRes = await app.inject({
      method: "POST",
      url: "/api/contacts",
      headers: auth(defaultToken),
      payload: {
        name: `Kavita Sharma ${stamp}`,
        companyName: "Reliance Logistics Park",
        mobileNumber: "+91 98200 11223",
        email: "kavita.s@reliancelogistics.example",
        description: "Manages container handling, warehouse bay allocations, and night dispatches",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const contact = createRes.json();
    expect(contact.contactId).toMatch(/^CON\d{5}$/);
    expect(contact.name).toBe(`Kavita Sharma ${stamp}`);
    expect(contact.companyName).toBe("Reliance Logistics Park");
    expect(contact.mobileNumber).toBe("+91 98200 11223");
    createdIds.push(contact.contactId);

    // 2. Read One
    const readRes = await app.inject({
      method: "GET",
      url: `/api/contacts/${contact.contactId}`,
      headers: auth(defaultToken),
    });
    expect(readRes.statusCode).toBe(200);
    expect(readRes.json().name).toBe(`Kavita Sharma ${stamp}`);

    // 3. Search in List
    const listRes = await app.inject({
      method: "GET",
      url: `/api/contacts?search=${encodeURIComponent(String(stamp))}`,
      headers: auth(defaultToken),
    });
    expect(listRes.statusCode).toBe(200);
    const listData = listRes.json();
    expect(listData.data.some((c: any) => c.contactId === contact.contactId)).toBe(true);

    // 4. Update
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/api/contacts/${contact.contactId}`,
      headers: auth(defaultToken),
      payload: {
        mobileNumber: "+91 98200 99999",
        description: "Updated responsibilities to senior warehouse director",
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().mobileNumber).toBe("+91 98200 99999");
    expect(updateRes.json().description).toBe("Updated responsibilities to senior warehouse director");

    // 5. Delete
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/contacts/${contact.contactId}`,
      headers: auth(defaultToken),
    });
    expect(deleteRes.statusCode).toBe(200);

    // 6. Confirm gone
    const verifyGone = await app.inject({
      method: "GET",
      url: `/api/contacts/${contact.contactId}`,
      headers: auth(defaultToken),
    });
    expect(verifyGone.statusCode).toBe(404);
  });

  it("enforces multi-tenant isolation on contacts", async () => {
    // Tenant 1 creates a contact
    const t1Create = await app.inject({
      method: "POST",
      url: "/api/contacts",
      headers: auth(defaultToken),
      payload: {
        name: `Tenant1 Secret Contact ${stamp}`,
        companyName: "Private Cargo Ltd",
        mobileNumber: "+91 90000 11111",
      },
    });
    expect(t1Create.statusCode).toBe(201);
    const t1Contact = t1Create.json();
    createdIds.push(t1Contact.contactId);

    // Tenant 2 attempts to read Tenant 1's contact -> 404
    const t2Read = await app.inject({
      method: "GET",
      url: `/api/contacts/${t1Contact.contactId}`,
      headers: auth(secondTenantToken),
    });
    expect(t2Read.statusCode).toBe(404);

    // Tenant 2 searches for Tenant 1's contact -> should not be in list
    const t2List = await app.inject({
      method: "GET",
      url: `/api/contacts?search=${encodeURIComponent(t1Contact.name)}`,
      headers: auth(secondTenantToken),
    });
    expect(t2List.statusCode).toBe(200);
    expect(t2List.json().data).toHaveLength(0);

    // Tenant 2 attempts to update Tenant 1's contact -> 404
    const t2Patch = await app.inject({
      method: "PATCH",
      url: `/api/contacts/${t1Contact.contactId}`,
      headers: auth(secondTenantToken),
      payload: { name: "Hijacked Contact" },
    });
    expect(t2Patch.statusCode).toBe(404);

    // Tenant 2 attempts to delete Tenant 1's contact -> 404
    const t2Delete = await app.inject({
      method: "DELETE",
      url: `/api/contacts/${t1Contact.contactId}`,
      headers: auth(secondTenantToken),
    });
    expect(t2Delete.statusCode).toBe(404);
  });
});
