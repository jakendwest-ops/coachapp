---
id: 2026-10-01-effort-prescription-of-zero-cannot-be-authored-or-saved
status: closed
priority: low
reported: 2026-10-01
status_detail: "FIXED 2026-10-01, all three sites plus the input min together, by tests that ran RED on the old code and GREEN on the new. tests-node/effort-zero.test.mjs: 7 of 12 cases RED before (a numeric 0 nulled on save, dropped from the runner target bar, never rendered as RIR 0; the new _effortRange formatter), 12/12 after; the 5 controls (string 0, blank stays null, ordinary RPE) pass on both. tests/effort-zero-2026-10-01.spec.js (real clicks: type 0 in the RIR box, save, read the DB, start the workout, read the target bar) ran RED on the old modules at the input min=1 (a 0 was an invalid entry) and GREEN on the new. HONEST LIMIT: the builder inputs hand back the STRING 0, which is truthy, so the typed path mostly survived on the old code by accident; the data loss was for a NUMERIC 0 (imported or hand-edited sets_json), which the node tests cover. Not Jake-reported."
closing_conditions: "A test that prescribes RIR 0 (to failure) in the builder, saves, reopens, and sees RIR 0 in the runner's target bar, RED before and GREEN after the three truthy checks and the input's min are fixed together. Fixing one of the three is not a closing condition."
---

# A prescribed effort of 0 (RIR 0, "to failure") is dropped on save and hidden in the runner

**Closes when:** A test that prescribes RIR 0 (to failure) in the builder, saves, reopens, and sees RIR 0 in the runner's target bar, RED before and GREEN after the three truthy checks and the input's min are fixed together. Fixing one of the three is not a closing condition.

RIR 0 is the most meaningful value on that scale, and this project has shipped the falsy-zero bug at five
sites already. These three still lose it:

- `js/app-workouts.js` `_cleanTemplateSets`: `effortMin: s.effortMin || null` turns a prescribed `0` into
  `null` on every save.
- `js/app-runner.js` `_buildTargetCols`: `if (tgt.effortMin)` drops the RPE/RIR column from the target bar
  for a prescribed `0`.
- The builder's own effort inputs carry `min="1"`, so `0` cannot be typed at all — which is why this has
  stayed latent. A hand-edited or imported `sets_json` is not bound by it.

The two that are right: `renderStrengthTable`'s `wantsEffort` (uses `_hasNumVal`) and the builder's new
"top set has no effort" warning (explicit `!== null/undefined/''`). Fix all three plus the `min`, or name
what is left.

## Fixed 2026-10-01

One definition, not three: `_hasNumVal` moved from app-runner to app-core (shared by builder and runner) and gained a sibling
`_effortRange(min, max)` that formats a prescribed effort ("8", "7-9", "0", "0-2") with 0 present. `_cleanTemplateSets` keeps a
real 0 (`_hasNumVal`, not `||`), the runner's target bar and both of the builder's set summaries use `_effortRange`, and the
three effort inputs now take `min="0"`. Left alone on purpose: the legacy `s.rpe` fallback (an old field, RPE 0 means nothing).
