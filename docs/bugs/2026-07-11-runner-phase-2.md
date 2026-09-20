---
id: 2026-07-11-runner-phase-2
status: deferred
priority: medium
reported: 2026-07-11
status_detail: "deferred (Jake)"
---

# Runner Phase 2

**Runner Phase 2 — timed/unilateral/cardio** still use the old wizard; only %1RM was brought into the strength table. Jake's cardio-runner screenshot ("cardio runner needs the same UI as strength runner") folds into this — one item, not two. Not scoped.

---

## 2026-09-20 — status note (Jake's `deferred` is unchanged)

Read from the code and specs, not by running the app: the first sentence above is out of date. Every non-cardio
exercise now logs through the fast table (`_isPlainStrengthExercise`, `js/app-runner.js`) — unilateral,
timed-hold, jump-height/-distance and %1RM included, each with its own spec. Only cardio and intervals keep the
one-set-at-a-time flow. What is left of this row is the cardio-runner screenshot ask, which is a design question
for Jake (R5c in the [release plans](../superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md)).
