import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { registerCrudRoutes } from "../../lib/crud.js";

const base = {
  facilityName: z.string().trim().min(1).max(200),
  facilityType: z.enum(["Cross-Dock", "Distribution Center", "Terminal", "Warehouse"]),
  city: z.string().trim().min(1).max(100),
  state: z.string().length(2),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  dockDoors: z.coerce.number().int().min(0).nullable().optional(),
  operatingHours: z.string().max(50).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  contactName: z.string().max(150).nullable().optional(),
  contactPhone: z.string().max(40).nullable().optional(),
};

export default async function facilityRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, {
    entity: "Facility",
    table: "facilities",
    idColumn: "facility_id",
    idPrefix: "FAC",
    idSequence: "facility_id_seq",
    idWidth: 5,
    select: "facility_id, facility_name, facility_type, city, state, latitude, longitude, dock_doors, operating_hours, address, contact_name, contact_phone, created_at, updated_at",
    searchColumns: ["facility_name", "facility_id", "city", "state"],
    sortColumns: { created_at: "created_at", name: "facility_name", city: "city" },
    createSchema: z.object(base),
    updateSchema: z.object(base).partial(),
    filters: { type: "facility_type", state: "state" },
  });
}
