# Doxin — Logistics Operations Platform

Doxin is an end-to-end transportation management system for a trucking and
logistics operation. Administrators work the same records from first quote to
final settlement: customers, lanes, loads, drivers, trucks, trailers, fuel,
maintenance, incidents, and analytics.

The application ships with an import pipeline for the historical dataset in
`/home/shiv-gowda/Downloads/archive` (85k+ loads, 196k+ fuel purchases) and a
live demo operation seeded relative to today's date so every workflow is usable
immediately.

---

## What the product does

| Workspace | Staff can |
| --- | --- |
| **Control tower** | See revenue booked today, active loads, transit, exceptions, on-time rate, available trucks, maintenance due, fuel spend and a 14-day trend. Create a load without leaving the dashboard. |
| **Loads** | Search and filter the load board, create and edit commercial details, book, assign driver/truck/trailer, dispatch, start transit, flag and resolve exceptions, record pickup/delivery events, mark delivered, complete, or cancel. |
| **Dispatch board** | Work the unassigned queue, see planned/dispatched/in-transit capacity, and open any load in the workflow drawer. |
| **Trips & tracking** | Inspect every trip, its resources, distance, MPG, idle time, and pickup/delivery event timeline. |
| **Customers** | Maintain accounts, credit terms, freight profile, contacts, and account status. |
| **Drivers** | Maintain CDL, licensing, terminal, contact, employment status, and safety history. |
| **Fleet** | Manage tractors and trailers, service schedules, maintenance work orders, status transitions, and truck activity/cost history. |
| **Lanes & facilities** | Maintain origin/destination lanes, distance, rate per mile, fuel surcharge, transit days, and dock facilities. |
| **Fuel** | Browse fuel purchases by trip, truck, driver, state, and vendor with cost and MPG context. |
| **Safety** | Record incidents, claims, injuries, preventability, and move incidents through investigation to closure. |
| **Analytics** | Filter the full history by date; review revenue, contribution margin, RPM/CPM, on-time performance, lanes, customers, drivers, fleet and safety. |
| **Imports** | Upload any supported CSV from the browser and watch idempotent, atomic import results. |
| **Administrators & audit** | Add or disable administrator accounts; inspect the append-only audit trail for sensitive actions. |
| **Settings** | Review profile, session and workspace configuration; switch the accent color between orange, green, blue and purple. |

---

## Architecture

```
Doxin-Product/
├── apps/
│   ├── api/                  Fastify 5 + PostgreSQL (raw SQL, no ORM)
│   │   ├── src/modules/      auth, users, customers, drivers, trucks, trailers,
│   │   │                     facilities, routes, loads, trips, events, fuel,
│   │   │                     maintenance, safety, dashboard, analytics,
│   │   │                     imports, audit, platform
│   │   ├── src/db/           pool, migrations, idempotent seed
│   │   ├── src/lib/          importer, pagination, errors, audit, CRUD helper
│   │   └── src/__tests__/    Vitest integration tests
│   └── web/                  React 18 + Vite + Tailwind + React Query + Recharts
│       └── src/              pages, workflow drawer, reusable master-data CRUD,
│                             charts, auth context, API client
├── packages/shared/          Domain types, roles, load state machine, formatting
├── docker/                   API/web Dockerfiles, nginx reverse proxy and Render entrypoint
├── render.yaml               Render Blueprint: Postgres, Docker API and static web
├── docker-compose.yml        Postgres + API + web
└── .env.example              Compose configuration template
```

### Design decisions

- **One lifecycle, enforced in one place.** `packages/shared` exports
  `LOAD_ACTIONS` and `LOAD_TRANSITIONS`. The API validates every action against
  the current status with `SELECT … FOR UPDATE`; the web UI renders exactly the
  actions the server will accept. Invalid transitions return `422` with the
  current status and allowed actions.
- **Modular monolith.** Each API module owns its routes, validation and service
  logic behind a clean boundary. Modules share the database pool and domain
  types, not each other's internals. This is intentionally deployable as one
  service but split-ready by domain.
- **Raw SQL for the data plane.** Analytics and dispatch queries use indexed SQL
  and set-based operations rather than N+1 ORM calls. Commercial numbers are
  derived by the database so dispatch, dashboard and analytics agree.
- **Idempotent ingestion.** CSV files stream through `COPY` into a temporary
  staging table and merge with `ON CONFLICT DO NOTHING` in one transaction.
  Re-importing the same archive is safe; a malformed row aborts its dataset
  without touching existing data.
- **Auditability.** Sensitive actions (login, user changes, load transitions,
  imports, maintenance/safety status changes) are written to `audit_logs` with
  actor, entity, before/after details and timestamp.
- **Stateless API.** JWT bearer sessions, no server-side session store, container
  friendly; persistence lives in PostgreSQL.

---

## Multi-tenancy

Doxin is a shared-database, shared-schema multi-tenant application. Every
tenant-owned domain table carries `tenant_id UUID NOT NULL`; `users.tenant_id`
is nullable only for `PLATFORM_ADMIN`, and `audit_logs.tenant_id` is nullable
only for platform actions. The tenant registry (`tenants`) is deliberately outside
RLS because login and platform administration must read it before a tenant
context exists.

### Keys, counters and data migration

- Business keys remain the public identifiers. Domain-table primary and foreign
  keys are composite: `(tenant_id, customer_id)`, `(tenant_id, load_id)`, and
  so on. The same `CUST00001` or `LOAD00000001` can exist independently in two
  tenants. `users` keeps its existing UUID surrogate primary key with a global
  unique email (platform administrators have no tenant) plus
  `UNIQUE (tenant_id, id)` for composite references; `audit_logs` keeps its
  bigserial surrogate because it has no natural key. Tenant audit rows use a
  composite `(tenant_id, actor_id)` FK so their actor must be in the same
  tenant; platform audit rows keep a single-column actor FK because they have
  no tenant.
- The existing archive was backfilled into the fixed default tenant
  (`00000000-0000-0000-0000-000000000001`) in 10,000-row batches, then
  `tenant_id` was set `NOT NULL`. The `005`-`007` migration set is re-runnable;
  platform users and platform audit rows are excluded from the backfill.
- Display numbers are allocated atomically per tenant by
  `next_tenant_id(prefix, counter, width)`, which uses
  `UPDATE tenant_counters ... RETURNING` in the caller's transaction.
- The migration found four duplicate trailer numbers: `9796`, `6620`, `2791`
  and `7703`. The row with the lowest `trailer_id` kept the number; the other
  rows were deterministically renamed to `<number>-DUP2` and recorded in
  `migration_data_cleanup`. `UNIQUE (tenant_id, trailer_number)` is now
  enforced.
- `tenants` has `id`, `name`, a unique `slug`, `status`
  (`ACTIVE | SUSPENDED | DELETED`), nullable `shard_key`, and a `config` JSONB
  document. `config.rateLimit` is the per-tenant request limit.

### RLS, roles and request context

- Every tenant-owned table uses `ENABLE ROW LEVEL SECURITY` and
  `FORCE ROW LEVEL SECURITY`. The runtime role `doxin_app` is
  `NOSUPERUSER NOBYPASSRLS`; it does not own tables.
- Policies compare `tenant_id` with
  `current_setting('app.current_tenant', true)`. With no tenant context, a
  tenant table returns zero rows. Cross-tenant ID lookups return `404`, and
  composite foreign keys reject cross-tenant writes.
- `withTenant(tenantId, fn)` opens (or reuses) a transaction, runs
  `set_config('app.current_tenant', tenantId, true)`, and stores the client in
  `AsyncLocalStorage`. Fastify hooks commit on response and roll back on error.
  Module code uses the tenant-aware `query()` helper; bare-pool access is
  reserved for allowlisted pre-tenant reads.
- The tenant comes only from the verified JWT `tid` claim. `authenticate()`
  re-reads the account and tenant status, rejects a mismatched or missing
  `tid`, and returns `403` for suspended or deleted tenants. Body, query and
  route parameters are never trusted as tenant selectors.
- `doxin_auth_lookup` is a dedicated `NOLOGIN BYPASSRLS` role. It owns the
  `SECURITY DEFINER` function `auth_lookup_user(email)`, has `SELECT` on
  `users` only, uses a fixed `search_path = pg_catalog, public`, and grants
  `EXECUTE` only to `doxin_app`. This is the only pre-tenant user read.
- The owner connection (`MIGRATION_DATABASE_URL`) is used only by migrations,
  seeding and the archive CLI. The API runtime always connects as
  `doxin_app`; platform administration also uses the app role.

### Platform administration and export

`PLATFORM_ADMIN` accounts have `tenant_id NULL`. They can access only
`/api/platform/*` and `/api/auth/*`; tenant routes return `403`. The platform
API can create a tenant together with its first `ADMIN`, list tenants, suspend,
reactivate and soft-delete (`DELETED`) a tenant, and stream an export. Tenant
creation and export use `withTenant` for each target tenant, so RLS applies to
the data being written or read.

`GET /api/platform/tenants/:id/export` returns a streamed ZIP containing one CSV
per exported table under `<slug>/` plus `<slug>/manifest.json`. The manifest
records tenant metadata, export time and row counts. Deleted tenants cannot be
exported. The exported tables are:

```
customers              facilities             routes
drivers                trucks                 trailers
loads                  trips                  delivery_events
fuel_purchases         maintenance_records    safety_incidents
driver_monthly_metrics truck_utilization_metrics
users                  audit_logs             tenant_counters
```

### Rate limits and imports

- `tenants.config.rateLimit` is `{ "max": 300, "timeWindowSeconds": 60 }` by
  default. The in-process fixed-window limiter is keyed by tenant id and runs
  after authentication; the Fastify IP limiter remains the outer guard. Login
  has a separate 10-requests-per-minute IP limit.
- Browser imports derive the tenant from the authenticated administrator, never
  from the CSV. The importer writes `tenant_id` into its staging table, includes
  it in every `ON CONFLICT` target, takes a per-tenant advisory lock, and runs in
  the request transaction. After a numeric import it advances the tenant's
  display-number counter to at least the highest imported key.
- The CLI requires the tenant slug before the directory:

```bash
npm run import:archive -w @doxin/api -- default --dir=/home/shiv-gowda/Downloads/archive
```

### Seed accounts

`npm run db:seed` is idempotent. It creates the default tenant, a small second
tenant, the platform administrator, and one administrator per tenant. Passwords
come from environment variables; the seed refuses the built-in development
passwords when `NODE_ENV=production`.

| Email | Role | Tenant | Password variable |
| --- | --- | --- | --- |
| `platform@doxin.com` | `PLATFORM_ADMIN` | none | `SEED_PLATFORM_PASSWORD` |
| `admin@doxin.com` | `ADMIN` | `default` (Doxin) | `SEED_ADMIN_PASSWORD` |
| `admin@northwind.test` | `ADMIN` | `northwind` (Northwind Logistics) | `SEED_SECOND_TENANT_PASSWORD` |

The default tenant receives the archive/starter data and live demo loads. The
second tenant receives a small starter dataset (customers, lanes, facilities,
drivers, trucks and trailers) and no live loads, which makes isolation easy to
verify.

### Migration rollback notes

There is no automatic down migration. `db/migrate.ts` runs each SQL file in one
transaction and records applied files; rollback is a manual maintenance-window
operation. Export every tenant first:

```bash
curl -H "Authorization: Bearer $PLATFORM_TOKEN" \
  http://localhost:4000/api/platform/tenants/<tenant-id>/export -o tenant.zip
```

- **`007_audit_actor_tenant_fk.sql` (roll back first):** drop the
  `audit_logs_tenant_actor_fkey` composite constraint. The single-column
  platform actor FK can remain until `006` is rolled back.
- **`006_composite_fks_and_rls.sql`:** drop the composite foreign keys,
  `auth_lookup_user(text)`, the tenant/platform policies, and the app-role
  grants added by this migration; disable/force-RLS can then be turned off.
  Revoke `doxin_auth_lookup`'s grants and drop the role only after the function
  is gone. Do not drop the composite keys yet.
- **`005_tenants_and_composite_keys.sql`:** restore the pre-migration
  single-column primary/unique constraints and indexes, drop the tenant-leading
  indexes and `tenant_counters`, and remove the `tenant_id` defaults. Before
  dropping the `tenant_id` columns, archive and delete non-default tenant rows;
  otherwise duplicate business keys will collide. Then drop the columns,
  `tenants`, and the `doxin_app` role if it is no longer used.
- Restore from a verified backup if any step fails. The migrations were tested
  for re-runnability (`005`, `006` and `007` inside a transaction, followed by
  `ROLLBACK`) after platform users and platform audit rows existed.

### Query plans and known trade-offs

See [docs/query-plans.md](docs/query-plans.md) for the `EXPLAIN (ANALYZE,
BUFFERS)` comparison on `loads`, `fuel_purchases` and `delivery_events`. Every
tenant-leading index starts with `tenant_id`; the compared queries use index
scans before and after, and the no-index fallback is a multi-thousand-buffer
parallel sequential scan. RLS adds a small predicate overhead; broad date
ranges may still choose a sequential scan by design.

Assumptions and unfinished items:

- One shared schema and no shard routing. `tenants.shard_key` is reserved for a
  future sharding layer and is not used by the API.
- The platform API is intentionally small: tenant config editing, billing, SSO,
  telemetry and background export jobs are out of scope.
- The per-tenant rate limiter is in-memory and per API process. A multi-replica
  deployment should replace it with a shared store such as Redis.
- Export is a synchronous stream. It is not resumable, encrypted separately, or
  scheduled; large tenants should be exported during a maintenance window.
- Platform administrators cannot currently change their own password or accent
  preference through the tenant-facing settings routes because `users` has no
  platform self-service policy. Tenant administrators have the normal settings
  flow.
- The archive's historical counts and the seeded live-operation counts differ
  from the raw CSV totals; the import table below reports the archive files, not
  the post-seed row counts.

---

## Quick start (local development)

### Prerequisites

- Node.js 20+ and npm 10+
- Docker (for PostgreSQL) or an existing PostgreSQL 14+ instance
- The archive CSVs are optional for booting the app

### 1. Install and configure

```bash
npm install
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env if your Postgres differs.
```

### 2. Start PostgreSQL

```bash
# From the repository root. Uses host port 5433 to avoid clashing with a
# locally installed Postgres.
docker compose up -d db
```

Or create it manually:

```bash
docker run -d --name doxin-postgres \
  -e POSTGRES_USER=doxin \
  -e POSTGRES_PASSWORD=doxin_dev_password \
  -e POSTGRES_DB=doxin \
  -p 5433:5432 postgres:16-alpine
```

### 3. Create the schema and demo operation

```bash
npm run db:migrate
npm run db:seed
```

`db:seed` is idempotent. It creates the platform administrator, the default
tenant administrator, the second-tenant administrator, starter reference data
when the customer table is empty, and a live board in the default tenant with
loads in every state (booked, planned, dispatched, in transit, exception,
delivered, completed) relative to today.

### 4. Import the historical archive (optional)

```bash
npm run import:archive -w @doxin/api -- default --dir=/home/shiv-gowda/Downloads/archive
```

The importer processes these files when present:

```
customers.csv              facilities.csv
routes.csv                 drivers.csv
trucks.csv                 trailers.csv
loads.csv                  trips.csv
delivery_events.csv        fuel_purchases.csv
maintenance_records.csv    safety_incidents.csv
driver_monthly_metrics.csv truck_utilization_metrics.csv
```

Imported totals from the supplied archive:

| Dataset | Rows |
| --- | ---: |
| Customers | 200 |
| Facilities | 50 |
| Lanes | 58 |
| Drivers | 150 |
| Trucks | 120 |
| Trailers | 180 |
| Loads | 85,410 |
| Trips | 85,410 |
| Delivery events | 170,820 |
| Fuel purchases | 196,442 |
| Maintenance records | 2,920 |
| Safety incidents | 170 |
| Driver monthly metrics | 4,464 |
| Truck monthly metrics | 3,312 |

### 5. Run the app

```bash
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:4000
- OpenAPI UI: http://localhost:4000/docs

### Demo accounts

The seed creates one administrator per tenant plus a platform administrator.
The development passwords below are refused in production; set the
corresponding `SEED_*_PASSWORD` variables before first boot in any shared
environment.

| Email | Role | Tenant |
| --- | --- | --- |
| `platform@doxin.com` | `PLATFORM_ADMIN` | none (platform) |
| `admin@doxin.com` | `ADMIN` | Doxin (`default`) |
| `admin@northwind.test` | `ADMIN` | Northwind Logistics (`northwind`) |

The platform administrator manages tenants; tenant administrators work inside
their own workspace and cannot see another tenant's data.

---

## The load workflow

```
DRAFT ──book──▶ BOOKED ──plan──▶ PLANNED ──dispatch──▶ DISPATCHED
                                                          │
                                                    start_transit
                                                          ▼
COMPLETED ◀──complete── DELIVERED ◀──mark_delivered── IN_TRANSIT
                                                          │
                                                  flag_exception
                                                          ▼
                                                     EXCEPTION
                                                          │
                                                 resolve_exception
                                                          ▼
                                                PLANNED / BOOKED
```

- **Plan** requires an active driver, truck and trailer and rejects resources
  already assigned to a planned, dispatched or in-transit trip (`409`).
- **Start transit** records a pickup event if one does not already exist;
  **mark delivered** records the delivery event that drives on-time analytics,
  unless dispatch already captured one manually.
- **Exception** requires a reason. Resolution returns the load to `PLANNED`
  when a trip exists, otherwise `BOOKED`.
- **Cancel** is available before transit. Completed and cancelled loads are
  terminal.
- Every transition appends to the load timeline and the audit log.

### Access model

Doxin is an administrator-only workspace. Tenant administrators have full
access to their own operations console; a separate platform administrator
manages the tenant registry. The former dispatcher, fleet manager, safety
manager, finance and viewer roles have been removed.

| Capability | Tenant ADMIN | PLATFORM_ADMIN |
| --- | :---: | :---: |
| Read tenant operational data | ✓ | — |
| Create/edit loads, dispatch | ✓ | — |
| Fleet, maintenance | ✓ | — |
| Safety incidents | ✓ | — |
| Tenant administrators, CSV imports | ✓ | — |
| Tenant audit log read | ✓ | — |
| Create/suspend/reactivate/delete tenants | — | ✓ |
| Stream tenant export | — | ✓ |

JWTs carry the user id, name, email, role, accent preference and tenant id
(`tid`). Authentication re-reads the account from PostgreSQL on every request,
checks the tenant status, and rejects a token whose `tid` does not match the
account, so deactivated or deleted accounts and tampered tenant claims lose
access immediately. Every mutating route checks the administrator role on the
server; hiding a button in the UI is never the only control.

The accent color is stored per administrator in PostgreSQL and mirrored to
local storage so the chosen theme applies without a flash on the next page
load. Orange is the default; green, blue and purple are available in Settings.

---

## API surface

Full, interactive documentation is served at `/docs`. Core groups:

- `POST /api/auth/login`, `GET /api/auth/me`, `PATCH /api/auth/preferences`, `POST /api/auth/change-password`
- `/api/loads` — list/detail/create/patch, `/actions`, `/allowed-actions`,
  `/events`
- `/api/trips` — planned and active trips, `/complete`
- `/api/dashboard/summary|alerts`
- `/api/analytics/overview|monthly|lanes|customers|drivers|fleet|safety`
- `/api/fuel`, `/api/maintenance` (+ `due`, `/:id/status`), `/api/safety`
  (+ `/:id/status`)
- `/api/customers`, `/api/drivers`, `/api/trucks`, `/api/trailers`,
  `/api/facilities`, `/api/routes`, `/api/users`
- `/api/imports/catalog|history|:dataset`
- `/api/audit`
- `/api/platform/tenants` (create/list), `/api/platform/tenants/:id`
  (read/suspend/reactivate/delete), `/api/platform/tenants/:id/export`
- `/health`

All routes except `/health`, `/` and `/api/auth/login` require
`Authorization: Bearer <token>`.

---

## Quality checks

```bash
npm run typecheck   # shared, API and web
npm run build       # shared -> API -> web production builds
npm test            # API integration tests (requires the local database)
```

The 53-test Vitest suite covers administrator authentication, accent-color
preferences, master-data CRUD, every analytics endpoint, the complete load
lifecycle including exception recovery and automatic pickup/delivery events,
double-booking prevention, terminal-state protection, CSV import idempotency,
counter reconciliation and atomic rollback, forced RLS, cross-tenant 404/write
isolation, duplicate business keys across tenants, per-tenant
analytics/dashboard/audit, platform tenant lifecycle and ZIP export,
suspended-tenant blocking, per-tenant rate limits, and migration
backfill/trailer-dedupe invariants. Integration tests run against PostgreSQL;
Vitest isolates test files. Tests clean up their domain records, while platform
lifecycle tests soft-delete their tenants by design.

The archive-volume assertions expect the archive import to have populated the
default tenant. The seed adds live operations on top, so the assertions use the
archive row counts as their baseline. The archive import and every API
verification performed during development were run against the same PostgreSQL
schema the tests use.

---

## Deploy with Docker

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD, JWT_SECRET and SEED_ADMIN_PASSWORD.
docker compose up --build -d
```

- Application: http://localhost:8080
- OpenAPI UI: http://localhost:8080/docs
- Postgres is published on `${POSTGRES_PORT:-5433}` for controlled access.

The API container runs migrations and the idempotent seed on every boot, so a
fresh volume becomes a working demo operation. Web traffic is served by nginx;
`/api`, `/health` and `/docs` are reverse-proxied to the API container.

Useful commands:

```bash
docker compose ps
docker compose logs -f api
docker compose down            # keep the data volume
docker compose down -v         # destructive: drop Postgres data
```

To import the archive into the Compose database, run the CLI against the mapped
port (the seed is skipped when data already exists):

```bash
DATABASE_URL=postgres://doxin:doxin_dev_password@localhost:5433/doxin \
  npm run import:archive -w @doxin/api -- default --dir=/home/shiv-gowda/Downloads/archive
```

### Production checklist

- Replace every default in `.env`; generate `JWT_SECRET` with `openssl rand -hex 32`.
- Terminate TLS in front of nginx (or the load balancer) and set `CORS_ORIGIN`
  to the public origin.
- Back up PostgreSQL and test restore; use a managed Postgres for HA,
  point-in-time recovery and read replicas.
- Keep the API on `doxin_app` (`NOSUPERUSER NOBYPASSRLS`) and reserve the owner
  role for migrations/seed only. Rotate both credentials.
- Keep CSV import an administrative operation. The archive path is not baked
  into the runtime image; mount data deliberately if importing in a container.
- Ship application logs to your platform's log sink. The API emits structured
  JSON and redacts authorization and password fields.
- Put alerting on `/health`, error rate, p95 latency, database connections and
  the open-exception queue.

---

## Deploy on Render

The root [`render.yaml`](render.yaml) Blueprint provisions three resources:

| Resource | Render type | Purpose |
| --- | --- | --- |
| `doxin-db` | Render Postgres 16 | Shared database, private-network only |
| `doxin-api` | Docker web service | Fastify API, migrations and seed |
| `doxin-web` | Static site | React/Vite bundle served from Render's CDN |

The API and web app stay separate, matching the Docker/nginx split. The API is
reachable at its own HTTPS origin and the static site calls it using
`VITE_API_URL`; no API host is baked into the bundle for local development.

### First deploy

1. Push the repository to GitHub or GitLab.
2. In Render, choose **New → Blueprint**, connect the repository, and select the
   branch containing `render.yaml`.
3. Render prompts for the three `sync: false` seed secrets:
   `SEED_ADMIN_PASSWORD`, `SEED_PLATFORM_PASSWORD` and
   `SEED_SECOND_TENANT_PASSWORD`. Set strong values; they are never stored in
   the Blueprint. You can also change the seed emails and second-tenant name in
   `render.yaml` before applying it.
4. Apply the Blueprint. On first boot the API runs
   `dist/db/migrate.js`, then the idempotent `dist/db/seed.js`, then starts
   listening. Render waits for `/health` before routing traffic.
5. Open the `doxin-web` URL and sign in with `SEED_ADMIN_EMAIL` and
   `SEED_ADMIN_PASSWORD`. The platform administrator is API-only and is not a
   tenant workspace login.

The seed refuses the development passwords in production. If a deploy fails
with `Refusing to seed default passwords in production`, set the three
`SEED_*_PASSWORD` values in the Render Dashboard and redeploy.

### Runtime database role

Render exposes one owner connection string for Postgres. The Blueprint stores
that value only in `MIGRATION_DATABASE_URL`; it does **not** put it in
`DATABASE_URL`. At startup:

- `config.ts` derives `DATABASE_URL` from `MIGRATION_DATABASE_URL` plus the
  generated `APP_DB_PASSWORD`, replacing the owner credentials with the
  `doxin_app` role.
- Migrations and the seed use `MIGRATION_DATABASE_URL` (owner) to create the
  role, apply schema changes and synchronise the role password.
- The API process then connects only as `doxin_app`, which is
  `NOSUPERUSER NOBYPASSRLS` and subject to forced RLS.

`DATABASE_SSL=false` is deliberate: the API and database use Render's private
network, where TLS is optional. If you switch the API to an external database
URL, set `DATABASE_SSL=true` and include the required SSL mode.

You can derive the runtime URL for an operator command without printing the
owner password:

```bash
MIGRATION_DATABASE_URL='<owner-url>' APP_DB_PASSWORD='<app-password>' \
  npm run db:app-url -w @doxin/api
```

### Free-plan caveats

The Blueprint starts on Render's free plans so the demo can be deployed without
a paid instance. Free plans are **not** production infrastructure:

- Free web services spin down after 15 minutes without traffic; the next
  request has a cold-start delay of about a minute.
- Free Postgres is limited to 1 GB and expires 30 days after creation. It has no
  backups and cannot run managed connection pooling.
- Free web services do not provide shell access or one-off jobs.
- A full archive import is unlikely to fit in 1 GB. Upgrade the database before
  importing the archive.

For a real deployment, change `plan` for `doxin-db` and `doxin-api` in
`render.yaml` (or in the Render Dashboard), enable database backups, and use a
paid instance for the API so deploys and health checks are not subject to free
instance limits.

### Custom domains and CORS

The Blueprint wires the services together using Render's generated URLs:

- The API's `CORS_ORIGIN` references the static site's `RENDER_EXTERNAL_URL`.
- The static site's `VITE_API_URL` references the API's `RENDER_EXTERNAL_URL`.

If you add a custom domain for the web app, add its origin to `CORS_ORIGIN` as
a comma-separated list, for example:

```text
https://app.example.com,https://doxin-web.onrender.com
```

If you add a custom domain for the API, set `VITE_API_URL` to that API origin
and redeploy the static site. `VITE_API_URL` is compiled into the web bundle,
so changing it requires a new web deploy.

### Import the archive manually

The Blueprint sets the database's `ipAllowList` to `[]`, so only Render's
private network can reach it. To import the archive from a workstation:

1. In the Render Dashboard, temporarily add your public IP to the database's
   external access list (or set an `ipAllowList` entry in `render.yaml`).
2. Copy the database's external URL and the `APP_DB_PASSWORD` value from the
   API service's environment.
3. Run the importer from the repository root. The owner URL runs migrations;
   the app URL is used for tenant-scoped writes.

```bash
export OWNER_URL='postgresql://doxin:<owner-password>@<external-host>:5432/doxin?sslmode=require'
export APP_URL='postgresql://doxin_app:<app-password>@<external-host>:5432/doxin?sslmode=require'

DATABASE_URL="$APP_URL" \
MIGRATION_DATABASE_URL="$OWNER_URL" \
APP_DB_PASSWORD='<app-password>' \
DATABASE_SSL=true \
NODE_ENV=production \
  npm run import:archive -w @doxin/api -- default --dir=/path/to/archive
```

Remove the temporary external access rule when the import finishes. The
importer is idempotent, so a retry does not duplicate archive rows. The archive
contains four duplicate trailer numbers; the importer keeps the lowest
`trailer_id` and renames later rows to `<number>-DUP<n>`, recording the change
in `migration_data_cleanup`.

The automatic seed creates starter demo customers, drivers, trucks, trailers
and loads using the low `CUST`, `DRV`, `TRK`, `TRL` and `LOAD` IDs. If you import
the archive after that seed, archive rows with those IDs are skipped (the
importer never overwrites existing rows). For a full archive mirror, set
`SEED_STARTER_DATA` to `"false"` in `render.yaml` before applying the Blueprint
(or in the Dashboard before the first deploy), let the API create the
tenant/users without starter rows, then run the import. If the database already
contains starter rows, use a fresh database or a new tenant instead.

### Rollback and operations

- Render can roll back the API image to a previous deploy. Database migrations
  are forward-only; there is no automatic down migration. Take a database
  backup before applying schema changes on a paid plan.
- The API runs migrations and the idempotent seed on every boot. A redeploy or
  free-instance cold start therefore verifies the schema and reference data.
- Render logs include structured API JSON. Alert on `/health`, error rate,
  database connections and the open-exception queue.
- For zero-downtime schema changes, move migrations to a `preDeployCommand` and
  review them before enabling automatic deploys.

---

## Environment variables (API)

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` enables SSL heuristics and pool sizing |
| `PORT` / `HOST` | `4000` / `0.0.0.0` | HTTP listener; Render injects `PORT` |
| `DATABASE_URL` | derived when absent | Runtime PostgreSQL URL; must use the `doxin_app` role |
| `MIGRATION_DATABASE_URL` | falls back to `DATABASE_URL` | Owner URL used only by migrations, seed and archive CLI |
| `APP_DB_PASSWORD` | `doxin_app_dev_password` | Password synced onto the `doxin_app` role by the seed; also used to derive `DATABASE_URL` when it is absent |
| `DATABASE_SSL` | `auto` | `auto`, `true` or `false`; auto enables TLS outside localhost in production |
| `JWT_SECRET` | dev-only default | Signing key, minimum 32 characters |
| `JWT_EXPIRES_IN` | `12h` | Session lifetime |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins |
| `LOG_LEVEL` | `info` | Pino level |
| `SEED_ADMIN_EMAIL` | `admin@doxin.com` | Default-tenant administrator |
| `SEED_ADMIN_PASSWORD` | `Doxin@2026` | Default-tenant password (refused in production) |
| `SEED_PLATFORM_EMAIL` | `platform@doxin.com` | Platform administrator |
| `SEED_PLATFORM_PASSWORD` | `Platform@2026` | Platform password (refused in production) |
| `SEED_SECOND_TENANT_NAME` | `Northwind Logistics` | Second-tenant display name |
| `SEED_SECOND_TENANT_SLUG` | `northwind` | Second-tenant slug |
| `SEED_SECOND_TENANT_EMAIL` | `admin@northwind.test` | Second-tenant administrator |
| `SEED_SECOND_TENANT_PASSWORD` | `Northwind@2026` | Second-tenant password (refused in production) |
| `SEED_STARTER_DATA` | `true` | Set `false` before first boot when importing the archive into an empty tenant |

Web requests use relative `/api` paths by default. Vite proxies them in
development and nginx proxies them in Docker, so the browser never needs an API
host baked into the bundle. A separately hosted static site sets
`VITE_API_URL` at build time to the API origin (for example,
`https://doxin-api.onrender.com`); the Render Blueprint does this
automatically. `VITE_API_URL` must not include a trailing slash or an `/api`
suffix.
