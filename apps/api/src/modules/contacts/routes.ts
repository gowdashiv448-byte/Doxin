import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { registerCrudRoutes } from "../../lib/crud.js";

const base = {
  name: z.string().trim().min(1, "Person name is required").max(200),
  companyName: z.string().trim().max(200).nullable().optional(),
  mobileNumber: z.string().trim().min(1, "Mobile number is required").max(30),
  email: z.string().trim().email("Invalid email address").nullable().optional().or(z.literal("")).or(z.null()),
  description: z.string().trim().max(1000).nullable().optional(),
};

export default async function contactRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, {
    entity: "Contact",
    table: "contacts",
    idColumn: "contact_id",
    idPrefix: "CON",
    idSequence: "contact_id_seq",
    idWidth: 5,
    select: "contact_id, name, company_name, mobile_number, email, description, created_at, updated_at",
    searchColumns: ["name", "company_name", "mobile_number", "email", "description"],
    sortColumns: { created_at: "created_at", name: "name", company: "company_name" },
    createSchema: z.object(base),
    updateSchema: z.object(base).partial(),
  });
}

