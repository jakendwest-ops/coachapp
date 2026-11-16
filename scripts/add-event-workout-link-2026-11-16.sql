-- Lets a Personal-view user put one of their own workouts on a day (docs/bugs/2026-11-16-new-workout-cannot-be-scheduled-or-seen-on-dashboard.md;
-- Jake approved the design 2026-11-16). A scheduled workout is a calendar event (public.events) that points at a workout_templates row.
--
-- WHAT IT ADDS.
--   1. events.template_id: a nullable link to the workout. ON DELETE CASCADE: deleting the workout removes the days it was scheduled on (an
--      event pointing at nothing would draw as a session that cannot be started). Logged sessions are untouched: workout_logs keeps its own
--      template link, which is ON DELETE SET NULL.
--   2. A partial index on it, for the cascade and the dashboard's read.
--   3. A guard trigger: for a signed-in end user, a template_id may only name the caller's OWN Personal-library workout (coach_id = auth.uid(),
--      is_personal, and no client, programme or generated phase - so not a client's copy or a plan's session) on the caller's OWN personal
--      record (clients.user_id = auth.uid() and coach_id is null), with created_by = the caller. The existing events policies
--      already decide who may insert and delete an event; none of them looks at template_id, so without this a user could link someone
--      else's workout id. Same shape as guard_client_id_change (scripts/add-client-link-guard-2026-10-18.sql): invoker rights, fixed
--      search_path, the SQL editor and the service role are never refused, an UPDATE that changes neither column is not re-checked.
--
-- WHAT IT DOES NOT DO. No policy changes. No change to any existing row (the new column starts null everywhere). A coach scheduling for a
-- client is out of scope for this version and is refused by the guard.
--
-- ROLLBACK (data in the column is lost): drop trigger events_guard_template on public.events;
--                                        drop function public.guard_event_template();
--                                        alter table public.events drop column template_id;
--
-- Safe to run twice. Verified locally on PGlite with the live events/clients/workout_templates policies
-- (scripts/sql-verify/event-workout-link.verify.mjs, with its mutation self-test); the read-back at the bottom is the last check.

alter table public.events
  add column if not exists template_id uuid references public.workout_templates(id) on delete cascade;

create index if not exists events_template_id_idx on public.events (template_id) where template_id is not null;

create or replace function public.guard_event_template()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Only a signed-in end user is constrained; the SQL editor, the service role and admin-owned functions are not.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- An ordinary event (no workout) is not this guard's business.
  if new.template_id is null then
    return new;
  end if;

  -- An edit that changes neither the workout, whose record it is on, nor who made it is not a new link.
  if tg_op = 'UPDATE' then
    if new.template_id is not distinct from old.template_id and new.client_id is not distinct from old.client_id
       and new.created_by is not distinct from old.created_by then
      return new;
    end if;
  end if;

  -- The row says who made it: a user cannot file it under someone else's name (that person's created_by policies would then reach it).
  if new.created_by is distinct from auth.uid() then
    raise exception 'You can only schedule your own workouts on your own calendar' using errcode = '42501';
  end if;

  -- The workout must be one of the caller's own Personal-library workouts (not a client's copy, not a plan's session, not a coach-view
  -- workout), and the day must be on the caller's own Personal record.
  if exists (
    select 1
    from public.workout_templates t
    join public.clients c on c.id = new.client_id
    where t.id = new.template_id
      and t.coach_id = auth.uid()
      and t.client_id is null
      and t.program_id is null
      and t.generated_from_phase_id is null
      and t.is_personal
      and c.user_id = auth.uid()
      and c.coach_id is null
  ) then
    return new;
  end if;

  raise exception 'You can only schedule your own workouts on your own calendar' using errcode = '42501';
end;
$$;

revoke all on function public.guard_event_template() from public, anon;

create or replace trigger events_guard_template
  before insert or update of template_id, client_id, created_by on public.events
  for each row execute function public.guard_event_template();

-- READ-BACK: the column, the index, the function (invoker rights, fixed search_path) and the trigger.
select 'column' as kind, column_name::text as name, data_type::text || ' | nullable=' || is_nullable as detail
from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'template_id'
union all
select 'fkey', tc.constraint_name::text, 'on delete ' || lower(rc.delete_rule)
from information_schema.table_constraints tc join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
join information_schema.key_column_usage k on k.constraint_name = tc.constraint_name
where tc.table_schema = 'public' and tc.table_name = 'events' and tc.constraint_type = 'FOREIGN KEY' and k.column_name = 'template_id'
union all
select 'index', indexname::text, indexdef from pg_indexes where schemaname = 'public' and indexname = 'events_template_id_idx'
union all
select 'function', p.proname::text, 'security_definer=' || p.prosecdef || ' | config=' || coalesce(array_to_string(p.proconfig, ','), '-')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'guard_event_template'
union all
select 'trigger', t.tgname::text, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'events' and t.tgname = 'events_guard_template' and not t.tgisinternal
order by 1, 2;
