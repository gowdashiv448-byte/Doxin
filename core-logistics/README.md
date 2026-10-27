# Core logistics

Loads + sheet ingest + load board. The dispatcher source of truth.

## Current implementation (in main app)

- `src/data/mock.ts` — `Load`, `loads` seed (DX-2601…DX-2608)
- `src/components/ops.tsx` — `LoadBoard` (filter + search + trigger)
- `src/app/(app)/app/loads/page.tsx` — full board
- `src/app/(app)/app/sheet/page.tsx` — Excel/CSV upload + Google Sheet link
- `src/app/(app)/layout.tsx` + `src/components/chrome.tsx` — ops console shell

## Load statuses

`pending` · `in_transit` · `delivered` · `exception`

## Expected sheet columns

`load_id, origin, destination, driver_phone, customer_phone, eta, items`
Auto-map: `driver_phone → AI check-call`, `customer_phone → AI ETA call`.

## This module owns

- Load model + board filtering/search
- Sheet normalize + preview + confirm-to-board
- Future backend: `POST /api/sheets/ingest`
