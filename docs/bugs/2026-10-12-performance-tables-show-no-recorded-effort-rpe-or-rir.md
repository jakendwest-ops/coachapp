---
id: 2026-10-12-performance-tables-show-no-recorded-effort-rpe-or-rir
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-12
status_detail: "FIXED 2026-10-12 on master, unreleased (app-progress v79); awaiting Jake's look on a phone. Per session and Per exercise now print each set's effort (@7 RPE, @0 RIR) through the Stats sheet's own formatter, and the Per session query selects the effort columns. Red before, green after: tests/performance-effort-2026-10-12.spec.js (the Per session test answers the read like PostgREST, with only the columns asked for). Per program shows block totals, not sets, so it has no set line to carry effort: a question for Jake, below."
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

## Questions for Jake

1. **Per program** draws block totals and comparisons, never individual sets, so there is no set line to hang an effort on. Do you want an average effort per block there, or is Per exercise and Per session enough?
2. **Old data:** sets logged before the effort scale existed have an effort but no RPE/RIR type. The Stats sheet and these tables show nothing for them (RPE and RIR run in opposite directions, so guessing could invert it), while the runner's last-session table reads them as RPE. Leave them blank, or show them as RPE?
