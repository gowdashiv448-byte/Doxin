-- The archive importer runs as the tenant-scoped runtime role. It may record
-- deterministic trailer-number renames in the durable cleanup log, but it must
-- not be able to read, update or delete existing migration records.
GRANT INSERT ON migration_data_cleanup TO doxin_app;
GRANT USAGE, SELECT ON SEQUENCE migration_data_cleanup_id_seq TO doxin_app;
