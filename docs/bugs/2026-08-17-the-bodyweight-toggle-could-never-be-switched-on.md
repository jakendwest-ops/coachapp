---
id: 2026-08-17-the-bodyweight-toggle-could-never-be-switched-on
status: confirmed
closed_by: "clause (b) — bodyweight-toggle-2026-08-17.spec.js (4 tests) GREEN 2026-08-20, plus ledger-fixes-2026-08-02.spec.js:294 rewritten and empirically red-before verified (reverted app-workouts.js:1669 to the pre-fix 's.bodyweight ?' expression, test went RED, source restored via git). The 2026-08-02 declutter conflict this fix created is now resolved in Jake's favour, 2026-08-20: BW renders unconditionally, still gated by _BW_TYPES. Closed on test evidence, NOT on a Jake confirmation."
priority: high
reported: 2026-08-17
status_detail: "Fixed in commit 6fc7c50, live 2026-08-17 (app-workouts v68). Red-before verified by restoring the original expression. Awaiting Jake confirming a NEW template exercise can be marked BW on live."
---

# The bodyweight toggle could never be switched on

`js/app-workouts.js:1606` read:

```js
${s.bodyweight ? tog('BW', s.bodyweight, `toggleTsSet(${i},'bodyweight',…)`) : ''}
```

The pill that SETS `bodyweight` only rendered when `bodyweight` was already true — and that toggle is the
only thing in the entire codebase that can set the flag. A bootstrap deadlock. Confirmed by grepping all
nine modules: `_cleanTemplateSets` wrote `!!s.bodyweight` (false on a fresh set), starter-content sets
nothing, `app-programs` never touches it.

**So no template exercise created since that gate appeared could ever be marked bodyweight.** Every
pull-up and dip added to a template has silently been a weight-and-reps lift.

## Why it mattered more than it looked

The reps-charting for bodyweight lifts shipped the day before (2026-08-16, commit `9fa32e4`) reads this
flag. It was therefore **unreachable for any new data** — a feature built for a flag the UI cannot
produce. Jake's own Mon/Wed/Fri scenario (squat, bench, deadlift, pull-up, dip), which drove that work,
could not have been entered correctly.

## The repeat

Verbatim the defect that got `assisted`/`assistWeight` deleted on 2026-08-11 — *"its toggle only rendered
when the flag was ALREADY true"*. That note lives in `_cleanTemplateSets`, **220 lines above the twin
that survived it**. The removal fixed the instance and not the class.

## The fix

BW now renders unconditionally, like the AMRAP pill beside it, gated by a new `_BW_TYPES` set —
deliberately WIDER than `_AMRAP_TYPES` because it includes `timed_hold`: the runner has always rendered a
BW cell for a hold (`app-runner.js:387`), a plank being bodyweight by definition, so it carried the same
unreachable flag one metric type over.

Kept separate from `showSetToggles`, which also gates the Unilateral pill and must stay limited to the two
types sharing the weight+reps set shape.

`_cleanTemplateSets` now gates the saved flag on `metricType` too, matching `amrap`, so switching an
exercise's type can no longer leave a stale bodyweight flag on a jump. That is a partial fix of the wider
stale-field class — see `2026-08-17-template-edit-path-skips-the-set-cleaning-gate.md`, which is the rest
of it and is still open.

## Verification

`tests/bodyweight-toggle-2026-08-17.spec.js` — 4 tests, driving the real set editor
(`renderTemplateSets` / `toggleTsSet` / `_cleanTemplateSets`), because the bug was in the RENDER GATE and
asserting on a hand-built set object would have stayed green throughout.

Red-before proven by restoring the original expression: the fresh-set and per-type tests fail, the two
operating on an already-flagged set pass — exactly the bug's shape.

**Still needs Jake:** open the template editor on live, add an exercise, confirm the BW pill is present on
a fresh set and that saving it sticks.
