-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Progress overhaul ②a — SUPPLEMENTARY BACKFILL. Set metric_type for existing template exercises whose
-- sets carry a unilateral/timed flag. Sub-project ① backfilled cardio + jumps but could not derive
-- unilateral/timed (those live only as sets_json flags). This catches them.
-- Design: docs/superpowers/specs/2026-07-18-progress-tracking-overhaul-design.md
-- Run in the Supabase SQL editor. Additive, fix-forward, idempotent (only touches rows still at the
-- weight_reps default — never overwrites a value already set explicitly).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

update workout_template_exercises set metric_type = 'unilateral'
  where metric_type = 'weight_reps'
    and sets_json @> '[{"unilateral": true}]';

update workout_template_exercises set metric_type = 'timed_hold'
  where metric_type = 'weight_reps'
    and sets_json @> '[{"timed": true}]';

-- NOTE: workout_log_exercises is intentionally NOT backfilled here. Its metric_type is stamped correctly
-- at save time by sub-project ②b for all new logs. Historic logs stay 'weight_reps' — acceptable: ③'s
-- charts read the log's metric_type, pre-②b unilateral/timed history is rare, and it self-heals as new
-- sessions are logged. (Fix-forward — never retroactively rewrite ambiguous history.)

-- Verify (run after): counts of template exercises now tagged unilateral/timed.
--   select metric_type, count(*) from workout_template_exercises
--   where metric_type in ('unilateral','timed_hold') group by metric_type;
