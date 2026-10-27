-- Doxin currently runs as an administrator-only workspace.
-- Preserve historical records by detaching references to non-admin demo/staff
-- accounts before removing those accounts, then enforce the single-role model.
UPDATE loads
  SET created_by = NULL
  WHERE created_by IN (SELECT id FROM users WHERE role <> 'ADMIN');

UPDATE delivery_events
  SET recorded_by = NULL
  WHERE recorded_by IN (SELECT id FROM users WHERE role <> 'ADMIN');

UPDATE maintenance_records
  SET created_by = NULL
  WHERE created_by IN (SELECT id FROM users WHERE role <> 'ADMIN');

UPDATE safety_incidents
  SET recorded_by = NULL
  WHERE recorded_by IN (SELECT id FROM users WHERE role <> 'ADMIN');

UPDATE audit_logs
  SET actor_id = NULL
  WHERE actor_id IN (SELECT id FROM users WHERE role <> 'ADMIN');

DELETE FROM users WHERE role <> 'ADMIN';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role = 'ADMIN');

ALTER TABLE users
  ADD COLUMN theme_color text NOT NULL DEFAULT 'orange'
  CHECK (theme_color IN ('orange', 'green', 'blue', 'purple'));
