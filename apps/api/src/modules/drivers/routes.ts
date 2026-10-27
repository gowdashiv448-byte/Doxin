import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { registerCrudRoutes } from "../../lib/crud.js";

const base = {
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  hireDate: z.string().date().nullable().optional(),
  terminationDate: z.string().date().nullable().optional(),
  licenseNumber: z.string().max(50).nullable().optional(),
  licenseState: z.string().length(2).nullable().optional(),
  dateOfBirth: z.string().date().nullable().optional(),
  homeTerminal: z.string().max(100).nullable().optional(),
  employmentStatus: z.enum(["Active", "Inactive", "Terminated", "On Leave"]).default("Active"),
  cdlClass: z.string().max(10).nullable().optional(),
  yearsExperience: z.coerce.number().int().min(0).max(70).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  emergencyContact: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
};

export default async function driverRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, {
    entity: "Driver",
    table: "drivers",
    idColumn: "driver_id",
    idPrefix: "DRV",
    idSequence: "driver_id_seq",
    idWidth: 5,
    select: "driver_id, first_name, last_name, hire_date, termination_date, license_number, license_state, date_of_birth, home_terminal, employment_status, cdl_class, years_experience, phone, email, emergency_contact, notes, created_at, updated_at",
    searchColumns: ["first_name", "last_name", "driver_id", "license_number", "home_terminal"],
    sortColumns: { created_at: "created_at", name: "last_name", hireDate: "hire_date" },
    createSchema: z.object(base),
    updateSchema: z.object(base).partial(),
    filters: { employmentStatus: "employment_status", terminal: "home_terminal" },
  });
}
