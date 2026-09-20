---
id: 2026-09-20-nine-save-functions-read-form-values-after-an-awaited-ownership-check
status: open
priority: low
reported: 2026-09-20
status_detail: "open — a CLASS found by the R1a review (all three angles flagged it in the new saveNewTemplate guard, which was fixed). Nine pre-existing sites across four modules named, not fixed. Fail-safe today: a throw before the write, plus a stray error report."
---

# Nine save functions read form values AFTER an awaited ownership check

Found 2026-09-20 by the `multi-agent-review` of the `saveNewTemplate` fix: adding an awaited ownership guard put two
network round-trips between reading `name` and reading `#ct-desc`. If the user presses Cancel / ✕ or navigates inside
that window, the modal is removed, `document.getElementById('ct-desc')` is `null`, and `.value` throws a `TypeError`
**after the check passed and before the write** — nothing is saved, but the rejection escapes to the global handler
and is reported to the owner as an error for a user who simply cancelled. `saveNewTemplate` was fixed (values are now
snapshotted before the first await, like `name`); the same shape already existed elsewhere.

**Measured** with a read-only scan (a scratch script; not committed): of 176 top-level `async function`s in `js/`,
these 9 `await _verify…()` and then read `document.getElementById(...).value` later in the same function:

| Function | Where | DOM reads after the check |
|---|---|---|
| `saveNewGoal` | `js/app-calendar-goals.js:680` | 8 |
| `saveCheckIn` | `js/app-calendar-goals.js:1007` | 2 |
| `savePeriodizationConfig` | `js/app-programs.js:1799` | 6 |
| `saveOneRMGrid` | `js/app-progress.js:36` | 1 |
| `save1RM` | `js/app-progress.js:395` | 4 |
| `savePerformanceLog` | `js/app-progress.js:722` | 6 |
| `saveWeightLog` | `js/app-progress.js:1040` | 4 |
| `saveWeightGoals` | `js/app-progress.js:1068` | 2 |
| `saveWorkoutSession` | `js/app-runner.js:3073` | 3 |

The scan is a heuristic (it matches the text `await _verify…(` and `getElementById(...).value` inside one function), so
it may miss variants and could over-count a read that happens to be safe; treat the list as a starting point.

**Contrast that already does it right:** `savePhase` (`js/app-programs.js`) snapshots its DOM values before the guard.

**Fix shape:** snapshot every form value at the top, next to the existing first read, before the first `await` — the
same one-line-per-field change made in `saveNewTemplate`. A test per function (open the modal, press save, remove the
modal mid-flight, assert no unhandled rejection) or, cheaper, one shared spec that drives a handful of them.

**Not fixed in R1a:** pre-existing, four modules, each a separate cache-busted commit; it would have widened an
ownership commit well past its ledger row.
