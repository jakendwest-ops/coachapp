# Progress-tracking overhaul — capture + display for all exercise categories

**Date:** 2026-07-18
**Status:** Design approved (brainstorm). Each sub-project (①–④) gets its own implementation plan before build.

## Context

The "My Progress" page (`#progress`, Performance › Per exercise) is sparse: each exercise card plots only
a single derived max-weight-per-session line, and the "Per session" view is a reverse-chronological list
capped at 20 sessions. For a feature Jake considers **core to coaches tracking athletes over
weeks/months/years**, it shows almost none of the data it should.

Two exploration findings reframed the work (both confirmed by reading the code):

1. **The data mostly isn't being saved.** The in-gym runner captures rich per-set data in memory
   (`ex.loggedSets`: unilateral L/R reps+weight, timed, jump/carry distance) but the save row-builders in
   `saveRunnerSession` / `saveWorkoutSession` (`js/app-runner.js` ~1619-1634 / ~2127-2147) never read
   those fields, so they are silently dropped. Only `weight_kg`, `reps_achieved`, and (cardio)
   `duration_seconds` / `distance_m` ever reach `workout_log_sets`. **Heart rate is never logged** — HR
   exists only as a *prescribed target* on cardio templates, never an actual value.
2. **There are only two real exercise types.** `exercise_type` is a free-form string with two UI values
   (`strength`, `cardio`); unilateral / AMRAP / timed / jump are bolted on as boolean flags or by
   name-pattern-matching the exercise name (fragile).

So this is **two layers stacked**: a **capture** layer (runner + schema must persist every metric) and a
**display** layer (Progress must chart it). No display work can show data the capture layer throws away.

## Decisions (locked with Jake in this brainstorm)

- **Scope:** design the whole thing end-to-end, then build in sequenced sub-projects.
- **Audience:** one shared component, surfaced in both the client/solo "My Progress" page and the coach's
  view of a client (client-profile) — the coach sees exactly what the athlete sees.
- **Heart rate:** manual entry now (per-set avg/max HR + resting HR on check-in); wearable sync is a
  separate future project.
- **Model:** a first-class `metric_type` per exercise drives capture UI + storage + charting in lockstep.
- **Storage:** Approach A — typed columns on `workout_log_sets` (not a JSON blob, not a normalized
  `set_metrics` table). Chosen because it matches how the whole app already stores and charts sets (flat
  columns, simple `select`s), keeps the weeks/months/years aggregation queries cheap, and avoids the
  nested-JSON/PostgREST pitfalls this codebase has already been bitten by twice.
- **Runner UI:** one adaptive Hevy-style fast table whose columns switch by `metric_type`; the
  step-by-step wizard is retired for these types. Unilateral logs as two rows per set (an L row and an R
  row) to stay mobile-friendly on a 390px phone rather than cramming four columns.
- **Display:** enriched per-exercise trend cards are the primary view; per-session is demoted to a
  lightweight "Recent sessions" diary; a resting-HR trend is added to the Body tab.

## The metric_type model

Each exercise declares a `metric_type` that determines what the runner logs and how Progress charts it:

| metric_type | fast-table columns | progress chart / metrics |
|---|---|---|
| `weight_reps` | WEIGHT · REPS · (RPE) · ✓ | Top weight · Est 1RM (Epley) · Volume · expandable set-by-set |
| `unilateral` | L row: WEIGHT · REPS · ✓ / R row: WEIGHT · REPS · ✓ | dual L/R lines (imbalance) · volume per side |
| `amrap` | REPS · ✓ (target time as the row label) | reps over time |
| `timed_hold` | TIME · (WEIGHT) · ✓ | duration over time (+ load if any) |
| `jump_height` | HEIGHT (cm) · ✓ | best height per session |
| `jump_distance` | DISTANCE (m) · ✓ | best distance per session |
| `cardio` | TIME · DISTANCE · (AVG HR · MAX HR) · ✓ | distance · duration · pace · avg HR |

Body metrics logged outside a workout: bodyweight (exists) + resting HR (new).

## Build order — four sequenced sub-projects

Capture must precede display; within capture, schema precedes runner. A fast partial win is available —
display for *already-captured* metrics (volume, e1RM, cardio distance/duration) could ship before the
new-metric capture lands — but this end-to-end spec sequences all four. Each gets its own implementation
plan (via writing-plans) before its build; do not attempt all four in one pass.

### ① Data model (foundation, no user-visible change)

- Add `metric_type` to the exercise definition — on `workout_template_exercises`, and the canonical
  exercise-library record (confirm exact table during build; likely `exercises`). SQL in `scripts/`.
- Backfill: `strength` → `weight_reps`, `cardio` → `cardio`, name-pattern the obvious jumps (`box jump`,
  `broad jump`, `high jump`, …) → `jump_*`. Fix-forward; leave genuinely ambiguous rows as `weight_reps`
  for Jake to reclassify, never retroactively rewrite.
- Add typed columns to `workout_log_sets` (Approach A): `avg_hr`, `max_hr`, `height_cm`, `side`
  (`'left'` / `'right'` / null). Reuse existing `distance_m`, `duration_seconds`.
- Run through the **sql-safety** skill; add/adjust RLS as needed. Watch the recurring solo trap (solo's
  `coach_id` is NULL) and the embed-chain RLS trap (PostgREST silently nulls unreadable nested levels) —
  any new column must be readable by client AND solo AND the coach viewing the client.

### ② Capture — runner (`js/app-runner.js`, `js/app-workouts.js`)

- Exercise builder (`app-workouts.js`): replace the two-value Strength/Cardio `<select>` with a
  `metric_type` picker covering all seven types.
- Make the fast strength table **metric_type-aware**: render columns per the table above; change
  `_isPlainStrengthExercise` (`app-runner.js` ~266-272) so unilateral / timed / jump stay in the fast
  table instead of being kicked to the wizard. Retire the wizard path for these types.
- Fix the save row-builders (`saveRunnerSession`, `saveWorkoutSession`) to persist **every** field the
  logging UI collected, keyed off `metric_type` — this is the core "stop dropping data" fix.
- New manual inputs: per-cardio-set avg/max HR; resting HR on the Body Weight / check-in flow (logged as
  a body metric, not tied to a workout); jump-height / hold-duration / AMRAP-reps inputs via the adaptive
  columns.
- Preserve the fast in-gym logging flow for plain `weight_reps` — no regression to the common case.
- **missed-check-to-test:** add Playwright coverage that logs one set of each metric_type and asserts it
  round-trips to `workout_log_sets`. Silently-dropped set fields are exactly the bug class tests must now
  guard.

### ③ Display — Progress rebuild (`js/app-progress.js`)

- Rebuild the per-exercise view (`renderProgressStrength` / `_renderPerfExerciseList`, ~1204-1269) into
  metric_type-aware **trend cards**: header (name, type badge, headline best) + metric toggle chips (only
  the relevant ones per type) + a range selector (`1M · 3M · 6M · 1Y · All`) with smart weekly/monthly
  aggregation on long ranges so multi-year charts stay readable.
- Stop discarding `reps_achieved`; compute Est 1RM (Epley) and Volume; add expandable set-by-set detail.
- Unilateral → dual L/R lines; cardio → distance/duration/pace/avg-HR toggle; jump / timed / amrap →
  their single trend line.
- Body tab (`renderProgressWeight`, ~1097-1193): add a resting-HR trend chart alongside bodyweight.
- **Demote per-session** (`renderProgressPerSession`, ~981-1032): reframe as a lightweight "Recent
  sessions" diary (last ~10, collapsed by default), no longer the progression tool; per-exercise trends
  become the default Performance view.
- Charting stays on **Chart.js** (already used) — no new dependency.

### ④ Coach parity

- Factor the per-exercise + charts module so it takes `(clientId, role)` and render it from BOTH the
  client/solo "My Progress" page and the coach's client-profile view — replacing/aligning the older
  PT-facing `renderClientPerformance` / `renderClientWeight` (`app-progress.js` ~252 / ~521) so both
  audiences see one identical rich view.

## Critical files

- `scripts/*.sql` — new migration (metric_type, `workout_log_sets` columns, RLS).
- `js/app-workouts.js` — exercise builder metric_type picker; `sets_json` planning shape.
- `js/app-runner.js` — adaptive fast table, `_isPlainStrengthExercise` gate, save row-builders, HR inputs.
- `js/app-progress.js` — per-exercise trend cards, range/aggregation, resting-HR, per-session demotion,
  shared component for coach parity.
- `js/app-clients.js` / client-profile — resting-HR check-in field; mount the shared component.
- `index.html` — cache-bust bumps for every changed module, in the same commit.

## Verification (per sub-project, end-to-end)

1. **① model:** migration runs clean; confirm cross-tenant reads via **sql-safety** + a real client AND
   solo AND coach-viewing-client (behavioural, not just `pg_policies`).
2. **② capture:** `run-coachapp`, log one workout containing each metric_type as solo; confirm every
   field lands in `workout_log_sets` (query it). **mobile-check** at 390×844 for the unilateral L/R rows
   and cardio HR columns. Playwright round-trip tests (above).
3. **③ display:** open Progress as solo — each metric_type charts correctly, metric toggles work, the
   range selector + long-range aggregation behave, resting-HR shows on the Body tab, per-session is the
   demoted diary. **feature-audit** through a PT's and a gym user's eyes.
4. **④ parity:** the same view renders identically in the coach's client-profile; client is read-only.
5. `npm test` (update changed selectors + add new coverage); **multi-agent-review** before each push;
   cache-bust bump; commit; push.

## Notes

- Beta is 31 July 2026. If timeline pressures, ① → ② → ③ for `weight_reps` + `cardio` first delivers the
  biggest visible win, with the rarer metric types and ④ as fast-follows.
