---
id: 2026-07-30-6-more-unanchored-writes
status: closed
priority: medium
reported: 2026-07-30
status_detail: "CLOSED 2026-09-27 via closure rule (b), neuter-proven that day: tests/write-ownership-anchors-2026-09-27.spec.js asserts every exercises/events/goals write in the six functions carries its coach_id / created_by anchor; removing the anchor from deleteExercise and from deleteGoal each FAILED it naming the write; green after a byte-identical restore. A behavioural probe cannot go red here (RLS already refused these writes on 2026-07-30), so the source-level pin is the proof."
---

# 6 more unanchored writes

✅ **FIXED 2026-07-30 (round 2) — 6 more unanchored writes.** `toggleExerciseArchived`/`saveEditExercise`/`deleteExercise`/`_rememberExerciseMetricType` (`exercises`, now anchored on `coach_id`) and `deleteEvent`/`deleteGoal` (`events`/`goals`, anchored on `created_by`). A live PT2 probe against the `exercises` writes found RLS was **already blocking these** even before the JS anchor — hardening, not closing an active hole, unlike the CRITICAL row above.
