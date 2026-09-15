---
id: 2026-08-11-a-logged-rir-was-displayed-as-rpe-which-inverts-its-meaning
status: confirmed
closed_by: "clause (b), 2026-08-22 sweep. tests/effort-scale-rir-2026-08-11.spec.js calls the shipped openWorkoutLog and reads the RENDERED html for the effort column header - the exact thing Jake would have been looking at. RED-BEFORE RE-PROVEN TODAY: forcing the label map to always emit 'RPE' turned 2 of 4 red; restored, 4 pass."
priority: high
reported: 2026-08-11
---

# A logged RIR was displayed as RPE, which inverts its meaning

`workout_log_sets` stores effort as a PAIR — `effort_type` ('rpe' | 'rir') plus `effort_value`. The
Log Session modal writes that pair correctly. The session-detail screen threw the type away and
hardcoded the word: an "RPE" column header and `'RPE ' + s.effort_value` in every cell.

Not a cosmetic mislabel. The two scales run in OPPOSITE directions:

    RIR 2 = two reps left in reserve  -> near-maximal, brutal
    RPE 2 = 2 out of 10               -> a warmup

So a set logged as RIR 2 was shown back to the coach as RPE 2. A coach reading session history to set
next week's load was reading effort backwards.

Two adjacent findings fixed in the same pass: `if (s.effort)` dropped a logged effort of 0 (RIR 0 means
"to failure" — real and common), and the `if (s.rpe)` write path in saveRunnerSession is UNREACHABLE.

**Standing gap this exposed:** the in-gym runner captures NO effort at all — `_blankTableRow` has no
effort field, so the strength table has no RPE/RIR input. The column shown in the runner is the
TARGET. Effort only reaches the DB via the manual Log Session modal. Needs Jake's decision.

Fixed `5f892d3`. Pinned by `tests/effort-scale-rir-2026-08-11.spec.js` (4 tests).
