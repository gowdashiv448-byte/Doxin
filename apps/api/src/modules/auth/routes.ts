import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { THEME_COLORS, type SessionUser, type ThemeColor } from "@doxin/shared";
import { authenticate } from "../../plugins/auth.js";
import { query, withPlatformAdmin, withTenant } from "../../db/index.js";
import { authLookupUser, getTenant, type AuthUserRow } from "../../lib/auth-lookup.js";
import { audit } from "../../lib/audit.js";
import { badRequest, forbidden, unauthorized } from "../../lib/errors.js";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

const preferencesSchema = z.object({
  themeColor: z.enum(THEME_COLORS),
});

function sessionUser(user: AuthUserRow, tenantName: string | null): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    themeColor: user.theme_color as ThemeColor,
    tenantId: user.tenant_id,
    tenantName,
  };
}

export default async function authRoutes(app: FastifyInstance) {
  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
    const body = loginSchema.parse(request.body);
    const user = await authLookupUser(body.email);
    if (!user || !user.is_active || !(await bcrypt.compare(body.password, user.password_hash))) {
      throw unauthorized("Invalid email or password");
    }

    let tenantName: string | null = null;
    if (user.tenant_id) {
      const tenant = await getTenant(user.tenant_id);
      if (!tenant) throw unauthorized("Invalid email or password");
      if (tenant.status !== "ACTIVE") throw forbidden("This workspace is suspended or unavailable");
      tenantName = tenant.name;
    } else if (user.role !== "PLATFORM_ADMIN") {
      throw unauthorized("Invalid email or password");
    }

    const currentUser = sessionUser(user, tenantName);
    const token = app.jwt.sign({ ...currentUser, tid: user.tenant_id });

    if (user.tenant_id) {
      await withTenant(user.tenant_id, async () => {
        await query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
        await audit(
          { ...request, user: currentUser } as typeof request,
          { action: "LOGIN", entityType: "user", entityId: user.id },
        );
      });
    } else {
      await withPlatformAdmin(user.id, async () => {
        await audit(
          { ...request, user: currentUser } as typeof request,
          { action: "LOGIN", entityType: "user", entityId: user.id },
        );
      });
    }

    return { token, user: currentUser };
  });

  app.get("/me", { preHandler: authenticate }, async (request) => {
    return { user: { ...request.user, isActive: true } };
  });

  app.patch("/preferences", { preHandler: authenticate }, async (request) => {
    const body = preferencesSchema.parse(request.body);
    const { rows } = await query<AuthUserRow>(
      `UPDATE users SET theme_color = $1, updated_at = now()
       WHERE id = $2
       RETURNING id, email, name, role, theme_color, is_active, tenant_id, password_hash`,
      [body.themeColor, request.user.id],
    );
    const user = rows[0];
    if (!user) throw unauthorized();
    await audit(request, {
      action: "UPDATE_PREFERENCES",
      entityType: "user",
      entityId: user.id,
      details: { themeColor: body.themeColor },
    });
    return { user: sessionUser(user, request.user.tenantName ?? null) };
  });

  app.post("/change-password", { preHandler: authenticate }, async (request) => {
    const body = changePasswordSchema.parse(request.body);
    const { rows } = await query<Pick<AuthUserRow, "password_hash">>(
      "SELECT password_hash FROM users WHERE id = $1",
      [request.user.id],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(body.currentPassword, user.password_hash))) {
      throw badRequest("Current password is incorrect");
    }
    const hash = await bcrypt.hash(body.newPassword, 12);
    await query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [
      hash,
      request.user.id,
    ]);
    await audit(request, {
      action: "PASSWORD_CHANGED",
      entityType: "user",
      entityId: request.user.id,
    });
    return { ok: true };
  });
}
