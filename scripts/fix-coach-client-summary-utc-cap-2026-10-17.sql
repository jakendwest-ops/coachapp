-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- 2026-10-17: public.coach_client_summary stops hiding a session that is dated "tomorrow" in UTC.
--
-- WHY. Until 2026-10-17 the app stamped a session with the UTC calendar day. It now stamps the day the person started it
-- on THEIR clock (the 2026-10-04 and 2026-10-13 ledger rows). For anyone ahead of UTC that day is one ahead of the UTC date
-- for part of every day (in the UK summer, 00:00 to 01:00; in Sydney, the whole morning). The view ignored any log dated
-- after UTC today (a mistyped year would otherwise make a client look active for a year), so a session started at 00:30 BST
-- on 16 July (dated 2026-07-16 while the UTC date is still 07-15) vanished from last_session_date, sessions_7d and
-- sessions_28d until 01:00. It showed on the coach's Clients list and Needs attention.
--
-- WHAT CHANGES. Exactly two things, both the upper cap: "<= UTC today" becomes "<= UTC today + 1". No place on Earth is more
-- than one calendar day ahead of UTC (the furthest, UTC+14, is 14 hours), so a real session is never dated later than that;
-- the typo case the cap exists for (a year off, 400 days off) is still excluded. The windows' LOWER edges are unchanged.
-- Nothing else moves: the same 19 columns in the same order, the same scope inside the view (c.coach_id = auth.uid()),
-- the same security_invoker.
--
-- !! This restates the whole view because CREATE OR REPLACE needs the whole definition. It MUST keep
-- !! `with (security_invoker = true)` (leaving it out resets the view to its owner's rights and bypasses row-level
-- !! security; section 3 reads reloptions back to prove it).
--
-- RUN AFTER add-coach-client-summary-2026-09-20.sql (that script creates the indexes and the view). Safe to run twice.
-- No data is touched and no table changes; the view can be put back by running the `create or replace view` in the
-- 2026-09-20 script again (it fails with "cannot drop columns" ONLY if a later script added columns).
--
-- ROLLBACK: re-run section 2 of add-coach-client-summary-2026-09-20.sql (the `create or replace view`).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────

-- 1. The view, with the upper cap one day wider ------------------------------------------------------------
create or replace view public.coach_client_summary
with (security_invoker = true) as
select
  c.id                                   as client_id,
  c.full_name                            as full_name,
  c.status                               as status,
  c.user_id                              as user_id,
  c.invited_at                           as invited_at,
  c.created_at                           as created_at,
  last_wl.last_session_date              as last_session_date,
  coalesce(recent_wl.sessions_7d, 0)     as sessions_7d,
  coalesce(recent_wl.sessions_28d, 0)    as sessions_28d,
  last_wt.last_weigh_in_date             as last_weigh_in_date,
  last_ci.checked_in_at                  as last_check_in_at,
  last_ci.sleep                          as check_in_sleep,
  last_ci.energy                         as check_in_energy,
  last_ci.stress                         as check_in_stress,
  last_ci.soreness                       as check_in_soreness,
  prog.program_id                        as program_id,
  prog.program_name                      as program_name,
  prog.program_start                     as program_start,
  prog.program_weeks                     as program_weeks
from public.clients c
left join lateral (
  select w.date as last_session_date
  from public.workout_logs w
  where w.client_id = c.id
    and w.date <= (now() at time zone 'utc')::date + 1
  order by w.date desc
  limit 1
) last_wl on true
left join lateral (
  select count(*) filter (where w.date >= (now() at time zone 'utc')::date - 7) as sessions_7d,
         count(*)                                                               as sessions_28d
  from public.workout_logs w
  where w.client_id = c.id
    and w.date >= (now() at time zone 'utc')::date - 28
    and w.date <= (now() at time zone 'utc')::date + 1
) recent_wl on true
left join lateral (
  select t.date as last_weigh_in_date
  from public.weight_logs t
  where t.client_id = c.id
  order by t.date desc
  limit 1
) last_wt on true
left join lateral (
  select k.created_at as checked_in_at, k.sleep, k.energy, k.stress, k.soreness
  from public.client_check_ins k
  where k.client_id = c.id
  order by k.created_at desc
  limit 1
) last_ci on true
left join lateral (
  -- The client's NEWEST assignment, ordered exactly as every screen orders it (created_at DESC, so a NULL
  -- created_at sorts first, as PostgREST does; id as the tie-break), so coach and client see the same programme.
  select cp.program_id                                     as program_id,
         p.name                                            as program_name,
         cp.start_date                                     as program_start,
         (select nullif(sum(ph.duration_weeks), 0)
            from public.program_phases ph
           where ph.program_id = cp.program_id)            as program_weeks
  from public.client_programs cp
  left join public.programs p on p.id = cp.program_id
  where cp.client_id = c.id
  order by cp.created_at desc, cp.id desc
  limit 1
) prog on true
where c.coach_id = (select auth.uid());

-- 2. Grants, restated so a view someone re-granted is put back: signed-in users read only ------------------
revoke all on public.coach_client_summary from public, anon, authenticated;
grant select on public.coach_client_summary to authenticated;

-- 3. Read the state back (this is the verification — it returns rows) ---------------------------------------
-- EXPECT: 1 "view options" row = security_invoker=true
--         19 "view column" rows (client_id ... program_weeks), the same as before
--         8 "privilege" rows: anon SELECT/INSERT/UPDATE/DELETE = false; authenticated SELECT = true, the rest false
--         1 "upper cap" row = 2 of 2 (both caps now read "+ 1")
select 'view options' as check_name,
       coalesce(array_to_string(c.reloptions, ','), 'NONE - BAD: security_invoker is missing') as result
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'coach_client_summary'
union all
select 'view column',
       lpad(a.attnum::text, 2, '0') || ' ' || a.attname::text || ' ' || format_type(a.atttypid, a.atttypmod)
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'coach_client_summary' and a.attnum > 0 and not a.attisdropped
union all
select 'privilege',
       r.role_name || ' ' || p.priv || ' = ' || has_table_privilege(r.role_name, 'public.coach_client_summary', p.priv)::text
from (values ('anon'), ('authenticated')) as r(role_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
union all
select 'upper cap',
       ((length(pg_get_viewdef('public.coach_client_summary'::regclass)) - length(replace(pg_get_viewdef('public.coach_client_summary'::regclass), ' + 1)', ''))) / length(' + 1)'))::text || ' of 2'
order by 1, 2;
