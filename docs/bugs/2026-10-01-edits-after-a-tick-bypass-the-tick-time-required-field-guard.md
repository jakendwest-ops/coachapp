---
id: 2026-10-01-edits-after-a-tick-bypass-the-tick-time-required-field-guard
status: closed
priority: low
reported: 2026-10-01
status_detail: "FIXED 2026-10-01 with a decision made by Claude and FLAGGED FOR JAKE: a ticked row that no longer satisfies the tick-time rule is not a logged set; it is left out of loggedSets (so the finish screen and the save agree) and un-ticked (so the table stops claiming it is done). One predicate, _rowIncompleteReason, now serves the tick and the read-back. Tests that ran RED on the old code and GREEN on the new: tests-node/ticked-row-edit.test.mjs (6 of 9 RED before, 9/9 after) and tests/runner-edit-delete-2026-10-01.spec.js (a half-cleared set was stored as a second row; now exactly one set). CONFIRMED BY JAKE 2026-10-01 (option B): drop it, AND SAY SO — the finish screen shows a notice (#wr-dropped-note) and Save shows a toast, so the loss is never silent; tests: tests-node/ticked-row-edit.test.mjs (_droppedTickedCount) and tests/runner-edit-delete-2026-10-01.spec.js (the notice appears; the three role journeys assert it does NOT appear on a complete session). Not Jake-reported."
closing_conditions: "A test that ticks a set, then clears its reps (and separately its weight), saves, and asserts what is stored, RED before and GREEN after a decided behaviour: either refuse/untick a row that no longer satisfies the tick-time rule, or drop it from loggedSets so the finish screen and the save agree."
---

# Clearing a ticked set's reps or weight saves a partial row, or a row the finish screen counted but the save dropped

**Closes when:** A test that ticks a set, then clears its reps (and separately its weight), saves, and asserts what is stored, RED before and GREEN after a decided behaviour: either refuse/untick a row that no longer satisfies the tick-time rule, or drop it from loggedSets so the finish screen and the save agree.

`toggleTableSet` refuses to tick a weight/reps row without both values. Editing a ticked row afterwards is
unguarded. Before round 2 that was invisible, because `loggedSets` was a snapshot taken at tick time (and
the correction was silently lost — the displayed-value-is-not-the-stored-value problem). Now the screen is
the source of truth, which is right for a correction but means a CLEARED field is saved as cleared:

- reps cleared, weight kept -> saved with `weight_kg` and no `reps_achieved`;
- weight AND reps cleared, effort kept -> the row has `effort_type`/`effort_value`, so it survives the
  `Object.keys(row).length > 2` "carries real data" filter and saves as an effort-only junk row;
- both cleared and no effort -> the finish screen counts the set, the save drops it.

All need a deliberate clear on an already-ticked row, so this is rare. It needs a DECISION (refuse, untick,
or drop) rather than a guess, which is why it is a row and not a patch.

## Fixed 2026-10-01

The ledger wanted a decision (refuse, untick, or drop) rather than a guess. Chosen: **drop and untick at read-back**.
Refusing at the edit would need a re-render per keystroke, which tore the table out from under taps in round 1; dropping at
read-back keeps the finish screen and the save identical by construction. The un-tick is visible the next time the table is
drawn. Cost: a lifter who clears a ticked set's reps and then finishes loses that set from the session. Jake chose to keep that
and ADD A WARNING (2026-10-01): a notice on the finish screen and a toast on Save, driven by a per-row `_dropped` flag that the
read-back sets and a deliberate re-tick clears.
