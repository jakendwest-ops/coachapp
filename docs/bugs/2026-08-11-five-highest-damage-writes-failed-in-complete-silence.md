---
id: 2026-08-11-five-highest-damage-writes-failed-in-complete-silence
status: closed
priority: high
reported: 2026-08-11
closed_by: tests/silent-write-failures-2026-08-11.spec.js
status_detail: "CLOSED 2026-09-15 via closure rule (b): tests/silent-write-failures-2026-08-11.spec.js's header comment enumerates all 5 named functions verbatim and its tests exercise them (including _cloneTemplateForClient's empty-workout-on-failed-insert case). Matches the row's own 'Pinned by' citation."
---

# The five highest-damage writes failed in complete silence

A scan found 21 writes whose error was never inspected. Most are cleanup deletes whose worst case is
an orphan row. Five were different — a failure LOSES or CORRUPTS data while the UI reports success:

1. `_cloneTemplateForClient` — a failed exercise insert returned a valid id for an EMPTY workout.
2. `generatePhasePeriodization` — same shape, across every generated week at once.
3. `duplicatePhaseWeek` — master week saved, client copies didn't, coach told it worked.
4. `deletePhaseWeek` — a 4-step renumber with no transaction; partial failure left duplicated or
   missing week numbers across two tables and still said "Week deleted".
5. `moveTemplateExercise` / `_propagateExerciseChangeToTemplates` — a half-applied SWAP leaves two
   exercises sharing an order_index; propagation reached only some assigned copies, silently.

**16 unchecked writes remain**, deliberately — cleanup deletes, plus `starter-content`'s
`starter_seeded` flag (a failure there re-seeds ~40 exercises on next login). Worth a follow-up pass.

Fixed `d4b2689`, with review follow-ups in `730c03f` and `c4e7ecb`. Pinned by
`tests/silent-write-failures-2026-08-11.spec.js` (3 tests).
