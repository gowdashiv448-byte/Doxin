import { parse } from "csv-parse";
import { from as copyFrom } from "pg-copy-streams";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import type pg from "pg";
import { badRequest, conflict } from "./errors.js";

interface DatasetConfig {
  table: string;
  columns: string[];
  conflictColumns: string[];
  boolColumns?: string[];
  statusColumns?: Record<string, string>;
  label: string;
  /** Advance the tenant display-number counter after importing numeric IDs. */
  counter?: { name: string; prefix: string; idColumn: string };
}

const STATUS_MAP: Record<string, string> = {
  Completed: "COMPLETED",
  Cancelled: "CANCELLED",
  Canceled: "CANCELLED",
  Active: "ACTIVE",
  Inactive: "INACTIVE",
  Maintenance: "MAINTENANCE",
  Scheduled: "SCHEDULED",
  "In Progress": "IN_PROGRESS",
  "On Leave": "ON_LEAVE",
  Terminated: "TERMINATED",
};

export const DATASETS: Record<string, DatasetConfig> = {
  customers: {
    label: "Customers",
    counter: { name: "customer_id_seq", prefix: "CUST", idColumn: "customer_id" },
    conflictColumns: ["tenant_id", "customer_id"],
    table: "customers",
    columns: ["customer_id", "customer_name", "customer_type", "credit_terms_days", "primary_freight_type", "account_status", "contract_start_date", "annual_revenue_potential"],
  },
  facilities: {
    label: "Facilities",
    counter: { name: "facility_id_seq", prefix: "FAC", idColumn: "facility_id" },
    conflictColumns: ["tenant_id", "facility_id"],
    table: "facilities",
    columns: ["facility_id", "facility_name", "facility_type", "city", "state", "latitude", "longitude", "dock_doors", "operating_hours"],
  },
  routes: {
    label: "Lanes",
    counter: { name: "route_id_seq", prefix: "RTE", idColumn: "route_id" },
    conflictColumns: ["tenant_id", "route_id"],
    table: "routes",
    columns: ["route_id", "origin_city", "origin_state", "destination_city", "destination_state", "typical_distance_miles", "base_rate_per_mile", "fuel_surcharge_rate", "typical_transit_days"],
  },
  drivers: {
    label: "Drivers",
    counter: { name: "driver_id_seq", prefix: "DRV", idColumn: "driver_id" },
    conflictColumns: ["tenant_id", "driver_id"],
    table: "drivers",
    columns: ["driver_id", "first_name", "last_name", "hire_date", "termination_date", "license_number", "license_state", "date_of_birth", "home_terminal", "employment_status", "cdl_class", "years_experience"],
  },
  trucks: {
    label: "Trucks",
    counter: { name: "truck_id_seq", prefix: "TRK", idColumn: "truck_id" },
    conflictColumns: ["tenant_id", "truck_id"],
    table: "trucks",
    columns: ["truck_id", "unit_number", "make", "model_year", "vin", "acquisition_date", "acquisition_mileage", "fuel_type", "tank_capacity_gallons", "status", "home_terminal"],
  },
  trailers: {
    label: "Trailers",
    counter: { name: "trailer_id_seq", prefix: "TRL", idColumn: "trailer_id" },
    conflictColumns: ["tenant_id", "trailer_id"],
    table: "trailers",
    columns: ["trailer_id", "trailer_number", "trailer_type", "length_feet", "model_year", "vin", "acquisition_date", "status", "current_location"],
  },
  loads: {
    label: "Loads",
    counter: { name: "load_id_seq", prefix: "LOAD", idColumn: "load_id" },
    conflictColumns: ["tenant_id", "load_id"],
    table: "loads",
    columns: ["load_id", "customer_id", "route_id", "load_date", "load_type", "weight_lbs", "pieces", "revenue", "fuel_surcharge", "accessorial_charges", "load_status", "booking_type"],
    statusColumns: { load_status: "load_status" },
  },
  trips: {
    label: "Trips",
    counter: { name: "trip_id_seq", prefix: "TRIP", idColumn: "trip_id" },
    conflictColumns: ["tenant_id", "trip_id"],
    table: "trips",
    columns: ["trip_id", "load_id", "driver_id", "truck_id", "trailer_id", "dispatch_date", "actual_distance_miles", "actual_duration_hours", "fuel_gallons_used", "average_mpg", "idle_time_hours", "trip_status"],
    statusColumns: { trip_status: "trip_status" },
  },
  delivery_events: {
    label: "Delivery events",
    counter: { name: "event_id_seq", prefix: "EVT", idColumn: "event_id" },
    conflictColumns: ["tenant_id", "event_id"],
    table: "delivery_events",
    columns: ["event_id", "load_id", "trip_id", "event_type", "facility_id", "scheduled_datetime", "actual_datetime", "detention_minutes", "on_time_flag", "location_city", "location_state"],
    boolColumns: ["on_time_flag"],
  },
  fuel_purchases: {
    label: "Fuel purchases",
    counter: { name: "fuel_id_seq", prefix: "FUEL", idColumn: "fuel_purchase_id" },
    conflictColumns: ["tenant_id", "fuel_purchase_id"],
    table: "fuel_purchases",
    columns: ["fuel_purchase_id", "trip_id", "truck_id", "driver_id", "purchase_date", "location_city", "location_state", "gallons", "price_per_gallon", "total_cost", "fuel_card_number"],
  },
  maintenance_records: {
    label: "Maintenance records",
    counter: { name: "maintenance_id_seq", prefix: "MAINT", idColumn: "maintenance_id" },
    conflictColumns: ["tenant_id", "maintenance_id"],
    table: "maintenance_records",
    columns: ["maintenance_id", "truck_id", "maintenance_date", "maintenance_type", "odometer_reading", "labor_hours", "labor_cost", "parts_cost", "total_cost", "facility_location", "downtime_hours", "service_description"],
  },
  safety_incidents: {
    label: "Safety incidents",
    counter: { name: "incident_id_seq", prefix: "INC", idColumn: "incident_id" },
    conflictColumns: ["tenant_id", "incident_id"],
    table: "safety_incidents",
    columns: ["incident_id", "trip_id", "truck_id", "driver_id", "incident_date", "incident_type", "location_city", "location_state", "at_fault_flag", "injury_flag", "vehicle_damage_cost", "cargo_damage_cost", "claim_amount", "preventable_flag", "description"],
    boolColumns: ["at_fault_flag", "injury_flag", "preventable_flag"],
  },
  driver_monthly_metrics: {
    label: "Driver monthly metrics",
    conflictColumns: ["tenant_id", "driver_id", "month"],
    table: "driver_monthly_metrics",
    columns: ["driver_id", "month", "trips_completed", "total_miles", "total_revenue", "average_mpg", "total_fuel_gallons", "on_time_delivery_rate", "average_idle_hours"],
  },
  truck_utilization_metrics: {
    label: "Truck monthly metrics",
    conflictColumns: ["tenant_id", "truck_id", "month"],
    table: "truck_utilization_metrics",
    columns: ["truck_id", "month", "trips_completed", "total_miles", "total_revenue", "average_mpg", "maintenance_events", "maintenance_cost", "downtime_hours", "utilization_rate"],
  },
};

function cleanValue(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.toUpperCase() === "NULL" || trimmed.toUpperCase() === "NAN") return null;
  return trimmed;
}

function csvField(value: string | null): string {
  if (value === null) return "";
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export interface ImportResult {
  dataset: string;
  rows: number;
  imported: number;
  skipped: number;
  durationMs: number;
}

/**
 * Streams a CSV into a staging table, then merges with ON CONFLICT DO NOTHING.
 * Atomic: a malformed row aborts the whole dataset, leaving existing data untouched.
 */
export async function importCsvStream(
  client: pg.PoolClient,
  tenantId: string,
  datasetKey: string,
  input: Readable | ReadableStream<Uint8Array>,
): Promise<ImportResult> {
  const config = DATASETS[datasetKey];
  if (!config) throw badRequest(`Unknown dataset '${datasetKey}'`, { available: Object.keys(DATASETS) });
  const started = Date.now();
  let rows = 0;

  // One import per tenant at a time, across API instances and CLI processes.
  const lock = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked",
    [`doxin-import:${tenantId}`],
  );
  if (!lock.rows[0]?.locked) {
    throw conflict("An import is already running for this tenant");
  }

  await client.query(
    `CREATE TEMP TABLE ${config.table}_stage (LIKE ${config.table} INCLUDING DEFAULTS) ON COMMIT DROP`,
  );
  const copyStream = client.query(
    copyFrom(
      `COPY ${config.table}_stage (${config.columns.join(",")}) FROM STDIN WITH (FORMAT csv, NULL '', QUOTE '"')`,
    ) as unknown as string,
  ) as unknown as import("node:stream").Writable;

  const parser = parse({ columns: true, skip_empty_lines: true, bom: true, relax_column_count: true });
  const formatter = new Transform({
    objectMode: true,
    transform(record: Record<string, string>, _enc, cb) {
      rows += 1;
      const line =
        config.columns
          .map((col) => {
            let value = cleanValue(record[col]);
            if (value !== null && config.boolColumns?.includes(col)) {
              value = /^(true|t|1|yes)$/i.test(value) ? "true" : "false";
            }
            if (value !== null && config.statusColumns?.[col]) {
              value = STATUS_MAP[value] ?? value.toUpperCase().replaceAll(" ", "_");
            }
            return csvField(value);
          })
          .join(",") + "\n";
      cb(null, line);
    },
  });

  const source = input instanceof Readable ? input : Readable.fromWeb(input as ReadableStream<Uint8Array>);
  await pipeline(source, parser, formatter, copyStream);

  // Explicitly stamp the tenant on every staged row; the target insert also
  // carries tenant_id and uses a tenant-scoped conflict target.
  await client.query(`UPDATE ${config.table}_stage SET tenant_id = $1`, [tenantId]);

  // The archive contains four duplicate trailer numbers. The schema now
  // enforces UNIQUE (tenant_id, trailer_number), so keep the first row and
  // deterministically rename later collisions before the merge. Existing
  // target rows are included so re-imports cannot collide either.
  if (datasetKey === "trailers") {
    const staged = await client.query<{
      ctid: string;
      trailer_id: string;
      trailer_number: string;
    }>(
      `SELECT ctid::text AS ctid, trailer_id, trailer_number
       FROM ${config.table}_stage ORDER BY trailer_id`,
    );
    const existing = await client.query<{
      trailer_id: string;
      trailer_number: string;
    }>(
      `SELECT trailer_id, trailer_number FROM trailers WHERE tenant_id = $1`,
      [tenantId],
    );
    const existingIds = new Set(existing.rows.map((row) => row.trailer_id));
    const claimedNumbers = new Set(existing.rows.map((row) => row.trailer_number));

    for (const row of staged.rows) {
      if (existingIds.has(row.trailer_id)) continue;
      if (!claimedNumbers.has(row.trailer_number)) {
        claimedNumbers.add(row.trailer_number);
        continue;
      }

      let suffix = 2;
      let replacement = `${row.trailer_number}-DUP${suffix}`;
      while (claimedNumbers.has(replacement)) {
        suffix += 1;
        replacement = `${row.trailer_number}-DUP${suffix}`;
      }
      claimedNumbers.add(replacement);

      await client.query(
        `UPDATE ${config.table}_stage SET trailer_number = $1 WHERE ctid = $2::tid`,
        [replacement, row.ctid],
      );
      // Migration 005 records this same cleanup when duplicates already exist
      // at migration time. Archive imports can arrive later, so record them
      // here as well. The runtime role has INSERT-only access to this log.
      await client.query(
        `INSERT INTO migration_data_cleanup
           (migration, table_name, tenant_id, entity_id, old_value, new_value, reason)
         VALUES ('005', 'trailers', $1, $2, $3, $4,
                 'duplicate trailer_number; kept lowest trailer_id and renamed deterministically')
         ON CONFLICT DO NOTHING`,
        [tenantId, row.trailer_id, row.trailer_number, replacement],
      );
    }
  }

  const insertColumns = ["tenant_id", ...config.columns];
  const selectColumns = ["tenant_id", ...config.columns];
  const conflictClause =
    datasetKey === "trailers"
      ? "ON CONFLICT DO NOTHING"
      : `ON CONFLICT (${config.conflictColumns.join(",")}) DO NOTHING`;
  const inserted = await client.query(
    `INSERT INTO ${config.table} (${insertColumns.join(",")})
     SELECT ${selectColumns.join(",")} FROM ${config.table}_stage
     ${conflictClause}`,
  );

  if (config.counter) {
    const { name, prefix, idColumn } = config.counter;
    await client.query(
      `INSERT INTO tenant_counters (tenant_id, name, value)
       SELECT $1, $2,
              COALESCE(MAX(CASE WHEN ${idColumn} ~ $3 THEN substring(${idColumn} from $4::int)::bigint ELSE 0 END), 0)
       FROM ${config.table}
       WHERE tenant_id = $1
       ON CONFLICT (tenant_id, name) DO UPDATE
         SET value = GREATEST(tenant_counters.value, EXCLUDED.value)`,
      [tenantId, name, `^${prefix}[0-9]+$`, prefix.length + 1],
    );
  }

  return {
    dataset: datasetKey,
    rows,
    imported: inserted.rowCount ?? 0,
    skipped: rows - (inserted.rowCount ?? 0),
    durationMs: Date.now() - started,
  };
}

export async function importCsvFile(
  client: pg.PoolClient,
  tenantId: string,
  datasetKey: string,
  filePath: string,
): Promise<ImportResult> {
  const { createReadStream } = await import("node:fs");
  return importCsvStream(client, tenantId, datasetKey, createReadStream(filePath));
}
