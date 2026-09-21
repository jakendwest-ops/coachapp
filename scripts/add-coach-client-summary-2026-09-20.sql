-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Release 2b (2026-09-20): public.coach_client_summary — ONE summary row per coached client.
--
-- WHY. The coach dashboard and the client list build "last session", "sessions this week" and "at risk" from
-- capped slices of workout_logs (the API returns at most 200 rows per request — measured 2026-09-20): the
-- dashboard reads month-to-date logs `.limit(100)`, the list reads the newest 200 logs across ALL clients. Past
-- those sizes a client last seen 35 days ago reads "No sessions" and an active client reads "At risk"; and on
-- UTC days 1-7 of every month the dashboard cannot see last month's sessions at all. This view does the
-- arithmetic in the database, one row per client, so nothing is capped and nothing is guessed.
--
-- WHAT IT IS.
--   * A SECURITY INVOKER view: every base table's existing row-level security applies AS THE CALLER, exactly as
--     it does for the reads the app makes today. It is NOT a privileged surface.
--   * Scoped again inside the view (`c.coach_id = auth.uid()`), so a client, a solo user, another coach and a
--     caller with no identity each get ZERO rows even if a base-table policy were ever loosened. Never rely on
--     RLS alone for a new surface. anon has no privilege at all ("permission denied"); service_role has the
--     privilege but auth.uid() is null for it, so it also gets zero rows — an Edge Function using the service
--     key cannot read this view, by design.
--   * Dates and counts only, plus the latest check-in's raw 1-5 scores (any of which may be NULL). No weights,
--     no notes, no emails.
--   * WINDOWS. sessions_7d counts logs with `date` from (UTC today - 7) to UTC today — 8 calendar days,
--     inclusive — and sessions_28d from (UTC today - 28) — 29 calendar days. The 7-day cut-off is IDENTICAL to
--     the dashboard's today (js/app-dashboard.js: the UTC date of now-7d), so the numbers do not shift; near
--     midnight BST that is a UK coach's "yesterday", the same behaviour as before. A log dated in the FUTURE is
--     ignored (a mistyped year would otherwise make a client look active for a year).
--   * "Newest programme" = the client's newest client_programs row by created_at DESC — exactly how every screen
--     picks it (PostgREST's descending order puts NULL created_at FIRST, and so does this). program_weeks is the
--     sum of that programme's phase weeks, NULL when it has no phases (the app treats "no phases" as unknown,
--     not as zero weeks). client_programs.status is deliberately not consulted: nothing in the app reads it.
--   * "A session" is any workout_logs row, as on every coach screen today (the client-facing screens hide logs
--     with no exercises, so a coach and a client can already disagree by such rows; not changed here).
--
-- WHAT IT ADDS (nothing existing is altered). Schema read 2026-09-20: Postgres 17.6, RLS enabled on all seven
-- tables, and NO index on the client_id of workout_logs / weight_logs / client_check_ins, on clients.coach_id or
-- on program_phases.program_id (only primary keys, one unique pair on client_programs and a partial unique on
-- clients.user_id). The five indexes below are exactly the missing ones the view reads through. A plain
-- CREATE INDEX takes a brief write lock; at this data size that is a fraction of a second — run it when nobody
-- is mid-workout-save. (CONCURRENTLY cannot run in the editor.) `lock_timeout` makes it give up after 5 seconds
-- rather than queue every other write behind a long-running one; if it does, just run the script again.
--
-- DEPLOY ORDER. Run this FIRST. Nothing calls the view yet, so it is inert until the release that reads it
-- ships. Safe to run twice on a database no later script has extended. If any statement errors, stop and paste
-- the error — do not run the rest by hand. Every partial state is harmless (indexes without the view; or the
-- view without its revoke, which nothing calls and which returns nothing to anyone but the owning coach).
--
-- !! FUTURE EDITS TO THIS VIEW. Any later `create or replace view public.coach_client_summary` MUST repeat
-- !! `with (security_invoker = true)`. Leaving it out silently RESETS the view to run with its owner's rights,
-- !! which bypasses row-level security (measured: another coach's log was then counted). Only trailing
-- !! columns may be added (an insert, a swap, a type change or a drop is refused by Postgres), and re-running
-- !! THIS file after such an extension fails with "cannot drop columns" — run the later script instead.
-- !! Read reloptions back every time (section 4 does).
--
-- ROLLBACK (if ever wanted), in this order:
--   drop view if exists public.coach_client_summary;
--   drop index if exists public.workout_logs_client_date_idx, public.weight_logs_client_date_idx,
--                        public.client_check_ins_client_created_idx, public.clients_coach_id_idx,
--                        public.program_phases_program_id_idx;
--
-- The last statement is a SELECT that reads the resulting state back — the editor's "Success. No rows
-- returned." message proves nothing about DDL. Expected result is described above it.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────

-- Fail fast instead of queueing writes behind a blocked index build. (SET LOCAL applies inside the editor's
-- transaction; if it runs each statement on its own this is a harmless no-op with a notice.)
set local lock_timeout = '5s';

-- 1. The missing indexes -----------------------------------------------------------------------------------
create index if not exists workout_logs_client_date_idx          on public.workout_logs (client_id, date desc);
create index if not exists weight_logs_client_date_idx           on public.weight_logs (client_id, date desc);
create index if not exists client_check_ins_client_created_idx   on public.client_check_ins (client_id, created_at desc);
create index if not exists clients_coach_id_idx                  on public.clients (coach_id);
create index if not exists program_phases_program_id_idx         on public.program_phases (program_id);

-- 2. The view ----------------------------------------------------------------------------------------------
-- Every lateral subquery reads through the indexes above and is bounded: one newest row, or a 28-day range.
-- Every column is table-qualified (workout_logs and weight_logs both have `date`; several tables have
-- `created_at`) — Postgres would not raise an ambiguity error across query levels, it would bind the wrong one.
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
    and w.date <= (now() at time zone 'utc')::date
  order by w.date desc
  limit 1
) last_wl on true
left join lateral (
  select count(*) filter (where w.date >= (now() at time zone 'utc')::date - 7) as sessions_7d,
         count(*)                                                               as sessions_28d
  from public.workout_logs w
  where w.client_id = c.id
    and w.date >= (now() at time zone 'utc')::date - 28
    and w.date <= (now() at time zone 'utc')::date
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

comment on view public.coach_client_summary is
  'Release 2b: one row per client of the CALLING coach — last session, 7/28-day session counts, last weigh-in, latest check-in scores, current programme. security_invoker: base-table RLS applies as the caller; zero rows for anyone who is not the coach. Any later create or replace MUST repeat WITH (security_invoker = true).';

-- 3. Grants: signed-in users only, read only ---------------------------------------------------------------
-- New objects in `public` are granted to anon and authenticated by default in Supabase; take all of that away
-- and give back exactly SELECT to authenticated. (service_role keeps its defaults but sees zero rows.)
revoke all on public.coach_client_summary from public, anon, authenticated;
grant select on public.coach_client_summary to authenticated;

-- 4. Read the state back (this is the verification — it returns rows) ---------------------------------------
-- EXPECT: 1 "view options" row  = security_invoker=true
--         19 "view column" rows (client_id ... program_weeks)
--         8 "privilege" rows: anon SELECT/INSERT/UPDATE/DELETE = false;
--                             authenticated SELECT = true, INSERT/UPDATE/DELETE = false
--         5 "index" rows — each one's full definition (check the column lists match section 1)
--         1 "schema create" row: anon=false authenticated=false (nobody but the owner can add objects to public,
--           which is what stops a hostile role planting look-alike functions the view would call)
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
select 'index', indexdef::text
from pg_indexes
where schemaname = 'public'
  and indexname in ('workout_logs_client_date_idx', 'weight_logs_client_date_idx',
                    'client_check_ins_client_created_idx', 'clients_coach_id_idx',
                    'program_phases_program_id_idx')
union all
select 'schema create',
       'anon=' || has_schema_privilege('anon', 'public', 'CREATE')::text
         || ' authenticated=' || has_schema_privilege('authenticated', 'public', 'CREATE')::text
order by 1, 2;
