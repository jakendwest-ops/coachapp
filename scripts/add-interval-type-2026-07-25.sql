-- Intervals redesign, 2026-07-25.
-- Run in the Supabase SQL editor. Both halves are idempotent and additive — safe to re-run,
-- and nothing existing changes.
--
-- (1) metric_type gains 'interval'. Same idempotent drop-then-add shape as
--     scripts/add-metric-type-2026-07-18.sql — three tables, three DIFFERENT constraint names.
alter table exercises                  drop constraint if exists exercises_metric_type_chk;
alter table workout_template_exercises drop constraint if exists wte_metric_type_chk;
alter table workout_log_exercises      drop constraint if exists wle_metric_type_chk;

alter table exercises add constraint exercises_metric_type_chk
  check (metric_type in ('weight_reps','cardio','unilateral','amrap','timed_hold','jump_height','jump_distance','interval'));
alter table workout_template_exercises add constraint wte_metric_type_chk
  check (metric_type in ('weight_reps','cardio','unilateral','amrap','timed_hold','jump_height','jump_distance','interval'));
alter table workout_log_exercises add constraint wle_metric_type_chk
  check (metric_type in ('weight_reps','cardio','unilateral','amrap','timed_hold','jump_height','jump_distance','interval'));

-- (2) phase marks which part of an interval block a logged row came from.
--     NULL = an ordinary set: every pre-existing row, all strength, all steady-state cardio.
--     'rest' and 'recovery' are deliberately NOT allowed — neither is ever recorded (Jake,
--     2026-07-23 for rest; 2026-07-25 for recovery, which is a rest between cycles).
alter table workout_log_sets add column if not exists phase text;
alter table workout_log_sets drop constraint if exists wls_phase_chk;
alter table workout_log_sets add constraint wls_phase_chk
  check (phase is null or phase in ('warmup','work','cooldown'));
