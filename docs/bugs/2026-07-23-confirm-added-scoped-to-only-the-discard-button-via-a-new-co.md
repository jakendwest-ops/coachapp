---
id: 2026-07-23-confirm-added-scoped-to-only-the-discard-button-via-a-new-co
status: fixed-awaiting-jake
priority: high
reported: 2026-07-23
status_detail: "fixed — awaiting Jake"
---

# confirm added, scoped to ONLY the Discard button via a new confirmDiscardRunner() wrapper; discardRunner() its

✅ **FIXED + LIVE 2026-07-24 (b637e09)** — confirm added, scoped to ONLY the Discard button via a new `confirmDiscardRunner()` wrapper; `discardRunner()` itself stays silent for its other 2 callers (empty-session end, post-save cleanup — both have nothing to lose, confirming there would be actively wrong). An earlier version of this fix put the confirm in the shared teardown and broke both other callers — caught by the full suite, not by my own new test. — **Discard destroys a whole session with no confirm, beside Save.** app-runner.js:1690 → `discardRunner` (:1733) removes the DOM, clears the intervals AND `_clearRunnerDraft` — the localStorage safety net goes too. No undo. Every other destructive path in these 3 files gates on `confirm()` (deleteWorkoutLog, deleteTemplate, deleteExercise, delete1RM, deleteWeightLog, deletePerfLog).
