-- 2026-10-17: assign_program() stamps a restarted plan's end date with the CALLER's local day, not the server's UTC day.
--
-- WHY. When a plan is restarted, the function archives the old assignment into client_program_blocks with ended_at = current_date, and on
-- Supabase current_date is the UTC day. The browser's twin of that step (_archiveAssignmentBlock, used when a plan is removed) has stamped the
-- LOCAL day since 2026-10-17 (the 2026-10-13 and 2026-10-04 ledger rows), so for the first hour after midnight in the UK summer the two archive
-- copies of the same kind of block disagreed by a day. Cosmetic history only, found by the multi-agent review of that change.
--
-- WHAT CHANGES. One new, optional fifth argument, p_today date default null, and one use of it: ended_at = p_today, clamped to within one day of
-- the server's date (no time zone is further than that, so a wrong device clock cannot write a wild date into history; it is clamped, not refused,
-- so a client with a bad clock can still restart a plan). Called WITHOUT p_today, the function behaves exactly as before (the server's date).
-- Nothing else moves: the same body, the same checks, the same caller's-rights execution and fixed search_path, the same grants.
--
-- ORDER MATTERS, TWICE. (1) Run THIS script BEFORE the browser release that passes p_today: a browser that sends p_today to the old function is
-- refused by the API (no such argument) and every plan assignment fails. The browser change is only committed after this has been run. (2) Inside the
-- script the new function is created FIRST and the old four-argument one dropped SECOND: two functions of the same name with overlapping defaults make
-- the API refuse the call as ambiguous, so the old one must go, and doing it in this order means there is never a moment with no function at all.
--
-- ROLLBACK (roll the browser back first; an old browser never sends p_today, so it works against either function):
--   drop function public.assign_program(uuid, uuid, date, boolean, date);
--   then run add-assign-program-rpc-2026-09-27.sql again (it creates the four-argument function and its grants).
--
-- Safe to run twice. Reads and changes no data by itself. Verified locally on PGlite with the live schema and policies
-- (scripts/sql-verify/assign-program-today.verify.mjs); the read-back at the bottom is the last check.

-- 1. The new function (five arguments) ---------------------------------------------------------------------
create or replace function public.assign_program(
  p_client_id  uuid,
  p_program_id uuid,
  p_start_date date    default null,
  p_restart    boolean default false,
  p_today      date    default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_ended     date := least(greatest(coalesce(p_today, current_date), current_date - 1), current_date + 1);
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
           coalesce(v_existing.created_at, now()), v_ended,
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

revoke all on function public.assign_program(uuid, uuid, date, boolean, date) from public;
revoke all on function public.assign_program(uuid, uuid, date, boolean, date) from anon;
grant execute on function public.assign_program(uuid, uuid, date, boolean, date) to authenticated;

-- 2. The old four-argument function goes (it would make every call ambiguous) --------------------------------
drop function if exists public.assign_program(uuid, uuid, date, boolean);

-- make the API see the change now, not at its next schema reload
notify pgrst, 'reload schema';

-- READ-BACK (returns rows). EXPECT: exactly 1 "function" row, with args ending in "p_today date", security_definer=false and config=search_path=public, pg_temp;
-- "execute" rows: anon false, authenticated true; and the foreign keys into workout_templates as before.
select 'function' as kind, p.proname::text as name,
       'security_definer=' || p.prosecdef || '; config=' || coalesce(array_to_string(p.proconfig, ','), '-')
         || '; args=' || pg_get_function_identity_arguments(p.oid) as detail
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'assign_program'
union all
select 'execute', r.rolname::text,
       has_function_privilege(r.rolname, 'public.assign_program(uuid, uuid, date, boolean, date)', 'execute')::text
  from pg_roles r where r.rolname in ('anon', 'authenticated')
union all
select 'fk-into-workout_templates', con.conrelid::regclass::text,
       con.conname || ' on delete ' || case con.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL'
         when 'r' then 'RESTRICT' when 'a' then 'NO ACTION' when 'd' then 'SET DEFAULT' end
  from pg_constraint con
 where con.contype = 'f' and con.confrelid = 'public.workout_templates'::regclass
order by 1, 2, 3;
