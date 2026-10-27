import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { registerCrudRoutes } from "../../lib/crud.js";

const base = {
  originCity: z.string().trim().min(1).max(100),
  originState: z.string().length(2),
  destinationCity: z.string().trim().min(1).max(100),
  destinationState: z.string().length(2),
  typicalDistanceMiles: z.coerce.number().int().min(1),
  baseRatePerMile: z.coerce.number().min(0),
  fuelSurchargeRate: z.coerce.number().min(0).default(0),
  typicalTransitDays: z.coerce.number().int().min(1).max(30).default(1),
  isActive: z.boolean().default(true),
};

export default async function routeRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, {
    entity: "Route",
    table: "routes",
    idColumn: "route_id",
    idPrefix: "RTE",
    idSequence: "route_id_seq",
    idWidth: 5,
    select: "route_id, origin_city, origin_state, destination_city, destination_state, typical_distance_miles, base_rate_per_mile, fuel_surcharge_rate, typical_transit_days, is_active, created_at, updated_at",
    searchColumns: ["route_id", "origin_city", "destination_city", "origin_state", "destination_state"],
    sortColumns: { created_at: "created_at", distance: "typical_distance_miles", lane: "origin_city" },
    createSchema: z.object(base),
    updateSchema: z.object(base).partial(),
    filters: { active: "is_active" },
  });
}
