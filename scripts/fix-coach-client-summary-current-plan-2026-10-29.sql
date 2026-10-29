-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- 2026-10-29: public.coach_client_summary picks a client's CURRENT training plan by date, and says when the next one starts.
--
-- WHY. The view's programme columns came from the client's NEWEST-ASSIGNED plan (client_programs ordered by created_at desc). Book a
-- client's next block for a future date and, from that moment, the coach's Home and client list showed the block they have not started:
-- "Training plans ending" missed the running block, and its week count was the new one's
-- (docs/bugs/2026-10-29-current-plan-is-picked-by-assignment-order-not-by-date.md).
--
-- THE RULE (the same as _currentAssignment in js/app-core.js - change one, change the other). A plan "starts" on its start_date, or, with
-- none, on the UTC day it was assigned. Current = of the plans that have started, the one that started most recently; with none started,
-- the soonest upcoming one. Ties: the most recently assigned, then the id.
--
-- WHAT CHANGES. Exactly two things:
--   1. the ORDER BY inside the programme lateral (the rule above), and
--   2. ONE new column, appended LAST: next_program_start (date) - the soonest start, after today, of any plan other than the current one;
--      NULL when nothing is booked. The coach Home uses it to leave a client whose next block is booked out of "Training plans ending".
-- The 19 existing columns stay, in the same order; the scope inside the view (c.coach_id = auth.uid()) and security_invoker are unchanged.
--
-- !! This restates the whole view because CREATE OR REPLACE needs the whole definition. It MUST keep
-- !! `with (security_invoker = true)` (leaving it out resets the view to its owner's rights and bypasses row-level security; section 3
-- !! reads reloptions back to prove it). CREATE OR REPLACE VIEW may only APPEND columns, which is why next_program_start is last.
--
-- "Today" is the UTC day, as everywhere else in this view; the app uses the device's day. On a changeover day the two can disagree until
-- 01:00 BST (named, same class as docs/bugs/2026-10-17-server-side-today-still-uses-the-utc-day.md).
--
-- RUN AFTER fix-coach-client-summary-utc-cap-2026-10-17.sql. Safe to run twice. No data is touched and no table changes.
-- After this runs, re-running the 2026-09-20 or 2026-10-17 scripts FAILS with "cannot drop columns from view" (they have 19 columns, this
-- has 20) - that is the intended guard against silently undoing this.
--
-- ROLLBACK (only if needed): drop view public.coach_client_summary; then re-run fix-coach-client-summary-utc-cap-2026-10-17.sql. The app
-- reads next_program_start from 2026-10-29, so roll the app back first or the coach Home's summaries read fails (shown as "—", never as 0).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────

-- 1. The view: the current plan by date, plus next_program_start ---------------------------------------------
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
  prog.program_weeks                     as program_weeks,
  nxt.next_program_start                 as next_program_start
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
  -- The client's CURRENT plan, by date (the rule in the header). `s` is the day the plan starts; '-infinity' when it has neither a start
  -- date nor an assigned time, so such a plan counts as started but ranks below every dated one.
  select cp.id                                             as client_program_id,
         cp.program_id                                     as program_id,
         p.name                                            as program_name,
         cp.start_date                                     as program_start,
         (select nullif(sum(ph.duration_weeks), 0)
            from public.program_phases ph
           where ph.program_id = cp.program_id)            as program_weeks
  from public.client_programs cp
  left join public.programs p on p.id = cp.program_id
  cross join lateral (select coalesce(cp.start_date, (cp.created_at at time zone 'utc')::date, '-infinity'::date) as s) st
  where cp.client_id = c.id
  order by case when st.s <= (now() at time zone 'utc')::date then st.s end desc nulls last,    -- started plans first, the latest start first
           st.s asc,                                                                           -- else the soonest upcoming
           cp.created_at desc nulls last, cp.id desc                                           -- ties: the most recently assigned
  limit 1
) prog on true
left join lateral (
  -- The soonest start, after today, of any plan other than the current one.
  select min(coalesce(n.start_date, (n.created_at at time zone 'utc')::date)) as next_program_start
  from public.client_programs n
  where n.client_id = c.id
    and n.id is distinct from prog.client_program_id
    and coalesce(n.start_date, (n.created_at at time zone 'utc')::date) > (now() at time zone 'utc')::date
) nxt on true
where c.coach_id = (select auth.uid());

-- 2. Grants, restated so a view someone re-granted is put back: signed-in users read only ------------------
revoke all on public.coach_client_summary from public, anon, authenticated;
grant select on public.coach_client_summary to authenticated;

-- 3. Read the state back (this is the verification - it returns rows) ---------------------------------------
-- EXPECT: 1 "view options" row = security_invoker=true
--         20 "view column" rows (client_id ... program_weeks, then 20 next_program_start date)
--         8 "privilege" rows: anon SELECT/INSERT/UPDATE/DELETE = false; authenticated SELECT = true, the rest false
--         1 "plan order" row = date-aware (the view's definition orders the programme by its start, not by created_at alone)
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
select 'plan order',
       case when pg_get_viewdef('public.coach_client_summary'::regclass) like '%infinity%' then 'date-aware' else 'BAD: still newest-assigned' end
order by 1, 2;
