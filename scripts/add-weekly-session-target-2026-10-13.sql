-- Weekly session target - how many sessions a week this person aims for (1 to 14). The dashboard's Streak tile counts weeks in a row at this
-- target when no training plan governs the week; null means the person never set one and the tile reads it as 3.
-- The app reads it on its own (never in the main profile select) and treats a failed read as the default, so it works before this is run;
-- until it is run, saving the target from Settings fails ("Save failed. Try again.").
-- Additive and idempotent: one nullable column, nothing backfilled, no policy or grant touched (profiles' existing own-row policies cover it).
-- To be applied by Jake in the Supabase SQL editor. Recorded here for the repo history.

alter table profiles add column if not exists weekly_session_target smallint check (weekly_session_target between 1 and 14);

-- Read it back (an ALTER returns no rows by itself). One row = the column is there: data_type smallint, is_nullable YES.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'weekly_session_target';
