# Voice AI

AI check-calls to drivers + customers with transcript proof.

## Current implementation (in main app)

- `src/components/ops.tsx` — `CallPanel`, `TriggerCallButton`
- `src/app/(app)/app/calls/page.tsx` — call log list
- `src/data/mock.ts` — `CallLog`, `calls` seed (C-891…C-895)

## Call types

- `driver_check` — pickup confirmations, en-route checks
- `customer_eta` — proactive ETA updates
- `pod_followup` — POD chase

Languages: Hindi, English, Tamil + 12 more. Auto-retry on no-answer
(simulated with `setTimeout` in `CallPanel.simulateBulk`).

## This module owns

- Call queue, trigger, retry policy
- Transcripts + summaries + proof log
- Future backend: `POST /api/calls/trigger`, `GET /api/calls/:id/transcript`

## Next

Move `CallLog` / call helpers from `src/data/mock.ts` here.
Tell me the voice provider + languages priority and I'll wire it.
