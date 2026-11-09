-- ---------------------------------------------------------------------------
-- Migration 010: Contact Book (Tenant-Persistent Contacts)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contacts (
  contact_id text NOT NULL DEFAULT next_tenant_id('CON', 'contact_id_seq', 5),
  tenant_id uuid NOT NULL REFERENCES tenants(id) DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid),
  name text NOT NULL,
  company_name text,
  mobile_number text NOT NULL,
  email text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, contact_id)
);

CREATE INDEX IF NOT EXISTS contacts_tenant_name_idx ON contacts (tenant_id, name);
CREATE INDEX IF NOT EXISTS contacts_tenant_company_idx ON contacts (tenant_id, company_name);
CREATE INDEX IF NOT EXISTS contacts_tenant_mobile_idx ON contacts (tenant_id, mobile_number);
CREATE INDEX IF NOT EXISTS contacts_tenant_created_idx ON contacts (tenant_id, created_at DESC);

-- Enable and force Row Level Security
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON contacts;
CREATE POLICY tenant_isolation ON contacts FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);

-- Grant privileges to the runtime app role
GRANT SELECT, INSERT, UPDATE, DELETE ON contacts TO doxin_app;

