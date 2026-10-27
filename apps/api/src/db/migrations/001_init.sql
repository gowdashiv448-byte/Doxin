-- Doxin initial schema. Money in USD, timestamps in UTC.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SEQUENCE IF NOT EXISTS load_id_seq START 90000001;
CREATE SEQUENCE IF NOT EXISTS trip_id_seq START 90000001;
CREATE SEQUENCE IF NOT EXISTS event_id_seq START 90000001;
CREATE SEQUENCE IF NOT EXISTS fuel_id_seq START 90000001;
CREATE SEQUENCE IF NOT EXISTS maintenance_id_seq START 90000001;
CREATE SEQUENCE IF NOT EXISTS incident_id_seq START 90000001;
CREATE SEQUENCE IF NOT EXISTS customer_id_seq START 90001;
CREATE SEQUENCE IF NOT EXISTS driver_id_seq START 90001;
CREATE SEQUENCE IF NOT EXISTS truck_id_seq START 90001;
CREATE SEQUENCE IF NOT EXISTS trailer_id_seq START 90001;
CREATE SEQUENCE IF NOT EXISTS facility_id_seq START 90001;
CREATE SEQUENCE IF NOT EXISTS route_id_seq START 90001;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN','DISPATCHER','FLEET_MANAGER','SAFETY_MANAGER','FINANCE','VIEWER')),
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  customer_id text PRIMARY KEY,
  customer_name text NOT NULL,
  customer_type text NOT NULL CHECK (customer_type IN ('Spot','Contract','Dedicated')),
  credit_terms_days integer NOT NULL DEFAULT 30,
  primary_freight_type text,
  account_status text NOT NULL DEFAULT 'Active' CHECK (account_status IN ('Active','Inactive')),
  contract_start_date date,
  annual_revenue_potential numeric(14,2) NOT NULL DEFAULT 0,
  contact_name text,
  contact_email text,
  contact_phone text,
  billing_address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE facilities (
  facility_id text PRIMARY KEY,
  facility_name text NOT NULL,
  facility_type text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  latitude numeric(9,6),
  longitude numeric(9,6),
  dock_doors integer,
  operating_hours text,
  address text,
  contact_name text,
  contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE routes (
  route_id text PRIMARY KEY,
  origin_city text NOT NULL,
  origin_state text NOT NULL,
  destination_city text NOT NULL,
  destination_state text NOT NULL,
  typical_distance_miles integer NOT NULL,
  base_rate_per_mile numeric(8,4) NOT NULL,
  fuel_surcharge_rate numeric(8,4) NOT NULL DEFAULT 0,
  typical_transit_days integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE drivers (
  driver_id text PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL,
  hire_date date,
  termination_date date,
  license_number text,
  license_state text,
  date_of_birth date,
  home_terminal text,
  employment_status text NOT NULL DEFAULT 'Active' CHECK (employment_status IN ('Active','Inactive','Terminated','On Leave')),
  cdl_class text,
  years_experience integer,
  phone text,
  email text,
  emergency_contact text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trucks (
  truck_id text PRIMARY KEY,
  unit_number text NOT NULL UNIQUE,
  make text NOT NULL,
  model_year integer,
  vin text,
  acquisition_date date,
  acquisition_mileage integer,
  current_odometer integer,
  fuel_type text NOT NULL DEFAULT 'Diesel',
  tank_capacity_gallons integer,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Maintenance','Inactive')),
  home_terminal text,
  last_service_date date,
  next_service_due date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trailers (
  trailer_id text PRIMARY KEY,
  trailer_number text NOT NULL UNIQUE,
  trailer_type text NOT NULL,
  length_feet integer,
  model_year integer,
  vin text,
  acquisition_date date,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Maintenance','Inactive')),
  current_location text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE loads (
  load_id text PRIMARY KEY DEFAULT ('LOAD' || lpad(nextval('load_id_seq')::text, 8, '0')),
  customer_id text NOT NULL REFERENCES customers(customer_id),
  route_id text NOT NULL REFERENCES routes(route_id),
  load_date date NOT NULL DEFAULT CURRENT_DATE,
  load_type text NOT NULL DEFAULT 'Dry Van',
  weight_lbs integer,
  pieces integer,
  revenue numeric(12,2) NOT NULL DEFAULT 0,
  fuel_surcharge numeric(12,2) NOT NULL DEFAULT 0,
  accessorial_charges numeric(12,2) NOT NULL DEFAULT 0,
  load_status text NOT NULL DEFAULT 'DRAFT'
    CHECK (load_status IN ('DRAFT','BOOKED','PLANNED','DISPATCHED','IN_TRANSIT','DELIVERED','COMPLETED','CANCELLED','EXCEPTION')),
  booking_type text NOT NULL DEFAULT 'Spot' CHECK (booking_type IN ('Spot','Contract','Dedicated')),
  po_number text,
  notes text,
  exception_reason text,
  target_delivery_date date,
  created_by uuid REFERENCES users(id),
  assigned_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trips (
  trip_id text PRIMARY KEY DEFAULT ('TRIP' || lpad(nextval('trip_id_seq')::text, 8, '0')),
  load_id text NOT NULL UNIQUE REFERENCES loads(load_id) ON DELETE CASCADE,
  driver_id text REFERENCES drivers(driver_id),
  truck_id text REFERENCES trucks(truck_id),
  trailer_id text REFERENCES trailers(trailer_id),
  dispatch_date date NOT NULL DEFAULT CURRENT_DATE,
  actual_distance_miles integer,
  actual_duration_hours numeric(8,2),
  fuel_gallons_used numeric(10,2),
  average_mpg numeric(6,2),
  idle_time_hours numeric(8,2),
  odometer_start integer,
  odometer_end integer,
  trip_status text NOT NULL DEFAULT 'PLANNED'
    CHECK (trip_status IN ('PLANNED','DISPATCHED','IN_TRANSIT','DELIVERED','COMPLETED','CANCELLED')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE delivery_events (
  event_id text PRIMARY KEY DEFAULT ('EVT' || lpad(nextval('event_id_seq')::text, 8, '0')),
  load_id text NOT NULL REFERENCES loads(load_id) ON DELETE CASCADE,
  trip_id text REFERENCES trips(trip_id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('Pickup','Delivery')),
  facility_id text REFERENCES facilities(facility_id),
  scheduled_datetime timestamptz,
  actual_datetime timestamptz,
  detention_minutes integer NOT NULL DEFAULT 0,
  on_time_flag boolean,
  location_city text,
  location_state text,
  notes text,
  recorded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fuel_purchases (
  fuel_purchase_id text PRIMARY KEY DEFAULT ('FUEL' || lpad(nextval('fuel_id_seq')::text, 8, '0')),
  trip_id text REFERENCES trips(trip_id) ON DELETE SET NULL,
  truck_id text REFERENCES trucks(truck_id),
  driver_id text REFERENCES drivers(driver_id),
  purchase_date timestamptz NOT NULL DEFAULT now(),
  location_city text,
  location_state text,
  gallons numeric(10,2) NOT NULL,
  price_per_gallon numeric(8,3) NOT NULL,
  total_cost numeric(12,2) NOT NULL,
  fuel_card_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_records (
  maintenance_id text PRIMARY KEY DEFAULT ('MAINT' || lpad(nextval('maintenance_id_seq')::text, 8, '0')),
  truck_id text NOT NULL REFERENCES trucks(truck_id),
  maintenance_date date NOT NULL DEFAULT CURRENT_DATE,
  maintenance_type text NOT NULL,
  odometer_reading integer,
  labor_hours numeric(8,2) NOT NULL DEFAULT 0,
  labor_cost numeric(12,2) NOT NULL DEFAULT 0,
  parts_cost numeric(12,2) NOT NULL DEFAULT 0,
  total_cost numeric(12,2) NOT NULL DEFAULT 0,
  facility_location text,
  downtime_hours numeric(8,2) NOT NULL DEFAULT 0,
  service_description text,
  status text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE safety_incidents (
  incident_id text PRIMARY KEY DEFAULT ('INC' || lpad(nextval('incident_id_seq')::text, 8, '0')),
  trip_id text REFERENCES trips(trip_id) ON DELETE SET NULL,
  truck_id text REFERENCES trucks(truck_id),
  driver_id text REFERENCES drivers(driver_id),
  incident_date timestamptz NOT NULL DEFAULT now(),
  incident_type text NOT NULL,
  location_city text,
  location_state text,
  at_fault_flag boolean NOT NULL DEFAULT false,
  injury_flag boolean NOT NULL DEFAULT false,
  vehicle_damage_cost numeric(12,2) NOT NULL DEFAULT 0,
  cargo_damage_cost numeric(12,2) NOT NULL DEFAULT 0,
  claim_amount numeric(12,2) NOT NULL DEFAULT 0,
  preventable_flag boolean NOT NULL DEFAULT false,
  description text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','UNDER_REVIEW','CLOSED')),
  recorded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE driver_monthly_metrics (
  driver_id text NOT NULL REFERENCES drivers(driver_id) ON DELETE CASCADE,
  month date NOT NULL,
  trips_completed integer NOT NULL DEFAULT 0,
  total_miles integer NOT NULL DEFAULT 0,
  total_revenue numeric(14,2) NOT NULL DEFAULT 0,
  average_mpg numeric(6,2),
  total_fuel_gallons numeric(12,2),
  on_time_delivery_rate numeric(6,4),
  average_idle_hours numeric(8,2),
  PRIMARY KEY (driver_id, month)
);

CREATE TABLE truck_utilization_metrics (
  truck_id text NOT NULL REFERENCES trucks(truck_id) ON DELETE CASCADE,
  month date NOT NULL,
  trips_completed integer NOT NULL DEFAULT 0,
  total_miles integer NOT NULL DEFAULT 0,
  total_revenue numeric(14,2) NOT NULL DEFAULT 0,
  average_mpg numeric(6,2),
  maintenance_events integer NOT NULL DEFAULT 0,
  maintenance_cost numeric(14,2) NOT NULL DEFAULT 0,
  downtime_hours numeric(10,2) NOT NULL DEFAULT 0,
  utilization_rate numeric(6,4),
  PRIMARY KEY (truck_id, month)
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  actor_name text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX loads_status_idx ON loads (load_status);
CREATE INDEX loads_date_idx ON loads (load_date DESC);
CREATE INDEX loads_customer_idx ON loads (customer_id);
CREATE INDEX loads_route_idx ON loads (route_id);
CREATE INDEX loads_created_idx ON loads (created_at DESC);
CREATE INDEX trips_driver_idx ON trips (driver_id, dispatch_date DESC);
CREATE INDEX trips_truck_idx ON trips (truck_id, dispatch_date DESC);
CREATE INDEX trips_date_idx ON trips (dispatch_date DESC);
CREATE INDEX delivery_events_load_idx ON delivery_events (load_id);
CREATE INDEX delivery_events_trip_idx ON delivery_events (trip_id);
CREATE INDEX delivery_events_actual_idx ON delivery_events (actual_datetime DESC);
CREATE INDEX fuel_trip_idx ON fuel_purchases (trip_id);
CREATE INDEX fuel_truck_idx ON fuel_purchases (truck_id, purchase_date DESC);
CREATE INDEX fuel_date_idx ON fuel_purchases (purchase_date DESC);
CREATE INDEX maintenance_truck_idx ON maintenance_records (truck_id, maintenance_date DESC);
CREATE INDEX maintenance_status_idx ON maintenance_records (status);
CREATE INDEX incidents_driver_idx ON safety_incidents (driver_id, incident_date DESC);
CREATE INDEX incidents_date_idx ON safety_incidents (incident_date DESC);
CREATE INDEX audit_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_created_idx ON audit_logs (created_at DESC);
