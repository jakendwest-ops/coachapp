# Strength progress: an estimated-1RM trend per lift, and block comparison

**Date:** 2026-10-31 · **Status:** design, awaiting Jake's approval · **Builds after:**
[Personal view: four destinations](2026-10-31-personal-view-four-tabs-design.md) (Records hosts this).

## Intent and why

Jake (2026-10-31, question by question): the Performance charts are **hard to read** — they do not say plainly what they show — and
**hard to get to** for one exercise; and views he wants are **missing**. Of the missing views he ranked: **estimated-1RM trend first,
then block comparison**; cardio over time and weekly volume later (not in this piece).

## Goals

1. **An estimated-1RM (e1RM) trend per lift.** Tap an exercise in **Records** and its chart opens right there, in place: one line,
   one point per session (that session's best e1RM), the all-time best marked and labelled with its date and the set it came from.
   The title says what the line is in plain words: "Estimated 1-rep max, best set each session". A short line under it says how it
   is estimated (from RPE when a set carried one, otherwise from weight and reps) and which way is good (up).
2. **Block comparison.**
   - **Summary:** a per-lift table for "this block" against "the last block": each lift trained in both, last block's best e1RM, this
     block's best, the change (kg and %).
   - **Tap a lift:** both blocks' e1RM lines on one chart, aligned by week of the block (week 1 against week 1).
   - **A block** is a run of a training plan (open runs from `client_programs`, finished ones from `client_program_blocks`). With no
     plan in either period, fixed windows of **6 weeks** (Claude's assumption, Jake did not object): the last 6 weeks against the 6
     before.
3. **Who sees it:** the person in **Personal view** (Records) **and a coach on a client's profile**, the same charts for that client.

## Non-goals

- Cardio over time, weekly volume (next pieces).
- Changing how sessions, sets or RPE are logged; no schema change, no SQL.
- A new e1RM formula: use the existing engine.

## Anti-goals

- **A number that disagrees with another screen.** The runner's Stats sheet, the Per exercise cards and Personal Bests already compute
  e1RM through one engine (`_xsSessionMetrics(...).e1rm` / `_pbE1rmPoints`, `js/app-progress.js`; `_estimate1RM`, `js/app-workouts.js`,
  capped at `_ESTIMATE_1RM_MAX_REPS` = 12, RPE floor 6). The new charts must read the same engine, so the same session never shows two
  different e1RMs.
- **Implying a session "belongs" to a plan.** `workout_logs` carries no programme reference; a block is a DATE WINDOW. Labels say
  "sessions logged between X and Y" (the rule the existing Per program view already follows, `js/app-progress.js` ~2132).
- **A chart that claims a trend from too little.** A lift with one session shows the point and says "one session so far", not a line.
- Units: every number follows the person's weight unit (kg / lb), including the change column.
- A coach seeing another coach's client: the reads stay inside existing RLS; nothing new is granted.

## Constraints

- Vanilla JS, Chart.js as already used (`_renderMetricChart`, `_destroyManagedCharts` before any replace); no build; `?v=` bumps.
- Reads of growing tables are paged (`_fetchAllRows`), never cut at 200 rows.
- Pure computations (per-session best e1RM, block windows, week alignment, the summary table) live in testable pure functions with
  `node:test` tests (`tests-node/`).
- Mobile first: readable at 390 px.

## Decided

- Entry point: **tap a lift in Records** (Jake). Not a separate search page.
- Block comparison shows **both** the summary table and the overlaid lines (Jake).
- Block = plan run, else weeks (Jake); 6-week windows (Claude, unchallenged).
- Coach side too (Jake).

## Left to the builder

- Where the coach reaches it on the client profile (the profile has separate `Performance` and `1RMs` tabs today; the natural home is
  wherever that client's lift records are listed).
- What happens to the existing **Per exercise** and **Per program** views (they overlap goals 1 and 2): replace, or keep as the
  detailed view behind the new ones — say which, and keep every control they offer that the new views do not (the range select, the
  metric choice, the picker).
- Which block is "this" and "last" when two plan runs overlap in time (plans can be assigned at once).
- How the best point is marked on the line.

## Open questions

Raised by the builder check; answered before planning.
