-- Source archives can contain duplicate fleet numbers. Keep the human-readable
-- number indexed for lookup, but do not make it a hard uniqueness constraint.
ALTER TABLE trailers DROP CONSTRAINT IF EXISTS trailers_trailer_number_key;
CREATE INDEX IF NOT EXISTS trailers_number_idx ON trailers (trailer_number);
