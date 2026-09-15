---
id: 2026-07-23-resolvemetrictype-shared-by-runner-builder-edit-modal-makes-
status: fixed-awaiting-jake
priority: high
reported: 2026-07-23
status_detail: "fixed — awaiting Jake"
---

# resolveMetricType (shared by runner + builder edit-modal) makes the legacy fallback reachable again

✅ **FIXED + LIVE 2026-07-24 (b637e09)** — `_resolveMetricType` (shared by runner + builder edit-modal) makes the legacy fallback reachable again. Red→green test confirms an explicit non-default type is never overridden, and a genuine new set (flags explicitly `false`) stays `weight_reps`. — **Legacy unilateral + timed exercises silently log as plain weight×reps.** `_exMetricType`'s legacy fallback (app-runner.js:271-278) is DEAD CODE: line 40 sets `metricType: ex.metric_type || 'weight_reps'`, always truthy, so the `sets_json[0].unilateral/.timed` fallback never runs. The 07-18 migration deliberately backfilled only cardio+jumps, so every pre-07-18 unilateral/timed exercise has `metric_type='weight_reps'`. A legacy Bulgarian Split Squat logs with **no `side`** → the L/R chart it exists for is permanently empty. A legacy Plank shows a DURATION target but demands REPS to tick. Sibling gap: `showEditTemplateExerciseModal` (app-workouts.js:1644) also ignores the flags, and saving **strips** them.
