-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Progress overhaul — sub-project ① DATA MODEL. First-class metric_type + typed metric columns.
-- Design: docs/superpowers/specs/2026-07-18-progress-tracking-overhaul-design.md
-- Run in the Supabase SQL editor. Additive, idempotent, reversible. No user-visible change.
-- APPLIED to production by Jake 2026-07-18. Verified: 4 new workout_log_sets columns present;
-- metric_type on all 3 tables (default 'weight_reps'); cardio backfilled from exercise_type
-- (template 68, log 2); jumps → jump_height (Box Jump, Depth Jump); Trap Bar Jump correctly stayed
-- weight_reps; no NULLs; no strength lift misclassified.
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

-- NOTE: deliberately NO cardio name-pattern backfill for the canonical `exercises` library.
-- The library metric_type is only a DEFAULT (the authoritative per-use value is denormalized onto the
-- template/log rows above, backfilled accurately from exercise_type). Name-pattern cardio detection here
-- is trap-laden — substrings misclassify real strength lifts as cardio ("Row", "Crunch"→run, "Bicycle"→
-- cycl) — and the fix-forward guard makes a wrong guess sticky. Library cardio items stay at the
-- weight_reps default and are set correctly when the exercise is used/edited in the builder (sub-project
-- ②). False-negative-safe by design; a wrong guess would be worse than none. (Jake's call, 2026-07-18.)
