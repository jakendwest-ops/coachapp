---
id: 2026-08-17-template-edit-path-skips-the-set-cleaning-gate
status: confirmed
closed_by: "clause (b) — stale-set-fields-2026-08-18.spec.js ran GREEN 2026-08-20 in a serialized 192-test run; red-before is recorded in this file's body. Closed on test evidence, NOT on a Jake confirmation."
priority: high
reported: 2026-08-17
status_detail: "FIXED commit 53071cf, live 2026-08-18 (app-workouts v70). 7 red-before tests in tests/stale-set-fields-2026-08-18.spec.js. Gating is PER KEY, not per jump-family — review found the family-wide version still mis-rendered a jump_distance row as a height. NOTE: pre-existing bad rows are NOT repaired passively — see 2026-08-18-stale-jump-targets-may-exist-in-saved-rows."
---

# The template EDIT path skips `_cleanTemplateSets`, so stale fields ride onto the wrong exercise type

`saveEditTemplateExercise` (`js/app-workouts.js:2093`) writes `sets_json: sets.length ? sets : null` —
the raw `window._templateSets`. Its two siblings clean first: `saveExerciseToTemplate` (`:2024`) and
`_confirmRunnerExerciseFromModal` (`js/app-runner.js:1964`).

`flushTemplateSets` deliberately PRESERVES fields the current type does not render, so anything set under
a previous type survives the switch. `_cleanTemplateSets` is the gate that strips them — the edit path
never calls it.

## Repro 1 — AMRAP on a jump (edit path)

Template → Edit a **weight_reps** exercise → toggle **AMRAP** on → change Type to **Jump height** → Save.
`amrap:true` is written with `metric_type:'jump_height'`. The runner prints `AMRAP / JUMPS`
(`app-runner.js:532-536`), `openTemplate` relabels the set `AMRAP:` (`app-workouts.js:1251`), the
collapsed day row shows nothing. Three surfaces, three answers.

The gate skipped is `amrap: _AMRAP_TYPES.has(metricType) && !!s.amrap` (`app-workouts.js:378`), whose own
comment says it was placed there "rather than at the three render sites — one gate, not three".

## Repro 2 — a barbell lift renders as a jump (ADD path, no edit needed)

`_cleanTemplateSets` passes `targetHeightCm` / `targetDistanceM` through unconditionally (`:404`), and
`_fmtSetDetail` decides "this is a jump" from the SET DATA, not the metric type:

```js
} else if (s.targetHeightCm || s.targetDistanceM) {     // app-workouts.js:290
```

+ Add exercise → Type **Jump height** → Target height 40 → change Type to **Weight & reps** → fill reps →
Add. Saved row is `metric_type:'weight_reps'` with `targetHeightCm:40`.

`openTemplate` (`:1250`), `openSessionDetail` (`:450`), client Workouts day rows (`:704`), the calendar
day modal (`app-calendar-goals.js:280`) and the programs grid (`app-programs.js:112`, `:1967`) all render
**"40cm · 8-10 jumps"**. The runner renders the same row as weight x reps.

**The coach's plan preview and the athlete's in-gym screen show two different exercises for one row.**

## Fix shape

Both belong in `_cleanTemplateSets` — gate the jump keys on `metricType` exactly as `amrap` is — and the
edit path must call it. Do NOT fix in `_fmtSetDetail`: that leaves bad data on disk and hides one of six
render sites. `bodyweight` was gated this way on 2026-08-17 (commit `6fc7c50`) and is the template.
