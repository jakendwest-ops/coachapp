-- Lets a signed-in CLIENT delete their own workout session — but ONLY while nothing has been saved in it AND it is brand new (created in the
-- last 15 minutes). Additive: two small read-only functions and two policies; no data touched, no table changed.
--
-- WHY. When a client's workout save fails part-way (a CHECK, a network drop), the app tries to undo what it already wrote: it deletes the
-- session's workout_log_exercises, then the workout_logs row (js/app-runner.js, around the exercises insert and the batched sets insert, and
-- the matching spots in saveWorkoutSession). The live policies (Jake's pg_policies read, 2026-10-01) give a client INSERT and SELECT on these
-- tables and NO DELETE, so the undo is refused WITHOUT AN ERROR and the half-written session stays: the client is told "Save failed", their
-- coach sees an empty workout in the client's history, and a retry saves a duplicate. Proved by behaviour with a probe (the rollback returned no
-- error and deleted nothing). Coach and solo are unaffected: the coach's delete policy matches coach_id = auth.uid(), which is the solo user's
-- own id. Ledger row 2026-10-01-client-failed-save-rollback-deletes-nothing. Decision (Jake, 2026-10-01): option 1, this narrow grant.
--
-- WHAT IT DOES. Two DELETE policies for the authenticated role, each asking one function whether the caller may delete THAT row:
--   workout_logs          "Client deletes own empty workout logs"  -> client_may_delete_log(id)
--   workout_log_exercises "Client deletes own empty log exercises" -> client_may_delete_log_exercise(id)
-- A function says yes only if ALL of these hold: the row belongs to one of the caller's own client records; no workout_log_sets exist under it
-- (under that session; under that exercise); and its SESSION was created less than 15 minutes ago. "Nothing saved" is the state a failed save
-- leaves (the sets go in as ONE all-or-nothing batch, so after a database error no set was written); the 15 minutes is the rollback's window (it
-- runs seconds after the insert) and keeps the grant from reaching old rows: without it a client could delete a set-less session of any age,
-- including one carrying a coach's note (workout_logs.notes). A finished session has sets, so a client cannot erase it, and a coach still controls it.
--
-- WHY FUNCTIONS, NOT THE TEST WRITTEN INTO THE POLICY. The first draft wrote the "no sets" test straight into each policy. Postgres refused it
-- ("infinite recursion detected in policy for relation workout_logs") and, worse, it would have broken the COACH's and the solo user's existing
-- deletes too: the new policy on workout_logs reads workout_log_exercises, whose own policies read workout_logs again, and Postgres rejects any
-- policy whose expansion reaches its own table. The local verifier caught it before anything was applied. Putting the test behind a function
-- breaks that cycle (a function containing sub-queries is not expanded inline). The functions are also SECURITY DEFINER so that they read the
-- tables directly rather than through those tables' policies, and each does its OWN check (below).
--
-- THE FUNCTIONS: search_path is fixed and every object is schema-qualified, including auth.uid(). Each returns true only when the CALLER (auth.uid())
-- owns the row's client record, the row is empty and it is recent, and false for everyone else, a stranger included, so calling one directly as an
-- RPC reveals nothing about anyone else's sessions. EXECUTE is revoked from PUBLIC and anon. (The explicit grant to authenticated is
-- belt-and-braces: the project's default privileges already give it, and service_role keeps its default grant.)
--
-- WHAT IT DOES NOT DO. No DELETE on workout_log_sets (a rollback never has any to delete, and a client must not be able to remove one).
-- No UPDATE or INSERT change. It does not stop a client deleting a recent empty session the COACH started for them (it has no sets either).
-- It also cannot help in one case: if the network drops AFTER the server committed the sets, the client sees an error although the sets exist, the
-- rollback is refused (sets exist), and a retry duplicates the session — coach and solo would have deleted it. Reading each rollback's rowcount in the
-- app (ledger option 3) is the follow-up for that. Not verified: whether workout_log_exercises.log_id has a foreign key to workout_logs with ON DELETE
-- CASCADE (the live rule was not read) — the app deletes the exercises first, so the first-branch rollback (log only) depends on it only if the
-- exercises were committed but their response lost.
--
-- ROLLBACK (all additive):
--   drop policy "Client deletes own empty workout logs" on public.workout_logs;
--   drop policy "Client deletes own empty log exercises" on public.workout_log_exercises;
--   drop function public.client_may_delete_log(uuid);
--   drop function public.client_may_delete_log_exercise(uuid);
--
-- Safe to run twice (create or replace, drop policy if exists). Verified locally on PGlite loaded with the live schema and every live policy on
-- these tables (scripts/sql-verify/client-empty-session-delete.verify.mjs), including that the documented rollback runs and reopens the gap;
-- the read-back at the bottom is the last check — run it and confirm two functions (definer=true, anon_exec=false) and two DELETE policies.

create or replace function public.client_may_delete_log(p_log_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workout_logs l
    join public.clients c on c.id = l.client_id
    where l.id = p_log_id and c.user_id = auth.uid()
      and l.created_at > now() - interval '15 minutes'
  )
  and not exists (
    select 1 from public.workout_log_exercises e
    join public.workout_log_sets s on s.workout_log_exercise_id = e.id
    where e.log_id = p_log_id
  )
$$;

create or replace function public.client_may_delete_log_exercise(p_exercise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workout_log_exercises e
    join public.workout_logs l on l.id = e.log_id
    join public.clients c on c.id = l.client_id
    where e.id = p_exercise_id and c.user_id = auth.uid()
      and l.created_at > now() - interval '15 minutes'
  )
  and not exists (select 1 from public.workout_log_sets s where s.workout_log_exercise_id = p_exercise_id)
$$;

revoke all on function public.client_may_delete_log(uuid) from public, anon;
revoke all on function public.client_may_delete_log_exercise(uuid) from public, anon;
grant execute on function public.client_may_delete_log(uuid) to authenticated;
grant execute on function public.client_may_delete_log_exercise(uuid) to authenticated;

drop policy if exists "Client deletes own empty workout logs" on public.workout_logs;
create policy "Client deletes own empty workout logs" on public.workout_logs
  for delete to authenticated
  using (public.client_may_delete_log(workout_logs.id));

drop policy if exists "Client deletes own empty log exercises" on public.workout_log_exercises;
create policy "Client deletes own empty log exercises" on public.workout_log_exercises
  for delete to authenticated
  using (public.client_may_delete_log_exercise(workout_log_exercises.id));

-- READ-BACK: two functions (security definer, fixed search_path, anon cannot execute, authenticated can) and two policies (FOR DELETE, authenticated only).
select 'function' as kind, p.proname::text as name,
       'definer=' || p.prosecdef::text
         || ' ' || coalesce(array_to_string(p.proconfig, ','), 'NO search_path')
         || ' anon_exec=' || has_function_privilege('anon', p.oid, 'execute')::text
         || ' authenticated_exec=' || has_function_privilege('authenticated', p.oid, 'execute')::text as detail
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('client_may_delete_log', 'client_may_delete_log_exercise')
union all
select 'policy', policyname::text, tablename::text || ' ' || cmd::text || ' ' || array_to_string(roles, ',')
from pg_policies
where schemaname = 'public'
  and policyname in ('Client deletes own empty workout logs', 'Client deletes own empty log exercises')
order by 1, 2;
