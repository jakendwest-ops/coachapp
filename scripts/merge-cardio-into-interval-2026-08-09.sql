-- CoachApp — merge 'cardio' metric_type into 'interval' (2026-08-09)
--
-- Why: Jake — "having cardio and intervals as 2 separate categories is redundant and intervals should
-- be the only 1." Confirmed via a read-only check (2026-08-09) against real data: every existing
-- metric_type='cardio' row has UNIFORM values across every sets_json array entry (same duration/rest/
-- distance repeated identically) — a genuine repeating pattern (e.g. Assault Bike: 10x 0:15 work / 0:45
-- rest) or a single steady effort (e.g. SkiErg "10km Steady State (MAF)": one entry, 10km, no rest,
-- HR zone 145-150) — never varied round lengths. Both fold cleanly into interval's one-block shape
-- (work x sets x cycles) with no data loss. The app code (js/app-workouts.js, js/app-runner.js) no
-- longer offers 'cardio' as a selectable type as of this same push — this migrates the real rows that
-- predate that change.
--
-- Scope: `exercises` (scalar metric_type only, no shape data) and `workout_template_exercises` (needs
-- the sets_json reshape below) — covers master templates AND already-cloned client-program copies,
-- since clones live in the same table. Deliberately does NOT touch `workout_log_exercises`/
-- `workout_log_sets` (historical logged data) — every progress/chart/diary read path already treats
-- 'cardio' and 'interval' symmetrically (app-progress.js), so historical rows are safe left exactly as
-- they are; retroactively reclassifying history is not this migration's job. Does NOT tighten the DB
-- CHECK constraint — 'cardio' stays a DB-allowed value (same precedent as 'amrap', which has had zero
-- corresponding UI for a while and is still allowed).
--
-- Mapping (cardio-shape N array entries -> interval-shape 1-entry block):
--   duration (mm:ss, first entry)     -> workSecs (seconds), only when NOT isDistanceBased
--   distanceM / distance*1000         -> workDistanceM (metres), only when isDistanceBased
--   restMin (mm:ss, first entry)      -> restSecs (single value, seconds) -- every real row has
--                                         restMin = restMax, so picking restMin loses nothing
--   array length                      -> sets (an N-round uniform prescription becomes sets:N, cycles:1)
--   (no cardio equivalent)            -> countdownSecs:5, warmupSecs:0, recoverySecs:0, cooldownSecs:0
--   pace500/paceKm/watts/hrZone/restHrMax/strokeRate -> carried straight across, identical key names
-- The old cardio-only keys (duration/distance/distanceM/restMin/restMax) are explicitly nulled on the
-- new block rather than left dangling -- avoids the documented "type-switch doesn't clear the other
-- shape's fields" staleness class (app-runner.js:847-856 comment; real 2026-08-08 SkiErg incident hit
-- exactly this).
--
-- Safety (sql-safety): read-only check ran first (2026-08-09, results reviewed before writing this).
-- No FK/RLS changes -- existing row policies already cover these tables, unaffected by a value/shape
-- change to columns they already permit reading/writing. A full backup of every affected row's ORIGINAL
-- id/table/metric_type/sets_json is taken into a throwaway table before either UPDATE runs, since this
-- reshape is not trivially reversible once run (unlike every other additive migration this project has
-- run) -- drop the backup table yourself once you've spot-checked a few templates and you're happy.

-- 1. Backup every row about to change, in both tables, before touching anything.
drop table if exists _cardio_merge_backup_2026_08_09;
create table _cardio_merge_backup_2026_08_09 as
select 'workout_template_exercises' as source_table, id, metric_type, sets_json, null::text as name
from public.workout_template_exercises where metric_type = 'cardio'
union all
select 'exercises' as source_table, id, metric_type, null as sets_json, name
from public.exercises where metric_type = 'cardio';

-- Verify the backup landed before proceeding (expect the same row count Step 0 found).
select source_table, count(*) from _cardio_merge_backup_2026_08_09 group by source_table;

-- 2. exercises — scalar flip only, no shape data on this table.
update public.exercises
set metric_type = 'interval'
where metric_type = 'cardio';

-- 3. workout_template_exercises — reshape sets_json, then flip metric_type.
update public.workout_template_exercises wte
set sets_json = computed.new_block,
    metric_type = 'interval'
from (
  select
    id,
    jsonb_build_array(
      jsonb_build_object(
        'countdownSecs', 5,
        'warmupSecs', 0,
        'isDistanceBased', is_dist,
        'workSecs', case when not is_dist then work_secs else null end,
        'workDistanceM', case when is_dist then work_dist_m else null end,
        'restSecs', coalesce(rest_secs, 0),
        'sets', greatest(1, jsonb_array_length(sets_json)),
        'recoverySecs', 0,
        'cycles', 1,
        'cooldownSecs', 0,
        'duration', null,
        'distance', null,
        'distanceM', null,
        'restMin', null,
        'restMax', null,
        'pace500Min', first->>'pace500Min',
        'pace500Max', first->>'pace500Max',
        'paceKmMin', first->>'paceKmMin',
        'paceKmMax', first->>'paceKmMax',
        'wattsMin', first->>'wattsMin',
        'wattsMax', first->>'wattsMax',
        'hrZoneMin', first->>'hrZoneMin',
        'hrZoneMax', first->>'hrZoneMax',
        'restHrMax', first->>'restHrMax',
        'strokeRateMin', first->>'strokeRateMin',
        'strokeRateMax', first->>'strokeRateMax'
      )
    ) as new_block
  from (
    select
      id, sets_json,
      sets_json->0 as first,
      coalesce((sets_json->0->>'isDistanceBased')::boolean, false) as is_dist,
      coalesce(
        nullif(split_part(nullif(sets_json->0->>'duration', ''), ':', 1), '')::int * 60
        + nullif(split_part(nullif(sets_json->0->>'duration', ''), ':', 2), '')::int,
        0
      ) as work_secs,
      coalesce(
        nullif(sets_json->0->>'distanceM', '')::numeric,
        nullif(sets_json->0->>'distance', '')::numeric * 1000,
        0
      ) as work_dist_m,
      coalesce(
        nullif(split_part(nullif(sets_json->0->>'restMin', ''), ':', 1), '')::int * 60
        + nullif(split_part(nullif(sets_json->0->>'restMin', ''), ':', 2), '')::int,
        0
      ) as rest_secs
    from public.workout_template_exercises
    where metric_type = 'cardio'
  ) shaped
) computed
where wte.id = computed.id;

-- 4. Verify: expect 0 rows in both (every 'cardio' row converted).
select 'exercises' as tbl, count(*) from public.exercises where metric_type = 'cardio'
union all
select 'workout_template_exercises', count(*) from public.workout_template_exercises where metric_type = 'cardio';

-- 5. Spot-check the reshape looks right (compare against the backup for the same ids).
select wte.id, wte.exercise_name, wte.metric_type, wte.sets_json
from public.workout_template_exercises wte
where wte.id in (select id from _cardio_merge_backup_2026_08_09 where source_table = 'workout_template_exercises')
order by wte.exercise_name;
