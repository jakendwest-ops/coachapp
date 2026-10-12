---
id: 2026-10-12-streak-tile-says-16-weeks-hitting-your-whole-plan-but-the-plan-is-one-week-old
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-12
status_detail: "FIXED 2026-10-12 on master, unreleased (app-dashboard v33); awaiting Jake's look on a phone. Jake chose 'plan weeks only': while a plan is running the streak starts with the plan (it never counts the weeks before it); before the plan begins it is 0; with no dated plan it stays a plain training streak and is labelled as one. Red before, green after: tests-node/dashboard-model.test.mjs (Jake's one-week-plan case reads 0, not 16; the not-begun, no-dated-plan and exactly-52-weeks cases; the tile wording) and tests/dashboard-rework-2026-10-03.spec.js. Carried: see the section at the end."
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

## Decision (Jake, 2026-10-12) and what was built

Asked "what should the dashboard streak count?", Jake chose **plan weeks only**: while a plan is running, count only weeks since it began; with no plan it stays a plain training streak.

- `_dashStreakWeeks` never looks back past the Monday of the plan's first session; before the plan has begun it is 0 (`notBegun`); it returns `onPlan`, which says whether the number was counted by the plan.
- The tile's words follow `onPlan`, not "a program exists": "hitting your whole plan" only for a plan-counted streak, "a session every week" for a plain one, "your plan has not started yet" before it begins. A program with no start date or no sessions has nothing dated, so it is a plain streak and says so (found by the review).
- A plan exactly 52 weeks old no longer shows "53+" (review).

## Carried (not built, for Jake)

- **A plan assigned mid-week can start with an impossible week.** Week 1 counts every planned session in that calendar week, including days before the start date, so someone who starts on a Wednesday of a Mon/Wed/Fri plan can never complete week 1 and the streak stays 0 until week 2 is done. This was already true of the plan's own weeks; it matters more now that week 1 is where the streak begins. A fix would count only sessions on or after the start date.
- The streak resets to 0 whenever a program is re-assigned or restarted (a new assignment is a new plan). That follows the rule Jake chose; the wording does not say so.
- If a newer program has been assigned beside a running one, the newest assignment decides (the same convention as the Workouts page and the calendar).
