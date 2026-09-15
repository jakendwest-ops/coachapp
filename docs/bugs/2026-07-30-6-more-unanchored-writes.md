---
id: 2026-07-30-6-more-unanchored-writes
status: fixed-awaiting-jake
priority: medium
reported: 2026-07-30
status_detail: "fixed — awaiting Jake"
---

# 6 more unanchored writes

✅ **FIXED 2026-07-30 (round 2) — 6 more unanchored writes.** `toggleExerciseArchived`/`saveEditExercise`/`deleteExercise`/`_rememberExerciseMetricType` (`exercises`, now anchored on `coach_id`) and `deleteEvent`/`deleteGoal` (`events`/`goals`, anchored on `created_by`). A live PT2 probe against the `exercises` writes found RLS was **already blocking these** even before the JS anchor — hardening, not closing an active hole, unlike the CRITICAL row above.
