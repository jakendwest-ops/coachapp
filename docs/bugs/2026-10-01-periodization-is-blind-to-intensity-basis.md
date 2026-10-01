---
id: 2026-10-01-periodization-is-blind-to-intensity-basis
status: closed
priority: low
reported: 2026-10-01
status_detail: "DECIDED AND FIXED 2026-10-01. Jake chose option 2: the weekly percentage wave leaves a set pointed at today's top set (intensityBasis topSet) alone; a stored-1RM set follows the wave as before. One rule, _applyWavePct (app-programs.js), tested two ways, both RED on the old code and GREEN on the new: tests-node/periodization-basis.test.mjs (pure rule) and tests/periodization-top-set-basis-2026-10-01.spec.js (the real generator against real rows: on the old module the week-2 back-off came back 80, a wave number nobody chose, instead of its own 70; the stored-1RM Squat in the same run is the positive control and follows the wave). Not Jake-reported; closed by the decision he made and the test."
closing_conditions: "Jake decides what a periodised percentage on a 'Today's top set' row should mean. If it should NOT step through the weeks, generatePhasePeriodization skips rows with intensityBasis 'topSet' and a test goes RED then GREEN. If it SHOULD, record that in docs/decisions.md and close."
---

# Periodisation steps a '% of today's top set' row through weeks as if it were a % of the stored 1RM

**Closes when:** Jake decides what a periodised percentage on a 'Today's top set' row should mean. If it should NOT step through the weeks, generatePhasePeriodization skips rows with intensityBasis 'topSet' and a test goes RED then GREEN. If it SHOULD, record that in docs/decisions.md and close.

I told Jake on 2026-09-30 that the remaining `intensityMin` consumers were "basis-aware or basis-irrelevant".
For this one that was wrong: periodisation is basis-relevant, and I had not checked it closely.

`generatePhasePeriodization` (js/app-programs.js) overwrites `intensityMin`/`intensityMax` on every set
that has one with the wave's weekly percentage, whatever its `intensityBasis`. So a week-1 backoff of
"70% of today's top set" becomes, say, "85% of today's top set" in week 3.

That may be what a coach wants — progressing the backoff load week to week is normal. Or it may be a
stored-1RM wave number being applied to a different base. The code cannot tell the two apart, so it is a
product decision, not a bug I should fix on a guess.

## Decision and fix (2026-10-01)

Jake picked "leave top-set-based sets alone". The reason in his terms: the wave numbers are percentages of your max, so written onto a
back-off set they became things like "95% of the top set", nearly as heavy as the top set, chosen by nobody. The coach can still edit any
generated week by hand. Only `generatePhasePeriodization` rewrote intensities (one site, grepped), and it now goes through `_applyWavePct`.
