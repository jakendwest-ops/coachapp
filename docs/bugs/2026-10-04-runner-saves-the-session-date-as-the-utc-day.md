---
id: 2026-10-04-runner-saves-the-session-date-as-the-utc-day
status: open
priority: low
reported: 2026-10-04
status_detail: "FOUND BY CLAUDE 2026-10-04 while checking how 'logged today' is decided for the Up next card. startWorkoutRunner stamps a session with `new Date().toISOString().split('T')[0]` (js/app-runner.js, the _runner object), which is the UTC calendar day, while everything that reads it back compares with the LOCAL day (_ymdLocal): the dashboard's Today card and week strip, the streak, the calendar, and now the Workouts Up next card. Where local and UTC dates differ the two disagree by a day. For a UK user that is only 00:00-01:00 in summer (BST), so a workout started just after midnight is filed under yesterday; for anyone WEST of UTC (the Americas) it is every evening after about 7-8 pm, so an evening workout is filed under tomorrow and the Today card would show it done a day early. No current user is west of UTC. NOT FIXED: it changes the date written to workout_logs and every reader's assumption about it, so it wants its own decision and a test over each reader. The save-time stamp for 1RM records (one_rm_kg recorded_at) uses the same pattern. A fix would stamp _ymdLocal(new Date()) at the start of a session (and, for a session started before midnight and finished after, decide which day it belongs to)."
closing_conditions: "A session started at 00:30 local time on a BST day is filed under that local day and shows as done on the dashboard and the Workouts card that day."
---

# The runner files a session under the UTC day, not the local day

**Closes when:** see `closing_conditions`.
