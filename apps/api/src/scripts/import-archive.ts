import { readFile } from "node:fs/promises";
import path from "node:path";
import { closePools, withTenant } from "../db/index.js";
import { migrate } from "../db/migrate.js";
import { DATASETS, importCsvFile } from "../lib/importer.js";
import { getTenantBySlug } from "../lib/auth-lookup.js";

const args = process.argv.slice(2);
const tenantSlug = args.find((a) => !a.startsWith("--"));
const dir = args.find((a) => a.startsWith("--dir="))?.split("=")[1] ?? process.env.ARCHIVE_DIR;

const files: { dataset: string; file: string }[] = [
  { dataset: "customers", file: "customers.csv" },
  { dataset: "facilities", file: "facilities.csv" },
  { dataset: "routes", file: "routes.csv" },
  { dataset: "drivers", file: "drivers.csv" },
  { dataset: "trucks", file: "trucks.csv" },
  { dataset: "trailers", file: "trailers.csv" },
  { dataset: "loads", file: "loads.csv" },
  { dataset: "trips", file: "trips.csv" },
  { dataset: "delivery_events", file: "delivery_events.csv" },
  { dataset: "fuel_purchases", file: "fuel_purchases.csv" },
  { dataset: "maintenance_records", file: "maintenance_records.csv" },
  { dataset: "safety_incidents", file: "safety_incidents.csv" },
  { dataset: "driver_monthly_metrics", file: "driver_monthly_metrics.csv" },
  { dataset: "truck_utilization_metrics", file: "truck_utilization_metrics.csv" },
];

async function main() {
  if (!tenantSlug || !dir) {
    console.error("Usage: npm run import:archive -- <tenant-slug> --dir=/path/to/archive");
    process.exit(1);
  }
  await migrate();
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) {
    console.error(`Unknown tenant slug '${tenantSlug}'`);
    process.exit(1);
  }
  if (tenant.status !== "ACTIVE") {
    console.error(`Tenant '${tenantSlug}' is ${tenant.status}; refusing to import`);
    process.exit(1);
  }

  console.log(`Importing archive from ${dir} into tenant ${tenant.slug}`);
  for (const item of files) {
    const config = DATASETS[item.dataset];
    if (!config) continue;
    try {
      await readFile(path.join(dir, item.file));
    } catch {
      console.warn(`! ${item.file} not found, skipping ${item.dataset}`);
      continue;
    }
    const result = await withTenant(tenant.id, (client) =>
      importCsvFile(client, tenant.id, item.dataset, path.join(dir, item.file)),
    );
    console.log(
      `✓ ${config.label.padEnd(24)} ${String(result.imported).padStart(8)} imported` +
        `${result.skipped ? `, ${result.skipped} skipped` : ""} (${(result.durationMs / 1000).toFixed(1)}s)`,
    );
  }
  console.log("Archive import complete");
  await closePools();
}

main().catch(async (error) => {
  console.error("Import failed", error);
  await closePools().catch(() => undefined);
  process.exit(1);
});
