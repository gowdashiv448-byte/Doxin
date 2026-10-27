-- Enforce tenant consistency for audit actors. Platform audit rows have
-- tenant_id NULL and continue to use the single-column actor FK; tenant audit
-- rows must reference a user in the same tenant. MATCH SIMPLE means the
-- composite FK is skipped when tenant_id is NULL.
--
-- This is a separate migration because 006 was already applied in existing
-- environments. It is idempotent and safe to re-run.

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_tenant_actor_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_tenant_actor_fkey
  FOREIGN KEY (tenant_id, actor_id) REFERENCES users (tenant_id, id) NOT VALID;
ALTER TABLE audit_logs VALIDATE CONSTRAINT audit_logs_tenant_actor_fkey;
