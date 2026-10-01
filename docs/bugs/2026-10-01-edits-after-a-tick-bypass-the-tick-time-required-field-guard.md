---
id: 2026-10-01-edits-after-a-tick-bypass-the-tick-time-required-field-guard
status: open
priority: low
reported: 2026-10-01
status_detail: "Found by the multi-agent review of the RPE top-set work (2026-09-30 / 2026-10-01), not reported by Jake. Verified by reading both functions (not run in a browser): toggleTableSet requires weight and reps at tick time, but the live-table re-sync now in _loggedExercises() reads whatever the fields hold at save. Made MORE reachable by the round-2 re-sync; the underlying gap (post-tick edits are unguarded) predates it."
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
