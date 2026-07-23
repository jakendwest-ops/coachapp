-- CoachApp — add avg_watts to workout_log_sets (2026-07-22)
--
-- APPLIED to production by Jake 2026-07-22. Verified: information_schema returned exactly one row —
-- avg_watts | smallint | YES. The JS requests this column unconditionally in two app-progress.js
-- SELECTs, so shipping the code without the column 400s the whole embed and empties every user's
-- Performance tab silently (neither call site checks `error`). Migration must precede deploy.
--
-- Why: the cardio builder gained a Watts target (sets_json.wattsMin/wattsMax, jsonb — no migration
-- needed for the target). This is the ACHIEVED side: what the client actually held on the erg/bike.
-- Mirrors exactly how avg_hr / max_hr were added on 2026-07-19.
--
-- Safety notes (sql-safety):
--   * Additive only. No DELETE, no UPDATE, no FK changes, no RLS changes.
--   * workout_log_sets already has RLS enabled and is already covered by the behavioural RLS audit
--     (tests/rls-audit.spec.js). A new column inherits the table's existing policies, so no new
--     policy is required — column-level grants are not used anywhere in this project.
--   * smallint is deliberate: erg/bike power is 0–2000W in practice; smallint tops out at 32767.
--   * Nullable with no default, so every existing row stays untouched and reads as "not recorded".
--
-- GDPR: erasure is covered by the existing FK cascade to clients. NOTE — downloadMyData() does NOT
-- currently export workout_log_sets at all (it exports workout_logs as name+date only). That is a
-- pre-existing export gap, logged in STATUS.md's ledger on 2026-07-22, NOT introduced by this column.

alter table public.workout_log_sets add column if not exists avg_watts smallint;

-- Verify (expect exactly one row: avg_watts | smallint | YES)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'workout_log_sets'
  and column_name = 'avg_watts';
