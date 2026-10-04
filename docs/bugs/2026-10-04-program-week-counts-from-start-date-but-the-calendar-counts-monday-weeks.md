---
id: 2026-10-04-program-week-counts-from-start-date-but-the-calendar-counts-monday-weeks
status: open
priority: low
reported: 2026-10-04
status_detail: "FOUND BY CLAUDE 2026-10-04 while planning the Up next change, in my own dashboard commit (ca7b0cd) and in the older Workouts hero. The calendar (_programWorkoutsByDate) anchors every program week to the MONDAY of the start date's week. The dashboard's program tile (_dashProgramInfo, 'Wk 3 of 12') and the Workouts hero (_buildWorkoutsHero) count whole 7-day blocks FROM the start date. They agree when a program starts on a Monday and disagree for a few days of each week when it starts mid-week: start Thursday 1 Oct, on Tuesday 6 Oct the tile says 'Wk 1' while the calendar (and so the Today card) is already in week 2. Not yet seen by Jake. FIX (bundled with the Up next change, approved 2026-10-04): both count Monday-anchored weeks, like the calendar. The old unit tests all start on a Monday or far from a boundary, so they keep passing; new tests pin a mid-week start."
closing_conditions: "A program that starts on a Wednesday reads the same week number on the dashboard tile, the Workouts card and the calendar on every day of the week."
---

# Program week: start-date weeks vs the calendar's Monday weeks

**Closes when:** see `closing_conditions`.
