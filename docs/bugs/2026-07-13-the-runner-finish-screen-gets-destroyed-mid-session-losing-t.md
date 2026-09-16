---
id: 2026-07-13-the-runner-finish-screen-gets-destroyed-mid-session-losing-t
status: fixed-awaiting-jake
priority: high
reported: 2026-07-13
status_detail: "NOT closed — flagging an anomaly found 2026-09-15. This row had 'fixed — awaiting Jake' with ZERO fix description in the body, which is its own small instance of the ledger-status-drift class (a fact recorded in the status field with nothing backing it in the text). Checked the live code directly: js/app-runner.js:2189-2214's showRunnerFinish() already does the exact full teardown this row describes (clears _afterRest, _timerInterval, _restInterval, stopRunnerCountIn/stopIntervalTimer/stopStrengthSetTimer, _stopRunnerDraftSafetyNet, removes the rest-timer-overlay node) — its own comment narrates the old bug in the past tense, matching this row almost verbatim. The closure-candidates check's cited spec (set-count-agreement-2026-08-11.spec.js) is a false positive: it calls showRunnerFinish but tests an unrelated set-numbering bug, not this one. No dedicated test asserts the full teardown, so this is NOT closed on rule (b) — the code fix is real but unproven by a spec. Left fixed-awaiting-jake; worth either a quick manual re-test or a dedicated regression test before treating this as done."
---

# the runner finish screen gets destroyed mid-session, losing the notes you are typing

**HIGH — the runner finish screen gets destroyed mid-session, losing the notes you are typing.** `showRunnerFinish` (app-runner.js:1381) clears ONLY `_timerInterval`; `_restInterval`, `_intervalInterval`, `_setTimerInterval` and the draft safety-net all keep running. Tick your last set (fires a 90s rest) → tap Finish → ~88s later the rest tick hits 0 and calls `renderRunner()` (:1134), which `innerHTML`-replaces the Workout complete screen with the exercise runner — **discarding the session name and notes mid-typing.** In wizard mode it is worse: `_afterRest` bounces you into the NEXT exercise. Needs the full teardown.
