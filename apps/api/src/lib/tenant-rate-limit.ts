import { AppError } from "./errors.js";
import type { TenantRow } from "./auth-lookup.js";

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/**
 * Small per-tenant fixed-window limiter. The Fastify IP limiter remains the
 * outer guard; this enforces the limit stored in tenants.config.rateLimit.
 * A production deployment can replace the Map with Redis without changing the
 * call site.
 */
export function consumeTenantRateLimit(tenant: TenantRow): void {
  const raw = tenant.config?.rateLimit as
    | { max?: unknown; timeWindowSeconds?: unknown }
    | undefined;
  const max = Number(raw?.max ?? 300);
  const windowSeconds = Number(raw?.timeWindowSeconds ?? 60);
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    return;
  }

  const now = Date.now();
  const key = tenant.id;
  let window = windows.get(key);
  if (!window || window.resetAt <= now) {
    window = { count: 0, resetAt: now + windowSeconds * 1000 };
    windows.set(key, window);
  }
  window.count += 1;
  if (window.count > max) {
    throw new AppError(429, "Too many requests for this workspace. Please slow down.", "RATE_LIMITED");
  }
}
