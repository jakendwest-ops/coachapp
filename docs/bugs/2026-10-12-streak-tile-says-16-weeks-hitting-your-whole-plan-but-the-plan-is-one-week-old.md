---
id: 2026-10-12-streak-tile-says-16-weeks-hitting-your-whole-plan-but-the-plan-is-one-week-old
status: open
priority: medium
reported: 2026-10-12
status_detail: "OPEN. Reported by Jake 2026-10-12. Cause found in the code, not yet checked against his data (the browser pane was signed out): weeks BEFORE the plan began count by the looser one-session rule, but the tile labels the whole number 'hitting your whole plan'. Needs Jake's call on what the streak should count; nothing built."
---

# The dashboard streak says "16 week streak, hitting your whole plan", but he has not been on the plan for 16 weeks

## Jake's report (verbatim, 2026-10-12)

> 1. This streak is not accurate. I have not been on this plan for 16 weeks.

Attached: the dashboard Streak tile ("16 week streak / hitting your whole plan"), and the Program tile beside it ("Wk 1, Mesocycle 1").

## What the code does (`js/app-dashboard.js`)

- `_dashStreakWeeks` (lines 113-149) follows Jake's own choice of 2026-10-03, "Weeks hitting my whole plan": INSIDE the program's span a week counts only when every planned session was logged; OUTSIDE the span (before it began, after it ended, or with no program) one logged session keeps the streak alive.
- The tile's sub-label (line 344) is `program ? 'hitting your whole plan' : 'a session every week'`: it depends only on whether a program EXISTS, not on which rule produced the number.
- His plan "Operation 240" is one phase of one week ("1w · 4 sessions", the Program tile says "Wk 1"). Almost all of the 16 weeks are therefore "before the plan" and were counted by the one-session rule, then labelled "hitting your whole plan".

UNVERIFIED against his data: the browser pane was signed out on 2026-10-12, so his weekly session counts were not read. The code says the figure is 16 weeks with at least one session each; that is the thing to confirm.

## Options for Jake

- Count only weeks since the plan began while a program is running (so this reads about 1), and fall back to "a session every week" only when there is no program.
- Keep the activity streak but label it honestly ("16 weeks with a session") whichever rule applies.
- Show both: weeks on the plan, and weeks training.

## What would close it

**Closes when** Jake picks one, it is built, and he confirms on his phone that the number and its label agree with his history.
