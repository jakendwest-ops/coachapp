---
id: 2026-07-13-the-runner-finish-screen-gets-destroyed-mid-session-losing-t
status: fixed-awaiting-jake
priority: high
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# the runner finish screen gets destroyed mid-session, losing the notes you are typing

**HIGH — the runner finish screen gets destroyed mid-session, losing the notes you are typing.** `showRunnerFinish` (app-runner.js:1381) clears ONLY `_timerInterval`; `_restInterval`, `_intervalInterval`, `_setTimerInterval` and the draft safety-net all keep running. Tick your last set (fires a 90s rest) → tap Finish → ~88s later the rest tick hits 0 and calls `renderRunner()` (:1134), which `innerHTML`-replaces the Workout complete screen with the exercise runner — **discarding the session name and notes mid-typing.** In wizard mode it is worse: `_afterRest` bounces you into the NEXT exercise. Needs the full teardown.
