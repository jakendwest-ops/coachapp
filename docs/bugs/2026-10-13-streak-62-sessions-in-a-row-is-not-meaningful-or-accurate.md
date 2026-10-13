---
id: 2026-10-13-streak-62-sessions-in-a-row-is-not-meaningful-or-accurate
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-13
status_detail: "BUILT 2026-10-13, not released. The Streak tile is plan adherence while a plan governs the week, and weeks in a row at a weekly target (set in Settings, default 3) when none does. Needs the SQL in scripts/add-weekly-session-target-2026-10-13.sql run in Supabase BEFORE the release tag (until then Save target fails with a message). Closes when Jake confirms on his phone."
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

## Plan (built; see "Built" below)

- Replace `_dashStreak` (a pure function, `js/app-dashboard.js`) with two pure functions under the same node tests: `_dashPlanAdherence` (due so far, done, this week, week n of N; planned days before the start date or in the future are not due) and `_dashTargetStreak` (weeks in a row at the target, this week never breaks it). `_dashTilesHtml` shows whichever applies, and the plan tile beside it keeps its job.
- The target: a "Weekly target" row in Settings (1 to 14, default 3), read in `loadUserInfo` with the units. **SQL for Jake to run (one line, no data touched):** `alter table profiles add column if not exists weekly_session_target smallint check (weekly_session_target between 1 and 14);` The code reads a null as 3 and works before the SQL is run, so the order is not critical.
- Tests: node tests for both functions (plan week boundaries, a plan starting mid-week, a plan that has ended, extras, the no-plan weeks, the cap), a Playwright spec for the tile in each state and for saving the target, and a mutation check on each rule. Before the tile is drawn for real, a tappable prototype of the two states.
- Not in scope: the week strip, the plan tile, push reminders.

## Built (2026-10-13)

- **Model** (`js/app-dashboard.js`, pure functions, unit-tested): `_dashPlanAdherence` (done / due so far, week n of N, this week's count), `_dashTargetStreak` (weeks in a row at the target; this week counts once it reaches it and never breaks the run before then), `_dashStreakModel` (picks one), `_dashWeeklyTarget` (null, 0, 15, text, a fraction or a boolean all read as 3), `_dashStreakTileHtml`. `_dashStreak` is gone.
- **The tile:** plan on: "Sessions done / 9 of 10 planned so far / Week 3 of 8 · this week 2 of 4" and a bar. No plan: "Streak / 4 weeks in a row / at 3 a week · this week 1 of 3" and a bar; tapping it opens Settings. Nothing due yet reads "0 sessions due yet"; a planned rest week reads "a rest week".
- **The target:** Settings > Weekly target (a 1 to 14 list), kept in `profiles.weekly_session_target`. Read on its own at login (`_loadWeeklyTarget`, started beside the profile read), never in the main profile select, so a missing column cannot fail the profile; a failed read is the default. Saving asks for the written row back, so a save that RLS filters out, or that matches no row, is a failure and not "Saved".
- **SQL for Jake to run (one line, no data touched):** `alter table profiles add column if not exists weekly_session_target smallint check (weekly_session_target between 1 and 14);`
- **Checks:** 59 node tests (the rules, the plan's first and last day, a Sunday start, daylight saving fixed to London, timestamps, junk keys), each rule broken on purpose and caught (50 deliberate breakages across the model, tile, loader, Settings card, save and call site). Playwright: dashboard-rework (the tile in each state, the target honoured, the View-as page uses the default and is not a link), weekly-target (load, the missing-column case, the Settings card, the save, a refused range, a save that updates no row), solo-dashboard-tiles. 3-angle review: no blocking findings; its non-blocking ones were fixed (a stale old-shape caller whose test stayed green while the tile printed "undefined", the View-as link, the unpinned plan edges, a save that could not tell a no-op from a write, the extra login round trip, tests that depended on the test account's real target).
- **Known limits:** (1) In the owner's "View as" page the tile uses the default of 3, not that client's own target (it cannot read it). (2) A plan more than a year long is measured over the last year only. (3) A plan with no start date has no dated sessions, so the tile falls back to the weekly target. (4) A session logged between 00:00 and 01:00 BST on a Monday is dated Sunday by the runner (open row 2026-10-04-runner-saves-the-session-date-as-the-utc-day) and so lands in the week before, in both modes. (5) Both number tiles are `section` elements with a tap handler and no keyboard control; the program tile already was.
