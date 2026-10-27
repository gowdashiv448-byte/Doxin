# Supply chain management

Fleet overview + exceptions. "You handle 5, not 60."

## Current implementation (in main app)

- `src/app/(app)/app/page.tsx` — dashboard composition (`KpiStrip` + `LoadBoard` + `CallPanel`)
- `src/components/ops.tsx` — `KpiStrip`
- `src/data/mock.ts` — `kpis`

## This module owns

- KPI definitions (today's loads, on-time rate, AI calls done, needs attention)
- Exception surfacing (2 exceptions · 3 failed calls pattern)
- Future: multi-hub rollups, SLA tracking

## Next

Move `kpis` + KPI logic from `src/data/mock.ts` here and re-export.
Backend: aggregation queries over loads + calls.
