-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- 2026-10-31: the coach can see whether an invited client has signed in (MVP item 7, invite state; approved by Jake 2026-10-31).
--
-- WHY. Inviting a client creates their login and links it to the client record at once (supabase/functions/invite-client), so "has an
-- account" does not mean "accepted". The one real sign that they did is profiles.consented_at: an invited client's first sign-in stops at
-- the privacy consent screen, and agreeing stamps it. But profiles is readable only by its own user, so a coach cannot see it - and
-- coach_client_summary is security_invoker, so a plain join there would come back empty for every client.
--
-- WHAT IT ADDS.
--   1. public.coach_client_signed_in(p_client_id): SECURITY DEFINER (it reads profiles past that row's own-user policy), read-only, and it
--      answers ONLY for a client of the caller (clients.coach_id = auth.uid()): true = they have agreed to the privacy policy at least once,
--      false = linked but never agreed, null = not the caller's client, not linked to a login, or no profile row. It returns one boolean and
--      nothing else from profiles. EXECUTE is revoked from public and anon and granted to authenticated.
--   2. coach_client_summary gains ONE column, appended LAST: signed_in (boolean), from that function. The 20 existing columns stay, in the
--      same order; the scope inside the view (c.coach_id = auth.uid()) and security_invoker are unchanged.
--
-- LIMITS (named). A client who signed in before consent existed (2026-08-24) and has not signed in since reads false until their next
-- sign-in, when the consent screen stamps them. A client who reached the consent screen and signed out without agreeing reads false - in
-- the app they never got in, so "not accepted yet" is what the coach should see.
--
-- !! This restates the whole view because CREATE OR REPLACE needs the whole definition. It MUST keep `with (security_invoker = true)`
-- !! (section 4 reads reloptions back). CREATE OR REPLACE VIEW may only APPEND columns, which is why signed_in is last.
--
-- RUN AFTER fix-coach-client-summary-current-plan-2026-10-29.sql. Safe to run twice. No data is touched and no table changes. After this
-- runs, re-running the 2026-10-29 script FAILS with "cannot drop columns from view" (20 columns against 21) - the intended guard.
--
-- ROLLBACK (only if needed): roll the app back first (it reads signed_in from 2026-10-31; without the column the coach screens' summaries
-- read fails, shown as "—"), then: drop view public.coach_client_summary; re-run fix-coach-client-summary-current-plan-2026-10-29.sql;
-- drop function public.coach_client_signed_in(uuid);
--
-- Verified locally on PGlite (scripts/sql-verify/client-signed-in.verify.mjs, with deliberate breakages in client-signed-in.mutations.mjs).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────

-- 1. The function: one boolean, for the caller's own clients only ----------------------------------------
create or replace function public.coach_client_signed_in(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.consented_at is not null
  from public.clients c
  join public.profiles p on p.id = c.user_id
  where c.id = p_client_id
    and c.coach_id = (select auth.uid())
$$;

revoke all on function public.coach_client_signed_in(uuid) from public, anon;
grant execute on function public.coach_client_signed_in(uuid) to authenticated;

-- 2. The view: the 20 columns of 2026-10-29, plus signed_in ------------------------------------------------
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
  nxt.next_program_start                 as next_program_start,
  public.coach_client_signed_in(c.id)    as signed_in
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
  -- The client's CURRENT plan, by date (unchanged from 2026-10-29; the rule is in that script's header and in _currentAssignment).
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

-- 3. Grants, restated so a view someone re-granted is put back: signed-in users read only ------------------
revoke all on public.coach_client_summary from public, anon, authenticated;
grant select on public.coach_client_summary to authenticated;

-- 4. Read the state back (this is the verification - it returns rows) ---------------------------------------
-- EXPECT: 1 "view options" row = security_invoker=true
--         21 "view column" rows (client_id ... next_program_start, then 21 signed_in boolean)
--         8 "privilege" rows: anon SELECT/INSERT/UPDATE/DELETE = false; authenticated SELECT = true, the rest false
--         1 "function" row = security_definer=true | search_path=public, pg_temp
--         2 "execute" rows: anon = false, authenticated = true
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
select 'function',
       'security_definer=' || p.prosecdef || ' | ' || coalesce(array_to_string(p.proconfig, ','), 'NO search_path - BAD')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'coach_client_signed_in'
union all
select 'execute',
       r.role_name || ' = ' || has_function_privilege(r.role_name, 'public.coach_client_signed_in(uuid)', 'EXECUTE')::text
from (values ('anon'), ('authenticated')) as r(role_name)
order by 1, 2;
