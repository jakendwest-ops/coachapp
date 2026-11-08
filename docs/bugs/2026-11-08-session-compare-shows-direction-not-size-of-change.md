---
id: 2026-11-08-session-compare-shows-direction-not-size-of-change
status: open
priority: medium
reported: 2026-11-08
status_detail: "open - REPORTED by Jake 2026-11-08 on the live v2026.11.2, with a screenshot of the set-by-set comparison (Barbell Military Press: 55x7 @7 RPE vs 70x3 @7 RPE, 57.5x7 @8 RPE vs 57.5x4 with a red down arrow): 'This column should also show what the changes/difference was (eg +/- reps/sets/weight/RPE)'. Today the third column is only an arrow or 'Same' (`_setMark`, js/app-progress.js). Needs the format agreed with Jake (e.g. '+15 kg, -4 reps, RPE =') before any build, including what a set with no partner and a changed set count show."
closing_conditions: "Each compared set shows its weight, reps and RPE difference from last time, and Jake confirms it reads clearly on his phone."
---

# The set-by-set comparison shows which way a set moved, not by how much

The comparison's right-hand column marks each set with an up or down arrow (or "Same"). Jake wants it to say what changed: the
difference in weight, reps and RPE, and a change in the number of sets.

Closes when Jake confirms the change on his phone (see closing_conditions above); a commit message alone never closes it.
