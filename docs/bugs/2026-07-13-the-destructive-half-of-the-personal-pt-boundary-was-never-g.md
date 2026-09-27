---
id: 2026-07-13-the-destructive-half-of-the-personal-pt-boundary-was-never-g
status: closed
priority: high
reported: 2026-07-13
status_detail: "CLOSED 2026-09-27 via closure rule (b), neuter-proven that day: tests/personal-view-delete-boundary-2026-09-27.spec.js drives _deleteClientCopiesForSlots from Personal view against a programme a real (fixture) client is assigned to; it passed on current code, FAILED with the _propagationTargets filter removed ('the real client's week copy must survive'), and passed again after a byte-identical restore."
---

# the destructive half of the Personal/PT boundary was never guarded

**HIGH — the destructive half of the Personal/PT boundary was never guarded.** `_propagationTargets()` was wired into the two ADDITIVE paths (generatePhasePeriodization :1425, duplicatePhaseWeek :1630) but NOT into either DESTRUCTIVE one (`_cleanupPhaseWeeksBeyond` :1489-1494, `deletePhaseWeek` :1674-1678). Today the program-list `is_personal` filter mostly hides this — but the stale-context bug above defeats that filter. **4th instance of fix-the-class-not-the-instance.** Put the guard in the shared helper.
