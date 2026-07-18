# Progress Data-Model Foundation (sub-project ①) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `metric_type` to every exercise record and typed metric columns to `workout_log_sets`, with a fix-forward backfill, so later sub-projects can capture and chart all exercise categories — with **zero user-visible change** in this sub-project.

**Architecture:** A single hand-run SQL migration (Supabase SQL editor, recorded in `scripts/` per project convention). `metric_type` is added to `exercises` (source-of-truth default), and denormalized onto `workout_template_exercises` and `workout_log_exercises` — mirroring exactly how `exercise_type` already flows from library → template → log, because a logged exercise's `exercise_id` is nullable (freeform exercises) so history cannot rely on a join back to `exercises`. `workout_log_sets` gains `avg_hr`, `max_hr`, `height_cm`, `side` (Approach A: typed columns, matching the table's existing flat shape). All additions are nullable/defaulted, so existing reads and writes keep working untouched.

**Tech Stack:** Supabase Postgres + RLS; migrations authored as `.sql` in `scripts/`, run by Jake in the Supabase SQL editor; verification via SQL verify queries + the Playwright E2E suite (`npm test`). No JS changes, therefore **no cache-bust bump** and **no `index.html` edit** in this sub-project.

## Global Constraints

- **No user-visible change.** This sub-project ships schema only. No JS module changes → no `?v=N` bump.
- **Additive & reversible only.** Every DDL statement is `add column if not exists` with a nullable or
  defaulted column. No drops, no type changes, no NOT NULL on existing tables. The migration must be safe
  to run twice (idempotent).
- **Fix-forward backfill.** Backfill from data we can trust (`exercise_type`), plus a conservative
  jump-name pattern. Leave anything ambiguous as `weight_reps` for Jake to reclassify later — never
  guess-reclassify, never rewrite non-null values.
- **Cross-tenant safety.** Adding a column inherits the table's existing row-level policies — no new RLS
  policy is required — but this MUST be verified behaviourally as client AND solo AND coach-viewing-client
  (solo's `coach_id` is NULL; PostgREST silently nulls unreadable nested embed levels).
- **`metric_type` allowed values:** `weight_reps`, `cardio`, `unilateral`, `amrap`, `timed_hold`,
  `jump_height`, `jump_distance`. Default `weight_reps`.
- **`side` allowed values:** `left`, `right` (nullable; null = bilateral/not-applicable).
- Run the migration through the **sql-safety** skill before handing it to Jake.

---

### Task 1: Author the migration script (DDL + backfill)

**Files:**
- Create: `scripts/add-metric-type-2026-07-18.sql`

**Interfaces:**
- Produces: columns `exercises.metric_type`, `workout_template_exercises.metric_type`,
  `workout_log_exercises.metric_type` (all `text not null default 'weight_reps'` with a CHECK on the
  7 allowed values); and `workout_log_sets.avg_hr smallint`, `workout_log_sets.max_hr smallint`,
  `workout_log_sets.height_cm numeric`, `workout_log_sets.side text` (CHECK `left`/`right`, nullable).
  Later sub-projects (② capture, ③ display) consume exactly these names.

- [ ] **Step 1: Write the DDL + backfill script**

Create `scripts/add-metric-type-2026-07-18.sql` with this exact content:

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Progress overhaul — sub-project ① DATA MODEL. First-class metric_type + typed metric columns.
-- Design: docs/superpowers/specs/2026-07-18-progress-tracking-overhaul-design.md
-- Run in the Supabase SQL editor. Additive, idempotent, reversible. No user-visible change.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- metric_type is intrinsic to an exercise ("Box Jump is always jump_height"), so it lives on the
-- canonical `exercises` library AND is denormalized onto the template/log rows exactly like
-- exercise_type already is — a logged row's exercise_id is nullable (freeform), so progress history
-- must not depend on a join back to `exercises`.
alter table exercises                 add column if not exists metric_type text not null default 'weight_reps';
alter table workout_template_exercises add column if not exists metric_type text not null default 'weight_reps';
alter table workout_log_exercises      add column if not exists metric_type text not null default 'weight_reps';

-- Constrain to the 7 known kinds. Drop-then-add so re-running updates the allowed set cleanly.
do $$
begin
  alter table exercises                 drop constraint if exists exercises_metric_type_chk;
  alter table workout_template_exercises drop constraint if exists wte_metric_type_chk;
  alter table workout_log_exercises      drop constraint if exists wle_metric_type_chk;
end $$;
alter table exercises                 add constraint exercises_metric_type_chk
  check (metric_type in ('weight_reps','cardio','unilateral','amrap','timed_hold','jump_height','jump_distance'));
alter table workout_template_exercises add constraint wte_metric_type_chk
  check (metric_type in ('weight_reps','cardio','unilateral','amrap','timed_hold','jump_height','jump_distance'));
alter table workout_log_exercises      add constraint wle_metric_type_chk
  check (metric_type in ('weight_reps','cardio','unilateral','amrap','timed_hold','jump_height','jump_distance'));

-- Typed per-set metric columns (Approach A). distance_m / duration_seconds already exist and are reused.
alter table workout_log_sets add column if not exists avg_hr    smallint;
alter table workout_log_sets add column if not exists max_hr    smallint;
alter table workout_log_sets add column if not exists height_cm numeric;
alter table workout_log_sets add column if not exists side      text;
do $$ begin
  alter table workout_log_sets drop constraint if exists wls_side_chk;
end $$;
alter table workout_log_sets add constraint wls_side_chk check (side is null or side in ('left','right'));

-- ── BACKFILL ────────────────────────────────────────────────────────────────────────────────────
-- Trustworthy signal first: the denormalized rows already carry exercise_type. cardio → cardio,
-- everything else stays the 'weight_reps' default. Only touch rows still at the default so a re-run
-- never clobbers a value ② later set explicitly (fix-forward).
update workout_template_exercises set metric_type = 'cardio'
  where metric_type = 'weight_reps' and exercise_type = 'cardio';
update workout_log_exercises set metric_type = 'cardio'
  where metric_type = 'weight_reps' and exercise_type = 'cardio';

-- Conservative jump name-patterns (all three tables). Deliberately narrow: only names that are
-- unambiguously a bodyweight jump measured by height or distance. Loaded/known-strength jumps
-- (e.g. "Trap Bar Jump") are intentionally NOT matched — they stay weight_reps for Jake to set.
update exercises                 set metric_type = 'jump_height'
  where metric_type = 'weight_reps' and name ~* '(box|vertical|depth|high) *jump';
update exercises                 set metric_type = 'jump_distance'
  where metric_type = 'weight_reps' and name ~* '(broad|standing *long|horizontal|long) *jump';
update workout_template_exercises set metric_type = 'jump_height'
  where metric_type = 'weight_reps' and exercise_name ~* '(box|vertical|depth|high) *jump';
update workout_template_exercises set metric_type = 'jump_distance'
  where metric_type = 'weight_reps' and exercise_name ~* '(broad|standing *long|horizontal|long) *jump';
update workout_log_exercises      set metric_type = 'jump_height'
  where metric_type = 'weight_reps' and exercise_name ~* '(box|vertical|depth|high) *jump';
update workout_log_exercises      set metric_type = 'jump_distance'
  where metric_type = 'weight_reps' and exercise_name ~* '(broad|standing *long|horizontal|long) *jump';

-- Cardio-name backfill for the canonical `exercises` table only (it has no exercise_type to lean on).
update exercises set metric_type = 'cardio'
  where metric_type = 'weight_reps'
    and name ~* '(row(ing)?|run(ning)?|treadmill|bike|cycl|skierg|ski *erg|erg|swim|elliptical|assault|echo *bike|jog|sprint)';
```

- [ ] **Step 2: Run the script through the sql-safety skill**

Invoke the **sql-safety** skill and walk this file through its checklist (destructive-op check, RLS
impact, idempotency, tenant scoping). Expected: passes — every statement is additive/`if not exists`,
no RLS policy touched, backfill only writes rows at the default value. Fix anything it flags inline.

- [ ] **Step 3: Commit the script**

```bash
git add scripts/add-metric-type-2026-07-18.sql docs/superpowers/plans/2026-07-18-progress-data-model.md
git commit -m "sub-project 1: add metric_type + typed set columns migration script"
```

---

### Task 2: Apply the migration and verify state (RED → GREEN)

**Files:**
- Uses: `scripts/add-metric-type-2026-07-18.sql`

**Interfaces:**
- Consumes: the columns/constraints produced by Task 1.

- [ ] **Step 1: Capture the RED state (columns absent) — before applying**

In the Supabase SQL editor, run:

```sql
select column_name from information_schema.columns
where table_name = 'workout_log_sets' and column_name in ('avg_hr','max_hr','height_cm','side')
order by column_name;
```

Expected (RED, pre-migration): **0 rows** — none of the new columns exist yet.

- [ ] **Step 2: Apply the migration**

Paste the full contents of `scripts/add-metric-type-2026-07-18.sql` into the Supabase SQL editor and
run it. Expected: completes with no error. (Jake runs this — the agent cannot reach the live DB.)

- [ ] **Step 3: Verify the columns now exist (GREEN)**

Re-run the Step 1 query. Expected (GREEN): **4 rows** — `avg_hr`, `height_cm`, `max_hr`, `side`.

Then confirm `metric_type` landed on all three tables:

```sql
select table_name, column_name, data_type, column_default
from information_schema.columns
where column_name = 'metric_type'
order by table_name;
```

Expected: 3 rows (`exercises`, `workout_log_exercises`, `workout_template_exercises`), each
`text`, default `'weight_reps'`.

- [ ] **Step 4: Verify the backfill is sane**

```sql
select metric_type, count(*) from exercises                 group by metric_type order by metric_type;
select metric_type, count(*) from workout_template_exercises group by metric_type order by metric_type;
select metric_type, count(*) from workout_log_exercises      group by metric_type order by metric_type;
```

Expected: every row has a value from the 7-value set; `cardio` counts match the previous
`exercise_type='cardio'` counts on the template/log tables; any jumps in the library show as `jump_*`;
no NULLs (the `not null default` guarantees this). Spot-check: no row that should be strength was
mis-tagged (e.g. confirm a "Trap Bar Jump", if present, is still `weight_reps`).

```sql
-- Spot-check the guard against loaded-jump misclassification:
select name, metric_type from exercises where name ~* 'jump' order by name;
```

Expected: bodyweight jumps → `jump_height`/`jump_distance`; any loaded/strength "jump" → `weight_reps`.

---

### Task 3: Confirm no RLS regression, then run the E2E safety net

**Files:**
- Test: `tests/` (existing Playwright suite — no new file required for a schema-only change)

**Interfaces:**
- Consumes: the applied migration from Task 2.

- [ ] **Step 1: Confirm additive columns did not disturb RLS (behavioural, all three lenses)**

Adding a column inherits the table's existing row policies, so no policy change is expected. Prove it
still reads correctly for every audience. In the Supabase SQL editor, first confirm no policy on the
touched tables changed shape unexpectedly:

```sql
select tablename, policyname, cmd
from pg_policies
where tablename in ('exercises','workout_template_exercises','workout_log_exercises','workout_log_sets')
order by tablename, policyname;
```

Expected: the same policy set as before the migration (record the list; nothing added/removed by this
migration — it authors no policies).

- [ ] **Step 2: Behavioural cross-tenant read check**

Drive the app (via **run-coachapp**) and confirm the new columns are readable end-to-end for each role,
since a broken embed would surface as missing data, not an error:
- **Solo** (Jake's Personal account): open Workouts + Progress — programs, templates, and logged
  sessions still render (confirms `metric_type`/new set columns read through the solo path where
  `coach_id` is NULL).
- **Real client** account: open the client Workouts + Progress pages — assigned program and session
  history still render (confirms the client embed chain still resolves with the new columns present).
- **Coach viewing that client**: open the client profile — performance/weight still render.

Expected: all three render exactly as before (no visual change — this sub-project adds no UI).

- [ ] **Step 3: Run the Playwright regression suite**

```bash
npm test
```

Expected: same pass/skip counts as the pre-migration baseline (152 passed / 2 skipped / 0 failed at last
run — read the actual total from the output). A schema-only additive change must not fail any test; a
failure means an existing query broke on the new columns and must be investigated before closing ①.

- [ ] **Step 4: Record application in the migration file header and commit**

Add a one-line note to the top of `scripts/add-metric-type-2026-07-18.sql` recording the date Jake
applied it (matching the `add-starter-seeded` convention), then:

```bash
git add scripts/add-metric-type-2026-07-18.sql
git commit -m "sub-project 1: record metric_type migration applied to production"
```

---

## Self-Review

**1. Spec coverage (against the spec's sub-project ①):**
- `metric_type` on the exercise definition → Task 1 (exercises + workout_template_exercises; **extended**
  to workout_log_exercises with rationale — history can't join on nullable `exercise_id`).
- Typed columns `avg_hr`/`max_hr`/`height_cm`/`side` on `workout_log_sets` → Task 1.
- Backfill (`strength`→`weight_reps`, `cardio`→`cardio`, jump name-patterns, fix-forward) → Task 1 Step 1
  + verified Task 2 Step 4.
- sql-safety pass → Task 1 Step 2.
- RLS / solo-trap / embed-chain verification → Task 3 Steps 1–2.
- "No user-visible change / no cache-bust" → Global Constraints (no JS touched).
- Resting-HR storage: intentionally **out of scope for ①** per the spec/brainstorm — it's a body-metric
  entry-flow decision folded into sub-project ② (Body Weight / check-in), not a `workout_log_sets`
  column. Called out here so it isn't mistaken for a gap.

**2. Placeholder scan:** none — all SQL and commands are literal.

**3. Type consistency:** `metric_type` value set is identical across all three CHECK constraints and the
Global Constraints block; `side` values (`left`/`right`) match between the DDL CHECK and the constraint
list; column names (`avg_hr`, `max_hr`, `height_cm`, `side`) are identical in Task 1, Task 2 Step 1/3,
and the Interfaces blocks. Consumers in ②/③ must use these exact names.

---

## Execution note (project-specific)

This sub-project's core deliverable is SQL that **only Jake can apply** (live Supabase, no service-role
access from the agent). So execution is inherently human-in-the-loop at Task 2 Step 2: the agent authors
+ commits the script and prepares every verify query, Jake runs the migration and the verify queries in
the Supabase editor, then the agent runs the Playwright regression and closes out. Keep that division in
mind when choosing an execution mode.
