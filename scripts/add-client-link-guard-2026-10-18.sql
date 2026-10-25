-- Stops a signed-in END USER from pointing a row's client_id at a client they do not own, on the three tables whose owner policy
-- pins who owns the ROW but not whose client the row is linked to: events, goals and workout_templates. Read-only to existing data: it
-- adds one function and three triggers.
--
-- WHY. The owner UPDATE/ALL policies on these tables ("Coach updates own events", "Coach updates own client goals", "Coach updates own
-- templates", "coaches manage own templates") check only created_by / coach_id = auth.uid(). Permissive policies are OR'd, so they beat the
-- stricter ones beside them, and a coach could set client_id on a row they own to ANOTHER coach's client.
-- Confirmed against the live API on 2026-10-18 with the two E2E coach accounts: an UPDATE of an owned event to another coach's client was
-- accepted and that coach then saw it; an UPDATE of an owned template was accepted; a direct INSERT of an event there was refused. (An INSERT
-- of a template there passes the policy's check and was reproduced on the local copy only.) Goals showed the same policy shape but was held
-- back by a side effect (Postgres re-checks the SELECT policy on the moved row), which is not a guarantee: an UPDATE with no column in its WHERE
-- moves the goal on the local copy. The attacker needs the victim client's id (a random uuid that coaches cannot list for each other), so the
-- practical exposure was low, but it was a genuine cross-tenant write. The other tables were read policy by policy from the live dump of
-- 2026-10-18 (not probed): they pin the client link.
--
-- WHAT IT DOES. A BEFORE INSERT OR UPDATE OF client_id row trigger on each table. If client_id is null, or an UPDATE leaves it unchanged, it
-- does nothing. Otherwise, for a signed-in end user (the database role the API switches to: authenticated or anon), the new client_id must be a
-- client the caller owns: a coach's own client (clients.coach_id = auth.uid()) or the caller's own record (clients.user_id = auth.uid(), which
-- covers a solo account and the owner's personal record). Anything else is refused (SQLSTATE 42501). It checks the CHANGE, not the row, so an
-- edit to a row already linked to a client who has since detached or moved on still works. The SQL editor (postgres), the service role and
-- functions owned by an admin role run as a different current_user and are never refused.
--
-- WHAT IT DOES NOT DO. It does not touch any policy, so who may read, create or delete these rows is unchanged. It does not stop a
-- SECURITY DEFINER function (which runs as its owner) from writing client_id, so any such function must do its own check; none is known for
-- these tables. It is PREVENTIVE only: it does not look for rows already planted (a read-only audit of that is a separate query). Its
-- exemption is a deny-list (every role other than authenticated / anon passes, as in clients_guard_coach_id): stock Supabase gives the API
-- only anon, authenticated and service_role, but a custom API-reachable role that inherits authenticated would not be constrained.
-- Nothing in js/ re-points client_id: events are only inserted and deleted, templates are only renamed, goals are updated for progress
-- and title (every update on the three tables was read).
--
-- WHAT A PASS HERE DOES NOT PROVE. The verifier runs on PGlite (Postgres 18; live is 17.6), loaded with the live policies of clients, events,
-- goals and workout_templates only: live-only triggers, columns and functions are not mirrored, and the PostgREST layer (row caps, safeupdate,
-- embeds) is not exercised. The live regression spec (tests/client-link-guard-2026-10-18.spec.js) is what proves it on the real API.
--
-- ROLLBACK (all additive): drop trigger events_guard_client_id on public.events;
--                          drop trigger goals_guard_client_id on public.goals;
--                          drop trigger workout_templates_guard_client_id on public.workout_templates;
--                          drop function public.guard_client_id_change();
--
-- Safe to run twice (create or replace on all four objects, so there is no moment without the guard). Verified locally on PGlite loaded with
-- the live schema and the live policies of all three tables (scripts/sql-verify/client-link-guard.verify.mjs), including that the exploit is
-- REPRODUCED before the script and that the rollback reopens it; the read-back at the bottom is the last check.

create or replace function public.guard_client_id_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Only a signed-in end user is constrained. The SQL editor (postgres), the service role and functions owned by an admin role run as a
  -- different current_user and are never refused here.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- A row linked to nobody (a coach's own personal event or template) points at no one's client.
  if new.client_id is null then
    return new;
  end if;

  -- An UPDATE that leaves client_id as it was is not re-pointing anything: renaming a template cloned for a client who has since detached
  -- must keep working.
  if tg_op = 'UPDATE' then
    if new.client_id is not distinct from old.client_id then
      return new;
    end if;
  end if;

  -- The target must be a client the caller owns: their own client, or their own record. Runs as the caller, so a client they cannot see
  -- is a client they do not own.
  if exists (
    select 1 from public.clients c
    where c.id = new.client_id
      and (c.coach_id = auth.uid() or c.user_id = auth.uid())
  ) then
    return new;
  end if;

  raise exception 'client_id must belong to one of your own clients' using errcode = '42501';
end;
$$;

revoke all on function public.guard_client_id_change() from public, anon;

create or replace trigger events_guard_client_id
  before insert or update of client_id on public.events
  for each row execute function public.guard_client_id_change();

create or replace trigger goals_guard_client_id
  before insert or update of client_id on public.goals
  for each row execute function public.guard_client_id_change();

create or replace trigger workout_templates_guard_client_id
  before insert or update of client_id on public.workout_templates
  for each row execute function public.guard_client_id_change();

-- READ-BACK: the function (invoker rights, fixed search_path) and the guard trigger on each of the three tables.
select 'function' as kind, p.proname::text as name,
       'security_definer=' || p.prosecdef || ' | config=' || coalesce(array_to_string(p.proconfig, ','), '-') as detail
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'guard_client_id_change'
union all
select 'trigger', c.relname::text || ' / ' || t.tgname::text, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and t.tgname in ('events_guard_client_id', 'goals_guard_client_id', 'workout_templates_guard_client_id') and not t.tgisinternal
order by 1, 2;
