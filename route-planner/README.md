# Route planner

Lanes, stops, ETAs. Placeholder — no dedicated UI yet.

## Current implementation

None. Routes today are plain `origin → destination` strings in
`src/data/mock.ts` (`Load.origin`, `Load.destination`, `Load.eta`).

## This module owns (going forward)

- Lane model (origin, destination, waypoints)
- Stop sequencing + ETA computation
- Inputs to voice-ai ("customer ETA call") and core-logistics (board grouping)

## Next

Define `Route`, `Stop`, `EtaEstimate` types here first.
Tell me your planner inputs (manual lanes? auto-optimize? maps provider?)
and I'll build it out.
