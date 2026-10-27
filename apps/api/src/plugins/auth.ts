import type { FastifyReply, FastifyRequest } from "fastify";
import type { SessionUser } from "@doxin/shared";
import {
  attachPlatformContext,
  attachTenantContext,
  createRequestStore,
  type TenantStore,
} from "../db/index.js";
import { authLookupUser, getTenant } from "../lib/auth-lookup.js";
import { consumeTenantRateLimit } from "../lib/tenant-rate-limit.js";
import { forbidden, unauthorized } from "../lib/errors.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: SessionUser & { tid?: string | null };
    user: SessionUser & { tid?: string | null };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    tenantContext?: TenantStore;
    tenantId?: string | null;
    tenantName?: string | null;
    isPlatformAdmin?: boolean;
  }
}

function sessionUser(
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    theme_color: string;
    tenant_id: string | null;
  },
  tenantName: string | null,
): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as SessionUser["role"],
    themeColor: user.theme_color as SessionUser["themeColor"],
    tenantId: user.tenant_id,
    tenantName,
  };
}

/**
 * Verify the JWT, re-read the account through the SECURITY DEFINER lookup, and
 * establish exactly one tenant context. The tenant comes only from the signed
 * `tid` claim; body/query/params are never consulted.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw unauthorized("Your session is invalid or has expired");
  }

  const payload = request.user;
  if (!payload.email || !payload.id) throw unauthorized("Your session is invalid or has expired");

  const user = await authLookupUser(payload.email);
  if (!user || !user.is_active) {
    throw unauthorized("Your session is invalid or has expired");
  }

  const tokenTenantId = payload.tid ?? null;
  if ((user.tenant_id ?? null) !== tokenTenantId) {
    throw unauthorized("Your session is invalid or has expired");
  }

  if (user.role === "PLATFORM_ADMIN") {
    if (user.tenant_id !== null) throw unauthorized("Your session is invalid or has expired");
    if (!request.url.startsWith("/api/platform") && !request.url.startsWith("/api/auth")) {
      throw forbidden("Platform administrators manage tenants, not tenant operations");
    }
    const store = request.tenantContext ?? createRequestStore();
    await attachPlatformContext(store, user.id);
    request.tenantContext = store;
    request.tenantId = null;
    request.tenantName = null;
    request.isPlatformAdmin = true;
    request.user = sessionUser(user, null);
    return;
  }

  if (!user.tenant_id) throw unauthorized("Your session is invalid or has expired");
  const tenant = await getTenant(user.tenant_id);
  if (!tenant) throw unauthorized("Your session is invalid or has expired");
  if (tenant.status !== "ACTIVE") {
    throw forbidden("This workspace is suspended or unavailable");
  }

  consumeTenantRateLimit(tenant);

  const store = request.tenantContext ?? createRequestStore();
  await attachTenantContext(store, user.tenant_id);
  request.tenantContext = store;
  request.tenantId = user.tenant_id;
  request.tenantName = tenant.name;
  request.isPlatformAdmin = false;
  request.user = sessionUser(user, tenant.name);
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await authenticate(request, reply);
  if (request.user.role !== "ADMIN") {
    throw forbidden();
  }
}

export async function requirePlatformAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await authenticate(request, reply);
  if (request.user.role !== "PLATFORM_ADMIN") {
    throw forbidden();
  }
}
