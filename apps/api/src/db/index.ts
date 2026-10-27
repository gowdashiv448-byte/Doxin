import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "../config.js";

// DATE columns are calendar values, not instants: never timezone-shift them.
pg.types.setTypeParser(1082, (value: string) => value);

const { Pool } = pg;

export const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_TENANT_SLUG = "default";
export const NORTHWIND_TENANT_ID = "00000000-0000-0000-0000-000000000002";
export const NORTHWIND_TENANT_SLUG = "northwind";

const basePoolOptions = {
  max: config.isProduction ? 20 : 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
};

/** Runtime pool. This must connect as the NOSUPERUSER NOBYPASSRLS app role. */
export const pool = new Pool({
  ...basePoolOptions,
  connectionString: config.DATABASE_URL,
  application_name: "doxin-api",
});

/** Migration/seed pool. It is only used by CLI/bootstrap code. */
export const ownerPool = new Pool({
  ...basePoolOptions,
  max: 5,
  connectionString: config.MIGRATION_DATABASE_URL ?? config.DATABASE_URL,
  application_name: "doxin-owner",
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error", err);
});
ownerPool.on("error", (err) => {
  console.error("Unexpected PostgreSQL owner-pool error", err);
});

export type Queryable = pg.Pool | pg.PoolClient;

export interface TenantStore {
  tenantId: string | null;
  client: pg.PoolClient | null;
  platform: boolean;
  closed: boolean;
}

const storage = new AsyncLocalStorage<TenantStore>();

export function getTenantStore(): TenantStore | undefined {
  return storage.getStore();
}

export function getTenantId(): string | undefined {
  return storage.getStore()?.tenantId ?? undefined;
}

export function requireTenantId(): string {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error("Tenant context is required");
  return tenantId;
}

export function getTenantClient(): pg.PoolClient {
  const store = storage.getStore();
  if (!store || store.closed || !store.client) {
    throw new Error("Tenant database context is required");
  }
  return store.client;
}

/**
 * Fastify's onRequest hook calls this synchronously before any await. The
 * mutable store is inherited by body parsing, preHandlers and the route
 * handler. authenticate() then attaches the DB client to this same store.
 */
export function createRequestStore(): TenantStore {
  const store: TenantStore = {
    tenantId: null,
    client: null,
    platform: false,
    closed: false,
  };
  storage.enterWith(store);
  return store;
}

export async function attachTenantContext(store: TenantStore, tenantId: string): Promise<void> {
  if (store.client && !store.closed) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
    await client.query("SELECT set_config('app.is_platform_admin', '', true)");
    store.tenantId = tenantId;
    store.client = client;
    store.platform = false;
    store.closed = false;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    throw error;
  }
}

export async function attachPlatformContext(store: TenantStore, actorId: string): Promise<void> {
  if (store.client && !store.closed) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant', '', true)");
    await client.query("SELECT set_config('app.is_platform_admin', 'true', true)");
    await client.query("SELECT set_config('app.current_user', $1, true)", [actorId]);
    store.tenantId = null;
    store.client = client;
    store.platform = true;
    store.closed = false;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    throw error;
  }
}

export async function beginTenantContext(tenantId: string): Promise<TenantStore> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
    await client.query("SELECT set_config('app.is_platform_admin', '', true)");
    return { tenantId, client, platform: false, closed: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    throw error;
  }
}

export async function beginPlatformContext(actorId: string): Promise<TenantStore> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant', '', true)");
    await client.query("SELECT set_config('app.is_platform_admin', 'true', true)");
    await client.query("SELECT set_config('app.current_user', $1, true)", [actorId]);
    return { tenantId: null, client, platform: true, closed: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    throw error;
  }
}

export async function commitTenantContext(store: TenantStore): Promise<void> {
  if (store.closed || !store.client) return;
  const client = store.client;
  store.closed = true;
  try {
    await client.query("COMMIT");
  } finally {
    client.release();
    store.client = null;
  }
}

export async function rollbackTenantContext(store: TenantStore): Promise<void> {
  if (store.closed || !store.client) return;
  const client = store.client;
  store.closed = true;
  try {
    await client.query("ROLLBACK");
  } finally {
    client.release();
    store.client = null;
  }
}

/**
 * Runs a callback in a tenant-scoped transaction. If the caller is already
 * inside the same tenant context (a normal Fastify request), the existing
 * client/transaction is reused. This keeps SELECT ... FOR UPDATE workflows and
 * audit writes in the same transaction.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const existing = storage.getStore();
  if (
    existing &&
    !existing.closed &&
    existing.client &&
    !existing.platform &&
    existing.tenantId === tenantId
  ) {
    return fn(existing.client);
  }

  const store = await beginTenantContext(tenantId);
  return storage.run(store, async () => {
    try {
      const result = await fn(store.client!);
      await commitTenantContext(store);
      return result;
    } catch (error) {
      await rollbackTenantContext(store);
      throw error;
    }
  });
}

/** Platform-admin transaction. It still uses the app role; tenants has no RLS. */
export async function withPlatformAdmin<T>(
  actorId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const existing = storage.getStore();
  if (existing && !existing.closed && existing.client && existing.platform) {
    return fn(existing.client);
  }

  const store = await beginPlatformContext(actorId);
  return storage.run(store, async () => {
    try {
      const result = await fn(store.client!);
      await commitTenantContext(store);
      return result;
    } catch (error) {
      await rollbackTenantContext(store);
      throw error;
    }
  });
}

/** Tenant-aware query helper. Throws when called outside a tenant context. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return getTenantClient().query<T>(text, params);
}

/** Explicit allowlisted path for login/tenant-registry reads before a tenant exists. */
export async function systemQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

/** Owner-only helper for migrations, seed, and bootstrap scripts. */
export async function ownerQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return ownerPool.query<T>(text, params);
}

export async function withOwnerTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await ownerPool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Owner transaction with a tenant setting, used only by the seed script. */
export async function withOwnerTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withOwnerTransaction(async (client) => {
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
    return fn(client);
  });
}

/** Legacy transaction helper: reuse the request transaction when present. */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const existing = storage.getStore();
  if (existing && !existing.closed && existing.client) return fn(existing.client);
  return withTenant(requireTenantId(), fn);
}

export async function closePools(): Promise<void> {
  await Promise.allSettled([pool.end(), ownerPool.end()]);
}
