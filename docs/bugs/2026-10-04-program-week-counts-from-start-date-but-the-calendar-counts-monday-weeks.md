---
id: 2026-10-04-program-week-counts-from-start-date-but-the-calendar-counts-monday-weeks
status: fixed-awaiting-jake
priority: low
reported: 2026-10-04
status_detail: "FOUND BY CLAUDE 2026-10-04 while planning the Up next change, in my own dashboard commit (ca7b0cd) and in the older Workouts hero. The calendar (_programWorkoutsByDate) anchors every program week to the MONDAY of the start date's week. The dashboard's program tile (_dashProgramInfo, 'Wk 3 of 12') and the Workouts hero (_buildWorkoutsHero) counted whole 7-day blocks FROM the start date. They agreed when a program started on a Monday and disagreed for a few days of each week when it started mid-week: start Thursday 1 Oct, on Tuesday 6 Oct the tile said 'Wk 1' while the calendar (and so the Today card) was already in week 2. Not seen by Jake. FIXED 2026-10-04 with the Up next change, committed on master, not released: one function, _programWeeksElapsed (app-dashboard.js), counts Monday-to-Sunday weeks like the calendar, and both the tile and the card's fallback use it; the Up next card itself takes its week from the dated session it names. The older unit tests all start on a Monday or far from a boundary, so they kept passing; new tests (tests-node/up-next.test.mjs) pin a Thursday start on every side of the Monday, and that the card and the tile say the same week; breaking the function back to start-date weeks fails four of them. UNVERIFIED on Jake's real program (his start day is not known)."
closing_conditions: "A program that starts on a Wednesday reads the same week number on the dashboard tile, the Workouts card and the calendar on every day of the week."
---

# Program week: start-date weeks vs the calendar's Monday weeks

**Closes when:** see `closing_conditions`.
