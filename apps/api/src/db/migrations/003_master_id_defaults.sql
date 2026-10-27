-- Master data created through the UI receives its id from the API. Give every
-- master table the same database-level fallback as operational tables so
-- direct SQL inserts (seed scripts, backfills) are safe too.
ALTER TABLE customers ALTER COLUMN customer_id
  SET DEFAULT ('CUST' || lpad(nextval('customer_id_seq')::text, 5, '0'));

ALTER TABLE facilities ALTER COLUMN facility_id
  SET DEFAULT ('FAC' || lpad(nextval('facility_id_seq')::text, 5, '0'));

ALTER TABLE routes ALTER COLUMN route_id
  SET DEFAULT ('RTE' || lpad(nextval('route_id_seq')::text, 5, '0'));

ALTER TABLE drivers ALTER COLUMN driver_id
  SET DEFAULT ('DRV' || lpad(nextval('driver_id_seq')::text, 5, '0'));

ALTER TABLE trucks ALTER COLUMN truck_id
  SET DEFAULT ('TRK' || lpad(nextval('truck_id_seq')::text, 5, '0'));

ALTER TABLE trailers ALTER COLUMN trailer_id
  SET DEFAULT ('TRL' || lpad(nextval('trailer_id_seq')::text, 5, '0'));
