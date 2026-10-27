import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { DEFAULT_TENANT_ID, NORTHWIND_TENANT_ID, withTenant } from "../db/index.js";

export const ADMIN = { email: "admin@doxin.com", password: "Doxin@2026" };
export const NORTHWIND_ADMIN = { email: "admin@northwind.test", password: "Northwind@2026" };
export const PLATFORM_ADMIN = { email: "platform@doxin.com", password: "Platform@2026" };

export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

export async function login(
  app: FastifyInstance,
  credentials: { email: string; password: string },
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: credentials,
  });
  if (response.statusCode !== 200)
    throw new Error(`Login failed for ${credentials.email}: ${response.body}`);
  return response.json().token as string;
}

export function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** Direct SQL in tests runs through the same tenant/RLS path as the API. */
export function tenantQuery<T extends import("pg").QueryResultRow = import("pg").QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  return withTenant(DEFAULT_TENANT_ID, (client) => client.query<T>(text, params));
}

/** Direct SQL scoped to the seeded second tenant. */
export function northwindQuery<
  T extends import("pg").QueryResultRow = import("pg").QueryResultRow,
>(text: string, params: unknown[] = []) {
  return withTenant(NORTHWIND_TENANT_ID, (client) => client.query<T>(text, params));
}

export interface CreatedTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  config: Record<string, unknown>;
  adminEmail: string;
  adminPassword: string;
}

/** Creates an isolated tenant through the platform API for tests. */
export async function createPlatformTenant(
  app: FastifyInstance,
  platformToken: string,
  overrides: {
    name?: string;
    slug?: string;
    config?: Record<string, unknown>;
    adminPassword?: string;
  } = {},
): Promise<CreatedTenant> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const slug = overrides.slug ?? `test-${stamp}`;
  const adminEmail = `admin@${slug}.test`;
  const adminPassword = overrides.adminPassword ?? "TestTenant@2026";
  const response = await app.inject({
    method: "POST",
    url: "/api/platform/tenants",
    headers: auth(platformToken),
    payload: {
      name: overrides.name ?? `Test Tenant ${stamp}`,
      slug,
      adminEmail,
      adminName: "Test Tenant Admin",
      adminPassword,
      config: overrides.config,
    },
  });
  if (response.statusCode !== 201) {
    throw new Error(`Tenant creation failed: ${response.statusCode} ${response.body}`);
  }
  return { ...response.json().tenant, adminEmail, adminPassword };
}
