import { Readable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_TENANT_ID, NORTHWIND_TENANT_ID, pool, withTenant } from "../db/index.js";
import { importCsvStream } from "../lib/importer.js";
import { northwindQuery, tenantQuery as query } from "./helpers.js";

const TEST_ID = `TEST_IMP_${Date.now()}`;
const SHARED_ID = `TEST_IMP_SHARED_${Date.now()}`;
const ROLLBACK_GOOD_ID = `TEST_IMP_ROLLBACK_GOOD_${Date.now()}`;
const ROLLBACK_BAD_ID = `TEST_IMP_ROLLBACK_BAD_${Date.now()}`;

function importAsDefault(
  dataset: string,
  input: Parameters<typeof importCsvStream>[3],
) {
  return withTenant(DEFAULT_TENANT_ID, (client) =>
    importCsvStream(client, DEFAULT_TENANT_ID, dataset, input),
  );
}

function importAsNorthwind(
  dataset: string,
  input: Parameters<typeof importCsvStream>[3],
) {
  return withTenant(NORTHWIND_TENANT_ID, (client) =>
    importCsvStream(client, NORTHWIND_TENANT_ID, dataset, input),
  );
}

function customerCsv(id: string, name: string) {
  return [
    "customer_id,customer_name,customer_type,credit_terms_days,primary_freight_type,account_status,contract_start_date,annual_revenue_potential",
    `${id},"${name}",Contract,30,General,Active,2026-01-01,250000.00`,
  ].join("\n");
}

describe("archive CSV importer", () => {
  afterAll(async () => {
    await query("DELETE FROM customers WHERE customer_id = ANY($1::text[])", [
      [TEST_ID, SHARED_ID, ROLLBACK_GOOD_ID, ROLLBACK_BAD_ID],
    ]);
    await northwindQuery("DELETE FROM customers WHERE customer_id = $1", [SHARED_ID]);
    await pool.end();
  });

  it("imports a CSV once and is idempotent on re-import", async () => {
    const first = await importAsDefault(
      "customers",
      Readable.from(customerCsv(TEST_ID, "Importer Test, Inc.")),
    );
    expect(first).toMatchObject({ rows: 1, imported: 1, skipped: 0 });

    const second = await importAsDefault(
      "customers",
      Readable.from(customerCsv(TEST_ID, "Importer Test, Inc.")),
    );
    expect(second).toMatchObject({ rows: 1, imported: 0, skipped: 1 });

    const { rows } = await query<{ customer_name: string }>(
      "SELECT customer_name FROM customers WHERE customer_id = $1",
      [TEST_ID],
    );
    expect(rows[0]?.customer_name).toBe("Importer Test, Inc.");
  });

  it("imports the same business key independently into two tenants", async () => {
    const csv = customerCsv(SHARED_ID, "Shared Tenant Customer");
    const [defFirst, nwFirst] = await Promise.all([
      importAsDefault("customers", Readable.from(csv)),
      importAsNorthwind("customers", Readable.from(csv)),
    ]);
    expect(defFirst).toMatchObject({ rows: 1, imported: 1, skipped: 0 });
    expect(nwFirst).toMatchObject({ rows: 1, imported: 1, skipped: 0 });

    const [defAgain, nwAgain] = await Promise.all([
      importAsDefault("customers", Readable.from(csv)),
      importAsNorthwind("customers", Readable.from(csv)),
    ]);
    expect(defAgain).toMatchObject({ rows: 1, imported: 0, skipped: 1 });
    expect(nwAgain).toMatchObject({ rows: 1, imported: 0, skipped: 1 });

    const [defRows, nwRows] = await Promise.all([
      query<{ customer_name: string }>(
        "SELECT customer_name FROM customers WHERE customer_id = $1",
        [SHARED_ID],
      ),
      northwindQuery<{ customer_name: string }>(
        "SELECT customer_name FROM customers WHERE customer_id = $1",
        [SHARED_ID],
      ),
    ]);
    expect(defRows.rows[0]?.customer_name).toBe("Shared Tenant Customer");
    expect(nwRows.rows[0]?.customer_name).toBe("Shared Tenant Customer");
  });

  it("rolls back valid rows when a later row fails the merge", async () => {
    const csv = [
      "customer_id,customer_name,customer_type,credit_terms_days,primary_freight_type,account_status,contract_start_date,annual_revenue_potential",
      `${ROLLBACK_GOOD_ID},Good Row,Contract,30,General,Active,2026-01-01,1.00`,
      `${ROLLBACK_BAD_ID},Bad Row,Bogus,30,General,Active,2026-01-01,1.00`,
    ].join("\n");

    await expect(importAsDefault("customers", Readable.from(csv))).rejects.toBeTruthy();
    const { rows } = await query(
      "SELECT customer_id FROM customers WHERE customer_id = ANY($1::text[])",
      [[ROLLBACK_GOOD_ID, ROLLBACK_BAD_ID]],
    );
    expect(rows).toHaveLength(0);
  });

  it("rolls back the whole file when a row is malformed", async () => {
    const badId = `${TEST_ID}_BAD`;
    const malformed = [
      "customer_id,customer_name,customer_type,credit_terms_days,primary_freight_type,account_status,contract_start_date,annual_revenue_potential",
      `${badId},Bad Row,Contract,not-a-number,General,Active,2026-01-01,1.00`,
    ].join("\n");

    await expect(
      importAsDefault("customers", Readable.from(malformed)),
    ).rejects.toBeTruthy();
    const { rows } = await query(
      "SELECT 1 FROM customers WHERE customer_id = $1",
      [badId],
    );
    expect(rows).toHaveLength(0);
  });

  it("rejects unknown datasets with a helpful error", async () => {
    await expect(
      importAsDefault("not_a_dataset", Readable.from("a,b\n1,2\n")),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("advances the tenant display-number counter from imported numeric IDs", async () => {
    const id = "CUST99000";
    const before = await northwindQuery<{ value: string }>(
      "SELECT value FROM tenant_counters WHERE name = 'customer_id_seq'",
    );
    try {
      const result = await importAsNorthwind(
        "customers",
        Readable.from(customerCsv(id, "Counter Reconciliation")),
      );
      expect(result).toMatchObject({ rows: 1, imported: 1, skipped: 0 });
      const after = await northwindQuery<{ value: string }>(
        "SELECT value FROM tenant_counters WHERE name = 'customer_id_seq'",
      );
      expect(Number(after.rows[0]?.value)).toBeGreaterThanOrEqual(99_000);
    } finally {
      await northwindQuery("DELETE FROM customers WHERE customer_id = $1", [id]);
      if (before.rows[0]) {
        await northwindQuery(
          "UPDATE tenant_counters SET value = $1 WHERE name = 'customer_id_seq'",
          [before.rows[0].value],
        );
      }
    }
  });
});
