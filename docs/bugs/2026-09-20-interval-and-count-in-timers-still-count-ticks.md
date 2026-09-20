---
id: 2026-09-20-interval-and-count-in-timers-still-count-ticks
status: open
priority: low
reported: 2026-09-20
status_detail: "open — named, deliberately NOT fixed by R1e (which fixed the REST timer). Latent: unverified on a real phone. Closes on Jake's on-phone observation or a fake-clock test plus catch-up logic."
---

# Interval, interval-phase and count-in timers still count ticks, so a suspended tab freezes them

R1e (2026-09-20) made the **rest** timer count to an end time and added a screen wake lock. Three other live timers in
`js/app-runner.js` still decrement a counter once per interval tick — `_countInRemaining--` (~1326), `_intervalRemaining--`
in `startIntervalTimer` (~1460) and in `startIntervalPhaseTimer` (~1547) — so they have the failure the rest timer had:
if the OS suspends the tab (screen locked, another app in front) they stop counting, and come back late with their
voice cues and finish beep never having fired. (`startStrengthSetTimer` also counts ticks but has no production caller —
[2026-08-29-strength-set-timer-is-dead-code-and-its-test-proves-nothing](2026-08-29-strength-set-timer-is-dead-code-and-its-test-proves-nothing.md);
re-confirmed 2026-09-20 by grep.)

**Why they were left alone.** An interval phase **auto-logs a set when it completes** (`_logIntervalPhase`), so a
suspended tab that wakes 90 s late must decide what happened in the gap — one phase, or several elapsed — before it logs
anything. That is catch-up logic with data consequences, not a one-line change, and it deserves its own red-first spec
rather than riding along in a commit about a wake lock.

**Mitigation already in place.** With the wake lock the screen normally stays on, so the timers keep running in the
common case (phone propped up, workout app in front). It fails only when the user switches to another app — a music or
messaging app is the likely case for cardio and intervals.

**Measured vs guessed.** The code shape is read from source; the on-phone behaviour is **unverified**. Cheapest
evidence: Jake starts an interval workout, switches to another app for ~30 s mid-phase, returns, and reports what the
countdown shows and whether a set was logged.

**Fix shape when it is wanted.** The same end-time derivation as `_restTick` (a 250 ms poll, per-second work only when
the displayed second changes, re-derived on `visibilitychange`), plus an explicit rule for elapsed phases: log the phase
that was running when the tab froze exactly once, and never more than one phase per wake. Tests use Playwright's
`page.clock` (`fastForward` for a suspended tab, `setSystemTime` + a `visibilitychange` for a frozen one), as in
`tests/runner-timers-wakelock-2026-09-20.spec.js`.
