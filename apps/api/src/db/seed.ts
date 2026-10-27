import bcrypt from "bcryptjs";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_SLUG,
  NORTHWIND_TENANT_ID,
  NORTHWIND_TENANT_SLUG,
  closePools,
  ownerQuery,
  systemQuery,
  withTenant,
} from "./index.js";
import { migrate } from "./migrate.js";
import { config } from "../config.js";

const DEFAULT_SEED_PASSWORDS = ["Doxin@2026", "Platform@2026", "Northwind@2026"];

function assertProductionPasswords() {
  if (!config.isProduction) return;
  const passwords = [
    config.SEED_ADMIN_PASSWORD,
    config.SEED_PLATFORM_PASSWORD,
    config.SEED_SECOND_TENANT_PASSWORD,
  ];
  if (passwords.some((password) => DEFAULT_SEED_PASSWORDS.includes(password))) {
    throw new Error(
      "Refusing to seed default passwords in production. Set SEED_ADMIN_PASSWORD, SEED_PLATFORM_PASSWORD and SEED_SECOND_TENANT_PASSWORD.",
    );
  }
}

async function syncAppRolePassword() {
  // The role is created by migration 005 with a development password. Keep it
  // in sync with DATABASE_URL's password without ever using the owner role at
  // runtime.
  const quoted = await ownerQuery<{ value: string }>("SELECT quote_literal($1) AS value", [
    config.APP_DB_PASSWORD,
  ]);
  await ownerQuery(`ALTER ROLE doxin_app PASSWORD ${quoted.rows[0]!.value}`);
}

async function ensureTenants() {
  await systemQuery(
    `INSERT INTO tenants (id, name, slug, status, config)
     VALUES ($1, 'Doxin', $2, 'ACTIVE', '{"rateLimit":{"max":300,"timeWindowSeconds":60}}'::jsonb)
     ON CONFLICT (slug) DO NOTHING`,
    [DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG],
  );
  await systemQuery(
    `INSERT INTO tenants (id, name, slug, status, config)
     VALUES ($1, $2, $3, 'ACTIVE', '{"rateLimit":{"max":300,"timeWindowSeconds":60}}'::jsonb)
     ON CONFLICT (slug) DO NOTHING`,
    [NORTHWIND_TENANT_ID, config.SEED_SECOND_TENANT_NAME, config.SEED_SECOND_TENANT_SLUG],
  );
}

async function ensureUsers() {
  const defaultHash = await bcrypt.hash(config.SEED_ADMIN_PASSWORD, 10);
  await withTenant(DEFAULT_TENANT_ID, async (client) => {
    const result = await client.query(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1,$2,$3,'ADMIN') ON CONFLICT (email) DO NOTHING`,
      [config.SEED_ADMIN_EMAIL, "Avery Stone", defaultHash],
    );
    if (result.rowCount) console.log(`✓ default-tenant user ${config.SEED_ADMIN_EMAIL}`);
  });

  const secondHash = await bcrypt.hash(config.SEED_SECOND_TENANT_PASSWORD, 10);
  await withTenant(NORTHWIND_TENANT_ID, async (client) => {
    const result = await client.query(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1,$2,$3,'ADMIN') ON CONFLICT (email) DO NOTHING`,
      [config.SEED_SECOND_TENANT_EMAIL, "Northwind Admin", secondHash],
    );
    if (result.rowCount) console.log(`✓ northwind user ${config.SEED_SECOND_TENANT_EMAIL}`);
  });

  // The platform administrator has no tenant and is inserted with the owner
  // connection during bootstrap; runtime always uses the app role.
  const platformHash = await bcrypt.hash(config.SEED_PLATFORM_PASSWORD, 10);
  const platform = await ownerQuery(
    `INSERT INTO users (email, name, password_hash, role, tenant_id)
     VALUES ($1,$2,$3,'PLATFORM_ADMIN',NULL) ON CONFLICT (email) DO NOTHING`,
    [config.SEED_PLATFORM_EMAIL, "Platform Administrator", platformHash],
  );
  if (platform.rowCount) console.log(`✓ platform user ${config.SEED_PLATFORM_EMAIL}`);
}

async function ensureStarterData(tenantId: string) {
  await withTenant(tenantId, async (client) => {
    const count = await client.query<{ count: string }>(
      "SELECT count(*) FROM customers",
    );
    if (Number(count.rows[0]?.count) > 0) return;

    console.log("Seeding starter reference data…");
    const customer = await client.query<{ customer_id: string }>(
      `INSERT INTO customers (customer_name, customer_type, credit_terms_days, primary_freight_type, account_status, contract_start_date, annual_revenue_potential, contact_name, contact_email, contact_phone)
     VALUES ('Northwind Retail','Contract',30,'Retail','Active',CURRENT_DATE - 400,4800000,'Jordan Blake','ops@northwind.example','+1 312 555 0142') RETURNING customer_id`,
    );
    const customerId = customer.rows[0]!.customer_id;
    await client.query(
      `INSERT INTO customers (customer_name, customer_type, credit_terms_days, primary_freight_type, account_status, contract_start_date, annual_revenue_potential)
     VALUES ('Cascade Foods','Dedicated',45,'Food/Beverage','Active',CURRENT_DATE - 300,3200000),
            ('Atlas Industrial','Spot',15,'General','Active',CURRENT_DATE - 120,900000)`,
    );
    const lanes = [
      ["Chicago", "IL", "Columbus", "OH", 355, 2.15, 0.24, 1],
      ["Dallas", "TX", "Atlanta", "GA", 780, 1.92, 0.21, 2],
      ["Seattle", "WA", "Denver", "CO", 1315, 2.28, 0.25, 3],
      ["Kansas City", "MO", "Detroit", "MI", 700, 2.02, 0.22, 2],
      ["Houston", "TX", "Nashville", "TN", 790, 1.98, 0.2, 2],
    ];
    for (const lane of lanes) {
      await client.query(
        `INSERT INTO routes (origin_city, origin_state, destination_city, destination_state, typical_distance_miles, base_rate_per_mile, fuel_surcharge_rate, typical_transit_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        lane,
      );
    }
    const facilities = [
      [
        "Chicago Cross-Dock",
        "Cross-Dock",
        "Chicago",
        "IL",
        41.8781,
        -87.6298,
        64,
        "24/7",
      ],
      [
        "Columbus Distribution Center",
        "Distribution Center",
        "Columbus",
        "OH",
        39.9612,
        -82.9988,
        48,
        "6AM-10PM",
      ],
      [
        "Dallas Terminal",
        "Terminal",
        "Dallas",
        "TX",
        32.7767,
        -96.797,
        36,
        "24/7",
      ],
      [
        "Atlanta Warehouse",
        "Warehouse",
        "Atlanta",
        "GA",
        33.749,
        -84.388,
        28,
        "7AM-7PM",
      ],
      [
        "Seattle Hub",
        "Cross-Dock",
        "Seattle",
        "WA",
        47.6062,
        -122.3321,
        40,
        "24/7",
      ],
      [
        "Denver Terminal",
        "Terminal",
        "Denver",
        "CO",
        39.7392,
        -104.9903,
        32,
        "6AM-10PM",
      ],
      [
        "Kansas City Hub",
        "Cross-Dock",
        "Kansas City",
        "MO",
        39.0997,
        -94.5786,
        30,
        "24/7",
      ],
      [
        "Detroit Distribution Center",
        "Distribution Center",
        "Detroit",
        "MI",
        42.3314,
        -83.0458,
        22,
        "7AM-7PM",
      ],
      [
        "Houston Terminal",
        "Terminal",
        "Houston",
        "TX",
        29.7604,
        -95.3698,
        26,
        "24/7",
      ],
      [
        "Nashville Warehouse",
        "Warehouse",
        "Nashville",
        "TN",
        36.1627,
        -86.7816,
        18,
        "8AM-5PM",
      ],
    ];
    for (const f of facilities) {
      await client.query(
        `INSERT INTO facilities (facility_name, facility_type, city, state, latitude, longitude, dock_doors, operating_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        f,
      );
    }
    const driverNames: [string, string, string][] = [
      ["Marcus", "Reed", "TX"],
      ["Elena", "Petrov", "IL"],
      ["Darnell", "King", "GA"],
      ["Sofia", "Alvarez", "CO"],
      ["Owen", "Bennett", "OH"],
      ["Nadia", "Hassan", "WA"],
      ["Victor", "Ramos", "MO"],
      ["Grace", "Kim", "MI"],
      ["Andre", "Cole", "TN"],
      ["Leah", "Brooks", "TX"],
    ];
    for (const [first, last, state] of driverNames) {
      await client.query(
        `INSERT INTO drivers (first_name, last_name, hire_date, license_number, license_state, date_of_birth,
        home_terminal, employment_status, cdl_class, years_experience, phone, email)
       VALUES ($1,$2,CURRENT_DATE - $3::int,$4,$5,'1985-04-12',$6,'Active','A',8,$7,$8)`,
        [
          first,
          last,
          500 + Math.floor(Math.random() * 1500),
          `DL${Math.floor(Math.random() * 900000000 + 100000000)}`,
          state,
          [
            "Dallas",
            "Chicago",
            "Atlanta",
            "Denver",
            "Columbus",
            "Seattle",
            "Kansas City",
            "Detroit",
            "Nashville",
            "Houston",
          ][driverNames.findIndex((d) => d[0] === first)],
          `+1 555 01${String(Math.floor(Math.random() * 90) + 10)}`,
          `${first.toLowerCase()}.${last.toLowerCase()}@doxin.example`,
        ],
      );
    }
    const trucks = [
      ["4101", "Freightliner", "Cascadia", 2022, "Dallas"],
      ["4102", "Kenworth", "T680", 2021, "Chicago"],
      ["4103", "Volvo", "VNL", 2022, "Atlanta"],
      ["4104", "Peterbilt", "579", 2020, "Denver"],
      ["4105", "Freightliner", "Cascadia", 2023, "Columbus"],
      ["4106", "Mack", "Anthem", 2020, "Seattle"],
      ["4107", "International", "LT", 2021, "Kansas City"],
      ["4108", "Kenworth", "T680", 2022, "Detroit"],
    ];
    for (const [unit, make, model, year, terminal] of trucks) {
      await client.query(
        `INSERT INTO trucks (unit_number, make, model_year, vin, acquisition_date, acquisition_mileage, current_odometer, fuel_type, tank_capacity_gallons, status, home_terminal, last_service_date, next_service_due)
       VALUES ($1,$2,$3,$4,CURRENT_DATE - 700,120000,168000,'Diesel',200,'Active',$5,CURRENT_DATE - 45,CURRENT_DATE + 45)`,
        [
          unit,
          make,
          year,
          `1DX${Math.floor(Math.random() * 9_000_000_000_000_000 + 1_000_000_000_000_000)}`,
          terminal,
        ],
      );
    }
    for (let i = 1; i <= 8; i += 1) {
      await client.query(
        `INSERT INTO trailers (trailer_number, trailer_type, length_feet, model_year, vin, acquisition_date, status, current_location)
       VALUES ($1,$2,53,$3,$4,CURRENT_DATE - 600,'Active',$5)`,
        [
          String(7800 + i),
          i % 3 === 0 ? "Refrigerated" : "Dry Van",
          2021 + (i % 3),
          `1TR${Math.floor(Math.random() * 9_000_000_000_000_000 + 1_000_000_000_000_000)}`,
          "Chicago",
        ],
      );
    }
    void customerId;
  });
}

interface ResourceRow {
  driver_id: string;
  truck_id: string;
  trailer_id: string;
}

async function ensureLiveOperations(tenantId: string) {
  await withTenant(tenantId, async (client) => {
    const existing = await client.query(
      "SELECT 1 FROM loads WHERE load_date = CURRENT_DATE LIMIT 1",
    );
    if (existing.rowCount) {
      console.log("Live operations already present, skipping");
      return;
    }
    const customers = await client.query<{
      customer_id: string;
      customer_type: string;
    }>(
      "SELECT customer_id, customer_type FROM customers WHERE account_status = 'Active' LIMIT 3",
    );
    const routes = await client.query<{
      route_id: string;
      typical_distance_miles: number;
      typical_transit_days: number;
      base_rate_per_mile: string;
      fuel_surcharge_rate: string;
    }>("SELECT * FROM routes WHERE is_active LIMIT 5");
    const drivers = await client.query<{ driver_id: string }>(
      "SELECT driver_id FROM drivers WHERE employment_status = 'Active' ORDER BY driver_id LIMIT 8",
    );
    const trucks = await client.query<{ truck_id: string }>(
      "SELECT truck_id FROM trucks WHERE status = 'Active' ORDER BY truck_id LIMIT 8",
    );
    const trailers = await client.query<{ trailer_id: string }>(
      "SELECT trailer_id FROM trailers WHERE status = 'Active' ORDER BY trailer_id LIMIT 8",
    );
    const facilities = await client.query<{
      facility_id: string;
      city: string;
      state: string;
    }>(
      "SELECT facility_id, city, state FROM facilities ORDER BY facility_id LIMIT 10",
    );
    if (
      !customers.rows.length ||
      !routes.rows.length ||
      !drivers.rows.length ||
      !trucks.rows.length ||
      !trailers.rows.length
    ) {
      console.log("Reference data missing, live operations not seeded");
      return;
    }

    const plan: {
      status: string;
      tripStatus: string | null;
      offset: number;
    }[] = [
      { status: "BOOKED", tripStatus: null, offset: 0 },
      { status: "BOOKED", tripStatus: null, offset: 1 },
      { status: "PLANNED", tripStatus: "PLANNED", offset: 0 },
      { status: "PLANNED", tripStatus: "PLANNED", offset: 1 },
      { status: "DISPATCHED", tripStatus: "DISPATCHED", offset: 0 },
      { status: "IN_TRANSIT", tripStatus: "IN_TRANSIT", offset: -1 },
      { status: "IN_TRANSIT", tripStatus: "IN_TRANSIT", offset: -1 },
      { status: "EXCEPTION", tripStatus: "IN_TRANSIT", offset: -1 },
      { status: "DELIVERED", tripStatus: "DELIVERED", offset: -1 },
      { status: "COMPLETED", tripStatus: "COMPLETED", offset: -2 },
    ];

    let resourceIndex = 0;
    for (const [index, item] of plan.entries()) {
      const customer = customers.rows[index % customers.rows.length]!;
      const lane = routes.rows[index % routes.rows.length]!;
      const distance = lane.typical_distance_miles;
      const revenue =
        Math.round(distance * Number(lane.base_rate_per_mile) * 100) / 100;
      const fsc =
        Math.round(distance * Number(lane.fuel_surcharge_rate) * 100) / 100;
      const origin = facilities.rows[index % facilities.rows.length]!;
      const destination =
        facilities.rows[(index + 1) % facilities.rows.length]!;
      const loadDate = new Date();
      loadDate.setUTCDate(loadDate.getUTCDate() + Math.min(item.offset, 0));
      const loadDateStr = loadDate.toISOString().slice(0, 10);
      const target = new Date(
        loadDate.getTime() + lane.typical_transit_days * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);

      const load = await client.query<{ load_id: string }>(
        `INSERT INTO loads (customer_id, route_id, load_date, load_type, weight_lbs, pieces, revenue, fuel_surcharge,
         accessorial_charges, load_status, booking_type, target_delivery_date, exception_reason, assigned_at, dispatched_at, delivered_at, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING load_id`,
        [
          customer.customer_id,
          lane.route_id,
          loadDateStr,
          index % 4 === 0 ? "Refrigerated" : "Dry Van",
          18000 + index * 840,
          12 + index,
          revenue,
          fsc,
          item.status,
          customer.customer_type,
          target,
          item.status === "EXCEPTION"
            ? "Driver reported mechanical delay; recovery in progress"
            : null,
          item.tripStatus ? new Date() : null,
          item.tripStatus ? new Date() : null,
          item.status === "DELIVERED" || item.status === "COMPLETED"
            ? new Date()
            : null,
          item.status === "COMPLETED" ? new Date() : null,
        ],
      );
      const loadId = load.rows[0]!.load_id;

      if (item.tripStatus) {
        const driver = drivers.rows[resourceIndex % drivers.rows.length]!;
        const truck = trucks.rows[resourceIndex % trucks.rows.length]!;
        const trailer = trailers.rows[resourceIndex % trailers.rows.length]!;
        resourceIndex += 1;
        const trip = await client.query<{ trip_id: string }>(
          `INSERT INTO trips (load_id, driver_id, truck_id, trailer_id, dispatch_date, actual_distance_miles,
           actual_duration_hours, fuel_gallons_used, average_mpg, idle_time_hours, odometer_start, odometer_end, trip_status, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,168000,168000 + $6,$11,$12) RETURNING trip_id`,
          [
            loadId,
            driver.driver_id,
            truck.truck_id,
            trailer.trailer_id,
            loadDateStr,
            item.tripStatus === "PLANNED" ? null : distance,
            item.tripStatus === "PLANNED"
              ? null
              : Math.round((distance / 52) * 10) / 10,
            item.tripStatus === "PLANNED"
              ? null
              : Math.round((distance / 6.4) * 10) / 10,
            item.tripStatus === "PLANNED" ? null : 6.4,
            item.tripStatus === "PLANNED" ? null : 3.2,
            item.tripStatus,
            item.status === "COMPLETED" ? new Date() : null,
          ],
        );
        const tripId = trip.rows[0]!.trip_id;
        if (item.tripStatus !== "PLANNED") {
          const pickupAt = new Date(loadDate);
          pickupAt.setUTCHours(14, 30, 0, 0);
          const scheduledPickup = new Date(pickupAt);
          scheduledPickup.setUTCHours(15, 0, 0, 0);
          await client.query(
            `INSERT INTO delivery_events (load_id, trip_id, event_type, facility_id, scheduled_datetime, actual_datetime, detention_minutes, on_time_flag, location_city, location_state)
           VALUES ($1,$2,'Pickup',$3,$4,$5,35,true,$6,$7)`,
            [
              loadId,
              tripId,
              origin.facility_id,
              scheduledPickup,
              pickupAt,
              origin.city,
              origin.state,
            ],
          );
          if (item.status === "DELIVERED" || item.status === "COMPLETED") {
            const deliveredAt = new Date(`${target}T16:20:00Z`);
            const scheduledDelivery = new Date(`${target}T17:00:00Z`);
            await client.query(
              `INSERT INTO delivery_events (load_id, trip_id, event_type, facility_id, scheduled_datetime, actual_datetime, detention_minutes, on_time_flag, location_city, location_state)
             VALUES ($1,$2,'Delivery',$3,$4,$5,20,true,$6,$7)`,
              [
                loadId,
                tripId,
                destination.facility_id,
                scheduledDelivery,
                deliveredAt,
                destination.city,
                destination.state,
              ],
            );
          } else {
            const scheduledDelivery = new Date(`${target}T17:00:00Z`);
            await client.query(
              `INSERT INTO delivery_events (load_id, trip_id, event_type, facility_id, scheduled_datetime, actual_datetime, detention_minutes, on_time_flag, location_city, location_state)
             VALUES ($1,$2,'Delivery',$3,$4,NULL,0,NULL,$5,$6)`,
              [
                loadId,
                tripId,
                destination.facility_id,
                scheduledDelivery,
                destination.city,
                destination.state,
              ],
            );
          }
        }
      }
    }
    await client.query(
      `INSERT INTO maintenance_records (truck_id, maintenance_date, maintenance_type, odometer_reading, labor_hours, labor_cost, parts_cost, total_cost, facility_location, downtime_hours, service_description, status)
     SELECT truck_id, CURRENT_DATE + 3, 'Preventive', current_odometer, 3, 240, 380, 620, home_terminal, 6, 'Scheduled PM service', 'SCHEDULED'
     FROM trucks WHERE status = 'Active' ORDER BY truck_id LIMIT 2`,
    );
    console.log("✓ live operations seeded");
  });
}

/**
 * Live trips need recent fuel receipts so the control tower reports a real
 * 30-day fuel spend. Historical archive purchases are years old by design.
 */
async function ensureLiveFuel(tenantId: string) {
  await withTenant(tenantId, async (client) => {
    const result = await client.query(
      `INSERT INTO fuel_purchases (trip_id, truck_id, driver_id, purchase_date, location_city, location_state,
                                 gallons, price_per_gallon, total_cost)
     SELECT t.trip_id, t.truck_id, t.driver_id,
            now() - (interval '1 day' * (row_number() OVER (ORDER BY t.trip_id) % 5)),
            r.origin_city, r.origin_state,
            round(t.fuel_gallons_used, 2), 3.879,
            round(t.fuel_gallons_used * 3.879, 2)
     FROM trips t
     JOIN loads l ON l.load_id = t.load_id
     JOIN routes r ON r.route_id = l.route_id
     WHERE l.load_date >= CURRENT_DATE - 2
       AND t.trip_status <> 'PLANNED'
       AND t.fuel_gallons_used IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM fuel_purchases fp WHERE fp.trip_id = t.trip_id
       )`,
    );
    if (result.rowCount)
      console.log(`✓ ${result.rowCount} live fuel receipts seeded`);
  });
}

async function main() {
  assertProductionPasswords();
  await migrate();
  await syncAppRolePassword();
  await ensureTenants();
  await ensureUsers();
  if (config.SEED_STARTER_DATA) {
    await ensureStarterData(DEFAULT_TENANT_ID);
    await ensureLiveOperations(DEFAULT_TENANT_ID);
    await ensureLiveFuel(DEFAULT_TENANT_ID);
    await ensureStarterData(NORTHWIND_TENANT_ID);
  } else {
    console.log(
      "Starter demo data disabled (SEED_STARTER_DATA=false); import the archive or create master data.",
    );
  }
  console.log(
    `\nDoxin seed complete.\nDefault tenant: ${config.SEED_ADMIN_EMAIL}\nSecond tenant: ${config.SEED_SECOND_TENANT_EMAIL}\nPlatform admin: ${config.SEED_PLATFORM_EMAIL}\nPasswords come from the SEED_* environment variables.`,
  );
  await closePools();
}

main().catch(async (error) => {
  console.error("Seed failed", error);
  await closePools().catch(() => undefined);
  process.exit(1);
});
