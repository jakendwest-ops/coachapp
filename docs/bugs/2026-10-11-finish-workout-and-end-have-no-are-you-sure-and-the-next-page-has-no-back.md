---
id: 2026-10-11-finish-workout-and-end-have-no-are-you-sure-and-the-next-page-has-no-back
status: open
priority: medium
reported: 2026-10-11
status_detail: "OPEN. Reported by Jake 2026-10-11, not yet investigated."
---

# Finish workout and End can be tapped by accident, and the page after Finish has no way back

## Jake's report (verbatim, 2026-10-11)

> If this button is clicked then then next page does not have a back button. I think there should be a failsafe, so when you click 'finish workout' you should be asked 'are you sure you wish to finish this workout?' This also goes for the 'end' button that could accidentally be pressed during a workout.

"This button" is the runner's grey `Finish workout` button (`button#wr-cta`, `onclick="confirmEndRunner()"`), full width at the bottom of the runner, directly under the "Last time" strip.

## What would close it

**Closes when** tapping Finish workout, and the End button during a workout, asks "are you sure" first, and declining leaves the workout exactly as it was. Or Jake confirming it on his phone. Whether the page after Finish should also gain a way back is a question for Jake.
