---
id: 2026-08-11-captured-hr-watts-pace-discarded-when-an-interval-had-a-cool-down
status: confirmed
closed_by: "clause (b), 2026-08-22 sweep. tests/cardio-capture-cooldown-2026-08-11.spec.js drives the real _applyCardioCapture. RED-BEFORE RE-PROVEN TODAY: making it a no-op turned 4 tests red; restored, green."
priority: high
reported: 2026-08-11
---

# Captured HR/watts/pace were discarded whenever an interval had a cool-down

The exercise-finish capture card stamped what the athlete typed onto `loggedSets[length - 1]` — the
literal last row. Correct for ordinary cardio. Wrong for an interval block with a cool-down, because
`_logIntervalPhase` logs warmup, then the work rounds, then the COOL-DOWN.

Every Progress aggregate filters through `_countableSets` (`!phase || phase === 'work'`) by design, so
the capture landed in the one row guaranteed to be discarded by every reader:

    athlete types "Avg HR 158" -> written to the cool-down row -> filtered out -> chart shows nothing

Silent at all three layers. All five captured fields ride that row, so avg HR, max HR, watts,
pace/500m and stroke rate were lost together — and only on intervals with a cool-down, which is why
it survived this long.

Fixed `2c7ff09`. Pinned by `tests/cardio-capture-cooldown-2026-08-11.spec.js` (4 tests).
