-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Progress overhaul — sub-project ②d MANUAL HR. Resting-HR body metric on weight_logs.
-- Design: docs/superpowers/specs/2026-07-18-progress-tracking-overhaul-design.md
-- Plan:   docs/superpowers/plans/2026-07-19-progress-manual-hr-inputs.md
-- Run in the Supabase SQL editor. Additive, idempotent, reversible. No user-visible change alone.
-- Resting HR lives here (not client_check_ins) so solo/client both log it from My Progress → Body,
-- which is exactly where ③ charts it. avg_hr/max_hr already exist on workout_log_sets (sub-project ①).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

alter table weight_logs add column if not exists resting_hr smallint;

-- Sanity range guard (resting HR in a plausible human band; null always allowed).
do $$ begin
  alter table weight_logs drop constraint if exists weight_logs_resting_hr_chk;
end $$;
alter table weight_logs add constraint weight_logs_resting_hr_chk
  check (resting_hr is null or (resting_hr between 20 and 250));

-- No RLS change: weight_logs already has client-own / solo-own / coach-of-client policies,
-- and a new column is covered by the existing row policies. Verified behaviourally in Task 3's test.
