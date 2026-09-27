---
id: 2026-07-13-runner-back-is-a-no-op-during-a-rest-and-edit-double-tap-sil
status: closed
priority: medium
reported: 2026-07-13
status_detail: "CLOSED 2026-09-27 via closure rule (b), neuter-proven that day: tests/runner-edit-set-double-tap-2026-09-27.spec.js, both halves. Edit double-tap: with the overlay guard and mountModal removed it FAILED ('a double tap must leave exactly one edit sheet'). Back during a rest with a queued advance: with the old skipRestTimer()-first code restored it FAILED ('must land on A … stayed on B'). Both green before and after a byte-identical restore. The older ledger-fixes-2026-07-29 Back test was shown NOT to catch the original bug (it never queues an _afterRest)."
---

# runner ← Back is a no-op during a rest, and ✎ Edit double-tap silently saves the OLD values

**MEDIUM — runner ← Back is a no-op during a rest, and ✎ Edit double-tap silently saves the OLD values.** (1) `runnerGoBack` (app-runner.js:1270) calls `skipRestTimer()`, which FIRES the pending `_afterRest` (advancing exIdx forward), then decrements — landing you on the screen you were already on. Must null `_afterRest` first. (2) `editRunnerSet` (:1208) has no re-entrancy guard: a double-tap appends two overlays sharing input ids; you type into the visible one, `saveEditRunnerSet` reads the BURIED one, and the set saves **unchanged with no error**. `showRunnerOneRMSheet:1732` already does `if (existing) existing.remove()` — same two lines.
