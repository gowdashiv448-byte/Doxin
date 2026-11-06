import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { pool, DEFAULT_TENANT_ID, NORTHWIND_TENANT_ID } from "../db/index.js";
import {
  ADMIN,
  NORTHWIND_ADMIN,
  auth,
  createTestApp,
  login,
  tenantQuery as query,
  northwindQuery,
} from "./helpers.js";

const stamp = Date.now();
const DRIVER_ID = `DRV_ACC_${stamp}`;
const TRUCK_ID = `TRK_ACC_${stamp}`;
const TRAILER_ID = `TRL_ACC_${stamp}`;
const UNIT = `TRK-${stamp}`;
const TRAILER_NUM = `TRL-${stamp}`;

describe("Accounting, S3 Bill Generation, 18% GST, and AWS SES Receipts", () => {
  let app: FastifyInstance;
  let token: string;
  let northwindToken: string;
  let customerId: string;
  let routeId: string;
  let loadId: string;
  let generatedBillId: string;

  const call = (method: "GET" | "POST", url: string, payload?: unknown) =>
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
    northwindToken = await login(app, NORTHWIND_ADMIN);

    const customer = await query<{ customer_id: string }>(
      `SELECT customer_id FROM customers WHERE account_status = 'Active' ORDER BY customer_id LIMIT 1`,
    );
    const route = await query<{ route_id: string }>(
      `SELECT route_id FROM routes WHERE is_active = TRUE ORDER BY route_id LIMIT 1`,
    );
    customerId = customer.rows[0]!.customer_id;
    routeId = route.rows[0]!.route_id;

    // Ensure customer has a contact email for testing SES receipt sending
    await query(
      `UPDATE customers SET contact_email = 'customer.billing@test.com' WHERE customer_id = $1`,
      [customerId],
    );

    await query(
      `INSERT INTO drivers (driver_id, first_name, last_name, employment_status) VALUES ($1, 'Bill', 'Driver', 'Active')`,
      [DRIVER_ID],
    );
    await query(
      `INSERT INTO trucks (truck_id, unit_number, make, status) VALUES ($1, $2, 'Volvo', 'Active')`,
      [TRUCK_ID, UNIT],
    );
    await query(
      `INSERT INTO trailers (trailer_id, trailer_number, trailer_type, status) VALUES ($1, $2, 'Dry Van', 'Active')`,
      [TRAILER_ID, TRAILER_NUM],
    );
  });

  afterAll(async () => {
    if (loadId) {
      await query("DELETE FROM db_s3_bill WHERE load_id = $1", [loadId]);
      await query("DELETE FROM delivery_events WHERE load_id = $1", [loadId]);
      await query("DELETE FROM trips WHERE load_id = $1", [loadId]);
      await query("DELETE FROM loads WHERE load_id = $1", [loadId]);
    }
    await query("DELETE FROM drivers WHERE driver_id = $1", [DRIVER_ID]);
    await query("DELETE FROM trucks WHERE truck_id = $1", [TRUCK_ID]);
    await query("DELETE FROM trailers WHERE trailer_id = $1", [TRAILER_ID]);
    await pool.end();
  });

  it("automatically generates a bill with 18% GST and S3 attachment when delivery is completed", async () => {
    // 1. Create and progress a load through the lifecycle
    const createRes = await call("POST", "/api/loads", {
      customerId,
      routeId,
      loadDate: "2026-11-04",
      revenue: 2000,
      fuelSurcharge: 300,
      accessorialCharges: 100,
      book: true,
    });
    expect(createRes.statusCode).toBe(201);
    loadId = createRes.json().loadId;

    // Plan
    const planRes = await action(loadId, {
      action: "plan",
      driverId: DRIVER_ID,
      truckId: TRUCK_ID,
      trailerId: TRAILER_ID,
    });
    expect(planRes.statusCode).toBe(200);

    // Dispatch
    await action(loadId, { action: "dispatch" });

    // Start Transit
    await action(loadId, { action: "start_transit" });

    // Mark Delivered -> Triggers bill generation!
    const deliverRes = await action(loadId, { action: "mark_delivered" });
    expect(deliverRes.statusCode).toBe(200);
    const deliverJson = deliverRes.json();
    expect(deliverJson.loadStatus).toBe("DELIVERED");

    // Check that bill was generated and attached to the load
    expect(deliverJson.bill).toBeDefined();
    expect(deliverJson.bill.loadId).toBe(loadId);
    generatedBillId = deliverJson.bill.billId;
    expect(generatedBillId).toMatch(/^BILL\d+/);

    // 2. Verify Charges Breakdown and 18% GST calculation:
    // Subtotal = 2000 + 300 + 100 = 2400
    // GST (18%) = 2400 * 0.18 = 432
    // Total = 2400 + 432 = 2832
    expect(Number(deliverJson.bill.linehaulAmount)).toBe(2000);
    expect(Number(deliverJson.bill.fuelSurcharge)).toBe(300);
    expect(Number(deliverJson.bill.accessorialCharges)).toBe(100);
    expect(Number(deliverJson.bill.subtotal)).toBe(2400);
    expect(Number(deliverJson.bill.gstRate)).toBe(18);
    expect(Number(deliverJson.bill.gstAmount)).toBe(432);
    expect(Number(deliverJson.bill.totalAmount)).toBe(2832);

    // 3. Verify S3 location and Tenant association
    expect(deliverJson.bill.tenantId).toBe(DEFAULT_TENANT_ID);
    expect(deliverJson.bill.s3Url).toContain(`${DEFAULT_TENANT_ID}/bills/${generatedBillId}.pdf`);
    expect(deliverJson.bill.s3Url).toMatch(/^s3:\/\//);
    expect(deliverJson.bill.s3Key).toBe(`${DEFAULT_TENANT_ID}/bills/${generatedBillId}.pdf`);

    // 4. Verify Dispatcher Company Name and Recipient Email
    expect(deliverJson.bill.dispatcherCompanyName).toBeTruthy();
    expect(deliverJson.bill.recipientEmail).toBe("customer.billing@test.com");
    expect(["SENT", "SKIPPED"]).toContain(deliverJson.bill.emailStatus);

    // 5. Verify direct record in db_s3_bill table
    const dbRes = await query<{ bill_id: string; total_amount: string; s3_url: string }>(
      "SELECT * FROM db_s3_bill WHERE bill_id = $1",
      [generatedBillId],
    );
    expect(dbRes.rows).toHaveLength(1);
    expect(Number(dbRes.rows[0]!.total_amount)).toBe(2832);
  });

  it("serves the bill in accounting endpoints and provides PDF download", async () => {
    // List bills
    const listRes = await call("GET", `/api/accounting/bills?search=${loadId}`);
    expect(listRes.statusCode).toBe(200);
    const listJson = listRes.json();
    expect(listJson.data.some((b: any) => b.billId === generatedBillId)).toBe(true);

    // Get bill by ID
    const getRes = await call("GET", `/api/accounting/bills/${generatedBillId}`);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().billId).toBe(generatedBillId);
    expect(Number(getRes.json().totalAmount)).toBe(2832);

    // Get bill by Load ID
    const byLoadRes = await call("GET", `/api/accounting/bills/by-load/${loadId}`);
    expect(byLoadRes.statusCode).toBe(200);
    expect(byLoadRes.json().bill.billId).toBe(generatedBillId);

    // Download PDF
    const pdfRes = await call("GET", `/api/accounting/bills/${generatedBillId}/pdf`);
    expect(pdfRes.statusCode).toBe(200);
    expect(pdfRes.headers["content-type"]).toBe("application/pdf");
    expect(pdfRes.rawPayload.length).toBeGreaterThan(500);

    // Accounting summary
    const summaryRes = await call("GET", "/api/accounting/summary");
    expect(summaryRes.statusCode).toBe(200);
    expect(summaryRes.json().billsCount).toBeGreaterThanOrEqual(1);
    expect(summaryRes.json().totalGst).toBeGreaterThanOrEqual(432);
  });

  it("allows resending receipt email via AWS SES", async () => {
    const resendRes = await call("POST", `/api/accounting/bills/${generatedBillId}/resend-email`);
    expect(resendRes.statusCode).toBe(200);
    expect(resendRes.json().emailStatus).toBe("SENT");
    expect(resendRes.json().emailSentAt).toBeDefined();
  });

  it("factors the bill and 18% GST into revenue analytics", async () => {
    const overviewRes = await call("GET", "/api/analytics/overview");
    expect(overviewRes.statusCode).toBe(200);
    const overview = overviewRes.json();

    // Verify billed analytics properties
    expect(overview.billedRevenue).toBeGreaterThanOrEqual(2832);
    expect(overview.billedSubtotal).toBeGreaterThanOrEqual(2400);
    expect(overview.gstCollected).toBeGreaterThanOrEqual(432);
    expect(overview.billsCount).toBeGreaterThanOrEqual(1);

    // Verify monthly analytics
    const monthlyRes = await call("GET", "/api/analytics/monthly");
    expect(monthlyRes.statusCode).toBe(200);
    const monthlyData = monthlyRes.json().data;
    expect(monthlyData.length).toBeGreaterThan(0);
    const currentMonth = monthlyData.find((m: any) => Number(m.billedRevenue) > 0);
    expect(currentMonth).toBeDefined();
    expect(Number(currentMonth.gstCollected)).toBeGreaterThanOrEqual(432);
  });

  it("enforces multi-tenant isolation on db_s3_bill", async () => {
    // Another tenant should not see this tenant's bill in db_s3_bill
    const northwindRes = await app.inject({
      method: "GET",
      url: `/api/accounting/bills/${generatedBillId}`,
      headers: auth(northwindToken),
    });
    expect(northwindRes.statusCode).toBe(404);

    // Direct SQL with Northwind tenant context yields 0 rows due to RLS
    const directRes = await northwindQuery("SELECT * FROM db_s3_bill WHERE bill_id = $1", [
      generatedBillId,
    ]);
    expect(directRes.rows).toHaveLength(0);
  });

  it("serves sample dummy tax invoice PDF and supports token in query params", async () => {
    // 1. Authenticated via header
    const sampleRes = await call("GET", "/api/accounting/sample/pdf");
    expect(sampleRes.statusCode).toBe(200);
    expect(sampleRes.headers["content-type"]).toBe("application/pdf");
    expect(sampleRes.rawPayload.subarray(0, 4).toString()).toBe("%PDF");

    // 2. Authenticated via query parameter ?token=... (for direct browser tab viewing)
    const queryAuthRes = await app.inject({
      method: "GET",
      url: `/api/accounting/sample/pdf?token=${encodeURIComponent(token)}`,
    });
    expect(queryAuthRes.statusCode).toBe(200);
    expect(queryAuthRes.headers["content-type"]).toBe("application/pdf");
    expect(queryAuthRes.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("serves live load invoice preview PDF for active or completed loads", async () => {
    const previewRes = await call("GET", `/api/accounting/bills/preview/${loadId}/pdf`);
    expect(previewRes.statusCode).toBe(200);
    expect(previewRes.headers["content-type"]).toBe("application/pdf");
    expect(previewRes.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
  });
});
