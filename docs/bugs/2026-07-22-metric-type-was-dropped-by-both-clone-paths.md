---
id: 2026-07-22-metric-type-was-dropped-by-both-clone-paths
status: confirmed
closed_by: "clause (b) — clone-metric-type.spec.js ran GREEN 2026-08-20 in a serialized 192-test run; red-before is recorded in this file's body. Closed on test evidence, NOT on a Jake confirmation."
priority: high
reported: 2026-07-22
status_detail: "fixed — awaiting Jake"
---

# metric_type was dropped by BOTH clone paths

**`metric_type` was dropped by BOTH clone paths — every assigned plan lost its shape routing.** Found by the review 2026-07-22, **fixed same session**. `_cloneTemplateForClient` (runs on every program assignment, incl. solo self-assign) and `_cloneSharedMasterTemplate` (fork-on-edit) copied `sets_json` but not `metric_type`, so `_exMetricType` fell back to `weight_reps` on the assigned copy: jump/timed/unilateral/cardio routing silently disabled for the person actually training, while the coach's master looked correct. Pre-existing since metric_type shipped 2026-07-19; this session's jump targets were the first feature to depend on it. Feeding selects all use `workout_template_exercises(*)`, so only the INSERTs were at fault. Red→green test: `tests/clone-metric-type.spec.js`.
