import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import { config } from "./config.js";
import { AppError } from "./lib/errors.js";
import authRoutes from "./modules/auth/routes.js";
import userRoutes from "./modules/users/routes.js";
import customerRoutes from "./modules/customers/routes.js";
import driverRoutes from "./modules/drivers/routes.js";
import truckRoutes from "./modules/trucks/routes.js";
import trailerRoutes from "./modules/trailers/routes.js";
import facilityRoutes from "./modules/facilities/routes.js";
import routeRoutes from "./modules/routes/routes.js";
import loadRoutes from "./modules/loads/routes.js";
import tripRoutes from "./modules/trips/routes.js";
import eventRoutes from "./modules/events/routes.js";
import fuelRoutes from "./modules/fuel/routes.js";
import maintenanceRoutes from "./modules/maintenance/routes.js";
import safetyRoutes from "./modules/safety/routes.js";
import dashboardRoutes from "./modules/dashboard/routes.js";
import analyticsRoutes from "./modules/analytics/routes.js";
import importRoutes from "./modules/imports/routes.js";
import auditRoutes from "./modules/audit/routes.js";
import platformRoutes from "./modules/platform/routes.js";
import {
  commitTenantContext,
  createRequestStore,
  pool,
  rollbackTenantContext,
} from "./db/index.js";

export async function buildApp() {
  const app = Fastify({
    logger:
      config.NODE_ENV === "test"
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: ["req.headers.authorization", "req.body.password", "req.body.currentPassword", "req.body.newPassword"],
          },
    trustProxy: true,
    bodyLimit: 25 * 1024 * 1024,
    requestIdHeader: "x-request-id",
  });

  app.addHook("onRequest", async (request) => {
    // Establish the mutable async-local store synchronously, before any await.
    request.tenantContext = createRequestStore();
  });
  app.addHook("onSend", async (request, _reply, payload) => {
    // Commit before the response leaves the server so a client cannot issue a
    // follow-up read and observe the pre-write state. onResponse remains a
    // fallback for hijacked/streaming responses.
    if (request.tenantContext) await commitTenantContext(request.tenantContext);
    return payload;
  });
  app.addHook("onResponse", async (request) => {
    if (request.tenantContext) await commitTenantContext(request.tenantContext);
  });
  app.addHook("onError", async (request) => {
    if (request.tenantContext) await rollbackTenantContext(request.tenantContext);
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1 } });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Doxin Logistics API",
        description: "End-to-end dispatch, fleet, safety and analytics API.",
        version: "1.0.0",
      },
      servers: [{ url: `http://localhost:${config.PORT}`, description: "Local" }],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: error.flatten().fieldErrors,
      });
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
        details: error.details,
      });
    }
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23505") {
      return reply.status(409).send({ error: "A record with those unique values already exists", code: "DUPLICATE" });
    }
    if (pgCode === "23503") {
      return reply.status(409).send({ error: "This record is referenced by other data and cannot be changed", code: "REFERENCE" });
    }
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send({ error: "Too many requests. Please slow down.", code: "RATE_LIMITED" });
    }
    request.log.error({ err: error }, "Unhandled request error");
    return reply.status(500).send({ error: "Something went wrong on our side", code: "INTERNAL" });
  });

  app.get("/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok", service: "doxin-api", time: new Date().toISOString() };
  });

  app.get("/", async () => ({ name: "Doxin Logistics API", docs: "/docs", health: "/health" }));

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(userRoutes, { prefix: "/api/users" });
  await app.register(customerRoutes, { prefix: "/api/customers" });
  await app.register(driverRoutes, { prefix: "/api/drivers" });
  await app.register(truckRoutes, { prefix: "/api/trucks" });
  await app.register(trailerRoutes, { prefix: "/api/trailers" });
  await app.register(facilityRoutes, { prefix: "/api/facilities" });
  await app.register(routeRoutes, { prefix: "/api/routes" });
  await app.register(loadRoutes, { prefix: "/api/loads" });
  await app.register(tripRoutes, { prefix: "/api/trips" });
  await app.register(eventRoutes, { prefix: "/api/events" });
  await app.register(fuelRoutes, { prefix: "/api/fuel" });
  await app.register(maintenanceRoutes, { prefix: "/api/maintenance" });
  await app.register(safetyRoutes, { prefix: "/api/safety" });
  await app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  await app.register(analyticsRoutes, { prefix: "/api/analytics" });
  await app.register(importRoutes, { prefix: "/api/imports" });
  await app.register(auditRoutes, { prefix: "/api/audit" });
  await app.register(platformRoutes, { prefix: "/api/platform" });

  return app;
}
