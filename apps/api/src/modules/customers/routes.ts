import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { registerCrudRoutes } from "../../lib/crud.js";

const base = {
  customerName: z.string().trim().min(1).max(200),
  customerType: z.enum(["Spot", "Contract", "Dedicated"]),
  creditTermsDays: z.coerce.number().int().min(0).max(180),
  primaryFreightType: z.string().max(100).nullable().optional(),
  accountStatus: z.enum(["Active", "Inactive"]).default("Active"),
  contractStartDate: z.string().date().nullable().optional(),
  annualRevenuePotential: z.coerce.number().min(0).default(0),
  contactName: z.string().max(150).nullable().optional(),
  contactEmail: z.string().email().nullable().optional().or(z.literal("")),
  contactPhone: z.string().max(40).nullable().optional(),
  billingAddress: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
};

export default async function customerRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, {
    entity: "Customer",
    table: "customers",
    idColumn: "customer_id",
    idPrefix: "CUST",
    idSequence: "customer_id_seq",
    idWidth: 5,
    select: "customer_id, customer_name, customer_type, credit_terms_days, primary_freight_type, account_status, contract_start_date, annual_revenue_potential, contact_name, contact_email, contact_phone, billing_address, notes, created_at, updated_at",
    searchColumns: ["customer_name", "customer_id", "contact_name", "contact_email"],
    sortColumns: { created_at: "created_at", name: "customer_name", revenue: "annual_revenue_potential" },
    createSchema: z.object(base),
    updateSchema: z.object(base).partial(),
    filters: { accountStatus: "account_status", customerType: "customer_type" },
  });
}
