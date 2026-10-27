import "dotenv/config";
import { z } from "zod";
import { deriveAppDatabaseUrl } from "./lib/database-url.js";

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().default("0.0.0.0"),
    DATABASE_URL: z.string().min(1).optional(),
    MIGRATION_DATABASE_URL: z.string().min(1).optional(),
    APP_DB_PASSWORD: z.string().min(8).default("doxin_app_dev_password"),
    DATABASE_SSL: z.enum(["auto", "true", "false"]).default("auto"),
    JWT_SECRET: z
      .string()
      .min(32)
      .default("dev-only-change-me-please-32-characters-minimum"),
    JWT_EXPIRES_IN: z.string().default("12h"),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    LOG_LEVEL: z.string().default("info"),
    SEED_ADMIN_EMAIL: z.string().email().default("admin@doxin.com"),
    SEED_ADMIN_PASSWORD: z.string().min(8).default("Doxin@2026"),
    SEED_PLATFORM_EMAIL: z.string().email().default("platform@doxin.com"),
    SEED_PLATFORM_PASSWORD: z.string().min(8).default("Platform@2026"),
    SEED_SECOND_TENANT_NAME: z.string().min(1).default("Northwind Logistics"),
    SEED_SECOND_TENANT_SLUG: z.string().min(1).default("northwind"),
    SEED_SECOND_TENANT_EMAIL: z.string().email().default("admin@northwind.test"),
    SEED_SECOND_TENANT_PASSWORD: z.string().min(8).default("Northwind@2026"),
    // Set false before the first deploy when importing the archive into an
    // otherwise empty tenant; otherwise starter rows claim the low IDs.
    SEED_STARTER_DATA: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
  })
  .superRefine((value, ctx) => {
    if (!value.DATABASE_URL && !value.MIGRATION_DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message:
          "Set DATABASE_URL, or set MIGRATION_DATABASE_URL and APP_DB_PASSWORD so the doxin_app URL can be derived",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "Invalid environment configuration",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

// Render only exposes the owner connection string. When DATABASE_URL is not
// provided, derive the runtime role URL without ever connecting as the owner.
const databaseUrl =
  parsed.data.DATABASE_URL ??
  deriveAppDatabaseUrl(
    parsed.data.MIGRATION_DATABASE_URL!,
    parsed.data.APP_DB_PASSWORD,
  );

export const config = {
  ...parsed.data,
  DATABASE_URL: databaseUrl,
  isProduction: parsed.data.NODE_ENV === "production",
  databaseSsl:
    parsed.data.DATABASE_SSL === "true" ||
    (parsed.data.DATABASE_SSL === "auto" &&
      parsed.data.NODE_ENV === "production" &&
      !/localhost|127\.0\.0\.1/.test(databaseUrl)),
  corsOrigins: parsed.data.CORS_ORIGIN.split(",").map((s) => s.trim()),
};
