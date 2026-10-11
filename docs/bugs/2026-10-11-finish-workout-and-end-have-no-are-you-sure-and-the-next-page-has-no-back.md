---
id: 2026-10-11-finish-workout-and-end-have-no-are-you-sure-and-the-next-page-has-no-back
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-11
status_detail: "FIXED 2026-10-11 on master, unreleased (app-runner v114); awaiting Jake's look on a phone. Red before, green after: tests/runner-zero-weight-and-finish-2026-10-11.spec.js (Finish and End ask first and Cancel changes nothing; the finish screen has 'Back to workout' and what was logged and typed survives; a late PR lookup cannot repaint the finish screen over the runner). Jake's answer: 'there should be a back to workout button'."
---

# Finish workout and End can be tapped by accident, and the page after Finish has no way back

## Jake's report (verbatim, 2026-10-11)

> If this button is clicked then then next page does not have a back button. I think there should be a failsafe, so when you click 'finish workout' you should be asked 'are you sure you wish to finish this workout?' This also goes for the 'end' button that could accidentally be pressed during a workout.

"This button" is the runner's grey `Finish workout` button (`button#wr-cta`), full width at the bottom of the runner, directly under the "Last time" strip. His answer to the follow-up question: "there should be a back to workout button".

## What changed

- The red End button, the grey "Finish workout" (nothing logged yet) and the green "Finish" (a set ticked, last exercise) all ask first: "Finish this workout? You can still go back and change it from the next screen." (or "End this workout? Nothing has been logged yet." when nothing is logged). Cancel leaves the workout exactly as it was, including the running timers. The question lives in `confirmEndRunner`, not in `discardRunner`, which has silent callers by design.
- The Workout complete screen has a "← Back to workout" button (a 44 px tap target). It repaints the runner from the same state, restarts the session timer, the draft checkpoint and the screen lock, and keeps the session name and notes typed on the finish screen for the next visit.
- Found while testing it: the finish screen looks up each lift's best earlier weight in the background and repaints itself when that returns, so tapping Back first could have the finish screen drawn back over the runner. A per-visit token now stops a late repaint (deterministic test, no fixed sleep).
- Found by the three-angle review before it was committed: Back is refused while a save is under way (a second Save on a freshly drawn finish screen could have inserted a second log); a nameless exercise gets its blank name back on Back (the finish screen's "Exercise 1" label was being made permanent); and a cardio duration typed in the Edit sheet was printed raw on the finish screen and in the wizard's set list, which is now escaped.
- Not changed: the workout still finishes by itself when the rest after the last set ends, as it always did. Back is the way out of that too.
- Known limits, named and left: Back after Finish cancels a rest timer that was running (the set it followed stays ticked); an interval block that was mid-walk when Finish was pressed restarts at phase 0 on "Start timer" and would log those phases twice (tabbing away from an exercise and back already did this); the notes typed on the finish screen are kept across Back but not across a page reload.

**Closes when** Jake confirms on his phone that Finish and End ask first and that Back to workout returns him to the workout with his sets intact.
