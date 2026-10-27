/**
 * Render exposes one owner connection string per Postgres database. The API
 * must still run as the least-privilege `doxin_app` role, so derive its URL
 * from the owner URL and the generated app-role password.
 */
export function deriveAppDatabaseUrl(ownerUrl: string, appPassword: string): string {
  let parsed: URL;
  try {
    parsed = new URL(ownerUrl);
  } catch {
    throw new Error("MIGRATION_DATABASE_URL must be a valid PostgreSQL connection URL");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("MIGRATION_DATABASE_URL must use the postgres:// or postgresql:// scheme");
  }
  if (!parsed.hostname) {
    throw new Error("MIGRATION_DATABASE_URL must include a database host");
  }
  if (!appPassword) {
    throw new Error("APP_DB_PASSWORD must be set when DATABASE_URL is not provided");
  }

  parsed.username = "doxin_app";
  parsed.password = appPassword;
  return parsed.toString();
}
