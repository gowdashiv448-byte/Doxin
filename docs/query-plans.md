# Tenant-index query plan comparison

This note records the before/after query-plan check for the three highest-volume
tenant-owned tables: `loads`, `fuel_purchases` and `delivery_events`.

The plans were captured with `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` against
the local development database after migrations `005`-`007` and the demo seed. The
default tenant is `00000000-0000-0000-0000-000000000001`.

## Methodology

- **Before (old index shape + RLS):** inside a transaction, the tenant-leading
  indexes were replaced with the pre-multi-tenancy index shapes
  (`loads(load_date DESC)`, `fuel_purchases(truck_id, purchase_date DESC)`,
  `delivery_events(load_id)`), then the queries ran as `doxin_app` with
  `app.current_tenant` set to the default tenant. This isolates the index-shape
  change while keeping forced RLS in place.
- **After (tenant-leading indexes + RLS):** the same queries ran as
  `doxin_app` with the current indexes, where every tenant index starts with
  `tenant_id`.
- **No-index fallback:** the tenant-leading indexes were dropped inside a
  transaction to show what the planner does without them. This is a fallback
  measurement, not the pre-migration schema.
- All "before" index changes were rolled back; the database was not modified.

## Summary

| Query | Before: old index shape + RLS | After: tenant-leading index + RLS | No-index fallback |
| --- | --- | --- | --- |
| `loads` by recent `load_date`, 50-row limit | `Index Scan using loads_date_idx`; `Filter: tenant_id = ...`; 25 shared buffers; 0.110 ms | `Index Scan using loads_date_idx`; `Index Cond: tenant_id = ... AND load_date >= ...`; 22 shared buffers; 0.238 ms | `Parallel Seq Scan`; 3,393 shared buffers; 27.227 ms |
| `fuel_purchases` by `truck_id`, 50-row limit | `Index Scan using fuel_truck_idx`; `Index Cond: truck_id = ...`; `Filter: tenant_id = ...`; 50 hit + 3 read; 0.396 ms | `Index Scan using fuel_truck_idx`; `Index Cond: tenant_id = ... AND truck_id = ...`; 53 shared hit; 0.682 ms | `Parallel Seq Scan`; 3,834 hit + 3,349 read; 40.577 ms |
| `delivery_events` by `load_id`, 50-row limit | `Index Scan using delivery_events_load_idx`; `Index Cond: load_id = ...`; `Filter: tenant_id = ...`; 2 hit + 3 read; 0.187 ms | `Index Scan using delivery_events_load_idx`; `Index Cond: tenant_id = ... AND load_id = ...`; 8 shared hit; 0.191 ms | `Parallel Seq Scan`; 3,083 hit + 3,022 read; 40.026 ms |

Timings are single local runs and should be treated as directional. The stable
signal is the plan shape: after the migration, `tenant_id` is part of the index
condition instead of a post-index filter, and the no-index fallback is a
multi-thousand-buffer parallel sequential scan.

## Representative plan excerpts

### `loads` — after

```text
Limit  (cost=0.31..91.77 rows=50 width=26) (actual time=0.059..0.156 rows=20 loops=1)
  Buffers: shared hit=22
  ->  Index Scan using loads_date_idx on loads
        (cost=0.31..208.84 rows=114 width=26) (actual time=0.057..0.151 rows=20 loops=1)
        Index Cond: ((tenant_id = (NULLIF(current_setting('app.current_tenant'::text, true), ''::text))::uuid)
                     AND (load_date >= (CURRENT_DATE - 30)))
        Buffers: shared hit=22
Execution Time: 0.238 ms
```

### `fuel_purchases` — after

```text
Limit  (cost=0.43..80.59 rows=50 width=27) (actual time=0.068..0.598 rows=50 loops=1)
  Buffers: shared hit=53
  ->  Index Scan using fuel_truck_idx on fuel_purchases
        (cost=0.43..3621.92 rows=2259 width=27) (actual time=0.066..0.585 rows=50 loops=1)
        Index Cond: ((tenant_id = (NULLIF(current_setting('app.current_tenant'::text, true), ''::text))::uuid)
                     AND (truck_id = 'TRK00001'::text))
        Buffers: shared hit=53
Execution Time: 0.682 ms
```

### `delivery_events` — after

```text
Limit  (cost=10.23..10.23 rows=2 width=41) (actual time=0.133..0.135 rows=2 loops=1)
  Buffers: shared hit=8
  ->  Sort  (cost=10.23..10.23 rows=2 width=41) (actual time=0.132..0.133 rows=2 loops=1)
        Sort Key: actual_datetime DESC
        ->  Index Scan using delivery_events_load_idx on delivery_events
              (cost=0.43..10.22 rows=2 width=41) (actual time=0.061..0.069 rows=2 loops=1)
              Index Cond: ((tenant_id = (NULLIF(current_setting('app.current_tenant'::text, true), ''::text))::uuid)
                           AND (load_id = 'LOAD90085452'::text))
              Buffers: shared hit=5
Execution Time: 0.191 ms
```

## Raw plans

- [Old index shape, RLS enabled](query-plans/before-old-indexes-rls.txt)
- [Old index shape, no RLS](query-plans/before-old-indexes-no-rls.txt)
- [Tenant-leading indexes, RLS enabled](query-plans/after-tenant-indexes-rls.txt)
- [No tenant indexes, RLS enabled](query-plans/no-index-fallback.txt)

## Slower queries and caveats

- The post-migration plans still use index scans for these access patterns.
  There is no broad sequential-scan regression in the compared queries.
- RLS adds a `tenant_id` predicate to every tenant query. When the predicate is
  in the index condition it is effectively free at this data volume; the
  single-run fuel timing was noisy (roughly 0.4 ms before versus 0.7 ms after),
  but both plans touch tens of buffers, not thousands.
- Queries that filter on a column that is not covered by a tenant-leading
  composite index may still fall back to a sequential scan or a bitmap scan.
  New high-volume access paths should add an index beginning with
  `(tenant_id, <filter/order columns>)`.
- Broad date ranges and low-selectivity filters can make the planner prefer a
  sequential scan even with the tenant indexes. That is expected; the tenant
  predicate still constrains rows and the index remains available for selective
  queries.
- The before/after numbers include integration-test rows in non-default
  tenants. The RLS-enabled plans return only the default tenant's rows; the
  old-shape plans may inspect other tenants before filtering them out.
