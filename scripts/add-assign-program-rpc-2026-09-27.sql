-- assign_program(): assigning (or restarting) a programme for a client becomes ONE database transaction.
-- Additive: creates one function and its grants. Reads and changes no existing data by itself.
--
-- WHY. Until now the browser did it as a chain of separate API writes (app-programs.js saveAssignProgram and
-- saveAssignProgramToClient): archive the old block, delete the old assignment, sweep its copies, insert the new
-- assignment, then copy every session one at a time (2 requests per session; a 12-week, 4-session programme is
-- ~97 sequential requests). A dropped connection or one refused write part-way left permanent partial state:
-- a restart could delete the client's plan and never insert the new one, and an assign could leave an assignment
-- with only some of its sessions. The code reported it; it could not prevent it. (App-code audit 2026-09-27, R1.)
-- Inside one function either every step lands or none does.
--
-- WHAT IT DOES, in order, mirroring the JS it replaces step for step:
--   1. the caller must be signed in; the client must be theirs (clients.coach_id = me OR clients.user_id = me —
--      exactly _verifyClientAccess) and the programme must be theirs (programs.coach_id = me — _verifyProgramOwnership).
--   2. if the client already has this programme: refuse with 23505 unless p_restart is true. On restart:
--      archive it into client_program_blocks (_archiveAssignmentBlock: name, dates, planned weeks, reason 'restarted'),
--      delete the assignment (its session rows cascade), then delete its copied workouts that nothing else still uses
--      and nobody has trained from (_removeAssignmentAndClones's two guards; only rows with client_id set).
--   3. insert the new assignment; copy every session that has a workout (_cloneTemplateForClient's exact columns),
--      one copy per session, each linked by a client_program_workouts row carrying its week number.
--   4. returns { client_program_id, phases, sessions, restarted }. phases = 0 is "assigned, but nothing to do yet",
--      the same outcome the JS warned about.
-- Deliberate differences, all in the direction of "change nothing rather than half":
--   · a session whose workout cannot be read (the JS counted it as "skipped" and kept a half-copied assignment) now
--     FAILS the whole call, so the client keeps exactly what they had;
--   · a failure sweeping the OLD copies on restart now aborts the restart (the JS logged it and carried on, leaking
--     the copies). The read-back lists every foreign key into workout_templates so a blocking one would be visible;
--   · a restart that finds its old assignment already removed (two tabs restarting at once) fails with 40001.
--
-- SECURITY. SECURITY INVOKER: it runs with the caller's own rights, so every read and write still passes the live
-- row-level-security policies (read from the live database 2026-09-27) — the function adds checks, it bypasses none.
-- Executable by `authenticated` only (revoked from PUBLIC and anon). search_path is pinned.
--
-- NOT MOVED HERE: the optional 1RM quick-entry save (client_1rms) stays in the browser after a successful assign, as
-- before. Removing a programme and deleting a programme / week are unchanged (a later release).
--
-- ROLLBACK (the JS falls back to nothing, so roll back the JS release first):
--   drop function public.assign_program(uuid, uuid, date, boolean);
--
-- Safe to run twice (create or replace). Verified locally on PGlite loaded with the live schema, the live policies of
-- every table it touches, and the live triggers that matter (scripts/sql-verify/assign-program.verify.mjs), including
-- rollback on a mid-flow failure and refusal for another coach, a client, and no identity. The read-back at the bottom
-- is the last check.

create or replace function public.assign_program(
  p_client_id  uuid,
  p_program_id uuid,
  p_start_date date    default null,
  p_restart    boolean default false
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_existing  record;
  v_restarted boolean := false;
  v_clone_ids uuid[];
  v_cp_id     uuid;
  v_phases    integer;
  v_sessions  integer := 0;
  v_slot      record;
  v_new_tmpl  uuid;
begin
  -- 1. who, and whose
  if v_uid is null then
    raise exception 'assign_program: not signed in' using errcode = '42501';
  end if;
  if p_client_id is null or p_program_id is null then
    raise exception 'assign_program: a client and a programme are both required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients c
                 where c.id = p_client_id and (c.coach_id = v_uid or c.user_id = v_uid)) then
    raise exception 'assign_program: that client is not yours' using errcode = '42501';
  end if;
  if not exists (select 1 from public.programs p where p.id = p_program_id and p.coach_id = v_uid) then
    raise exception 'assign_program: that programme is not yours' using errcode = '42501';
  end if;

  -- 2. an existing assignment of this programme to this client (unique on client_id, program_id)
  select cp.id, cp.client_id, cp.program_id, cp.start_date, cp.created_at
    into v_existing
    from public.client_programs cp
   where cp.client_id = p_client_id and cp.program_id = p_program_id
   order by cp.created_at desc
   limit 1;

  if v_existing.id is not null then
    if not p_restart then
      raise exception 'assign_program: that programme is already assigned to this client' using errcode = '23505';
    end if;
    v_restarted := true;

    -- archive FIRST (history must never be traded for the removal)
    insert into public.client_program_blocks
      (client_id, program_id, program_name, start_date, assigned_at, ended_at, planned_weeks, ended_reason, source_client_program_id)
    select v_existing.client_id, v_existing.program_id, coalesce(nullif(p.name, ''), 'Programme'), v_existing.start_date,
           coalesce(v_existing.created_at, now()), current_date,
           (select sum(case when ph.duration_weeks > 0 then ph.duration_weeks else 1 end)::integer
              from public.program_phases ph where ph.program_id = v_existing.program_id),
           'restarted', v_existing.id
      from public.programs p
     where p.id = v_existing.program_id;
    if not found then
      raise exception 'assign_program: could not archive the existing assignment' using errcode = '42501';
    end if;

    select coalesce(array_agg(distinct cpw.workout_template_id), '{}')
      into v_clone_ids
      from public.client_program_workouts cpw
     where cpw.client_program_id = v_existing.id;

    delete from public.client_programs where id = v_existing.id;
    if not found then
      -- 40001, not 42501: the realistic cause is a second restart of the same plan (another tab) that removed this
      -- row first. Nothing is lost either way; the app says "changed elsewhere, try again" instead of "permission denied".
      raise exception 'assign_program: the existing assignment was changed by something else' using errcode = '40001';
    end if;

    -- its copies, only where nothing still uses them and nobody trained from them; never a master (client_id null)
    delete from public.workout_templates t
     where t.id = any (v_clone_ids)
       and t.client_id is not null
       and not exists (select 1 from public.client_program_workouts x where x.workout_template_id = t.id)
       and not exists (select 1 from public.workout_logs l where l.template_id = t.id);
  end if;

  -- 3. the new assignment and a copy of every session
  insert into public.client_programs (client_id, program_id, start_date)
  values (p_client_id, p_program_id, p_start_date)
  returning id into v_cp_id;

  select count(*) into v_phases from public.program_phases where program_id = p_program_id;

  for v_slot in
    select pw.id as pw_id, pw.week_number, t.id as t_id, t.name, t.description, t.is_personal, t.family_id
      from public.program_phases ph
      join public.program_phase_workouts pw on pw.phase_id = ph.id
      left join public.workout_templates t on t.id = pw.template_id
     where ph.program_id = p_program_id
       and pw.template_id is not null
     order by ph.order_index, pw.week_number, pw.session_order, pw.order_index, pw.id
  loop
    if v_slot.t_id is null then
      -- the slot names a workout this caller cannot read: fail the whole assignment rather than hand the client
      -- a plan with a session silently missing
      raise exception 'assign_program: a session''s workout could not be read, so nothing was assigned' using errcode = '42501';
    end if;

    insert into public.workout_templates (coach_id, client_id, program_id, is_personal, name, description, family_id)
    values (v_uid, p_client_id, null, v_slot.is_personal, v_slot.name, nullif(v_slot.description, ''), v_slot.family_id)
    returning id into v_new_tmpl;

    insert into public.workout_template_exercises
      (template_id, exercise_id, exercise_name, exercise_type, metric_type, order_index, sets, sets_json, notes, superset_group)
    select v_new_tmpl, e.exercise_id, e.exercise_name, e.exercise_type, coalesce(nullif(e.metric_type, ''), 'weight_reps'),
           e.order_index, nullif(e.sets, 0), e.sets_json, nullif(e.notes, ''), nullif(e.superset_group, '')
      from public.workout_template_exercises e
     where e.template_id = v_slot.t_id;

    insert into public.client_program_workouts (client_program_id, program_phase_workout_id, workout_template_id, week_number)
    values (v_cp_id, v_slot.pw_id, v_new_tmpl, v_slot.week_number);

    v_sessions := v_sessions + 1;
  end loop;

  return jsonb_build_object('client_program_id', v_cp_id, 'phases', v_phases, 'sessions', v_sessions, 'restarted', v_restarted);
end;
$$;

revoke all on function public.assign_program(uuid, uuid, date, boolean) from public;
revoke all on function public.assign_program(uuid, uuid, date, boolean) from anon;
grant execute on function public.assign_program(uuid, uuid, date, boolean) to authenticated;

-- make the API see the new function now, not at its next schema reload
notify pgrst, 'reload schema';

-- READ-BACK (returns rows): the function's security mode and config, who may execute it, and every foreign key that
-- points INTO workout_templates with its ON DELETE rule (a RESTRICT / NO ACTION one could make the restart's sweep fail).
select 'function' as kind, p.proname::text as name,
       'security_definer=' || p.prosecdef || '; config=' || coalesce(array_to_string(p.proconfig, ','), '-')
         || '; args=' || pg_get_function_identity_arguments(p.oid) as detail
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'assign_program'
union all
select 'execute', r.rolname::text,
       has_function_privilege(r.rolname, 'public.assign_program(uuid, uuid, date, boolean)', 'execute')::text
  from pg_roles r where r.rolname in ('anon', 'authenticated')
union all
select 'fk-into-workout_templates', con.conrelid::regclass::text,
       con.conname || ' on delete ' || case con.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL'
         when 'r' then 'RESTRICT' when 'a' then 'NO ACTION' when 'd' then 'SET DEFAULT' end
  from pg_constraint con
 where con.contype = 'f' and con.confrelid = 'public.workout_templates'::regclass
order by 1, 2, 3;
