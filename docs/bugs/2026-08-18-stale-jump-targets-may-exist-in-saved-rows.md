---
id: 2026-08-18-stale-jump-targets-may-exist-in-saved-rows
status: open
priority: low
reported: 2026-08-18
status_detail: "Raised by the review of commit 53071cf. Jake ran the inspect query 2026-08-18 and replied 'success' — the ROW COUNT was not captured, so whether any bad rows exist is still unknown."
---

# Rows saved before 53071cf may carry a jump target on a non-jump exercise

`_cleanTemplateSets` now gates `targetHeightCm`/`targetDistanceM` on `metric_type` (commit `53071cf`), but
that only cleans a row when someone **edits and saves it**. Rows already on disk keep mis-rendering:
`_fmtSetDetail` (`js/app-workouts.js:290`) decides "this is a jump" from the set DATA, so a stale height
makes a barbell lift read as *"40cm · 8-10 jumps"* on the plan-preview surfaces while the runner shows
weight x reps.

Two things widen it:
- The **ADD** path was ungated too before `53071cf`, so this data is older than the edit-path bug and all
  three writers could produce it.
- `generatePhasePeriodization` (`js/app-programs.js:1687`) copies `sets` forward **without cleaning**, so an
  infected week 1 propagates the stale target into every generated week.

## Status

Jake ran the inspect query on 2026-08-18 and replied "success", but the returned rows were not captured —
so it is **unknown whether any bad rows actually exist**. Re-run and read the count before deciding:

```sql
select id, template_id, exercise_name, metric_type, sets_json
from workout_template_exercises
where metric_type not in ('jump_height','jump_distance')
  and sets_json::text ~ '"target(HeightCm|DistanceM)":\s*"?[0-9]';
```

**Closes when:** the query returns zero rows, or a repair is applied to the specific ids it returns. Do NOT
write a blanket UPDATE — per the fix-forward default, target known ids only.
