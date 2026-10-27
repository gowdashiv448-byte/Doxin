import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LOAD_ACTIONS, type LoadAction } from "@doxin/shared";
import { authenticate, requireAdmin } from "../../plugins/auth.js";
import { paginationSchema } from "../../lib/pagination.js";
import { createLoad, getLoadDetail, listLoads, recordEvent, transitionLoad, updateLoad } from "./service.js";

const loadBase = z.object({
  customerId: z.string().min(1),
  routeId: z.string().min(1),
  loadDate: z.string().date().optional(),
  loadType: z.string().max(50).optional(),
  weightLbs: z.coerce.number().int().min(0).max(200_000).optional(),
  pieces: z.coerce.number().int().min(0).max(100_000).optional(),
  revenue: z.coerce.number().min(0).optional(),
  fuelSurcharge: z.coerce.number().min(0).optional(),
  accessorialCharges: z.coerce.number().min(0).optional(),
  bookingType: z.enum(["Spot", "Contract", "Dedicated"]).optional(),
  poNumber: z.string().max(100).optional(),
  notes: z.string().max(4000).optional(),
  targetDeliveryDate: z.string().date().optional(),
  book: z.boolean().optional(),
});

const actionSchema = z.object({
  action: z.enum([
    "book",
    "plan",
    "dispatch",
    "start_transit",
    "mark_delivered",
    "complete",
    "cancel",
    "flag_exception",
    "resolve_exception",
  ]),
  driverId: z.string().optional(),
  truckId: z.string().optional(),
  trailerId: z.string().optional(),
  reason: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
});

const eventSchema = z.object({
  eventType: z.enum(["Pickup", "Delivery"]),
  facilityId: z.string().nullable().optional(),
  scheduledDatetime: z.string().datetime({ offset: true }).nullable().optional(),
  actualDatetime: z.string().datetime({ offset: true }).nullable().optional(),
  detentionMinutes: z.coerce.number().int().min(0).max(10_000).optional(),
  notes: z.string().max(2000).optional(),
});

const listQuery = paginationSchema.extend({
  status: z.string().optional(),
  customerId: z.string().optional(),
  driverId: z.string().optional(),
  bookingType: z.string().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  unassigned: z.enum(["true", "false"]).optional(),
  exceptions: z.enum(["true", "false"]).optional(),
});

export default async function loadRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: authenticate }, async (request) => {
    return listLoads(listQuery.parse(request.query));
  });

  app.get("/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    return getLoadDetail(id);
  });

  app.post("/", { preHandler: requireAdmin }, async (request, reply) => {
    const input = loadBase.parse(request.body);
    const load = await createLoad(input, request.user.id);
    reply.status(201);
    return load;
  });

  app.patch("/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const input = loadBase.partial().parse(request.body);
    return updateLoad(id, input);
  });

  app.post("/:id/actions", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const body = actionSchema.parse(request.body);
    return transitionLoad(id, { ...body, action: body.action as LoadAction }, { id: request.user.id, name: request.user.name });
  });

  app.get("/:id/allowed-actions", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const detail = await getLoadDetail(id);
    const status = String(detail.loadStatus);
    return {
      status,
      actions: Object.entries(LOAD_ACTIONS)
        .filter(([, rule]) => rule.from.includes(status as never))
        .map(([action, rule]) => ({ action, label: rule.label, to: rule.to })),
    };
  });

  app.post("/:id/events", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = eventSchema.parse(request.body);
    const event = await recordEvent(id, { ...body, recordedBy: request.user.id });
    reply.status(201);
    return event;
  });
}
