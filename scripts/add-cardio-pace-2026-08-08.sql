-- CoachApp — add pace_500m_secs to workout_log_sets (2026-08-08)
--
-- Why: runner cardio/interval capture fix. The pre-Start card's `wr-cardio-pace` input has captured a
-- typed pace ("2:32") into setData.paceAchieved in memory since 2026-07-22, but no workout_log_sets
-- column has ever existed for it and saveRunnerSession() never read paceAchieved — every value typed
-- there was silently discarded at save. This column is the missing third piece (input + read + DB
-- column), mirroring avg_hr/avg_watts exactly (2026-07-19 / 2026-07-22).
--
-- Units: SECONDS PER 500 METRES, matching the existing PRESCRIBED target fields sets_json.pace500Min/
-- pace500Max (mm:ss per 500m — app-workouts.js's cardio builder). Storing seconds (not text) lets
-- achieved and prescribed pace compare directly with no runtime mm:ss parsing, and reuses the existing
-- parseRest()/fmtRestCountdown() mm:ss<->seconds helpers the same way duration_seconds already does.
--
-- Safety notes (sql-safety):
--   * Additive only. No DELETE, no UPDATE, no FK changes, no RLS changes.
--   * workout_log_sets already has RLS enabled; a new column inherits the table's existing policies —
--     no new policy needed (same reasoning as avg_watts/resting_hr).
--   * smallint, sanity-bounded 30-1800 seconds (0:30-30:00 per 500m) — generous over any realistic
--     erg/row/ski pace, guards against a fat-fingered typo rather than modelling a real physiological
--     ceiling. smallint tops out at 32767 regardless.
--   * Nullable, no default — every existing row stays untouched and reads as "not recorded".
--
-- GDPR: erasure covered by the existing FK cascade to clients. Not exported by downloadMyData() today —
-- pre-existing gap, same as avg_watts (STATUS.md 2026-07-22 ledger), not introduced by this column.

alter table public.workout_log_sets add column if not exists pace_500m_secs smallint;

do $$ begin
  alter table public.workout_log_sets drop constraint if exists wls_pace_500m_secs_chk;
end $$;
alter table public.workout_log_sets add constraint wls_pace_500m_secs_chk
  check (pace_500m_secs is null or (pace_500m_secs between 30 and 1800));

-- Verify (expect exactly one row: pace_500m_secs | smallint | YES)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'workout_log_sets'
  and column_name = 'pace_500m_secs';
