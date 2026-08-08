-- CoachApp — add stroke_rate_spm to workout_log_sets (2026-08-08)
--
-- Why: runner cardio/interval capture fix. Reverses the 2026-08-07 deferral (STATUS.md ledger, "Genuinely
-- missing, DEFERRED by explicit reasoning: stroke rate... deferred until real friction") — Jake confirmed
-- 2026-08-08 he wants it built now, alongside pace. This is the ACHIEVED side: what the athlete's monitor
-- showed. The PRESCRIBED side (sets_json.strokeRateMin/strokeRateMax, a coach-set target) already exists
-- and needs no migration — it's plain jsonb, a different concept from this column.
--
-- Units: STROKES PER MINUTE (spm) — matching the existing prescribed strokeRateMin/strokeRateMax fields'
-- own unit exactly (app-workouts.js builder label: "Stroke rate (spm)").
--
-- Safety notes (sql-safety):
--   * Additive only. No DELETE, no UPDATE, no FK changes, no RLS changes.
--   * workout_log_sets already has RLS enabled; a new column inherits the table's existing policies —
--     no new policy needed (same reasoning as avg_watts/resting_hr/pace_500m_secs above).
--   * smallint, sanity-bounded 0-100 spm — generous over any real rowing/ski-erg cadence, guards against
--     a fat-fingered typo rather than modelling a real physiological ceiling.
--   * Nullable, no default — every existing row stays untouched and reads as "not recorded".
--
-- GDPR: erasure covered by the existing FK cascade to clients. Not exported by downloadMyData() today —
-- same pre-existing gap as avg_watts/pace_500m_secs, not introduced by this column.

alter table public.workout_log_sets add column if not exists stroke_rate_spm smallint;

do $$ begin
  alter table public.workout_log_sets drop constraint if exists wls_stroke_rate_spm_chk;
end $$;
alter table public.workout_log_sets add constraint wls_stroke_rate_spm_chk
  check (stroke_rate_spm is null or (stroke_rate_spm between 0 and 100));

-- Verify (expect exactly one row: stroke_rate_spm | smallint | YES)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'workout_log_sets'
  and column_name = 'stroke_rate_spm';
