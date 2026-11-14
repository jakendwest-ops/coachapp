---
id: 2026-11-14-update-all-copies-overwrites-each-copy-instead-of-applying-only-the-changes
status: closed
priority: high
reported: 2026-11-14
status_detail: "open - REPORTED by Jake 2026-11-14 on his own Personal-view (solo) strength plan: in Week 1's Monday workout he changed one exercise and one rest period, pressed Save, chose 'Update all copies', and every copy in the other weeks came out matching Week 1's Monday instead of getting only those two changes. Filed before investigation (intake rule). CODE READ 2026-11-14 (not reproduced; the pane is not signed in, so Jake's rows were not read): propagation is per EXERCISE, not per field. js/app-workouts.js saveTemplateDraft (about line 3303) builds an 'update' change whose row is the exercise's WHOLE patch (name, type, sets, the full sets_json, notes, superset); _propagateExerciseChangeToTemplates (about line 3504) writes that whole patch onto every same-named exercise in each copy. Weeks 2+ carry their own stepped sets_json (generatePhasePeriodization, js/app-programs.js about lines 2706-2734), so one changed rest replaces that exercise's week-specific loads/reps/RPE in every week with Week 1's. Suspected amplifier, UNVERIFIED: _diffTemplateDraft (about line 3142) compares sets_json with JSON.stringify, and _cleanTemplateSets (about line 432) rebuilds each set in its own key order while Postgres jsonb returns keys in its own order, so opening any exercise and saving its sheet unchanged may count it as 'updated' and push it too. FIXED 2026-11-14 (Jake approved the plan, then asked for a choice at save): the dialogue now offers 'Only my changes' (default: field-level edits via _exerciseEdits/_applyExerciseEdits, each copy keeps its own loads) and 'Whole workout' (_replaceWholeWorkoutInTemplates, an explicit exact copy, warned in red). The suspected amplifier was CONFIRMED by tests-node/exercise-edits.test.mjs (key order alone made an unchanged exercise count as updated) and fixed with _canonJson. CLOSED under rule (b): tests/update-copies-choice-2026-11-14.spec.js failed 3/3 on the old code (week 2 Bench came back at Week 1's 100 kg instead of its own 110 kg) and passes on the new code. multi-agent-review found 1 blocking and 5 non-blocking; all fixed before the commit. NOT LIVE until the next release tag. Jake's already-overwritten weeks are not restored by this."
closing_conditions: "'Update all copies' carries only the fields Jake actually changed (a changed rest reaches the copies' rest and nothing else; a swapped exercise keeps each copy's own week-specific sets) and leaves every other exercise and set in each copy as it was, with a test that fails before the fix and passes after, or Jake confirms it in the app."
---

# "Update all copies" overwrites each copy instead of applying only the changes

Jake edited Monday's workout in Week 1 of his strength plan: one exercise changed, one rest period changed. He pressed
Save and chose **Update all copies**. Every copy of that workout in the other weeks was overwritten to match Week 1's
Monday exactly, losing what made each week different (for example its own progressed loads).

**Expected:** only the two things he changed reach the copies; everything else in each copy stays as it was.

**Closes when:** a test that fails before the fix and passes after shows a copy keeping its own sets while receiving only
the changed field, or Jake confirms it in the app.
