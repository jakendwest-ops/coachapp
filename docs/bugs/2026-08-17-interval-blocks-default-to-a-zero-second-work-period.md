---
id: 2026-08-17-interval-blocks-default-to-a-zero-second-work-period
status: closed
priority: medium
reported: 2026-08-17
status_detail: "CLOSED 2026-09-27 via closure rule (b): commit 9510af2 records 'Verified red-before by reverting each half' for tests/interval-defaults-2026-08-19.spec.js; green in the v2026.09.8 full-suite run."
---

# Editing a saved exercise into Intervals gives a 0-second work block — 'Start timer' ends the workout instantly

`js/app-workouts.js:1530-1533`:

```js
window._templateSets = [{ countdownSecs: b.countdownSecs ?? 5, ..., workSecs: b.workSecs ?? 30, ..., ...b }]
```

`...b` is spread AFTER the defaults, so any key present-but-`null` overrides its default instead of
falling back to it.

This is the normal case, not an edge case: `_cleanTemplateSets:407-411` writes every interval key as
`s.workSecs ?? null` on EVERY save, including plain weight_reps sets. So any previously-saved exercise
carries `workSecs: null`.

## Repro

Edit any previously-saved exercise → Type → **Intervals**. Work renders `0:00`, not 30s.
`flushTemplateSets` reads `parseRest('0:00') || 0` and saves `workSecs: 0`.

In the runner `_expandIntervalBlock` still emits `{phase:'work', secs:0}`, so `startIntervalPhaseTimer(0)`
(`app-runner.js:1402`) hits its zero-tick on the first tick, logs a `0:00` round and finishes the
exercise. **Pressing "Start timer" completes the workout immediately.**

Same path for a legacy `metric_type:'cardio'` row, which `_showExerciseSetsModal:1804` routes here.

## Fix

Spread `...b` FIRST, then apply defaults with `??` over the result. `??` is already correct per key; only
the ordering is wrong.
