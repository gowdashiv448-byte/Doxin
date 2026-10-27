-- Multi-tenancy, phase 2: composite foreign keys, RLS, and the narrow
-- SECURITY DEFINER login lookup. All table owners remain the migration/owner
-- role; the runtime role is doxin_app (NOSUPERUSER, NOBYPASSRLS).

-- ---------------------------------------------------------------------------
-- Composite foreign keys. Parent keys are already UNIQUE (tenant_id, key) or
-- PRIMARY KEY (tenant_id, key) from migration 005.
-- ---------------------------------------------------------------------------
ALTER TABLE loads DROP CONSTRAINT IF EXISTS loads_tenant_customer_fkey;
ALTER TABLE loads ADD CONSTRAINT loads_tenant_customer_fkey
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, customer_id) NOT VALID;
ALTER TABLE loads DROP CONSTRAINT IF EXISTS loads_tenant_route_fkey;
ALTER TABLE loads ADD CONSTRAINT loads_tenant_route_fkey
  FOREIGN KEY (tenant_id, route_id) REFERENCES routes (tenant_id, route_id) NOT VALID;
ALTER TABLE loads DROP CONSTRAINT IF EXISTS loads_tenant_created_by_fkey;
ALTER TABLE loads ADD CONSTRAINT loads_tenant_created_by_fkey
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id) NOT VALID;

ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_tenant_load_fkey;
ALTER TABLE trips ADD CONSTRAINT trips_tenant_load_fkey
  FOREIGN KEY (tenant_id, load_id) REFERENCES loads (tenant_id, load_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_tenant_driver_fkey;
ALTER TABLE trips ADD CONSTRAINT trips_tenant_driver_fkey
  FOREIGN KEY (tenant_id, driver_id) REFERENCES drivers (tenant_id, driver_id) NOT VALID;
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_tenant_truck_fkey;
ALTER TABLE trips ADD CONSTRAINT trips_tenant_truck_fkey
  FOREIGN KEY (tenant_id, truck_id) REFERENCES trucks (tenant_id, truck_id) NOT VALID;
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_tenant_trailer_fkey;
ALTER TABLE trips ADD CONSTRAINT trips_tenant_trailer_fkey
  FOREIGN KEY (tenant_id, trailer_id) REFERENCES trailers (tenant_id, trailer_id) NOT VALID;

ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_tenant_load_fkey;
ALTER TABLE delivery_events ADD CONSTRAINT delivery_events_tenant_load_fkey
  FOREIGN KEY (tenant_id, load_id) REFERENCES loads (tenant_id, load_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_tenant_trip_fkey;
ALTER TABLE delivery_events ADD CONSTRAINT delivery_events_tenant_trip_fkey
  FOREIGN KEY (tenant_id, trip_id) REFERENCES trips (tenant_id, trip_id)
  ON DELETE SET NULL (trip_id) NOT VALID;
ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_tenant_facility_fkey;
ALTER TABLE delivery_events ADD CONSTRAINT delivery_events_tenant_facility_fkey
  FOREIGN KEY (tenant_id, facility_id) REFERENCES facilities (tenant_id, facility_id) NOT VALID;
ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_tenant_recorded_by_fkey;
ALTER TABLE delivery_events ADD CONSTRAINT delivery_events_tenant_recorded_by_fkey
  FOREIGN KEY (tenant_id, recorded_by) REFERENCES users (tenant_id, id) NOT VALID;

ALTER TABLE fuel_purchases DROP CONSTRAINT IF EXISTS fuel_purchases_tenant_trip_fkey;
ALTER TABLE fuel_purchases ADD CONSTRAINT fuel_purchases_tenant_trip_fkey
  FOREIGN KEY (tenant_id, trip_id) REFERENCES trips (tenant_id, trip_id)
  ON DELETE SET NULL (trip_id) NOT VALID;
ALTER TABLE fuel_purchases DROP CONSTRAINT IF EXISTS fuel_purchases_tenant_truck_fkey;
ALTER TABLE fuel_purchases ADD CONSTRAINT fuel_purchases_tenant_truck_fkey
  FOREIGN KEY (tenant_id, truck_id) REFERENCES trucks (tenant_id, truck_id) NOT VALID;
ALTER TABLE fuel_purchases DROP CONSTRAINT IF EXISTS fuel_purchases_tenant_driver_fkey;
ALTER TABLE fuel_purchases ADD CONSTRAINT fuel_purchases_tenant_driver_fkey
  FOREIGN KEY (tenant_id, driver_id) REFERENCES drivers (tenant_id, driver_id) NOT VALID;

ALTER TABLE maintenance_records DROP CONSTRAINT IF EXISTS maintenance_records_tenant_truck_fkey;
ALTER TABLE maintenance_records ADD CONSTRAINT maintenance_records_tenant_truck_fkey
  FOREIGN KEY (tenant_id, truck_id) REFERENCES trucks (tenant_id, truck_id) NOT VALID;
ALTER TABLE maintenance_records DROP CONSTRAINT IF EXISTS maintenance_records_tenant_created_by_fkey;
ALTER TABLE maintenance_records ADD CONSTRAINT maintenance_records_tenant_created_by_fkey
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id) NOT VALID;

ALTER TABLE safety_incidents DROP CONSTRAINT IF EXISTS safety_incidents_tenant_trip_fkey;
ALTER TABLE safety_incidents ADD CONSTRAINT safety_incidents_tenant_trip_fkey
  FOREIGN KEY (tenant_id, trip_id) REFERENCES trips (tenant_id, trip_id)
  ON DELETE SET NULL (trip_id) NOT VALID;
ALTER TABLE safety_incidents DROP CONSTRAINT IF EXISTS safety_incidents_tenant_truck_fkey;
ALTER TABLE safety_incidents ADD CONSTRAINT safety_incidents_tenant_truck_fkey
  FOREIGN KEY (tenant_id, truck_id) REFERENCES trucks (tenant_id, truck_id) NOT VALID;
ALTER TABLE safety_incidents DROP CONSTRAINT IF EXISTS safety_incidents_tenant_driver_fkey;
ALTER TABLE safety_incidents ADD CONSTRAINT safety_incidents_tenant_driver_fkey
  FOREIGN KEY (tenant_id, driver_id) REFERENCES drivers (tenant_id, driver_id) NOT VALID;
ALTER TABLE safety_incidents DROP CONSTRAINT IF EXISTS safety_incidents_tenant_recorded_by_fkey;
ALTER TABLE safety_incidents ADD CONSTRAINT safety_incidents_tenant_recorded_by_fkey
  FOREIGN KEY (tenant_id, recorded_by) REFERENCES users (tenant_id, id) NOT VALID;

ALTER TABLE driver_monthly_metrics DROP CONSTRAINT IF EXISTS driver_monthly_metrics_tenant_driver_fkey;
ALTER TABLE driver_monthly_metrics ADD CONSTRAINT driver_monthly_metrics_tenant_driver_fkey
  FOREIGN KEY (tenant_id, driver_id) REFERENCES drivers (tenant_id, driver_id) ON DELETE CASCADE NOT VALID;

ALTER TABLE truck_utilization_metrics DROP CONSTRAINT IF EXISTS truck_utilization_metrics_tenant_truck_fkey;
ALTER TABLE truck_utilization_metrics ADD CONSTRAINT truck_utilization_metrics_tenant_truck_fkey
  FOREIGN KEY (tenant_id, truck_id) REFERENCES trucks (tenant_id, truck_id) ON DELETE CASCADE NOT VALID;

-- audit_logs.actor_id keeps a single-column FK so platform audit rows (which
-- have tenant_id NULL) can still point at the platform administrator. The
-- additional composite FK enforces that a tenant audit row's actor belongs to
-- the same tenant; MATCH SIMPLE skips it when tenant_id is NULL.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users (id) NOT VALID;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_tenant_actor_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_tenant_actor_fkey
  FOREIGN KEY (tenant_id, actor_id) REFERENCES users (tenant_id, id) NOT VALID;

ALTER TABLE loads VALIDATE CONSTRAINT loads_tenant_customer_fkey;
ALTER TABLE loads VALIDATE CONSTRAINT loads_tenant_route_fkey;
ALTER TABLE loads VALIDATE CONSTRAINT loads_tenant_created_by_fkey;
ALTER TABLE trips VALIDATE CONSTRAINT trips_tenant_load_fkey;
ALTER TABLE trips VALIDATE CONSTRAINT trips_tenant_driver_fkey;
ALTER TABLE trips VALIDATE CONSTRAINT trips_tenant_truck_fkey;
ALTER TABLE trips VALIDATE CONSTRAINT trips_tenant_trailer_fkey;
ALTER TABLE delivery_events VALIDATE CONSTRAINT delivery_events_tenant_load_fkey;
ALTER TABLE delivery_events VALIDATE CONSTRAINT delivery_events_tenant_trip_fkey;
ALTER TABLE delivery_events VALIDATE CONSTRAINT delivery_events_tenant_facility_fkey;
ALTER TABLE delivery_events VALIDATE CONSTRAINT delivery_events_tenant_recorded_by_fkey;
ALTER TABLE fuel_purchases VALIDATE CONSTRAINT fuel_purchases_tenant_trip_fkey;
ALTER TABLE fuel_purchases VALIDATE CONSTRAINT fuel_purchases_tenant_truck_fkey;
ALTER TABLE fuel_purchases VALIDATE CONSTRAINT fuel_purchases_tenant_driver_fkey;
ALTER TABLE maintenance_records VALIDATE CONSTRAINT maintenance_records_tenant_truck_fkey;
ALTER TABLE maintenance_records VALIDATE CONSTRAINT maintenance_records_tenant_created_by_fkey;
ALTER TABLE safety_incidents VALIDATE CONSTRAINT safety_incidents_tenant_trip_fkey;
ALTER TABLE safety_incidents VALIDATE CONSTRAINT safety_incidents_tenant_truck_fkey;
ALTER TABLE safety_incidents VALIDATE CONSTRAINT safety_incidents_tenant_driver_fkey;
ALTER TABLE safety_incidents VALIDATE CONSTRAINT safety_incidents_tenant_recorded_by_fkey;
ALTER TABLE driver_monthly_metrics VALIDATE CONSTRAINT driver_monthly_metrics_tenant_driver_fkey;
ALTER TABLE truck_utilization_metrics VALIDATE CONSTRAINT truck_utilization_metrics_tenant_truck_fkey;
ALTER TABLE audit_logs VALIDATE CONSTRAINT audit_logs_actor_id_fkey;
ALTER TABLE audit_logs VALIDATE CONSTRAINT audit_logs_tenant_actor_fkey;

-- ---------------------------------------------------------------------------
-- Row-level security. Unset app.current_tenant yields NULL, and NULL never
-- matches tenant_id, so a request with no tenant sees zero rows.
-- ---------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities FORCE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes FORCE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers FORCE ROW LEVEL SECURITY;
ALTER TABLE trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE trucks FORCE ROW LEVEL SECURITY;
ALTER TABLE trailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trailers FORCE ROW LEVEL SECURITY;
ALTER TABLE loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE loads FORCE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips FORCE ROW LEVEL SECURITY;
ALTER TABLE delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_events FORCE ROW LEVEL SECURITY;
ALTER TABLE fuel_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_purchases FORCE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records FORCE ROW LEVEL SECURITY;
ALTER TABLE safety_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE driver_monthly_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_monthly_metrics FORCE ROW LEVEL SECURITY;
ALTER TABLE truck_utilization_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_utilization_metrics FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_counters FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON customers;
CREATE POLICY tenant_isolation ON customers FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON facilities;
CREATE POLICY tenant_isolation ON facilities FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON routes;
CREATE POLICY tenant_isolation ON routes FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON drivers;
CREATE POLICY tenant_isolation ON drivers FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON trucks;
CREATE POLICY tenant_isolation ON trucks FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON trailers;
CREATE POLICY tenant_isolation ON trailers FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON loads;
CREATE POLICY tenant_isolation ON loads FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON trips;
CREATE POLICY tenant_isolation ON trips FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON delivery_events;
CREATE POLICY tenant_isolation ON delivery_events FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON fuel_purchases;
CREATE POLICY tenant_isolation ON fuel_purchases FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON maintenance_records;
CREATE POLICY tenant_isolation ON maintenance_records FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON safety_incidents;
CREATE POLICY tenant_isolation ON safety_incidents FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON driver_monthly_metrics;
CREATE POLICY tenant_isolation ON driver_monthly_metrics FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON truck_utilization_metrics;
CREATE POLICY tenant_isolation ON truck_utilization_metrics FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON audit_logs;
CREATE POLICY tenant_isolation ON audit_logs FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
DROP POLICY IF EXISTS platform_actions ON audit_logs;
CREATE POLICY platform_actions ON audit_logs FOR ALL TO doxin_app
  USING (tenant_id IS NULL AND current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (tenant_id IS NULL AND current_setting('app.is_platform_admin', true) = 'true');
DROP POLICY IF EXISTS tenant_isolation ON tenant_counters;
CREATE POLICY tenant_isolation ON tenant_counters FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Login lookup. This is the only pre-tenant read path. It is owned by a
-- dedicated NOLOGIN BYPASSRLS role that has SELECT on users only, has a fixed
-- search_path, and is executable only by the app role.
-- ---------------------------------------------------------------------------
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE OR REPLACE FUNCTION auth_lookup_user(p_email text)
RETURNS TABLE (
  id uuid,
  email text,
  password_hash text,
  name text,
  role text,
  theme_color text,
  is_active boolean,
  tenant_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id, u.email, u.password_hash, u.name, u.role, u.theme_color, u.is_active, u.tenant_id
  FROM public.users u
  WHERE u.email = lower(p_email)
  LIMIT 1
$$;

ALTER FUNCTION auth_lookup_user(text) OWNER TO doxin_auth_lookup;
REVOKE ALL ON FUNCTION auth_lookup_user(text) FROM PUBLIC;
GRANT SELECT ON users TO doxin_auth_lookup;
GRANT EXECUTE ON FUNCTION auth_lookup_user(text) TO doxin_app;

-- ---------------------------------------------------------------------------
-- Runtime grants. The app role never owns a table and never bypasses RLS.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON customers TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON facilities TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON routes TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON drivers TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON trucks TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON trailers TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON loads TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON trips TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_events TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON fuel_purchases TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_records TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON safety_incidents TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_monthly_metrics TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON truck_utilization_metrics TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs TO doxin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_counters TO doxin_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO doxin_app;
GRANT EXECUTE ON FUNCTION next_tenant_id(text, text, integer) TO doxin_app;
