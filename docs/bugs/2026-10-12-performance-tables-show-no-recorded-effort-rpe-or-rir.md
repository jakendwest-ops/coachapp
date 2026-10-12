---
id: 2026-10-12-performance-tables-show-no-recorded-effort-rpe-or-rir
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-12
status_detail: "FIXED 2026-10-12 on master, unreleased (app-progress v79); awaiting Jake's look on a phone. Per session and Per exercise print each set's effort (@7 RPE, @0 RIR) through the Stats sheet's formatter and the Per session query selects the effort columns; Per program shows each block's average effort (Jake: 'include per block'); a set with no effort scale (logged before it existed) is shown as RPE (Jake: 'show them as RPE'). Red before, green after: tests/performance-effort-2026-10-12.spec.js, tests-node/exercise-stats.test.mjs."
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

## Built (Jake approved 'Item 2' on 2026-10-12)

- `_setDetailsLine` (split into `_setDetailOf` plus a wrapper) appends `_xsEffortText(x)`; consecutive sets collapse only when their effort is also the same.
- A stored effort that is not a number says nothing (never "@NaN RPE"), and the Per session set line is escaped like its sibling (review).

## Decisions (Jake, 2026-10-12)

1. **Per program:** "include per block". Each block's window of the chosen exercise now shows "Average effort @7.5 RPE · 2 sets" under its first-to-last line. An RIR is converted (RPE = 10 - RIR) and the line says so; a block whose sets have no effort shows no line.
2. **Old data:** "show them as RPE". A set with an effort but no scale is now shown as RPE everywhere the Stats formatter is used (the tables, the Stats sheet, the Last time strip, the Stats card). An unknown scale value still says nothing.

Not changed: the 1RM estimate still ignores an effort with no scale (RPE and RIR run in opposite directions, and changing an estimate is not what he asked), so a legacy set can show "@8 RPE" without the note "(effort counted)".

## Review follow-ups (2026-10-12)

- The effort scale is 0 to 10 (`_effortOrNull`'s range): a stored value outside it, or one that is not a number, says nothing per set and is left out of the block average (a hand-written 88 skewed the average and 1e308 overflowed the sum).
- "No scale" now means a **NULL** type only. An effort whose type column was not even selected is `undefined`, and reading that as RPE would invert an RIR.
- The 1RM estimate still ignores a type-less effort (see above), and its comment now says so.
