---
id: 2026-11-08-create-new-workout-this-day-only-should-save-to-your-workouts
status: open
priority: medium
reported: 2026-11-08
status_detail: "open - REPORTED by Jake 2026-11-08 on the live v2026.11.2, with a screenshot of the plan's Add workout picker: '+ Create new workout (this day only)' 'should save the workout that you create to your workouts page, so that if it is deleted off a plan you can add it in another time. Not this day only.' Code: the picker row is `js/app-programs.js` ~3466 (`_createWorkoutFromPicker`); a workout made this way is stamped with `program_id` and marked `_inThisProgram` (~1226, ~3373), which is what keeps it off Your workouts. Before any build: check what deleting it off a plan does today (the 2026-07-13 orphan-template rows), and what 'Your workouts' shows for a plan-made workout ('From a plan' badge)."
closing_conditions: "A workout created from a plan day appears in Your workouts and can be added to another day after it is removed from the plan, and Jake confirms it."
---

# A workout created from a plan day is only for that day

"+ Create new workout (this day only)" makes a workout that belongs to that plan day. Jake wants it saved to Your workouts too, so
that removing it from the plan does not lose it and it can be added again later.

Closes when Jake confirms the change on his phone (see closing_conditions above); a commit message alone never closes it.
