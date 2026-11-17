---
id: 2026-11-17-copy-sync-writes-rely-on-rls-alone
status: open
priority: low
reported: 2026-11-17
status_detail: "Not fixed. Hardening: RLS already refuses foreign writes (live probe 2026-08-01, comment at app-workouts.js:5258)."
---

# Three copy-sync write paths have no app-side ownership filter

`_propagateExerciseChangeToTemplates` (:4298-4321), `_propagateReorderToTemplates` (:4847) and `_replaceWholeWorkoutInTemplates` (:4936-4952) in `js/app-workouts.js` write `workout_template_exercises` keyed only by `template_id`; the fourth sibling `_propagateRenameToTemplates` (:4752) first filters targets by `coach_id`.

Found by the full-file multi-agent-review of app-progress, app-workouts and app-dashboard, 2026-11-17; the cited lines were re-read by the verifier.

**Closes when:** all four paths filter targets through `workout_templates ... eq(coach_id).in(id)` before writing, with a node or spec test of the filter.
