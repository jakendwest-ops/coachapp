---
id: 2026-10-11-session-done-in-the-runner-on-an-unscheduled-day-may-not-save-or-be-remembered
status: open
priority: high
reported: 2026-10-11
status_detail: "OPEN. Reported by Jake 2026-10-11. Investigated read-only against his account the same day: sessions on unscheduled days DO save. The likely real cause is the 0 kg display bug (row 2026-10-11-a-weight-of-0-is-not-recorded-or-shown-like-any-other-weight), fixed the same day on master (unreleased). Stays open until Jake confirms which session he meant and that it now shows."
---

# A session done in the runner on a day it is not scheduled may not be saved, or not remembered next time

## Jake's report (verbatim, 2026-10-11)

> Please can you check/test that when a session is performed in the runner on a day that is not scheduled training day, that this data is saved? I performed a monday session on a tuesday this week and it doesnt look like the workout memory was saved.

He attached two screenshots:

1. The dashboard's "This week" strip: MON green with a tick, TUE a grey "-" (the rest-day marker), WED red with a cross.
2. The runner's set table with grey placeholder numbers (set 1 `55` kg, set 2 `57.5` kg).

## What the data shows (read-only, his account, 2026-10-11)

- The runner stamps a session with the day it was STARTED (`_runner.date`, `js/app-runner.js:63`), never with the scheduled day, so scheduling cannot change what is saved.
- The account holds sessions on days they were not scheduled: `Heavy Upper Body` (a Monday-slot session) on Thu 8 Oct, with its exercises and sets; a Sunday session on 11 Oct. Both saved normally.
- No session is dated Tue 6 Oct, and none was created that day, so if one was done and saved on the Tuesday it did not reach the database. No runner draft is waiting in the browser either.
- The app's own error log (`app_errors`) holds nothing about a failed workout save.
- The grey `55` / `57.5` are Friday 9 Oct's Military Press sets (55 x 7, 57.5 x 7, 55 x 7): the grey memory is the most recent session of that exercise, whichever workout it was in.
- The Stats sheet row Jake selected, `Tue 29 Sept, 8 reps · 6 reps`, is Tricep Dip logged at 0 kg (0 x 8, 0 x 6). That is the 0 kg display bug: [a weight of 0 is not recorded or shown like any other weight](2026-10-11-a-weight-of-0-is-not-recorded-or-shown-like-any-other-weight.md).

## What would close it

**Closes when** Jake confirms which session he meant and that it now shows. If it was a Tuesday session that was never saved, that is a different bug and needs the steps he took.
