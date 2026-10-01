---
id: 2026-10-01-periodization-is-blind-to-intensity-basis
status: open
priority: low
reported: 2026-10-01
status_detail: "Found by the multi-agent review of the RPE top-set work (2026-09-30 / 2026-10-01), not reported by Jake. Reported by Agent B (round 2); I confirmed the shape by grep (app-programs.js generatePhasePeriodization rewrites intensityMin/Max on every set that already has one) but did NOT trace _computePeriodizedPct end to end. NEEDS JAKE'S DECISION — it may be exactly what he wants."
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
