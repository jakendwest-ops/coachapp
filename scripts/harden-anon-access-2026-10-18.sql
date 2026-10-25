-- Takes every privilege away from the SIGNED-OUT role (anon) on the app's tables and sequences, and stops anon from calling nine database functions it never needs.
-- Read-only to data: it changes who may attempt something, never what is stored.
--
-- WHY. The live inventory of 2026-10-18 found anon holding SELECT/INSERT/UPDATE/DELETE on 24 of the 28 relations in `public` (the other four - the app_errors table,
-- the client_program_blocks table, a 2026-08-09 backup table and the coach_client_summary view - were already closed to it), and EXECUTE on nine functions
-- (Supabase grants both to anon by default on every new object). Row-level security is on for all of them, and a signed-out probe of the 25 tables the app queries
-- returned zero rows on 2026-10-18 - so nothing leaks today. But RLS was then the ONLY wall: the anon key ships in the page by design, so one policy written without
-- `to authenticated`, or one `using (true)`, would put a table in front of the whole internet. The app never reads or writes a table while signed out (sign-in,
-- invite and recovery all go through the auth endpoints), so the privileges are not used.
--
-- WHAT IT DOES.
--   1. REVOKE ALL on every table, view and sequence in `public` FROM anon. `authenticated` and `service_role` are not touched.
--   2. ALTER DEFAULT PRIVILEGES so a table, sequence or function created later by the SQL editor / migrations (role postgres) is not handed to anon by Supabase's own
--      default grants. (Postgres also lets PUBLIC execute every new function, and that default can only be changed for ALL schemas - which would also change functions
--      that extensions create later, so it is left alone: a new function still needs its own `revoke ... from public, anon`, which scripts/check-sql-definer.mjs
--      requires of every SECURITY DEFINER function. Objects created by another role, such as supabase_admin, are not covered.)
--   3. REVOKE EXECUTE FROM public AND anon on nine functions: app_errors_rate_limit, clients_guard_coach_id, delete_current_user, handle_new_user, lock_created_at,
--      log_audit_event, set_workout_template_family_id, touch_parent_workout_template, touch_workout_template_updated_at. Eight are trigger functions (they cannot be
--      called through the API, and firing a trigger does not check the caller's EXECUTE right); delete_current_user() is the one the app calls, as a signed-in user, so
--      it is granted to `authenticated` explicitly. `mock_openapi()` is deliberately NOT touched: it is the stub that answers the API's root listing.
--
-- WHAT IT DOES NOT DO. It does not change a policy, a table's data, or anything `authenticated` may do. A signed-out request to a table now fails with "permission
-- denied" (HTTP 401) instead of returning an empty list. It cannot fix a function in a schema other than `public`.
--
-- WHAT A PASS HERE DOES NOT PROVE. The verifier runs on PGlite (Postgres 18; live is 17.6) loaded with 18 of the 28 relations and stand-ins for the functions, so the
-- live ACLs, the live role memberships and the exact function signatures are not exercised. The read-back below is the check on the real project.
--
-- AFTER RUNNING IT: sign in as a coach and as a client and open the dashboard, a client and a session; a permission error on a signed-in page means a privilege that
-- `authenticated` needed was granted only to anon (none is known - the app has no signed-out data path - so this is the check that would show it).
--
-- ROLLBACK (exact: it puts back what the inventory showed on 2026-10-18, including the three tables that were already closed to anon). Run all six:
--   grant all on all tables in schema public to anon;
--   grant all on all sequences in schema public to anon;
--   alter default privileges for role postgres in schema public grant all on tables to anon;
--   alter default privileges for role postgres in schema public grant all on sequences to anon;
--   alter default privileges for role postgres in schema public grant execute on functions to anon;
--   revoke all on table public.app_errors, public.client_program_blocks, public._cardio_merge_backup_2026_08_09 from anon;
--   (the function revokes are not worth undoing: nothing signed-out ever called them.)
--
-- Safe to run twice (a revoke of a privilege that is already gone is a no-op). Verified locally on PGlite (scripts/sql-verify/harden-anon-access.verify.mjs); the
-- read-back at the bottom is the last check.

-- 1. tables, views and sequences
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 2. objects created from now on
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- 3. functions
revoke all on function public.app_errors_rate_limit() from public, anon;
revoke all on function public.clients_guard_coach_id() from public, anon;
revoke all on function public.delete_current_user() from public, anon;
revoke all on function public.handle_new_user() from public, anon;
revoke all on function public.lock_created_at() from public, anon;
revoke all on function public.log_audit_event() from public, anon;
revoke all on function public.set_workout_template_family_id() from public, anon;
revoke all on function public.touch_parent_workout_template() from public, anon;
revoke all on function public.touch_workout_template_updated_at() from public, anon;
grant execute on function public.delete_current_user() to authenticated;

-- READ-BACK: anon's privileges across `public` (expect: no table or sequence with any, no function other than mock_openapi executable), and that signed-in users kept theirs.
select 'anon tables with any privilege' as check_name,
       count(*)::text as result
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
       or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete')
       or has_table_privilege('anon', c.oid, 'truncate') or has_table_privilege('anon', c.oid, 'references')
       or has_table_privilege('anon', c.oid, 'trigger'))
union all
select 'anon sequences with any privilege', count(*)::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'S'
  and (has_sequence_privilege('anon', c.oid, 'usage') or has_sequence_privilege('anon', c.oid, 'select') or has_sequence_privilege('anon', c.oid, 'update'))
union all
select 'tables authenticated cannot select (expect only the 2026-08-09 backup)', coalesce(string_agg(c.relname::text, ', ' order by c.relname), 'none')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not has_table_privilege('authenticated', c.oid, 'select')
union all
select 'functions anon can execute', coalesce(string_agg(p.proname::text, ', ' order by p.proname), 'none')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'delete_current_user executable by authenticated', has_function_privilege('authenticated', 'public.delete_current_user()', 'execute')::text
order by 1;
