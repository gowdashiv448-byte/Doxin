import { systemQuery } from "../db/index.js";

export interface AuthUserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: "ADMIN" | "PLATFORM_ADMIN";
  theme_color: string;
  is_active: boolean;
  tenant_id: string | null;
}

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  config: Record<string, unknown>;
}

/**
 * The only pre-tenant user read path. auth_lookup_user() is SECURITY DEFINER,
 * owned by a NOLOGIN BYPASSRLS role with SELECT on users only.
 */
export async function authLookupUser(email: string): Promise<AuthUserRow | undefined> {
  const { rows } = await systemQuery<AuthUserRow>(
    "SELECT * FROM auth_lookup_user($1)",
    [email.trim().toLowerCase()],
  );


  return rows[0];
}

export async function getTenant(tenantId: string): Promise<TenantRow | undefined> {
  const { rows } = await systemQuery<TenantRow>(
    "SELECT id, name, slug, status, config FROM tenants WHERE id = $1",
    [tenantId],
  );
  return rows[0];
}

export async function getTenantBySlug(slug: string): Promise<TenantRow | undefined> {
  const { rows } = await systemQuery<TenantRow>(
    "SELECT id, name, slug, status, config FROM tenants WHERE slug = $1",
    [slug],
  );
  return rows[0];
}
