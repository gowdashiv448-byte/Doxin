import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { registerCrudRoutes } from "../../lib/crud.js";

const base = {
  trailerNumber: z.string().trim().min(1).max(40),
  trailerType: z.string().trim().min(1).max(60),
  lengthFeet: z.coerce.number().int().min(1).max(100).nullable().optional(),
  modelYear: z.coerce.number().int().min(1980).max(2100).nullable().optional(),
  vin: z.string().max(40).nullable().optional(),
  acquisitionDate: z.string().date().nullable().optional(),
  status: z.enum(["Active", "Maintenance", "Inactive"]).default("Active"),
  currentLocation: z.string().max(100).nullable().optional(),
};

export default async function trailerRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, {
    entity: "Trailer",
    table: "trailers",
    idColumn: "trailer_id",
    idPrefix: "TRL",
    idSequence: "trailer_id_seq",
    idWidth: 5,
    select: "trailer_id, trailer_number, trailer_type, length_feet, model_year, vin, acquisition_date, status, current_location, created_at, updated_at",
    searchColumns: ["trailer_number", "trailer_id", "current_location"],
    sortColumns: { created_at: "created_at", number: "trailer_number", year: "model_year" },
    createSchema: z.object(base),
    updateSchema: z.object(base).partial(),
    filters: { status: "status", type: "trailer_type" },
  });
}
