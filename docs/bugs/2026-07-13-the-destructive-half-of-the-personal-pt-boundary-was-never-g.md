---
id: 2026-07-13-the-destructive-half-of-the-personal-pt-boundary-was-never-g
status: fixed-awaiting-jake
priority: high
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# the destructive half of the Personal/PT boundary was never guarded

**HIGH — the destructive half of the Personal/PT boundary was never guarded.** `_propagationTargets()` was wired into the two ADDITIVE paths (generatePhasePeriodization :1425, duplicatePhaseWeek :1630) but NOT into either DESTRUCTIVE one (`_cleanupPhaseWeeksBeyond` :1489-1494, `deletePhaseWeek` :1674-1678). Today the program-list `is_personal` filter mostly hides this — but the stale-context bug above defeats that filter. **4th instance of fix-the-class-not-the-instance.** Put the guard in the shared helper.
