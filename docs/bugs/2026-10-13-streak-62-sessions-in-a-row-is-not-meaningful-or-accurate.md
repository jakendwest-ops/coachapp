---
id: 2026-10-13-streak-62-sessions-in-a-row-is-not-meaningful-or-accurate
status: open
priority: medium
reported: 2026-10-13
status_detail: "OPEN. Scoped with Jake 2026-10-13 (clickable questions): the tile becomes plan adherence while a plan is on, and weeks in a row at a target he sets when none is. The build plan below awaits his approval; it needs one SQL line that he runs. Nothing built."
---

# The dashboard Streak tile ("62 sessions in a row") is not meaningful or accurate

## Jake's report (verbatim, 2026-10-13)

> 'strek' needs a rework, as this is not really recording anything meaningful or accurate. scope.

Attached: the solo dashboard, the Streak tile reading "62 sessions in a row, without missing a planned session", next to the Training plan tile ("Wk 1, Mesocycle 1").

## History

2026-10-12 (his item 1): "This streak is not accurate. I have not been on this plan 16 weeks." Rebuilt as "sessions logged in a row" that starts with the plan; a planned session left unlogged breaks it (v2026.10.2). He now says that is still not meaningful.

## What would close it

**Closes when** the scope is agreed with Jake, built with a spec that fails without it, and he confirms on his phone.

## Finding (2026-10-13, read-only on Jake's own account)

The 62 is exactly the number of sessions he has logged since his first one (2026-06-22), counted as one unbroken run: every Monday-to-Sunday week since then had at least one session, and `_dashStreak` (`js/app-dashboard.js`) only breaks on an empty week outside a plan or a short week inside one. It spans several earlier plans and weeks with no plan, so it does not describe the plan he is on (week 1 of Operation 240) and the tile's own words ("without missing a planned session") do not describe what it counted. By its rule it is right; the rule says nothing he can act on. It only rises, and with a one-session-a-week bar it can run for a year without ever resetting. Nothing is mis-read from the database (0 of the 62 logs are empty).

## Decisions (Jake, 2026-10-13, from clickable questions with mock-ups)

1. **The tile** becomes **plan adherence while a plan is on**: "9 of 10 planned sessions done so far", a bar, and "Week 3 of 8 · this week 2 of 4". It starts at 0 on the first day of a plan and starts again with the next plan.
2. **"Out of"** = the planned sessions **due so far** (not the whole plan).
3. **Counting** = **by week**: a planned session counts as done when a session is logged in the same Monday-to-Sunday week, up to the number planned that week; extras add nothing (never over 100%).
4. **No plan on:** a **weekly target the person sets** (default 3, 1 to 14); the tile shows weeks in a row at that target ("4 weeks in a row at 3 a week · this week 1 of 3").
5. **The target is stored on the account** (same place as the units), so it is the same on every device. That needs one small database change that Jake runs.

## Plan to approve (not built)

- Replace `_dashStreak` (a pure function, `js/app-dashboard.js`) with two pure functions under the same node tests: `_dashPlanAdherence` (due so far, done, this week, week n of N; planned days before the start date or in the future are not due) and `_dashTargetStreak` (weeks in a row at the target, this week never breaks it). `_dashTilesHtml` shows whichever applies, and the plan tile beside it keeps its job.
- The target: a "Weekly target" row in Settings (1 to 14, default 3), read in `loadUserInfo` with the units. **SQL for Jake to run (one line, no data touched):** `alter table profiles add column if not exists weekly_session_target smallint check (weekly_session_target between 1 and 14);` The code reads a null as 3 and works before the SQL is run, so the order is not critical.
- Tests: node tests for both functions (plan week boundaries, a plan starting mid-week, a plan that has ended, extras, the no-plan weeks, the cap), a Playwright spec for the tile in each state and for saving the target, and a mutation check on each rule. Before the tile is drawn for real, a tappable prototype of the two states.
- Not in scope: the week strip, the plan tile, push reminders.
