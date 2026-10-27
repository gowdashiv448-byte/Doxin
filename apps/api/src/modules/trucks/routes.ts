import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { registerCrudRoutes, toCamel } from "../../lib/crud.js";
import { authenticate } from "../../plugins/auth.js";
import { query } from "../../db/index.js";
import { notFound } from "../../lib/errors.js";

const base = {
  unitNumber: z.string().trim().min(1).max(40),
  make: z.string().trim().min(1).max(60),
  modelYear: z.coerce.number().int().min(1980).max(2100).nullable().optional(),
  vin: z.string().max(40).nullable().optional(),
  acquisitionDate: z.string().date().nullable().optional(),
  acquisitionMileage: z.coerce.number().int().min(0).nullable().optional(),
  currentOdometer: z.coerce.number().int().min(0).nullable().optional(),
  fuelType: z.string().max(30).default("Diesel"),
  tankCapacityGallons: z.coerce.number().int().min(0).nullable().optional(),
  status: z.enum(["Active", "Maintenance", "Inactive"]).default("Active"),
  homeTerminal: z.string().max(100).nullable().optional(),
  lastServiceDate: z.string().date().nullable().optional(),
  nextServiceDue: z.string().date().nullable().optional(),
};

export default async function truckRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, {
    entity: "Truck",
    table: "trucks",
    idColumn: "truck_id",
    idPrefix: "TRK",
    idSequence: "truck_id_seq",
    idWidth: 5,
    select: "truck_id, unit_number, make, model_year, vin, acquisition_date, acquisition_mileage, current_odometer, fuel_type, tank_capacity_gallons, status, home_terminal, last_service_date, next_service_due, created_at, updated_at",
    searchColumns: ["unit_number", "truck_id", "make", "vin", "home_terminal"],
    sortColumns: { created_at: "created_at", unit: "unit_number", year: "model_year" },
    createSchema: z.object(base),
    updateSchema: z.object(base).partial(),
    filters: { status: "status", terminal: "home_terminal" },
  });

  app.get("/:id/activity", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const truck = await query("SELECT truck_id, unit_number FROM trucks WHERE truck_id = $1", [id]);
    if (!truck.rows[0]) throw notFound("Truck");
    const maintenance = await query(
      `SELECT maintenance_id, maintenance_date, maintenance_type, total_cost, downtime_hours, status
       FROM maintenance_records WHERE truck_id = $1 ORDER BY maintenance_date DESC LIMIT 10`,
      [id],
    );
    const fuel = await query(
      `SELECT fuel_purchase_id, purchase_date, gallons, total_cost, location_city, location_state
       FROM fuel_purchases WHERE truck_id = $1 ORDER BY purchase_date DESC LIMIT 10`,
      [id],
    );
    const trips = await query(
      `SELECT t.trip_id, t.load_id, t.dispatch_date, t.actual_distance_miles, t.trip_status,
              l.revenue, r.origin_city, r.destination_city
       FROM trips t JOIN loads l ON l.load_id = t.load_id JOIN routes r ON r.route_id = l.route_id
       WHERE t.truck_id = $1 ORDER BY t.dispatch_date DESC LIMIT 10`,
      [id],
    );
    return {
      truck: toCamel(truck.rows[0]),
      maintenance: maintenance.rows.map((r) => toCamel(r)),
      fuel: fuel.rows.map((r) => toCamel(r)),
      trips: trips.rows.map((r) => toCamel(r)),
    };
  });
}
