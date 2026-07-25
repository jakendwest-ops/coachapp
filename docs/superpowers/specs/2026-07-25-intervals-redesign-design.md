# Intervals redesign — design spec

**Date:** 2026-07-25
**Status:** approved for planning
**Supersedes:** the flat work/rest×rounds interval handling shipped 2026-07-24 (`7aeb3ae`)

---

## Context

Jake, using the live app, raised two things about the interval work shipped the day before: the
"Repeat ×" control in the set builder is poor UI, and he showed screenshots of **Tabata Stopwatch
Pro** as how he envisions prescribing cardio/intervals — both its measure list *and* its underlying
interval model. Asked to distinguish, he confirmed: **both**.

Research into the current code (see "What the code actually does today") found the bad UI is a
symptom rather than the disease: **CoachApp's data model has no rounds field — a round *is* a row**.
`repeatTemplateSet` exists solely to materialise N identical `sets_json` entries, because there is
nowhere to store "× 8". Restyling the builder without changing the model would leave the cloned rows
in place behind a nicer surface.

The intended outcome: prescribing an interval block is **one screen describing one block**, the
runner walks it as a proper phase sequence, and the cloned-rows workaround disappears.

Beta is 31 July 2026. Jake chose this over the banked "Solo becomes a genuine account type"
pre-beta decision, explicitly accepting that Solo likely slips past beta.

---

## Decisions locked (Jake, 2026-07-25)

| Decision | Choice | Note |
|---|---|---|
| Copy the model, the UI, or both | **Both** | Reference: Tabata Stopwatch Pro screenshots |
| New type vs replace Cardio | **New `interval` type; Cardio untouched** | Zero migration of existing cardio templates |
| Rounds within a block | **Identical rounds only** | No ladders/pyramids — explicitly out of scope |
| Work measured by | **Time *and* distance** | Distance rounds advance manually |
| Warmup/cooldown logged | **Recorded** | Requires a new `phase` column |
| Recovery logged | **No — timed only** | Consistent with rest (Jake, 2026-07-23) |

Carried forward from the 2026-07-23 interval scoping session, unchanged:
per-round results *are* recorded; rest between rounds is **timed, not recorded**.

---

## The model

An `interval` exercise's `sets_json` holds **exactly one entry** describing the whole block.

| Field | Meaning | Default |
|---|---|---|
| `countdownSecs` | Get-ready lead-in before the first work interval | 5 |
| `warmupSecs` | Warm-up | 0 (off) |
| `isDistanceBased` | Work rounds measured by distance rather than time | false |
| `workSecs` | Work interval duration (when `!isDistanceBased`) | required |
| `workDistanceM` | Work interval distance in metres (when `isDistanceBased`) | required |
| `restSecs` | Rest after each work round | required |
| `sets` | Work/rest pairs per cycle | required |
| `recoverySecs` | Recovery after each cycle | 0 (off) |
| `cycles` | Times to repeat the set block | 1 |
| `cooldownSecs` | Cool-down | 0 (off) |

**Sequence:** `countdown → warmup → [ (work → rest) × sets → recovery ] × cycles → cooldown`

Rest runs after **every** work round, and recovery after **every** cycle, including the last of
each. This is not an arbitrary choice — it is verified against the reference app's own arithmetic:
warmup 2:00 + (4 sets × (4:00 work + 2:00 rest)) + 1:00 recovery = **27:00**, which is the total
that screenshot displays. Matching it exactly avoids inventing skip rules that would surprise
someone coming from that app.

Zero-valued phases (`warmupSecs: 0`, `cooldownSecs: 0`, `recoverySecs: 0`) are omitted from the
sequence entirely rather than run as 0-second phases.

The existing block-level cardio targets — pace/500m, watts, HR zone, stroke rate — remain
available under the same `+ More targets` disclosure, applying to work rounds.

### Explicitly out of scope

- **Per-round variation** (ladders, pyramids, differing work per round). Jake confirmed identical
  rounds are sufficient. A block cannot express "30s, 45s, 60s".
- **Replacing or migrating the existing Cardio type.** Steady-state cardio stays exactly as it is.
- **Presets** (the reference app's Load/Save/Arrange). Not requested.

---

## Storage and migration

### `metric_type` gains `interval`

The existing CHECK constraint already permits **7** values — `weight_reps`, `cardio`, `unilateral`,
`amrap`, `timed_hold`, `jump_height`, `jump_distance` (`scripts/add-metric-type-2026-07-18.sql:27`)
— of which `amrap` is DB-legal but has no UI anywhere. Adding `interval` is a re-run of the
idempotent drop-and-re-add across three tables and their three differently-named constraints
(`exercises_metric_type_chk`, `wte_metric_type_chk`, `wle_metric_type_chk`, lines 20–31). No data
migration, no downtime.

### ⚠️ The legacy `exercise_type` trap

**The runner and save path gate cardio behaviour on `ex.type === 'cardio'` — the legacy
`exercise_type` column — not on `metric_type`.** Three places: `js/app-runner.js:803`, `:1068`,
`:1962`. An `interval` exercise whose `exercise_type` is not `'cardio'` would fall into the strength
branch of `logRunnerSet` and of the save, **silently losing `duration_seconds` and `distance_m`**.

Therefore: interval exercises must also carry `exercise_type = 'cardio'`, derived at save time by
the builder's existing `_deriveFromMetricType` mechanism — the same established pattern that already
derives legacy fields from `metric_type`. This is the single highest-risk detail in the build.

### New column: `workout_log_sets.phase`

Required because Jake chose to record warmup and cooldown.

```sql
alter table workout_log_sets add column if not exists phase text;
alter table workout_log_sets drop constraint if exists wls_phase_chk;
alter table workout_log_sets add constraint wls_phase_chk
  check (phase is null or phase in ('warmup','work','cooldown'));
```

Nullable, no default. `null` means an ordinary set — every pre-existing row, and every strength or
steady-state cardio set, is unaffected. Only interval-logged rows carry a value.

`rest` and `recovery` are **not** in the allowed values: neither is recorded, so neither can ever
appear.

Achieved data otherwise reuses existing columns and needs nothing new: `set_number` (round index),
`duration_seconds`, `distance_m`, `avg_hr`, `max_hr`, `avg_watts`.

### Known pre-existing gap, not fixed here

`paceAchieved` is captured on the interval overlay (`js/app-runner.js:1295`) and in
`logRunnerSet` (`:1005`) but **has no column and is never persisted** — it survives only in memory
and the local draft. Out of scope for this spec; ledgered separately.

---

## Builder UI

One screen per interval block. No per-set cards, no cloning, no repeat control.

A vertical list of labelled rows — label left, value right, hairline separator — which is **not a
foreign pattern**: it is the existing `row()` helper (`js/app-workouts.js:1259`) already used
throughout the set editor, applied to a block instead of repeated per set.

Shown below filled in with the reference app's own example config, so it ties back to the 27:00
arithmetic above:

```
Initial countdown        0:00
Warm-up                  2:00
Work                     4:00        ← or "400 m" when distance-based
Rest                     2:00
Sets                     4
Recovery                 1:00
Cycles                   1
Cool-down                0:00
─────────────────────────────
Total time              27:00
+ More targets
```

- A **Time | Distance** toggle on the Work row, reusing the existing `tog()` pill pattern already
  used for the cardio Duration/Distance switch.
- A live **total time** readout, mirroring the reference app. **When the block is distance-based,
  work-round duration is unknowable, so this must not display a confident total** — it shows the
  timed portion with an explicit qualifier (e.g. `12:00 + work time`) rather than a wrong number.
- Distance values respect the account's cardio-distance unit preference via the existing
  `distanceToPref`/`distanceFromPref` helpers.

### Related smaller fix

The `ts-repeatn-*` box and "Repeat ×" button disappear for intervals. They remain on strength types,
where they have the problems Jake identified: no label (only a placeholder), rendered on *every* set
row, ~11px controls well under the 44px tap target enforced elsewhere in the CSS, and an
expand-with-no-undo action. Labelling/relocating it there is a **separate follow-up item**, not part
of this build.

---

## Runner

### Flat phase expansion

Rather than extending the current hand-rolled chain — `startRunnerCountIn → startIntervalTimer →
startRestTimer → _afterRest`, where `_afterRest` is a **one-shot single-slot callback**
(`js/app-runner.js:1407`) — the block is expanded **once at launch into a flat array of phases**:

```js
[{ phase:'countdown', secs:5 },
 { phase:'warmup',    secs:120 },
 { phase:'work',      secs:30, set:1, cycle:1 },
 { phase:'rest',      secs:30, set:1, cycle:1 },
 …
 { phase:'cooldown',  secs:60 }]
```

The runner then walks an index. This matters for three concrete reasons:

1. **Testability** — the expansion is a *pure function* (block object in, phase array out), testable
   without driving a browser or touching Supabase.
2. **Total time** is a sum over the array; **"Set 3 of 8 · Cycle 2 of 4"** is a property read on the
   current entry. Neither needs nested counters.
3. A one-shot callback chain across 8 phase types and 2 nesting levels is exactly the shape that
   has produced timer bugs in this codebase before (stray timers surviving teardown, `_afterRest`
   firing when it should have been nulled — see the comments at `js/app-runner.js:1559` and `:1672`).

### Advancing between phases

- **Timed phases** (countdown, warmup, rest, recovery, cooldown, and timed work) auto-advance on
  reaching zero, as today.
- **Distance work rounds cannot auto-advance** — there is no sensor. The athlete taps **Done**.
  This also closes a real existing gap: today, distance-based rounds simply *stop* rather than
  chaining, because both re-arm sites guard on `!isDistanceBased` (`js/app-runner.js:1317`, `:1070`).
  Under the new model the manual tap is the advance mechanism, so the dead-end disappears.

### Overlay

Extends the existing full-screen interval overlay (`renderIntervalTimer`, `js/app-runner.js:1347`)
rather than replacing it — the ring SVG, `speakCue` spoken countdown, `playBeep`, and the count-in
overlay are all reused as-is.

Additions: the **current phase name** (warm-up / work / rest / recovery / cool-down), and a
**sets · cycles · time-remaining** row mirroring the reference app's layout.

Known limitation carried over: the full-screen overlay covers the wizard card beneath it, so
prescribed pace/watts/HR chips are not visible mid-interval. Surfacing them on the overlay is
desirable but **not required** for this build.

---

## Logging and display

- One `workout_log_sets` row per **work** round, `set_number` = round index (1-based), `phase='work'`.
- One row each for warmup and cooldown when present, `phase='warmup'` / `'cooldown'`.
- **No rows** for rest or recovery.

**Display consequence that must be handled:** Progress-page aggregates count logged rows as sets
(`_diaryExMetrics`, `_exerciseRecords`, session-summary tiles in `js/app-progress.js`). Warmup and
cooldown rows would inflate set counts and session totals unless those aggregates exclude
`phase in ('warmup','cooldown')`. This is a required part of the build, not a follow-up — otherwise
recording warmups silently corrupts every session's set count.

---

## What the code actually does today (research findings)

Verified by direct read, 2026-07-25 — these are the facts the design is built on:

- **A round is a `sets_json` row.** `targetSets = ex.sets_json?.length || 3`
  (`js/app-runner.js:40`); the current round's target is `sets_json[loggedSets.length]`. There is no
  repeat/rounds field anywhere. This is *why* `repeatTemplateSet` clones rows.
- **Per-round rest is already ignored.** `ex.restSecs` is computed **once** at launch from
  `sets_json[0].restMin` (`js/app-runner.js:37`). Rest values on rounds 2..n are never read.
  `restMax` is never read anywhere in the run path. The builder currently implies a per-row control
  that the runner does not honour.
- **No warmup / cooldown / recovery / cycle concept exists** anywhere in `js/` — confirmed by
  search. The only grouping primitive is `superset_group`, which is exercise-level and flat.
- **Distance rounds never chain** (see above).
- **`paceAchieved` is never persisted** (see above).

---

## Verification

Red→green throughout, per project norm.

**Pure-function tests** (no browser needed) — the highest-value coverage here:
- Phase expansion for: minimal block (no warmup/cooldown/recovery); full block; `cycles: 1`;
  `sets: 1`; zero-valued phases omitted rather than emitted as 0s.
- Expansion arithmetic reproduces the reference app's 27:00 worked example exactly.
- Total-time sum; distance-based blocks return a partial/qualified total, never a confident wrong one.

**Behavioural (Playwright):**
- Building an 8-set block produces **one** `sets_json` entry, not eight — the core regression this
  redesign exists to prevent.
- An interval exercise saves with `exercise_type = 'cardio'`, and a logged round persists
  `duration_seconds` / `distance_m` (guards the legacy-`exercise_type` trap above).
- Runner walks phases in order; only work/warmup/cooldown rows are written; rest and recovery write
  nothing.
- A distance work round advances on the Done tap and does **not** dead-end.
- Progress set counts and session totals exclude warmup/cooldown rows.
- Existing cardio templates are untouched — a regression check that this build changed nothing for them.

**Gates:** full Playwright suite (currently 220 tests) at the real 390px viewport;
`multi-agent-review` (3 angles + verifier) before push; cache-bust bumps for every touched module
(`app-workouts`, `app-runner`, `app-progress` expected) in the same commit.

**Manual, Jake:** the migration must be run in Supabase before the code goes live — and per
**les-053**, never while a Playwright run is in flight against the live database.
