---
id: 2026-08-29-strength-set-timer-is-dead-code-and-its-test-proves-nothing
status: open
priority: medium
reported: 2026-08-29
status_detail: "startStrengthSetTimer + renderStrengthSetTimer (~70 lines) have zero production callers; the only invocation in the repo is a test calling it directly. Its prefill target #wr-duration-input exists nowhere. Two consequences: a green test asserting a teardown on a path no user can reach, and a silently lost affordance - timed_hold used to get a fullscreen countdown with voice cues and now gets a bare mm:ss text box while the prescription still shows."
---

# The strength set timer is dead code, and the only thing exercising it is a test

**js/app-runner.js:1110-1186** — found by the weekly full-file review (Agent C).

Zero production callers repo-wide. The only invocation is
`tests/weekly-review-2026-08-09.spec.js:23`, which calls `startStrengthSetTimer()` **directly** in order
to assert `discardRunner` clears `_setTimerInterval`. `renderStrengthSetTimer` is called only from inside
it. Its prefill target `#wr-duration-input` (`:1134`) exists nowhere in the codebase. Its start path died
with the wizard on 2026-08-11.

**Two consequences that must be separated, because they pull in opposite directions:**

1. **A green test proving nothing.** No user can reach the state it asserts. This is the
   [[feedback_reports_success_doing_nothing]] shape exactly — a check that passes on a path that cannot
   occur. Note the irony: the 2026-08-09 review had just *added* that `clearInterval` for this timer.
2. **A real dropped affordance.** A `timed_hold` exercise used to get a fullscreen ring countdown with
   voice cues at 10s and 3-2-1, a completion beep, and an auto-filled duration. In the table it is now a
   bare mm:ss box the athlete types by hand (`renderStrengthTable:706`). **The prescription still shows**
   — `_buildTargetCols:508-510` still pushes a DURATION column — so the loss is silent: the target is on
   screen with nothing to run it. Same shape as
   [[feedback_removing_container_drops_affordances]].

**This needs a decision from Jake, not a cleanup.** Either:
- wire a "Start hold" control on the `timed_hold` table row back to `startStrengthSetTimer` (and fix
  `#wr-duration-input` to target the row's duration cell), or
- delete both functions, the `_setTimerInterval` clears in `discardRunner`/`showRunnerFinish`/
  `stopStrengthSetTimer`, and rewrite that spec against a live timer.

**Closes when:** the decision is made and recorded, and either (a) a spec drives the hold timer through a
real user path, or (b) the functions and their now-pointless teardown are gone and
`weekly-review-2026-08-09.spec.js` no longer calls an unreachable function.
