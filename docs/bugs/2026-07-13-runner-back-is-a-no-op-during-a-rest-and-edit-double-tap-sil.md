---
id: 2026-07-13-runner-back-is-a-no-op-during-a-rest-and-edit-double-tap-sil
status: fixed-awaiting-jake
priority: medium
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# runner ← Back is a no-op during a rest, and ✎ Edit double-tap silently saves the OLD values

**MEDIUM — runner ← Back is a no-op during a rest, and ✎ Edit double-tap silently saves the OLD values.** (1) `runnerGoBack` (app-runner.js:1270) calls `skipRestTimer()`, which FIRES the pending `_afterRest` (advancing exIdx forward), then decrements — landing you on the screen you were already on. Must null `_afterRest` first. (2) `editRunnerSet` (:1208) has no re-entrancy guard: a double-tap appends two overlays sharing input ids; you type into the visible one, `saveEditRunnerSet` reads the BURIED one, and the set saves **unchanged with no error**. `showRunnerOneRMSheet:1732` already does `if (existing) existing.remove()` — same two lines.
