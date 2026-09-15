---
id: 2026-08-11-runner-wizard-deleted-155-lines-and-the-class-that-made-it-reachable
status: fixed-awaiting-jake
priority: medium
reported: 2026-08-11
---

# The runner's dead wizard — 155 lines, and the class that made it reachable

Jake: "It was eating up 300 lines of code." Close — but only 133 were wizard-only. `logRunnerSet`
(121 more) is SHARED with cardio logging, so deleting it wholesale would have broken every cardio
session. It split cleanly at `if (ex.type === 'cardio') {…} else {…}`.

**The routing change is the point, not the line count.** `_isPlainStrengthExercise` was an allowlist of
five metric types with the wizard catching "anything else" — and "anything else" was genuinely
reachable, because `_resolveMetricType` returns `metric_type` VERBATIM for anything that isn't
`weight_reps`. Any row whose `metric_type` and `exercise_type` had drifted apart landed on a branch
that predated metric_type. It is now `ex.type !== 'cardio'`: the table is the fallback.

Verified before cutting: a live probe found ZERO wizard-bound rows (53 template exercises, 105 logged).

Also removed the dead superset auto-advance (4 bugs: backward jump, ping-pong, no completion check,
bare return skipping rest + finish).

**Known consequence:** `supersetGroup` is still WRITTEN but now has NO reader — supersets are inert in
the runner until the grouped-work slice rebuilds them. Deliberate, documented in code.

**Left behind:** `startStrengthSetTimer` / `renderStrengthSetTimer` / `addExtraStrengthSet` now have
zero callers (~75 lines), but `stopStrengthSetTimer` is wired into `discardRunner`'s teardown, which
had a timer-leak fix in `fbe8491`. Runtime no-op as it stands. Follow-up.

Fixed `262f092`.
