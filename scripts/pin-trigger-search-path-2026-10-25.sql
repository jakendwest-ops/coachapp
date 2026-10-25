-- Pins the search_path of two small trigger functions the Supabase Security Advisor flagged ("Function Search Path Mutable", lint 0011):
-- touch_workout_template_updated_at() and set_workout_template_family_id(). Changes no data, no table and no policy.
--
-- WHY. A function with no search_path of its own resolves every unqualified name through the CALLER's search_path, so a role that could create an
-- object in an earlier schema could shadow a name the function uses. Neither function uses any unqualified object today (each sets one column on the
-- new row and calls now(), which lives in pg_catalog and is always searched first), so nothing was exploitable; pinning it makes that a guarantee
-- instead of a property of the current body. Found by the Advisor read of 2026-10-25 (Jake pasted it).
--
-- WHAT IT DOES. One ALTER FUNCTION per function, search_path = public, pg_temp (the same value every other function in this project carries, e.g.
-- guard_client_id_change and the two client_may_delete_* helpers). Neither is SECURITY DEFINER, so their privileges do not change.
--
-- WHAT IT DOES NOT DO. It does not touch the other three trigger functions the Advisor did not flag, and it does not change either function's body.
--
-- WHAT A PASS HERE DOES NOT PROVE. The verifier runs on PGlite (Postgres 18; live is 17.6) with the two bodies as scripted in
-- scripts/add-family-id-2026-08-14.sql and scripts/add-template-updated-at-2026-09-04.sql, not read back from the live project; the read-back below is the check
-- on the real one.
--
-- ROLLBACK (exact, restores the previous state):
--   alter function public.touch_workout_template_updated_at() reset search_path;
--   alter function public.set_workout_template_family_id() reset search_path;
--
-- Safe to run twice (setting a value that is already set is a no-op). Applied by Jake on 2026-10-25; the read-back showed both functions pinned.

alter function public.touch_workout_template_updated_at() set search_path = public, pg_temp;
alter function public.set_workout_template_family_id() set search_path = public, pg_temp;

-- READ-BACK: both functions, with the setting each now carries.
select p.proname::text as name,
       coalesce(array_to_string(p.proconfig, ','), 'NOT SET') as detail
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('touch_workout_template_updated_at', 'set_workout_template_family_id')
order by 1;
