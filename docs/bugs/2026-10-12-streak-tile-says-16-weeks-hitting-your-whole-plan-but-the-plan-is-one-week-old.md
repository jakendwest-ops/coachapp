---
id: 2026-10-12-streak-tile-says-16-weeks-hitting-your-whole-plan-but-the-plan-is-one-week-old
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-12
status_detail: "FIXED 2026-10-12 on master, unreleased (app-dashboard v33); awaiting Jake's look on a phone. Jake's final decision: the streak is SESSIONS LOGGED IN A ROW. A finished week inside the plan breaks it if a planned session was left unlogged; with no plan (or outside it) a whole week with no session breaks it; this week never breaks it; extra sessions count. The tile reads 'N sessions in a row'. Red before, green after: tests-node/dashboard-model.test.mjs and tests/dashboard-rework-2026-10-03.spec.js. See the section at the end for the history and what was simplified."
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

## Decisions (Jake, 2026-10-12) and what was built

1. First answer: "plan weeks only" (count only weeks since the plan began). Built, then **superseded the same day** by his next answer.
2. Final: "the streak should [show] how many sessions you have logged in a row". Asked what breaks it: **a planned session left unlogged** while a plan runs; with no plan, **the same gap rule** (7 days with none).

What `_dashStreak` does (it replaces `_dashStreakWeeks`):

- The number is the sessions logged across the unbroken run of Monday-to-Sunday weeks ending with this one; every session counts, planned or not.
- A FINISHED week inside the plan breaks the run when fewer sessions were logged than planned; a planned rest week neither earns nor breaks it (its sessions still count). A finished week outside the plan (before it began, after it ended, or no plan) breaks it when no session was logged.
- THIS week never breaks it and adds what is logged so far, so a Wednesday is not a missed week and a Monday session done on a Tuesday still counts.
- A plan cannot ask for a session before its start date: a plan that begins on a Wednesday no longer makes its own first Monday unwinnable (this was the review's finding, and the reason the streak could read 0 for a diligent first week).
- The tile says "N sessions in a row"; the sub-line says "without missing a planned session" while a plan governs this week and "a session every week" otherwise. It no longer claims "your plan" for weeks before the plan. Your own case (a one-week plan after 16 weeks of single sessions) is 17 sessions in a row, and says so.

## Simplified, for Jake to know

- "7 days with none" is implemented as "a whole Monday-to-Sunday week with none", so it works with the plan rule. A gap of 8 to 12 days that touches two weeks is therefore not a break; a whole empty week is. Say if you want the exact day count instead.
- Days before the first plan week still need one session a week while the plan has not started (outside the plan), and count toward the run.

## Review follow-ups, built (2026-10-12)

- **The plan's start week is in the plan.** The assign form defaults the start date to today, so a plan assigned on a Saturday has no session on or after its start day that week. That week is now a planned rest week (it asks nothing) and not an outside week that needs one session, so it no longer breaks the run.
- **The week strip, its "x of y done", the hero and Up next agree with the streak.** Planned days before the start date are filtered once, where the plan is loaded (`_dashPlannedFrom`); a plan that starts on a Wednesday used to show its own Monday as a red miss. The calendar and the Workouts page still show those days (not changed).
- Tile wording: with nothing yet it always says "log a session to start one" (a planned rest week asks for none); a capped 1 reads "1+ sessions".

## Carried, for Jake (strict by design)

- **A planned session must be logged by Sunday of its week.** Weeks are strict buckets: with a Mon/Wed/Fri plan, Mon and Wed logged and the Friday session done the next Monday, the finished week is one short and breaks the run; the late session counts in the new week. This is the rule as written, and it is the price of a simple, explainable streak. Say if you want a grace day.
- The runner stamps a session with the UTC date while the dashboard buckets by the local week, so a session logged in the first hour after midnight (BST) can land in the previous week. Already open: [the runner saves the session date as the UTC day](2026-10-04-runner-saves-the-session-date-as-the-utc-day.md).
