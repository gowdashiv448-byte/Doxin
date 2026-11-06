-- ---------------------------------------------------------------------------
-- Migration 009: Accounting, Bills, and S3 Storage
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS db_s3_bill (
  bill_id text NOT NULL DEFAULT next_tenant_id('BILL', 'bills', 8),
  tenant_id uuid NOT NULL REFERENCES tenants(id) DEFAULT (nullif(current_setting('app.current_tenant', true), '')::uuid),
  load_id text NOT NULL,
  trip_id text,
  customer_id text NOT NULL,
  dispatcher_company_name text NOT NULL,
  recipient_email text,
  s3_url text NOT NULL,
  s3_bucket text,
  s3_key text NOT NULL,
  linehaul_amount numeric(12,2) NOT NULL DEFAULT 0,
  fuel_surcharge numeric(12,2) NOT NULL DEFAULT 0,
  accessorial_charges numeric(12,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  gst_rate numeric(5,2) NOT NULL DEFAULT 18.00,
  gst_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  trip_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  charges_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'GENERATED' CHECK (status IN ('GENERATED', 'SENT', 'PAID', 'CANCELLED')),
  email_status text NOT NULL DEFAULT 'PENDING' CHECK (email_status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  email_error text,
  email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, bill_id)
);

-- Unique bill per load within a tenant
ALTER TABLE db_s3_bill DROP CONSTRAINT IF EXISTS db_s3_bill_tenant_load_unique;
ALTER TABLE db_s3_bill ADD CONSTRAINT db_s3_bill_tenant_load_unique UNIQUE (tenant_id, load_id);

-- Composite foreign keys
ALTER TABLE db_s3_bill DROP CONSTRAINT IF EXISTS db_s3_bill_tenant_load_fkey;
ALTER TABLE db_s3_bill ADD CONSTRAINT db_s3_bill_tenant_load_fkey
  FOREIGN KEY (tenant_id, load_id) REFERENCES loads (tenant_id, load_id) ON DELETE CASCADE;

ALTER TABLE db_s3_bill DROP CONSTRAINT IF EXISTS db_s3_bill_tenant_customer_fkey;
ALTER TABLE db_s3_bill ADD CONSTRAINT db_s3_bill_tenant_customer_fkey
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, customer_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS db_s3_bill_tenant_load_idx ON db_s3_bill (tenant_id, load_id);
CREATE INDEX IF NOT EXISTS db_s3_bill_tenant_customer_idx ON db_s3_bill (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS db_s3_bill_tenant_status_idx ON db_s3_bill (tenant_id, status);
CREATE INDEX IF NOT EXISTS db_s3_bill_tenant_created_idx ON db_s3_bill (tenant_id, created_at DESC);

-- Enable and force Row Level Security
ALTER TABLE db_s3_bill ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_s3_bill FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON db_s3_bill;
CREATE POLICY tenant_isolation ON db_s3_bill FOR ALL TO doxin_app
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);

-- Grant privileges to the runtime app role
GRANT SELECT, INSERT, UPDATE, DELETE ON db_s3_bill TO doxin_app;

