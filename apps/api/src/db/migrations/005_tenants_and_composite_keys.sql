-- Multi-tenancy, phase 1.
--
-- This migration intentionally keeps the existing human-readable business keys
-- as the API/domain identifiers. Tenant isolation is achieved by making every
-- tenant-owned primary key composite: (tenant_id, business_key). This avoids a
-- disruptive surrogate-key rewrite while still allowing the same CSV/business
-- key to exist independently in every tenant.
--
-- The migration is re-runnable: every object is created conditionally and the
-- backfill only touches rows whose tenant_id is still NULL.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Roles used by the application. The owner (the role running migrations) owns
-- the tables. The app role is deliberately not a superuser and cannot bypass
-- RLS. The auth lookup role is NOLOGIN + BYPASSRLS and owns only the
-- auth_lookup_user() function (created in 006).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'doxin_app') THEN
    EXECUTE 'CREATE ROLE doxin_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD ''doxin_app_dev_password''';
  ELSE
    EXECUTE 'ALTER ROLE doxin_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'doxin_auth_lookup') THEN
    EXECUTE 'CREATE ROLE doxin_auth_lookup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS';
  ELSE
    EXECUTE 'ALTER ROLE doxin_auth_lookup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Tenant registry and atomic per-tenant display-number counters.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  shard_key text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tenants (id, name, slug, status, config)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Doxin',
  'default',
  'ACTIVE',
  '{"rateLimit":{"max":300,"timeWindowSeconds":60}}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenant_counters (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  value bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, name)
);

-- Re-runs must be able to replace the composite primary/unique keys below.
-- Drop the phase-2 composite foreign keys first; 006 recreates and validates
-- them after the keys exist again. On a first run these are all no-ops.
ALTER TABLE loads DROP CONSTRAINT IF EXISTS loads_tenant_customer_fkey;
ALTER TABLE loads DROP CONSTRAINT IF EXISTS loads_tenant_route_fkey;
ALTER TABLE loads DROP CONSTRAINT IF EXISTS loads_tenant_created_by_fkey;
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_tenant_load_fkey;
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_tenant_driver_fkey;
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_tenant_truck_fkey;
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_tenant_trailer_fkey;
ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_tenant_load_fkey;
ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_tenant_trip_fkey;
ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_tenant_facility_fkey;
ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_tenant_recorded_by_fkey;
ALTER TABLE fuel_purchases DROP CONSTRAINT IF EXISTS fuel_purchases_tenant_trip_fkey;
ALTER TABLE fuel_purchases DROP CONSTRAINT IF EXISTS fuel_purchases_tenant_truck_fkey;
ALTER TABLE fuel_purchases DROP CONSTRAINT IF EXISTS fuel_purchases_tenant_driver_fkey;
ALTER TABLE maintenance_records DROP CONSTRAINT IF EXISTS maintenance_records_tenant_truck_fkey;
ALTER TABLE maintenance_records DROP CONSTRAINT IF EXISTS maintenance_records_tenant_created_by_fkey;
ALTER TABLE safety_incidents DROP CONSTRAINT IF EXISTS safety_incidents_tenant_trip_fkey;
ALTER TABLE safety_incidents DROP CONSTRAINT IF EXISTS safety_incidents_tenant_truck_fkey;
ALTER TABLE safety_incidents DROP CONSTRAINT IF EXISTS safety_incidents_tenant_driver_fkey;
ALTER TABLE safety_incidents DROP CONSTRAINT IF EXISTS safety_incidents_tenant_recorded_by_fkey;
ALTER TABLE driver_monthly_metrics DROP CONSTRAINT IF EXISTS driver_monthly_metrics_tenant_driver_fkey;
ALTER TABLE truck_utilization_metrics DROP CONSTRAINT IF EXISTS truck_utilization_metrics_tenant_truck_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_tenant_actor_fkey;

-- Atomic display-number allocator. It is called from column defaults and from
-- the generic CRUD helper, always inside the request/import transaction.
CREATE OR REPLACE FUNCTION next_tenant_id(p_prefix text, p_counter text, p_width integer)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := nullif(current_setting('app.current_tenant', true), '')::uuid;
  v_value bigint;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'app.current_tenant is not set';
  END IF;

  INSERT INTO public.tenant_counters (tenant_id, name, value)
  VALUES (v_tenant, p_counter, 1)
  ON CONFLICT (tenant_id, name) DO UPDATE
    SET value = public.tenant_counters.value + 1
  RETURNING value INTO v_value;

  RETURN p_prefix || lpad(v_value::text, p_width, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- Add nullable tenant_id columns, backfill the default tenant in batches,
-- then make the tenant-owned tables NOT NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE trailers ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE delivery_events ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE fuel_purchases ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE driver_monthly_metrics ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE truck_utilization_metrics ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id uuid;

DO $$
DECLARE
  v_tenant uuid;
  v_table text;
  v_count integer;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE slug = 'default';
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'default tenant is missing';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'users', 'customers', 'facilities', 'routes', 'drivers', 'trucks', 'trailers',
    'loads', 'trips', 'delivery_events', 'fuel_purchases', 'maintenance_records',
    'safety_incidents', 'driver_monthly_metrics', 'truck_utilization_metrics', 'audit_logs'
  ] LOOP
    LOOP
      IF v_table = 'users' THEN
        -- Platform administrators intentionally have no tenant. Never
        -- backfill them into the default tenant on a re-run.
        EXECUTE format(
          'UPDATE %I SET tenant_id = $1 WHERE ctid IN (SELECT ctid FROM %I WHERE tenant_id IS NULL AND role <> ''PLATFORM_ADMIN'' LIMIT 10000)',
          v_table, v_table
        ) USING v_tenant;
      ELSIF v_table = 'audit_logs' THEN
        -- Platform audit rows also stay tenant-less. They are identified by
        -- their platform-administrator actor.
        EXECUTE format(
          'UPDATE %I SET tenant_id = $1 WHERE ctid IN (SELECT a.ctid FROM %I a WHERE a.tenant_id IS NULL AND (a.actor_id IS NULL OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.actor_id AND u.role = ''PLATFORM_ADMIN'')) LIMIT 10000)',
          v_table, v_table
        ) USING v_tenant;
      ELSE
        EXECUTE format(
          'UPDATE %I SET tenant_id = $1 WHERE ctid IN (SELECT ctid FROM %I WHERE tenant_id IS NULL LIMIT 10000)',
          v_table, v_table
        ) USING v_tenant;
      END IF;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      EXIT WHEN v_count = 0;
    END LOOP;
  END LOOP;
END $$;

-- Every tenant-owned insert gets the transaction-local tenant automatically.
-- This is a safety net; application code still passes tenant_id explicitly for
-- imports and cross-tenant administrative operations.
ALTER TABLE customers ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);
ALTER TABLE facilities ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);
ALTER TABLE routes ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);
ALTER TABLE drivers ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);
ALTER TABLE trucks ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);
ALTER TABLE trailers ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);
ALTER TABLE loads ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);
ALTER TABLE trips ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);
ALTER TABLE delivery_events ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);
ALTER TABLE fuel_purchases ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);
ALTER TABLE maintenance_records ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);
ALTER TABLE safety_incidents ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);
ALTER TABLE driver_monthly_metrics ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);
ALTER TABLE truck_utilization_metrics ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);
ALTER TABLE users ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);
ALTER TABLE audit_logs ALTER COLUMN tenant_id SET DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE customers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE facilities ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE routes ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE drivers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE trucks ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE trailers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE loads ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE trips ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE delivery_events ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE fuel_purchases ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE maintenance_records ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE safety_incidents ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE driver_monthly_metrics ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE truck_utilization_metrics ALTER COLUMN tenant_id SET NOT NULL;

-- users and audit_logs intentionally remain nullable: PLATFORM_ADMIN and
-- platform audit actions have no tenant.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'PLATFORM_ADMIN'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tenant_role_check;
ALTER TABLE users ADD CONSTRAINT users_tenant_role_check CHECK (
  (role = 'PLATFORM_ADMIN' AND tenant_id IS NULL)
  OR (role <> 'PLATFORM_ADMIN' AND tenant_id IS NOT NULL)
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tenant_id_fkey;
ALTER TABLE users ADD CONSTRAINT users_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) NOT VALID;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_tenant_id_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_tenant_id_fkey;
ALTER TABLE audit_logs VALIDATE CONSTRAINT audit_logs_tenant_id_fkey;

-- ---------------------------------------------------------------------------
-- Replace global primary/unique keys with composite (tenant_id, key) keys.
-- Old foreign keys are dropped first; composite FKs are added in 006.
-- ---------------------------------------------------------------------------
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_facility_id_fkey;
ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_load_id_fkey;
ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_recorded_by_fkey;
ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_trip_id_fkey;
ALTER TABLE driver_monthly_metrics DROP CONSTRAINT IF EXISTS driver_monthly_metrics_driver_id_fkey;
ALTER TABLE fuel_purchases DROP CONSTRAINT IF EXISTS fuel_purchases_driver_id_fkey;
ALTER TABLE fuel_purchases DROP CONSTRAINT IF EXISTS fuel_purchases_trip_id_fkey;
ALTER TABLE fuel_purchases DROP CONSTRAINT IF EXISTS fuel_purchases_truck_id_fkey;
ALTER TABLE loads DROP CONSTRAINT IF EXISTS loads_created_by_fkey;
ALTER TABLE loads DROP CONSTRAINT IF EXISTS loads_customer_id_fkey;
ALTER TABLE loads DROP CONSTRAINT IF EXISTS loads_route_id_fkey;
ALTER TABLE maintenance_records DROP CONSTRAINT IF EXISTS maintenance_records_created_by_fkey;
ALTER TABLE maintenance_records DROP CONSTRAINT IF EXISTS maintenance_records_truck_id_fkey;
ALTER TABLE safety_incidents DROP CONSTRAINT IF EXISTS safety_incidents_driver_id_fkey;
ALTER TABLE safety_incidents DROP CONSTRAINT IF EXISTS safety_incidents_recorded_by_fkey;
ALTER TABLE safety_incidents DROP CONSTRAINT IF EXISTS safety_incidents_trip_id_fkey;
ALTER TABLE safety_incidents DROP CONSTRAINT IF EXISTS safety_incidents_truck_id_fkey;
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_driver_id_fkey;
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_load_id_fkey;
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_trailer_id_fkey;
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_truck_id_fkey;
ALTER TABLE truck_utilization_metrics DROP CONSTRAINT IF EXISTS truck_utilization_metrics_truck_id_fkey;

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_pkey;
ALTER TABLE facilities DROP CONSTRAINT IF EXISTS facilities_pkey;
ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_pkey;
ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_pkey;
ALTER TABLE trucks DROP CONSTRAINT IF EXISTS trucks_pkey;
ALTER TABLE trailers DROP CONSTRAINT IF EXISTS trailers_pkey;
ALTER TABLE loads DROP CONSTRAINT IF EXISTS loads_pkey;
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_pkey;
ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_pkey;
ALTER TABLE fuel_purchases DROP CONSTRAINT IF EXISTS fuel_purchases_pkey;
ALTER TABLE maintenance_records DROP CONSTRAINT IF EXISTS maintenance_records_pkey;
ALTER TABLE safety_incidents DROP CONSTRAINT IF EXISTS safety_incidents_pkey;
ALTER TABLE driver_monthly_metrics DROP CONSTRAINT IF EXISTS driver_monthly_metrics_pkey;
ALTER TABLE truck_utilization_metrics DROP CONSTRAINT IF EXISTS truck_utilization_metrics_pkey;
ALTER TABLE trucks DROP CONSTRAINT IF EXISTS trucks_unit_number_key;
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_load_id_key;
ALTER TABLE trailers DROP CONSTRAINT IF EXISTS trailers_trailer_number_key;
DROP INDEX IF EXISTS trailers_number_idx;

ALTER TABLE customers ADD CONSTRAINT customers_pkey PRIMARY KEY (tenant_id, customer_id);
ALTER TABLE facilities ADD CONSTRAINT facilities_pkey PRIMARY KEY (tenant_id, facility_id);
ALTER TABLE routes ADD CONSTRAINT routes_pkey PRIMARY KEY (tenant_id, route_id);
ALTER TABLE drivers ADD CONSTRAINT drivers_pkey PRIMARY KEY (tenant_id, driver_id);
ALTER TABLE trucks ADD CONSTRAINT trucks_pkey PRIMARY KEY (tenant_id, truck_id);
ALTER TABLE trailers ADD CONSTRAINT trailers_pkey PRIMARY KEY (tenant_id, trailer_id);
ALTER TABLE loads ADD CONSTRAINT loads_pkey PRIMARY KEY (tenant_id, load_id);
ALTER TABLE trips ADD CONSTRAINT trips_pkey PRIMARY KEY (tenant_id, trip_id);
ALTER TABLE delivery_events ADD CONSTRAINT delivery_events_pkey PRIMARY KEY (tenant_id, event_id);
ALTER TABLE fuel_purchases ADD CONSTRAINT fuel_purchases_pkey PRIMARY KEY (tenant_id, fuel_purchase_id);
ALTER TABLE maintenance_records ADD CONSTRAINT maintenance_records_pkey PRIMARY KEY (tenant_id, maintenance_id);
ALTER TABLE safety_incidents ADD CONSTRAINT safety_incidents_pkey PRIMARY KEY (tenant_id, incident_id);
ALTER TABLE driver_monthly_metrics ADD CONSTRAINT driver_monthly_metrics_pkey PRIMARY KEY (tenant_id, driver_id, month);
ALTER TABLE truck_utilization_metrics ADD CONSTRAINT truck_utilization_metrics_pkey PRIMARY KEY (tenant_id, truck_id, month);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tenant_id_key;
ALTER TABLE users ADD CONSTRAINT users_tenant_id_key UNIQUE (tenant_id, id);
ALTER TABLE trucks DROP CONSTRAINT IF EXISTS trucks_tenant_unit_number_key;
ALTER TABLE trucks ADD CONSTRAINT trucks_tenant_unit_number_key UNIQUE (tenant_id, unit_number);
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_tenant_load_id_key;
ALTER TABLE trips ADD CONSTRAINT trips_tenant_load_id_key UNIQUE (tenant_id, load_id);

-- ---------------------------------------------------------------------------
-- Deterministic cleanup of duplicate trailer numbers. The original data has
-- four duplicate values in the default tenant: 9796, 6620, 2791, 7703.
-- Keep the row with the lowest trailer_id unchanged and rename subsequent
-- rows to <number>-DUP<n>. The old/new values are recorded in a durable log.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS migration_data_cleanup (
  id bigserial PRIMARY KEY,
  migration text NOT NULL,
  table_name text NOT NULL,
  tenant_id uuid,
  entity_id text,
  old_value text,
  new_value text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (migration, table_name, tenant_id, entity_id, old_value)
);

WITH ranked AS (
  SELECT tenant_id, trailer_id, trailer_number,
         row_number() OVER (PARTITION BY tenant_id, trailer_number ORDER BY trailer_id) AS rn
  FROM trailers
), duplicates AS (
  SELECT * FROM ranked WHERE rn > 1
)
INSERT INTO migration_data_cleanup
  (migration, table_name, tenant_id, entity_id, old_value, new_value, reason)
SELECT '005', 'trailers', tenant_id, trailer_id, trailer_number,
       trailer_number || '-DUP' || rn,
       'duplicate trailer_number; kept lowest trailer_id and renamed deterministically'
FROM duplicates
ON CONFLICT DO NOTHING;

UPDATE trailers t
SET trailer_number = c.new_value
FROM migration_data_cleanup c
WHERE c.migration = '005'
  AND c.table_name = 'trailers'
  AND c.tenant_id = t.tenant_id
  AND c.entity_id = t.trailer_id
  AND c.old_value = t.trailer_number;

ALTER TABLE trailers DROP CONSTRAINT IF EXISTS trailers_tenant_trailer_number_key;
ALTER TABLE trailers ADD CONSTRAINT trailers_tenant_trailer_number_key UNIQUE (tenant_id, trailer_number);

-- ---------------------------------------------------------------------------
-- Initialize tenant_counters from the existing default-tenant data so new
-- display numbers do not collide with imported IDs.
-- ---------------------------------------------------------------------------
INSERT INTO tenant_counters (tenant_id, name, value)
SELECT t.id, 'customer_id_seq',
       COALESCE((SELECT MAX(CASE WHEN c.customer_id ~ '^CUST[0-9]+$' THEN substring(c.customer_id from 5)::bigint ELSE 0 END) FROM customers c), 0)
FROM tenants t WHERE t.slug = 'default'
ON CONFLICT (tenant_id, name) DO UPDATE SET value = GREATEST(tenant_counters.value, EXCLUDED.value);

INSERT INTO tenant_counters (tenant_id, name, value)
SELECT t.id, 'facility_id_seq',
       COALESCE((SELECT MAX(CASE WHEN f.facility_id ~ '^FAC[0-9]+$' THEN substring(f.facility_id from 4)::bigint ELSE 0 END) FROM facilities f), 0)
FROM tenants t WHERE t.slug = 'default'
ON CONFLICT (tenant_id, name) DO UPDATE SET value = GREATEST(tenant_counters.value, EXCLUDED.value);

INSERT INTO tenant_counters (tenant_id, name, value)
SELECT t.id, 'route_id_seq',
       COALESCE((SELECT MAX(CASE WHEN r.route_id ~ '^RTE[0-9]+$' THEN substring(r.route_id from 4)::bigint ELSE 0 END) FROM routes r), 0)
FROM tenants t WHERE t.slug = 'default'
ON CONFLICT (tenant_id, name) DO UPDATE SET value = GREATEST(tenant_counters.value, EXCLUDED.value);

INSERT INTO tenant_counters (tenant_id, name, value)
SELECT t.id, 'driver_id_seq',
       COALESCE((SELECT MAX(CASE WHEN d.driver_id ~ '^DRV[0-9]+$' THEN substring(d.driver_id from 4)::bigint ELSE 0 END) FROM drivers d), 0)
FROM tenants t WHERE t.slug = 'default'
ON CONFLICT (tenant_id, name) DO UPDATE SET value = GREATEST(tenant_counters.value, EXCLUDED.value);

INSERT INTO tenant_counters (tenant_id, name, value)
SELECT t.id, 'truck_id_seq',
       COALESCE((SELECT MAX(CASE WHEN tr.truck_id ~ '^TRK[0-9]+$' THEN substring(tr.truck_id from 4)::bigint ELSE 0 END) FROM trucks tr), 0)
FROM tenants t WHERE t.slug = 'default'
ON CONFLICT (tenant_id, name) DO UPDATE SET value = GREATEST(tenant_counters.value, EXCLUDED.value);

INSERT INTO tenant_counters (tenant_id, name, value)
SELECT t.id, 'trailer_id_seq',
       COALESCE((SELECT MAX(CASE WHEN tr.trailer_id ~ '^TRL[0-9]+$' THEN substring(tr.trailer_id from 4)::bigint ELSE 0 END) FROM trailers tr), 0)
FROM tenants t WHERE t.slug = 'default'
ON CONFLICT (tenant_id, name) DO UPDATE SET value = GREATEST(tenant_counters.value, EXCLUDED.value);

INSERT INTO tenant_counters (tenant_id, name, value)
SELECT t.id, 'load_id_seq',
       COALESCE((SELECT MAX(CASE WHEN l.load_id ~ '^LOAD[0-9]+$' THEN substring(l.load_id from 5)::bigint ELSE 0 END) FROM loads l), 0)
FROM tenants t WHERE t.slug = 'default'
ON CONFLICT (tenant_id, name) DO UPDATE SET value = GREATEST(tenant_counters.value, EXCLUDED.value);

INSERT INTO tenant_counters (tenant_id, name, value)
SELECT t.id, 'trip_id_seq',
       COALESCE((SELECT MAX(CASE WHEN tr.trip_id ~ '^TRIP[0-9]+$' THEN substring(tr.trip_id from 5)::bigint ELSE 0 END) FROM trips tr), 0)
FROM tenants t WHERE t.slug = 'default'
ON CONFLICT (tenant_id, name) DO UPDATE SET value = GREATEST(tenant_counters.value, EXCLUDED.value);

INSERT INTO tenant_counters (tenant_id, name, value)
SELECT t.id, 'event_id_seq',
       COALESCE((SELECT MAX(CASE WHEN e.event_id ~ '^EVT[0-9]+$' THEN substring(e.event_id from 4)::bigint ELSE 0 END) FROM delivery_events e), 0)
FROM tenants t WHERE t.slug = 'default'
ON CONFLICT (tenant_id, name) DO UPDATE SET value = GREATEST(tenant_counters.value, EXCLUDED.value);

INSERT INTO tenant_counters (tenant_id, name, value)
SELECT t.id, 'fuel_id_seq',
       COALESCE((SELECT MAX(CASE WHEN f.fuel_purchase_id ~ '^FUEL[0-9]+$' THEN substring(f.fuel_purchase_id from 5)::bigint ELSE 0 END) FROM fuel_purchases f), 0)
FROM tenants t WHERE t.slug = 'default'
ON CONFLICT (tenant_id, name) DO UPDATE SET value = GREATEST(tenant_counters.value, EXCLUDED.value);

INSERT INTO tenant_counters (tenant_id, name, value)
SELECT t.id, 'maintenance_id_seq',
       COALESCE((SELECT MAX(CASE WHEN m.maintenance_id ~ '^MAINT[0-9]+$' THEN substring(m.maintenance_id from 6)::bigint ELSE 0 END) FROM maintenance_records m), 0)
FROM tenants t WHERE t.slug = 'default'
ON CONFLICT (tenant_id, name) DO UPDATE SET value = GREATEST(tenant_counters.value, EXCLUDED.value);

INSERT INTO tenant_counters (tenant_id, name, value)
SELECT t.id, 'incident_id_seq',
       COALESCE((SELECT MAX(CASE WHEN i.incident_id ~ '^INC[0-9]+$' THEN substring(i.incident_id from 4)::bigint ELSE 0 END) FROM safety_incidents i), 0)
FROM tenants t WHERE t.slug = 'default'
ON CONFLICT (tenant_id, name) DO UPDATE SET value = GREATEST(tenant_counters.value, EXCLUDED.value);

-- Replace every global sequence default with the tenant counter allocator.
ALTER TABLE customers ALTER COLUMN customer_id SET DEFAULT next_tenant_id('CUST', 'customer_id_seq', 5);
ALTER TABLE facilities ALTER COLUMN facility_id SET DEFAULT next_tenant_id('FAC', 'facility_id_seq', 5);
ALTER TABLE routes ALTER COLUMN route_id SET DEFAULT next_tenant_id('RTE', 'route_id_seq', 5);
ALTER TABLE drivers ALTER COLUMN driver_id SET DEFAULT next_tenant_id('DRV', 'driver_id_seq', 5);
ALTER TABLE trucks ALTER COLUMN truck_id SET DEFAULT next_tenant_id('TRK', 'truck_id_seq', 5);
ALTER TABLE trailers ALTER COLUMN trailer_id SET DEFAULT next_tenant_id('TRL', 'trailer_id_seq', 5);
ALTER TABLE loads ALTER COLUMN load_id SET DEFAULT next_tenant_id('LOAD', 'load_id_seq', 8);
ALTER TABLE trips ALTER COLUMN trip_id SET DEFAULT next_tenant_id('TRIP', 'trip_id_seq', 8);
ALTER TABLE delivery_events ALTER COLUMN event_id SET DEFAULT next_tenant_id('EVT', 'event_id_seq', 8);
ALTER TABLE fuel_purchases ALTER COLUMN fuel_purchase_id SET DEFAULT next_tenant_id('FUEL', 'fuel_id_seq', 8);
ALTER TABLE maintenance_records ALTER COLUMN maintenance_id SET DEFAULT next_tenant_id('MAINT', 'maintenance_id_seq', 8);
ALTER TABLE safety_incidents ALTER COLUMN incident_id SET DEFAULT next_tenant_id('INC', 'incident_id_seq', 8);

-- ---------------------------------------------------------------------------
-- Tenant-leading indexes for the high-volume tables and every composite FK
-- child column that is not already covered by a unique key.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS loads_status_idx;
DROP INDEX IF EXISTS loads_date_idx;
DROP INDEX IF EXISTS loads_customer_idx;
DROP INDEX IF EXISTS loads_route_idx;
DROP INDEX IF EXISTS loads_created_idx;
DROP INDEX IF EXISTS trips_driver_idx;
DROP INDEX IF EXISTS trips_truck_idx;
DROP INDEX IF EXISTS trips_date_idx;
DROP INDEX IF EXISTS delivery_events_load_idx;
DROP INDEX IF EXISTS delivery_events_trip_idx;
DROP INDEX IF EXISTS delivery_events_actual_idx;
DROP INDEX IF EXISTS fuel_trip_idx;
DROP INDEX IF EXISTS fuel_truck_idx;
DROP INDEX IF EXISTS fuel_date_idx;
DROP INDEX IF EXISTS maintenance_truck_idx;
DROP INDEX IF EXISTS maintenance_status_idx;
DROP INDEX IF EXISTS incidents_driver_idx;
DROP INDEX IF EXISTS incidents_date_idx;
DROP INDEX IF EXISTS audit_entity_idx;
DROP INDEX IF EXISTS audit_created_idx;

CREATE INDEX IF NOT EXISTS loads_status_idx ON loads (tenant_id, load_status);
CREATE INDEX IF NOT EXISTS loads_date_idx ON loads (tenant_id, load_date DESC);
CREATE INDEX IF NOT EXISTS loads_customer_idx ON loads (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS loads_route_idx ON loads (tenant_id, route_id);
CREATE INDEX IF NOT EXISTS loads_created_idx ON loads (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS loads_created_by_idx ON loads (tenant_id, created_by);
CREATE INDEX IF NOT EXISTS trips_driver_idx ON trips (tenant_id, driver_id, dispatch_date DESC);
CREATE INDEX IF NOT EXISTS trips_truck_idx ON trips (tenant_id, truck_id, dispatch_date DESC);
CREATE INDEX IF NOT EXISTS trips_date_idx ON trips (tenant_id, dispatch_date DESC);
CREATE INDEX IF NOT EXISTS delivery_events_load_idx ON delivery_events (tenant_id, load_id);
CREATE INDEX IF NOT EXISTS delivery_events_trip_idx ON delivery_events (tenant_id, trip_id);
CREATE INDEX IF NOT EXISTS delivery_events_actual_idx ON delivery_events (tenant_id, actual_datetime DESC);
CREATE INDEX IF NOT EXISTS delivery_events_facility_idx ON delivery_events (tenant_id, facility_id);
CREATE INDEX IF NOT EXISTS delivery_events_recorded_by_idx ON delivery_events (tenant_id, recorded_by);
CREATE INDEX IF NOT EXISTS fuel_trip_idx ON fuel_purchases (tenant_id, trip_id);
CREATE INDEX IF NOT EXISTS fuel_truck_idx ON fuel_purchases (tenant_id, truck_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS fuel_date_idx ON fuel_purchases (tenant_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS fuel_driver_idx ON fuel_purchases (tenant_id, driver_id);
CREATE INDEX IF NOT EXISTS maintenance_truck_idx ON maintenance_records (tenant_id, truck_id, maintenance_date DESC);
CREATE INDEX IF NOT EXISTS maintenance_status_idx ON maintenance_records (tenant_id, status);
CREATE INDEX IF NOT EXISTS maintenance_created_by_idx ON maintenance_records (tenant_id, created_by);
CREATE INDEX IF NOT EXISTS incidents_driver_idx ON safety_incidents (tenant_id, driver_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS incidents_truck_idx ON safety_incidents (tenant_id, truck_id);
CREATE INDEX IF NOT EXISTS incidents_trip_idx ON safety_incidents (tenant_id, trip_id);
CREATE INDEX IF NOT EXISTS incidents_date_idx ON safety_incidents (tenant_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS incidents_recorded_by_idx ON safety_incidents (tenant_id, recorded_by);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_logs (tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users (tenant_id);
