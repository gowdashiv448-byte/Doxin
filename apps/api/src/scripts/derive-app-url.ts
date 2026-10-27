import { deriveAppDatabaseUrl } from "../lib/database-url.js";

const ownerUrl = process.env.MIGRATION_DATABASE_URL;
const appPassword = process.env.APP_DB_PASSWORD;

if (!ownerUrl) {
  console.error("MIGRATION_DATABASE_URL is required");
  process.exit(1);
}
if (!appPassword) {
  console.error("APP_DB_PASSWORD is required");
  process.exit(1);
}

process.stdout.write(`${deriveAppDatabaseUrl(ownerUrl, appPassword)}\n`);
