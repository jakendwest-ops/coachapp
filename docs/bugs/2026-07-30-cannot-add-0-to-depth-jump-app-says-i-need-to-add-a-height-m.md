---
id: 2026-07-30-cannot-add-0-to-depth-jump-app-says-i-need-to-add-a-height-m
status: confirmed
closed_by: "clause (b) — ledger-fixes-2026-07-30.spec.js ran GREEN 2026-08-20 in a serialized 192-test run; red-before is recorded in this file's body. Closed on test evidence, NOT on a Jake confirmation."
priority: high
reported: 2026-07-30
status_detail: "fixed — awaiting Jake"
---

# Cannot add 0 to depth jump (app says I need to add a height measurement)." Same falsy-zero class as the 2026-0

✅ **FIXED + LIVE 2026-07-30 — "Cannot add 0 to depth jump (app says I need to add a height measurement)."** Same falsy-zero class as the 2026-07-29 weight fix, extended to jump height_cm/distance_m: `toggleTableSet`'s `!row.height_cm`/`!row.distance_m` guards, `_syncLoggedSetsFromTable`'s jump branches, `saveRunnerSession`'s height_cm/distance_m writes, and — found via the blast-radius sweep, not reported directly — the identical bug in a sibling function `saveWorkoutSession` (manual "Log Session" modal)'s own separate weight_kg write, `_setDetailsLine`'s (My Progress diary) height_cm display, `fetchRunnerLastSession`'s set filter (see row above — likely the real Depth Jump mechanism), `editRunnerSet`'s weight-edit-overlay pre-fill, `renderLogExercises`'s own weight input re-render (typing 0 then adding another set silently blanked it before save), and `openWorkoutLog`'s past-session weight display. 9 sites total across 3 files. **Deliberately NOT touched**: `fmtDistanceM` (app-workouts.js) has its own `if (!n) return ''` shared with every cardio-distance call site — fixing jump_distance's 0m display fully needs its own scoped pass (see new row below), not folded into tonight's height-focused report. Red→green `tests/ledger-fixes-2026-07-30.spec.js` (8 tests).
