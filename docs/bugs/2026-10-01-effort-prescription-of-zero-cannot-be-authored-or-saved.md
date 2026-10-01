---
id: 2026-10-01-effort-prescription-of-zero-cannot-be-authored-or-saved
status: open
priority: low
reported: 2026-10-01
status_detail: "Found by the multi-agent review of the RPE top-set work (2026-09-30 / 2026-10-01), not reported by Jake. Pre-existing falsy-zero class, not a regression from the RPE work, and latent because the builder's inputs carry min=1. Verified by reading: three consumers use a truthy check where renderStrengthTable (_hasNumVal) and the new top-set warning use an explicit presence test. COUNT: 5 sites, 2 correct, 3 not."
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
