---
id: 2026-08-11-coach-and-athlete-read-different-set-counts-off-the-same-session
status: confirmed
closed_by: "clause (b), 2026-08-22 sweep. tests/set-count-agreement-2026-08-11.spec.js drives the real _countableSets. RED-BEFORE RE-PROVEN TODAY: stubbing it to return 0 turned 3 tests red; restored, green."
priority: high
reported: 2026-08-11
---

# The coach and the athlete read different set counts off the same session

Warm-up and cool-down rounds are recorded but are not training volume (Jake, 2026-07-25). My Progress
enforces that through `_countableSets`. The runner did not — four places counted raw rows.

A 4-round interval wrapped in a warm-up and a cool-down reported **6 sets** on the finish screen and in
the coach's view, and **4** in My Progress. Same session, same rows, two numbers.

The table compounded it: `set_number` counts every row, so it rendered "Set 1 … Set 6" under a header
claiming a different total. Rows are all still shown — a warm-up that happened is data — but non-work
rounds are now NAMED and work rounds numbered 1..N.

**The first fix was itself half-done:** it landed on `openWorkoutLog` (the coach's screen) and missed
its sibling in `showRunnerFinish` — the FIRST screen the athlete sees — which kept numbering every row.
Caught by the pre-push review. Fix-the-class-not-the-instance, again.

Fixed `40db93e`, completed `730c03f`. Pinned by `tests/set-count-agreement-2026-08-11.spec.js` (3).
