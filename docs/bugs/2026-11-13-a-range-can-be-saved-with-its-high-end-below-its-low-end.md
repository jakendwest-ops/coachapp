---
id: 2026-11-13-a-range-can-be-saved-with-its-high-end-below-its-low-end
status: closed
priority: low
reported: 2026-11-13
status_detail: "closed 2026-11-16 by a test that failed before the fix (closure rule b): the strength form keeps every range in order while typing (sfTyped) and on the rest − / + (sfRestStep), and _rangeInOrder in _cleanTemplateSets is the save-side guarantee for every type. tests-node/strength-form.test.mjs 'the save path applies it to every set' went red when the rule was removed (mutation check) and green with it; tests/strength-form-2026-11-15.spec.js pins the typing and stepper behaviour. Was: open - REPORTED by Jake 2026-11-13 while trying the Add exercise sheet demo ('the number on the right cannot be lower than on the left, eg i cant rest between 2 minutes - 30 seconds'); he then asked whether today's app has the same gap. CODE READ (not reproduced in the running app): js/app-workouts.js flushTemplateSets (about line 1902) copies repsMin/repsMax, effortMin/effortMax, restMin/restMax, intensityMin/intensityMax and the cardio min/max pairs straight from the inputs with no comparison, and the summary line prints them as typed (range() about line 302, the rest string about line 321), so 12-8 reps or a 2:00-0:30 rest saves and shows. No guard was found anywhere in js/. The redesigned sheet (scoping, docs/superpowers/specs/2026-11-11-add-exercise-sheet-scope.md) already settles the rule; fix it there rather than in today's editor unless Jake says otherwise."
closing_conditions: "The Add exercise sheet stops a range's high end going below its low end for reps, effort and rest (and the other min/max pairs the editor saves), with a test that fails before the fix, or Jake confirms it in the app."
---

# A range can be saved with its high end below its low end

The set editor lets a coach save a range backwards: reps 12–8, RPE 9–7, rest 2:00–0:30. Nothing checks the order, and the
workout summary shows the range exactly as typed.

**Found:** Jake hit it in the redesign demo; a read of today's code shows the live editor has the same gap.

**Settled for the redesign:** the right end can never be below the left. A − / + button stops at the other end; a typed
value stays and the other end moves to match.

**Closes when:** the sheet refuses a backwards range for reps, effort and rest, with a test that fails before the fix, or Jake confirms it in the app.
