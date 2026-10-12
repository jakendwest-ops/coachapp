---
id: 2026-10-12-performance-tables-show-no-recorded-effort-rpe-or-rir
status: open
priority: medium
reported: 2026-10-12
status_detail: "OPEN. Reported by Jake 2026-10-12. Cause found in the code: the Performance tab never shows a set's effort (Per session does not even fetch it; Per exercise fetches it and drops it). The shared Stats card already formats it. Fix is small but nothing is built yet; awaiting Jake's go."
---

# None of the Progress > Performance tables show recorded effort (RPE or RIR)

## Jake's report (verbatim, 2026-10-12)

> 2. None of the performance tables show recorded effort (rpe or rir).

Attached: Progress > Performance > Per session ("Barbell Military Press ... 62.5x4, 65x4, 62.4x4", no effort), and the Stats sheet, which does show it ("62.5x4 @7 · 65x4 @8", "82.5x6 @0 RIR").

## What the code does (`js/app-progress.js`)

- `renderProgressPerSession` selects `workout_log_sets(weight_kg, reps_achieved, ..., phase)` (line 1664): `effort_type` and `effort_value` are not even requested.
- `_EXERCISE_HISTORY_SELECT` (line 2480, Per exercise) does request them, but the line is built by `_setDetailsLine` (1569) and `_collapsedSetLine` (1598), which never print effort.
- The Stats card formats effort with `_xsEffortText` (2831): "@7" for RPE and "@2 RIR" for RIR. Reusing it is the natural fix.
- Per program and the diary use the same helpers; every query that feeds `_setDetailsLine` needs the two columns (fix the class, not one tab).

## What would close it

**Closes when** every Performance table (Per exercise, Per session, Per program) prints a set's effort as the Stats card does, a spec fails without it, and Jake confirms on his phone.
