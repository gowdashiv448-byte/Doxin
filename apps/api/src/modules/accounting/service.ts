import type pg from "pg";
import type { Bill, BillChargesBreakdown, BillTripDetails, AccountingSummary } from "@doxin/shared";
import { query, withTransaction, requireTenantId } from "../../db/index.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { toCamel } from "../../lib/crud.js";
import { paginate, pageResult, type Pagination } from "../../lib/pagination.js";
import { generateInvoicePdf } from "./pdf.js";
import { uploadBillToS3, fetchBillPdf } from "./s3.js";
import { sendBillEmail } from "./ses.js";

export interface BillListQuery extends Pagination {
  status?: string;
  customerId?: string;
  from?: string;
  to?: string;
}

function toIsoDateString(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

export async function generateBillForLoadTx(
  client: pg.PoolClient,
  loadId: string,
  options?: { force?: boolean },
): Promise<Bill> {
  const tenantId = requireTenantId();

  // 1. Check if bill already exists
  const existing = await client.query(
    "SELECT * FROM db_s3_bill WHERE load_id = $1",
    [loadId],
  );
  if (existing.rows[0] && !options?.force) {
    return toCamel<Bill>(existing.rows[0]);
  }

  // 2. Fetch load, customer, route, trip, and tenant company info
  const loadRes = await client.query<{
    load_id: string;
    customer_id: string;
    route_id: string;
    load_date: string;
    load_type: string;
    weight_lbs: number | null;
    pieces: number | null;
    revenue: string | number;
    fuel_surcharge: string | number;
    accessorial_charges: string | number;
    booking_type: string;
    po_number: string | null;
    target_delivery_date: string | null;
    delivered_at: string | null;
    customer_name: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    billing_address: string | null;
    origin_city: string;
    origin_state: string;
    destination_city: string;
    destination_state: string;
    typical_distance_miles: number;
    trip_id: string | null;
    driver_id: string | null;
    driver_name: string | null;
    truck_unit: string | null;
    trailer_id: string | null;
    trailer_number: string | null;
    actual_distance_miles: number | null;
    dispatch_date: string | null;
    tenant_name: string;
    tenant_config: Record<string, unknown> | null;
  }>(
    `SELECT
       l.load_id, l.customer_id, l.route_id, l.load_date, l.load_type,
       l.weight_lbs, l.pieces, l.revenue, l.fuel_surcharge, l.accessorial_charges,
       l.booking_type, l.po_number, l.target_delivery_date, l.delivered_at,
       c.customer_name, c.contact_name, c.contact_email, c.contact_phone, c.billing_address,
       r.origin_city, r.origin_state, r.destination_city, r.destination_state, r.typical_distance_miles,
       t.trip_id, t.driver_id, (d.first_name || ' ' || d.last_name) AS driver_name,
       tr.unit_number AS truck_unit, t.trailer_id, tl.trailer_number,
       t.actual_distance_miles, t.dispatch_date,
       tn.name AS tenant_name, tn.config AS tenant_config
     FROM loads l
     JOIN customers c ON c.customer_id = l.customer_id
     JOIN routes r ON r.route_id = l.route_id
     JOIN tenants tn ON tn.id = l.tenant_id
     LEFT JOIN trips t ON t.load_id = l.load_id
     LEFT JOIN drivers d ON d.driver_id = t.driver_id
     LEFT JOIN trucks tr ON tr.truck_id = t.truck_id
     LEFT JOIN trailers tl ON tl.trailer_id = t.trailer_id
     WHERE l.load_id = $1`,
    [loadId],
  );

  const row = loadRes.rows[0];
  if (!row) throw notFound("Load");

  // 3. Dispatcher company name & details from tenant config or tenant name
  const configObj = (row.tenant_config ?? {}) as Record<string, unknown>;
  const dispatcherCompanyName =
    (typeof configObj.companyName === "string" && configObj.companyName.trim()) ||
    row.tenant_name ||
    "Doxin Logistics";
  const companyGstin = (typeof configObj.gstin === "string" && configObj.gstin) || "29AAACD1234F1Z5";
  const companyPan = (typeof configObj.pan === "string" && configObj.pan) || "AAACD1234F";
  const companyAddress = (typeof configObj.address === "string" && configObj.address) || "Plot 42, Transport Nagar, Phase-II, Outer Ring Road, Bengaluru, Karnataka 560068";
  const companyPhone = (typeof configObj.phone === "string" && configObj.phone) || "+91 80 4123 9800";
  const companyEmail = (typeof configObj.email === "string" && configObj.email) || "billing@doxinlogistics.in";
  const companyBankName = (typeof configObj.bankName === "string" && configObj.bankName) || "HDFC Bank Ltd.";
  const companyBankAccount = (typeof configObj.bankAccount === "string" && configObj.bankAccount) || "50200084920194";
  const companyBankIfsc = (typeof configObj.bankIfsc === "string" && configObj.bankIfsc) || "HDFC0000128";

  // 4. Financial Calculations & 18% GST Breakdown
  const linehaulAmount = Math.round(Number(row.revenue ?? 0) * 100) / 100;
  const fuelSurcharge = Math.round(Number(row.fuel_surcharge ?? 0) * 100) / 100;
  const accessorialCharges = Math.round(Number(row.accessorial_charges ?? 0) * 100) / 100;
  const subtotal = Math.round((linehaulAmount + fuelSurcharge + accessorialCharges) * 100) / 100;
  const gstRate = 18.0;
  const gstAmount = Math.round(subtotal * 0.18 * 100) / 100;
  const totalAmount = Math.round((subtotal + gstAmount) * 100) / 100;
  const currency = "INR";

  const chargesBreakdown: BillChargesBreakdown = {
    linehaul: linehaulAmount,
    fuelSurcharge,
    accessorialCharges,
    subtotal,
    gstRate,
    gstAmount,
    totalAmount,
  };

  const distanceMiles = row.actual_distance_miles ?? row.typical_distance_miles;
  const tripDetails: BillTripDetails = {
    tripId: row.trip_id,
    loadId: row.load_id,
    loadDate: row.load_date,
    originCity: row.origin_city,
    originState: row.origin_state,
    destinationCity: row.destination_city,
    destinationState: row.destination_state,
    driverId: row.driver_id,
    driverName: row.driver_name,
    truckUnit: row.truck_unit,
    trailerId: row.trailer_id,
    trailerNumber: row.trailer_number,
    actualDistanceMiles: row.actual_distance_miles,
    typicalDistanceMiles: row.typical_distance_miles,
    dispatchDate: row.dispatch_date ? String(row.dispatch_date) : null,
    deliveredAt: toIsoDateString(row.delivered_at),
    weightLbs: row.weight_lbs,
    pieces: row.pieces,
    loadType: row.load_type,
    bookingType: row.booking_type,
    poNumber: row.po_number,
  };

  // 5. Allocate display bill ID
  const billIdRes = await client.query<{ id: string }>(
    "SELECT next_tenant_id('BILL', 'bills', 8) AS id",
  );
  const billId = billIdRes.rows[0]?.id || `BILL${Date.now().toString().slice(-8)}`;

  // 6. Generate PDF Bill Document
  const pdfBuffer = await generateInvoicePdf({
    billId,
    loadId: row.load_id,
    tripId: row.trip_id,
    loadDate: row.load_date ? String(row.load_date) : new Date().toISOString().slice(0, 10),
    deliveredAt: toIsoDateString(row.delivered_at),
    dispatcherCompanyName,
    companyGstin,
    companyPan,
    companyAddress,
    companyPhone,
    companyEmail,
    companyBankName,
    companyBankAccount,
    companyBankIfsc,
    customerName: row.customer_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    billingAddress: row.billing_address,
    originCity: row.origin_city,
    originState: row.origin_state,
    destinationCity: row.destination_city,
    destinationState: row.destination_state,
    distanceMiles,
    driverName: row.driver_name,
    truckUnit: row.truck_unit,
    trailerNumber: row.trailer_number,
    loadType: row.load_type,
    weightLbs: row.weight_lbs,
    poNumber: row.po_number,
    linehaulAmount,
    fuelSurcharge,
    accessorialCharges,
    subtotal,
    gstRate,
    gstAmount,
    totalAmount,
    currency,
  });

  // 7. Store PDF in S3
  const s3Result = await uploadBillToS3(tenantId, billId, pdfBuffer);

  // 8. Trigger Email via AWS SES
  let emailStatus: "PENDING" | "SENT" | "FAILED" | "SKIPPED" = "PENDING";
  let emailError: string | null = null;
  let emailSentAt: Date | null = null;

  const recipientEmail = row.contact_email?.trim();
  if (recipientEmail) {
    const emailResult = await sendBillEmail({
      to: recipientEmail,
      billId,
      loadId: row.load_id,
      tripId: row.trip_id,
      dispatcherCompanyName,
      customerName: row.customer_name,
      totalAmount,
      subtotal,
      gstAmount,
      currency,
      pdfBuffer,
    });
    if (emailResult.success) {
      emailStatus = "SENT";
      emailSentAt = new Date();
    } else {
      emailStatus = "FAILED";
      emailError = emailResult.error ?? "Failed to send via AWS SES";
    }
  } else {
    emailStatus = "SKIPPED";
    emailError = "No customer contact email provided";
  }

  // 9. Persist into db_s3_bill
  const insertRes = await client.query(
    `INSERT INTO db_s3_bill (
       bill_id, tenant_id, load_id, trip_id, customer_id,
       dispatcher_company_name, recipient_email,
       s3_url, s3_bucket, s3_key,
       linehaul_amount, fuel_surcharge, accessorial_charges,
       subtotal, gst_rate, gst_amount, total_amount, currency,
       trip_details, charges_breakdown, status, email_status,
       email_error, email_sent_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
     ON CONFLICT (tenant_id, load_id) DO UPDATE SET
       s3_url = EXCLUDED.s3_url,
       s3_bucket = EXCLUDED.s3_bucket,
       s3_key = EXCLUDED.s3_key,
       linehaul_amount = EXCLUDED.linehaul_amount,
       fuel_surcharge = EXCLUDED.fuel_surcharge,
       accessorial_charges = EXCLUDED.accessorial_charges,
       subtotal = EXCLUDED.subtotal,
       gst_rate = EXCLUDED.gst_rate,
       gst_amount = EXCLUDED.gst_amount,
       total_amount = EXCLUDED.total_amount,
       trip_details = EXCLUDED.trip_details,
       charges_breakdown = EXCLUDED.charges_breakdown,
       email_status = EXCLUDED.email_status,
       email_error = EXCLUDED.email_error,
       email_sent_at = EXCLUDED.email_sent_at,
       updated_at = now()
     RETURNING *`,
    [
      billId,
      tenantId,
      row.load_id,
      row.trip_id,
      row.customer_id,
      dispatcherCompanyName,
      recipientEmail || null,
      s3Result.s3Url,
      s3Result.s3Bucket,
      s3Result.s3Key,
      linehaulAmount,
      fuelSurcharge,
      accessorialCharges,
      subtotal,
      gstRate,
      gstAmount,
      totalAmount,
      currency,
      JSON.stringify(tripDetails),
      JSON.stringify(chargesBreakdown),
      "GENERATED",
      emailStatus,
      emailError,
      emailSentAt,
    ],
  );

  return toCamel<Bill>(insertRes.rows[0]);
}

export async function generateBillForLoad(loadId: string, options?: { force?: boolean }): Promise<Bill> {
  return withTransaction(async (client) => {
    return generateBillForLoadTx(client, loadId, options);
  });
}

export async function getBillForLoad(loadId: string): Promise<Bill | null> {
  const { rows } = await query(
    `SELECT b.*, c.customer_name, c.billing_address, c.contact_name
     FROM db_s3_bill b
     JOIN customers c ON c.customer_id = b.customer_id
     WHERE b.load_id = $1`,
    [loadId],
  );
  return rows[0] ? toCamel<Bill>(rows[0]) : null;
}

export async function getBillById(billId: string): Promise<Bill> {
  const { rows } = await query(
    `SELECT b.*, c.customer_name, c.billing_address, c.contact_name
     FROM db_s3_bill b
     JOIN customers c ON c.customer_id = b.customer_id
     WHERE b.bill_id = $1`,
    [billId],
  );
  if (!rows[0]) throw notFound("Bill");
  return toCamel<Bill>(rows[0]);
}

export async function listBills(filters: BillListQuery) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: (i: number) => string, value: unknown) => {
    params.push(value);
    where.push(sql(params.length));
  };

  if (filters.status && filters.status !== "ALL") {
    add((i) => `b.status = $${i}`, filters.status);
  }
  if (filters.customerId) {
    add((i) => `b.customer_id = $${i}`, filters.customerId);
  }
  if (filters.from) {
    add((i) => `b.created_at >= $${i}::timestamptz`, filters.from);
  }
  if (filters.to) {
    add((i) => `b.created_at <= ($${i}::date + interval '1 day')::timestamptz`, filters.to);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    const i = params.length;
    where.push(
      `(b.bill_id ILIKE $${i} OR b.load_id ILIKE $${i} OR b.trip_id ILIKE $${i} OR c.customer_name ILIKE $${i} OR b.recipient_email ILIKE $${i})`,
    );
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countRes = await query(
    `SELECT count(*)::int AS count FROM db_s3_bill b JOIN customers c ON c.customer_id = b.customer_id ${whereSql}`,
    params,
  );
  const total = countRes.rows[0]?.count ?? 0;

  const { offset, limit } = paginate(filters);
  const dataRes = await query(
    `SELECT b.*, c.customer_name, c.billing_address, c.contact_name
     FROM db_s3_bill b
     JOIN customers c ON c.customer_id = b.customer_id
     ${whereSql}
     ORDER BY b.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  return pageResult(dataRes.rows.map((r) => toCamel<Bill>(r)), total, filters);
}

export async function resendBillEmail(billId: string): Promise<Bill> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT b.*, c.customer_name FROM db_s3_bill b JOIN customers c ON c.customer_id = b.customer_id WHERE b.bill_id = $1`,
      [billId],
    );
    const bill = rows[0];
    if (!bill) throw notFound("Bill");
    if (!bill.recipient_email) {
      throw badRequest("No recipient email associated with this bill");
    }

    const tenantId = requireTenantId();
    const pdfBuffer = await fetchBillPdf(tenantId, billId, bill.s3_key);

    const emailResult = await sendBillEmail({
      to: bill.recipient_email,
      billId,
      loadId: bill.load_id,
      tripId: bill.trip_id,
      dispatcherCompanyName: bill.dispatcher_company_name,
      customerName: bill.customer_name,
      totalAmount: Number(bill.total_amount),
      subtotal: Number(bill.subtotal),
      gstAmount: Number(bill.gst_amount),
      currency: bill.currency,
      pdfBuffer,
    });

    const emailStatus = emailResult.success ? "SENT" : "FAILED";
    const emailError = emailResult.success ? null : (emailResult.error ?? "Failed to resend");
    const emailSentAt = emailResult.success ? new Date() : null;

    const updated = await client.query(
      `UPDATE db_s3_bill
       SET email_status = $1, email_error = $2, email_sent_at = COALESCE($3, email_sent_at), updated_at = now()
       WHERE bill_id = $4
       RETURNING *`,
      [emailStatus, emailError, emailSentAt, billId],
    );

    return toCamel<Bill>(updated.rows[0]);
  });
}

export async function getAccountingSummary(): Promise<AccountingSummary> {
  const { rows } = await query(
    `SELECT
       COALESCE(sum(total_amount), 0) AS total_invoiced,
       COALESCE(sum(subtotal), 0) AS total_subtotal,
       COALESCE(sum(gst_amount), 0) AS total_gst,
       COALESCE(sum(total_amount) FILTER (WHERE status = 'PAID'), 0) AS total_paid,
       COALESCE(sum(total_amount) FILTER (WHERE status <> 'PAID'), 0) AS total_pending,
       count(*)::int AS bills_count,
       count(*) FILTER (WHERE email_status = 'SENT')::int AS sent_bills_count
     FROM db_s3_bill`,
  );
  const row = rows[0] ?? {};
  return {
    asOf: new Date().toISOString(),
    totalInvoiced: Number(row.total_invoiced ?? 0),
    totalSubtotal: Number(row.total_subtotal ?? 0),
    totalGst: Number(row.total_gst ?? 0),
    totalPaid: Number(row.total_paid ?? 0),
    totalPending: Number(row.total_pending ?? 0),
    billsCount: Number(row.bills_count ?? 0),
    sentBillsCount: Number(row.sent_bills_count ?? 0),
  };
}

export async function generatePreviewPdfForLoad(loadId: string): Promise<Buffer> {
  // If bill already exists, fetch it directly
  const existing = await query<any>(
    "SELECT bill_id, s3_key FROM db_s3_bill WHERE load_id = $1",
    [loadId],
  );
  if (existing.rows[0]) {
    const tenantId = requireTenantId();
    return fetchBillPdf(tenantId, existing.rows[0].bill_id, existing.rows[0].s3_key);
  }

  // Otherwise generate preview from current load data
  const loadRes = await query<any>(
    `SELECT
       l.load_id, l.customer_id, l.route_id, l.load_date, l.load_type,
       l.weight_lbs, l.pieces, l.revenue, l.fuel_surcharge, l.accessorial_charges,
       l.booking_type, l.po_number, l.target_delivery_date, l.delivered_at,
       c.customer_name, c.contact_name, c.contact_email, c.contact_phone, c.billing_address,
       r.origin_city, r.origin_state, r.destination_city, r.destination_state, r.typical_distance_miles,
       t.trip_id, t.driver_id, (d.first_name || ' ' || d.last_name) AS driver_name,
       tr.unit_number AS truck_unit, t.trailer_id, tl.trailer_number,
       t.actual_distance_miles, t.dispatch_date,
       tn.name AS tenant_name, tn.config AS tenant_config
     FROM loads l
     JOIN customers c ON c.customer_id = l.customer_id
     JOIN routes r ON r.route_id = l.route_id
     JOIN tenants tn ON tn.id = l.tenant_id
     LEFT JOIN trips t ON t.load_id = l.load_id
     LEFT JOIN drivers d ON d.driver_id = t.driver_id
     LEFT JOIN trucks tr ON tr.truck_id = t.truck_id
     LEFT JOIN trailers tl ON tl.trailer_id = t.trailer_id
     WHERE l.load_id = $1`,
    [loadId],
  );
  const row = loadRes.rows[0];
  if (!row) throw notFound("Load");

  const configObj = (row.tenant_config ?? {}) as Record<string, unknown>;
  const dispatcherCompanyName =
    (typeof configObj.companyName === "string" && configObj.companyName.trim()) ||
    row.tenant_name ||
    "Doxin Logistics";
  const companyGstin = (typeof configObj.gstin === "string" && configObj.gstin) || "29AAACD1234F1Z5";
  const companyPan = (typeof configObj.pan === "string" && configObj.pan) || "AAACD1234F";
  const companyAddress = (typeof configObj.address === "string" && configObj.address) || "Plot 42, Transport Nagar, Phase-II, Outer Ring Road, Bengaluru, Karnataka 560068";
  const companyPhone = (typeof configObj.phone === "string" && configObj.phone) || "+91 80 4123 9800";
  const companyEmail = (typeof configObj.email === "string" && configObj.email) || "billing@doxinlogistics.in";
  const companyBankName = (typeof configObj.bankName === "string" && configObj.bankName) || "HDFC Bank Ltd.";
  const companyBankAccount = (typeof configObj.bankAccount === "string" && configObj.bankAccount) || "50200084920194";
  const companyBankIfsc = (typeof configObj.bankIfsc === "string" && configObj.bankIfsc) || "HDFC0000128";

  const linehaulAmount = Math.round(Number(row.revenue ?? 0) * 100) / 100;
  const fuelSurcharge = Math.round(Number(row.fuel_surcharge ?? 0) * 100) / 100;
  const accessorialCharges = Math.round(Number(row.accessorial_charges ?? 0) * 100) / 100;
  const subtotal = Math.round((linehaulAmount + fuelSurcharge + accessorialCharges) * 100) / 100;
  const gstRate = 18.0;
  const gstAmount = Math.round(subtotal * 0.18 * 100) / 100;
  const totalAmount = Math.round((subtotal + gstAmount) * 100) / 100;

  return generateInvoicePdf({
    billId: `PREVIEW-${row.load_id}`,
    loadId: row.load_id,
    tripId: row.trip_id,
    loadDate: row.load_date,
    deliveredAt: row.delivered_at,
    dispatcherCompanyName,
    companyGstin,
    companyPan,
    companyAddress,
    companyPhone,
    companyEmail,
    companyBankName,
    companyBankAccount,
    companyBankIfsc,
    customerName: row.customer_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    billingAddress: row.billing_address,
    originCity: row.origin_city,
    originState: row.origin_state,
    destinationCity: row.destination_city,
    destinationState: row.destination_state,
    distanceMiles: row.actual_distance_miles ?? row.typical_distance_miles,
    driverName: row.driver_name,
    truckUnit: row.truck_unit,
    trailerNumber: row.trailer_number,
    loadType: row.load_type,
    weightLbs: row.weight_lbs,
    poNumber: row.po_number,
    linehaulAmount,
    fuelSurcharge,
    accessorialCharges,
    subtotal,
    gstRate,
    gstAmount,
    totalAmount,
    currency: "INR",
  });
}

export async function generateSampleInvoicePdf(tenantName?: string): Promise<Buffer> {
  const company = tenantName || "Doxin Logistics India";
  return generateInvoicePdf({
    billId: "SAMPLE-BILL-0001",
    loadId: "LD00000042",
    tripId: "TRIP00000018",
    loadDate: new Date().toISOString().slice(0, 10),
    deliveredAt: new Date().toISOString().slice(0, 10),
    dispatcherCompanyName: company,
    companyGstin: "29AAACD1234F1Z5",
    companyPan: "AAACD1234F",
    companyAddress: "Plot 42, Transport Nagar, Phase-II, Outer Ring Road, Bengaluru, Karnataka 560068",
    companyPhone: "+91 80 4123 9800",
    companyEmail: "billing@doxinlogistics.in",
    companyBankName: "HDFC Bank Ltd.",
    companyBankAccount: "50200084920194",
    companyBankIfsc: "HDFC0000128",
    customerName: "Metro Wholesale Pvt. Ltd.",
    contactName: "Rajesh Sharma",
    contactEmail: "accounting@metrowholesale.example",
    billingAddress: "Plot 14, MIDC Industrial Area, Andheri East, Mumbai, MH 400093",
    originCity: "Mumbai",
    originState: "MH",
    destinationCity: "Delhi",
    destinationState: "DL",
    distanceMiles: 1420,
    driverName: "Ravi Kumar",
    truckUnit: "4101",
    trailerNumber: "TR-7801",
    loadType: "Dry Van",
    weightLbs: 18500,
    poNumber: "PO-IN-98234",
    linehaulAmount: 65000.0,
    fuelSurcharge: 8500.0,
    accessorialCharges: 2500.0,
    subtotal: 76000.0,
    gstRate: 18.0,
    gstAmount: 13680.0,
    totalAmount: 89680.0,
    currency: "INR",
  });
}
