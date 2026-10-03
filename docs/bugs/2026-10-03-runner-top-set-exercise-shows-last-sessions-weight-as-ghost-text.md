---
id: 2026-10-03-runner-top-set-exercise-shows-last-sessions-weight-as-ghost-text
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-03
status_detail: "REPORTED BY JAKE 2026-10-03, with screenshots of the builder's top-set and backoff-set editors and of the runner: 'There shouldnt be ghost text in runner when using RPE top sets. These fields should only be populated once the top set has been established.' His screenshot showed all three weight boxes of an RPE top-set exercise reading '130' in grey, plus a 'Log the top set first' note under set 2. FIXED 2026-10-03 (app-runner v111, on master and live with the next release): on an exercise whose row 0 is a top set, last session no longer feeds any ghost - the weight boxes stay empty until the top set is ticked and the backoff boxes then show their target (a % of today's top set), the effort box no longer echoes last session's RPE, and a row the coach prescribed nothing for shows the bare word 'reps'. The coach's PRESCRIBED reps still show (the plan, not history). Exercises without a top set keep every ghost. Red first: tests/runner-topset-ghost-2026-10-03.spec.js, 3 of 6 failed on the old code with the screenshot's own numbers, all 6 pass now, and undoing the fix turns the same 3 red again."
closing_conditions: "Jake looks at a real RPE top-set exercise on his phone: all weight boxes empty before the top set is ticked, backoff weights appear after, the effort box empty, prescribed reps still showing. Not closed by the spec - it proves the placeholders, not how it reads."
---

# Runner: a top-set exercise showed last session's weight as ghost text

**Closes when:** Jake has seen it on his phone (see `closing_conditions`).

## Cause

`renderStrengthTable` (js/app-runner.js) built each weight box's ghost as `oneRMPh || last session's weight for that set
number || the unit`. For a backoff row (`intensityBasis: 'topSet'`) with no top set logged yet, `oneRMPh` is deliberately
empty - the comment two lines above says an honest blank beats a plausible stale number - but the next term then supplied
last session's weight for the same position anyway. The top-set row has no prescribed weight at all, so it always fell
through to it. The effort box likewise echoed last session's RPE whenever the scale matched.

## What was left alone, and why

- The coach's prescribed reps ghost (3 / 6 in the screenshot): that is the plan, not history, and Jake asked for exactly
  that on 2026-09-30.
- The "Last time" line and its Stats button under the table: a button with a summary, not ghost text.
- Every ghost on an exercise with no top set, and on a non-weight exercise carrying a stale `isTopSet` flag (the builder
  honours a top set only on weight_reps; the runner now gates the same way).

## Open question for Jake

The reps boxes still show the prescribed number in grey before anything is logged. If "no ghost text" was meant to include
those too, say so - it is a one-line change.
