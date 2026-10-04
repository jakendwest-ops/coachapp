---
id: 2026-10-04-workouts-up-next-card-does-not-name-the-workout
status: open
priority: medium
reported: 2026-10-04
status_detail: "REPORTED BY JAKE 2026-10-04, with a phone screenshot of the Workouts page (UP NEXT / Operation 240 / Accumulation 1 - Week 1 / Start): 'Needs to include the next workout name.' APPROVED 2026-10-04. FOUND WHILE PLANNING: _buildWorkoutsHero (js/app-workouts.js) picks the FIRST session of the current program week and ignores both today's date and what is already logged - the comment on _programWorkoutsByDate (app-calendar-goals.js) already records that - so after Monday's workout is done the card still points at Monday's. Naming it would therefore sometimes name the wrong workout. The fix gives the card the dashboard's rule (today's session if it is not logged yet, otherwise the next planned one, found with the calendar's own date map), shows the workout name as the headline with Today / the date in the eyebrow, and keeps the old behaviour only when the program has no start date. A finished program says so instead of pointing at its first session."
closing_conditions: "Jake opens Workouts on his phone with his real program and confirms the card names the workout he expects to do next, before and after he logs a session (or tells me what to change)."
---

# Workouts page, Up next: name the workout (and point at the right one)

**Closes when:** see `closing_conditions`.

Jake, 2026-10-04: "Needs to include the next workout name."
