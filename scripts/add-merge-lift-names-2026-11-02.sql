-- merge_lift_names() / unmerge_lift_names(): a person (or their coach) says two names are the same lift, and the person's own history follows.
-- Additive: three nullable columns, one table, two functions and their grants. Changes no existing row by itself.
--
-- WHY. A lift is tracked by its typed NAME, so "Back Squat" and "Barbell Back Squat" are two lifts to every chart, "last time", personal
-- best and saved best (Jake's history has 12 such pairs). Merging means rewriting that name on the person's own rows. A coached client's
-- policies (read from the live database 2026-11-02) let them INSERT and SELECT their logged exercises and records but not UPDATE them
-- (workout_log_exercises, performance_logs); only the coach's "manage" policies update. So the rewrite runs in a SECURITY DEFINER
-- function that does its OWN ownership check, and changes exactly one column on exactly one client's rows.
--
-- WHAT IT DOES.
--   merge_lift_names(p_client_id, p_from, p_to):
--     1. the caller must be signed in and the client must be theirs: clients.user_id = me (the person; solo too) OR clients.coach_id = me
--        (their coach). Anything else is refused with 42501, and so is a missing client.
--     2. the kept name is p_to followed through any earlier merges (A into B, then B into C, keeps C); merging a name into itself, or
--        into something that already merges into it, is refused (cycle).
--     3. every row of THAT client whose name is p_from (ignoring case and edge spaces) takes the kept name, and remembers its old one in
--        merged_from: workout_log_exercises.exercise_name (via workout_logs.client_id), client_1rms.exercise_name, performance_logs.name.
--     4. the merge is recorded in lift_name_merges so FUTURE logging under the old name can land under the kept name (the app reads it).
--     Returns { final, sessions, bests, records }.
--   unmerge_lift_names(p_client_id, p_from): the same ownership check; puts back every row of that client whose merged_from is p_from,
--     clears merged_from, and forgets the merge. Rows logged under the kept name since are left alone.
-- Nothing is deleted. Templates, programmes and the exercise library are NOT touched (shared and coach-owned).
--
-- SECURITY. SECURITY DEFINER, search_path pinned, EXECUTE revoked from PUBLIC and anon, granted to `authenticated` only. lift_name_merges
-- has RLS on with a SELECT policy only: nothing can write it except these functions. The two update triggers on these tables
-- (lock_created_at; the audit trigger on workout_log_exercises and performance_logs) still fire, so every rewritten row is audited.
--
-- ACCEPTED WIDENING (decided with the review, 2026-11-02): a coached client had no UPDATE on their logged exercises or records; through this function they can
-- now rename their OWN history. The kept name must be one that already exists in that client's own rows and takes its STORED spelling; this is friction rather than a
-- boundary (a client can INSERT a row with any name, so could create the target first). Names are capped at 80 characters, a merge that moves nothing writes nothing,
-- and every merge is reversible. A client can therefore re-label one of their own lifts as another of their own lifts; the coach sees the merge (lift_name_merges) and
-- can undo it. KNOWN LIMIT: two names that differ only by edge spaces cannot be merged into each other (the names are trimmed, so they read as the same name). merged_from is a convenience for undo, NOT tamper-proof evidence: a client may INSERT rows
-- with any merged_from. The coach path is scoped by workout_logs.client_id like the client path (not by workout_logs.coach_id), so it also reaches that client's
-- older logs from a previous coach: same client's data, so accepted.
--
-- ROLLBACK (data first, then drop). Run in the SQL editor, which has no signed-in user, so the restore is written directly (it puts back EVERY client's merged names):
--   update public.workout_log_exercises set exercise_name = merged_from, merged_from = null where merged_from is not null;
--   update public.client_1rms set exercise_name = merged_from, merged_from = null where merged_from is not null;
--   update public.performance_logs set name = merged_from, merged_from = null where merged_from is not null;
--   drop function public.unmerge_lift_names(uuid, text);
--   drop function public.merge_lift_names(uuid, text, text);
--   drop table public.lift_name_merges;
--   alter table public.workout_log_exercises drop column merged_from;
--   alter table public.client_1rms drop column merged_from;
--   alter table public.performance_logs drop column merged_from;
--
-- Safe to run twice (if not exists / create or replace). Verified locally on PGlite with the live policies of every table it touches
-- (scripts/sql-verify/merge-lift-names.verify.mjs). The read-back at the bottom is the last check after it is applied.

alter table public.workout_log_exercises add column if not exists merged_from text;
alter table public.client_1rms           add column if not exists merged_from text;
alter table public.performance_logs      add column if not exists merged_from text;

create table if not exists public.lift_name_merges (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  from_name  text not null check (btrim(from_name) <> ''),
  to_name    text not null check (btrim(to_name) <> ''),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists lift_name_merges_client_from_uniq on public.lift_name_merges (client_id, lower(btrim(from_name)));
alter table public.lift_name_merges enable row level security;

drop policy if exists "Owner and coach read lift name merges" on public.lift_name_merges;
create policy "Owner and coach read lift name merges" on public.lift_name_merges
  for select to authenticated
  using (client_id in (select c.id from public.clients c where c.user_id = (select auth.uid()) or c.coach_id = (select auth.uid())));

revoke all on public.lift_name_merges from public, anon, authenticated;
grant select on public.lift_name_merges to authenticated;

create or replace function public.merge_lift_names(p_client_id uuid, p_from text, p_to text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_from     text := btrim(coalesce(p_from, ''));
  v_to       text := btrim(coalesce(p_to, ''));
  v_final    text;
  v_stored   text;
  v_next     text;
  v_hops     integer := 0;
  v_sessions integer := 0;
  v_bests    integer := 0;
  v_records  integer := 0;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id and (c.user_id = v_uid or c.coach_id = v_uid)) then
    raise exception 'That is not your client' using errcode = '42501';
  end if;
  -- one merge at a time per client: two at once could each pass the cycle check below and leave a loop (taken AFTER the ownership check, so a stranger cannot lock someone else's id)
  perform pg_advisory_xact_lock(hashtext(p_client_id::text));
  if v_from = '' or v_to = '' then
    raise exception 'Both names are needed' using errcode = '22023';
  end if;
  if v_from = v_to then
    raise exception 'That is the same name' using errcode = '22023';
  end if;
  if length(v_from) > 80 or length(v_to) > 80 then
    raise exception 'Names are limited to 80 characters' using errcode = '22023';
  end if;
  -- the kept name: follow the person's earlier merges, so A into B and then B into C keeps C (a record pointing at its own spelling, a case-only merge, ends the chain)
  v_final := v_to;
  loop
    select m.to_name into v_next from public.lift_name_merges m
      where m.client_id = p_client_id and lower(btrim(m.from_name)) = lower(v_final);
    exit when v_next is null or lower(v_next) = lower(v_final);
    v_final := v_next; v_hops := v_hops + 1;
    if v_hops > 20 then raise exception 'Too many chained merges' using errcode = '22023'; end if;
  end loop;
  -- the kept name must be a lift this client has actually logged or saved, and it takes the spelling that is STORED (the most used one): never the caller's casing or
  -- spacing, which would split the lift across two spellings. (Friction, not a boundary: a client may insert a row with any name, so they could create the target first.)
  select t.s into v_stored from (
    select e.exercise_name as s, count(*) as n from public.workout_log_exercises e join public.workout_logs l on l.id = e.log_id
      where l.client_id = p_client_id and lower(btrim(e.exercise_name)) = lower(v_final) group by e.exercise_name
    union all
    select r.exercise_name, count(*) from public.client_1rms r
      where r.client_id = p_client_id and lower(btrim(r.exercise_name)) = lower(v_final) group by r.exercise_name
    union all
    select p.name, count(*) from public.performance_logs p
      where p.client_id = p_client_id and lower(btrim(p.name)) = lower(v_final) group by p.name
  ) t group by t.s order by sum(t.n) desc, t.s limit 1;
  if v_stored is null then
    raise exception 'Merge into one of your own lifts' using errcode = '22023';
  end if;
  v_final := v_stored;
  -- a merge that would end up back at its own start is a cycle (case-only merges, Depth jump into Depth Jump, are not: no hops)
  if v_final = v_from or (v_hops > 0 and lower(v_final) = lower(v_from)) then
    raise exception 'Those names already merge the other way round' using errcode = '22023';
  end if;
  -- a name that was already merged into a DIFFERENT lift has no rows left to move (merging it elsewhere would split its history): undo that merge first.
  -- Repeating the SAME merge (a double tap, a retry) is harmless and moves nothing; a case-only record (pointing at its own spelling) is not "merged away".
  if exists (select 1 from public.lift_name_merges m where m.client_id = p_client_id and lower(btrim(m.from_name)) = lower(v_from)
               and lower(btrim(m.to_name)) <> lower(v_from) and lower(btrim(m.to_name)) <> lower(v_final)) then
    raise exception 'That name is already merged into another lift' using errcode = '22023';
  end if;

  update public.workout_log_exercises e
     set exercise_name = v_final, merged_from = coalesce(e.merged_from, e.exercise_name)
    from public.workout_logs l
   where l.id = e.log_id and l.client_id = p_client_id
     and lower(btrim(e.exercise_name)) = lower(v_from) and e.exercise_name <> v_final;
  get diagnostics v_sessions = row_count;

  update public.client_1rms r
     set exercise_name = v_final, merged_from = coalesce(r.merged_from, r.exercise_name)
   where r.client_id = p_client_id and lower(btrim(r.exercise_name)) = lower(v_from) and r.exercise_name <> v_final;
  get diagnostics v_bests = row_count;

  update public.performance_logs p
     set name = v_final, merged_from = coalesce(p.merged_from, p.name)
   where p.client_id = p_client_id and lower(btrim(p.name)) = lower(v_from) and p.name <> v_final;
  get diagnostics v_records = row_count;

  -- a merge that moved nothing writes nothing (no junk records)
  if v_sessions + v_bests + v_records > 0 then
    -- anything that already merged INTO the old name now points at the kept one
    update public.lift_name_merges set to_name = v_final
     where client_id = p_client_id and lower(btrim(to_name)) = lower(v_from);
    insert into public.lift_name_merges (client_id, from_name, to_name) values (p_client_id, v_from, v_final)
      on conflict (client_id, lower(btrim(from_name))) do update set to_name = excluded.to_name;
  end if;

  return jsonb_build_object('final', v_final, 'sessions', v_sessions, 'bests', v_bests, 'records', v_records);
end;
$$;

create or replace function public.unmerge_lift_names(p_client_id uuid, p_from text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_from     text := btrim(coalesce(p_from, ''));
  v_sessions integer := 0;
  v_bests    integer := 0;
  v_records  integer := 0;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id and (c.user_id = v_uid or c.coach_id = v_uid)) then
    raise exception 'That is not your client' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_client_id::text));   -- the same per-client lock as the merge, taken after the ownership check
  if v_from = '' then
    raise exception 'A name is needed' using errcode = '22023';
  end if;

  update public.workout_log_exercises e
     set exercise_name = e.merged_from, merged_from = null
    from public.workout_logs l
   where l.id = e.log_id and l.client_id = p_client_id and lower(btrim(e.merged_from)) = lower(v_from);
  get diagnostics v_sessions = row_count;

  update public.client_1rms r
     set exercise_name = r.merged_from, merged_from = null
   where r.client_id = p_client_id and lower(btrim(r.merged_from)) = lower(v_from);
  get diagnostics v_bests = row_count;

  update public.performance_logs p
     set name = p.merged_from, merged_from = null
   where p.client_id = p_client_id and lower(btrim(p.merged_from)) = lower(v_from);
  get diagnostics v_records = row_count;

  delete from public.lift_name_merges where client_id = p_client_id and lower(btrim(from_name)) = lower(v_from);

  return jsonb_build_object('sessions', v_sessions, 'bests', v_bests, 'records', v_records);
end;
$$;

revoke all on function public.merge_lift_names(uuid, text, text) from public, anon;
revoke all on function public.unmerge_lift_names(uuid, text) from public, anon;
grant execute on function public.merge_lift_names(uuid, text, text) to authenticated;
grant execute on function public.unmerge_lift_names(uuid, text) to authenticated;

-- READ-BACK: two functions (security definer, fixed search_path, anon cannot execute, authenticated can), the table with RLS on and exactly one
-- policy (SELECT), and the three merged_from columns.
select 'function' as kind, p.proname::text as name,
       'definer=' || p.prosecdef::text
         || ' ' || coalesce(array_to_string(p.proconfig, ','), 'NO search_path')
         || ' anon_exec=' || has_function_privilege('anon', p.oid, 'execute')::text
         || ' authenticated_exec=' || has_function_privilege('authenticated', p.oid, 'execute')::text as detail
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('merge_lift_names', 'unmerge_lift_names')
union all
select 'table', c.relname::text, 'rls=' || c.relrowsecurity::text
         || ' anon_write=' || (has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))::text
         || ' authenticated_write=' || (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete'))::text
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = 'lift_name_merges'
union all
select 'policy', policyname::text, tablename::text || ' ' || cmd::text || ' ' || array_to_string(roles, ',')
from pg_policies where schemaname = 'public' and tablename = 'lift_name_merges'
union all
select 'column', table_name::text, column_name::text || ' ' || data_type::text
from information_schema.columns
where table_schema = 'public' and column_name = 'merged_from' and table_name in ('workout_log_exercises', 'client_1rms', 'performance_logs')
order by 1, 2;
