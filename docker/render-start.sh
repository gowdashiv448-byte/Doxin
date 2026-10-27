#!/bin/sh
set -eu

# Render provides MIGRATION_DATABASE_URL and APP_DB_PASSWORD. The API config
# derives DATABASE_URL for doxin_app when DATABASE_URL is not set. Local
# Compose still supplies DATABASE_URL directly.
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set; deriving the doxin_app runtime URL from MIGRATION_DATABASE_URL."
fi

echo "Applying database migrations..."
node apps/api/dist/db/migrate.js

echo "Running the idempotent seed..."
node apps/api/dist/db/seed.js

echo "Starting the Doxin API..."
exec node apps/api/dist/server.js
