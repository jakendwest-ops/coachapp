-- Stops a signed-in END USER from re-pointing clients.coach_id at ANOTHER coach, while keeping the one change Jake already
-- accepted: a client detaching THEMSELVES (setting it to NULL). Read-only to existing data: it adds a function and a trigger.
--
-- WHY. The live policy `clients_update_own_row` (UPDATE, roles public, USING user_id = auth.uid(), WITH CHECK user_id = auth.uid())
-- pins only user_id, so a client may update EVERY column of their own row — coach_id included (read from the live database on
-- 2026-09-26; ledger row 2026-09-26-a-client-can-rewrite-the-coach-id-of-their-own-clients-row). Detaching was discussed and
-- accepted when the weight-goals feature shipped; pointing the row at ANOTHER coach's id was not covered. It exposes nobody
-- else's data, but it lets a client push their own row (and the health data hanging off it) into a stranger's roster.
-- Decision (Jake, 2026-09-26): close ONLY the "attach to another coach" half.
--
-- WHAT IT DOES. A BEFORE UPDATE OF coach_id row trigger. If coach_id is not actually changing, it does nothing. If the statement
-- runs as a signed-in end user (the database role the API switches to: authenticated or anon), a change is refused (SQLSTATE 42501)
-- UNLESS it is the row's own client setting coach_id to NULL. Everything else — the SQL editor (postgres), the service role
-- (Edge Functions), any function owned by an admin role — is untouched: they run as a different current_user.
--
-- WHAT IT DOES NOT DO. It does not touch the policies, so a client can still update their other columns (weight goals) and a
-- coach can still edit their own clients. It does not stop a SECURITY DEFINER function (which runs as its owner) from changing
-- coach_id, so any such function must do its own check; none is known, but the live database's functions are not all in this
-- repo, so that is unverified. A coach cannot move an ordinary client to another coach: the "Coach manages clients" policy
-- already refuses that (for the owner's own master record, where the coach is also the client, only this trigger does). INSERT is
-- not covered (the "Coach manages clients" policy pins coach_id = auth.uid() on insert). 'anon' is in the list as defence in
-- depth: RLS already gives it no rows. Nothing in js/ changes coach_id (every update on `clients` was read) and the one invite
-- Edge Function in this repo (invite-solo-user) only inserts, through the service role; the source of the invite-client Edge
-- Function and the handle_new_user trigger is NOT in the repo, so that part is unverified. If either changed coach_id under the
-- caller's own JWT, this trigger would refuse it, so send one client invite right after applying this and confirm it still works.
--
-- DETACH IS ONE-WAY FROM THE API. A client who sets coach_id to NULL (accepted) can no longer set it back, and their coach cannot
-- see a row with no coach, so undoing it is done in the SQL editor:
--   update public.clients set coach_id = '<the coach''s user id>' where id = '<the client''s id>';
-- A refused attempt leaves no audit_clients row (the statement aborts before the AFTER trigger), so it is invisible afterwards.
--
-- ROLLBACK (both are additive): drop trigger clients_guard_coach_id on public.clients;
--                               drop function public.clients_guard_coach_id();
--
-- Safe to run twice (create or replace on both, so there is no moment without the guard). Verified locally on PGlite loaded with
-- the live schema and the live `clients` policies (scripts/sql-verify/clients-coach-id-guard.verify.mjs), including that the
-- rollback runs and reopens the hole; the read-back at the bottom is the last check.

create or replace function public.clients_guard_coach_id()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- coach_id is not really changing (the column was named in the SET list but the value is the same)
  if new.coach_id is not distinct from old.coach_id then
    return new;
  end if;

  -- Only a signed-in end user is constrained. The SQL editor (postgres), the service role and functions owned by an admin role run
  -- as a different current_user and are never refused here.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- The one change an end user may still make: the row's own client detaching themselves.
  if new.coach_id is null and old.user_id is not null and old.user_id = auth.uid() then
    return new;
  end if;

  raise exception 'clients.coach_id cannot be changed from the API' using errcode = '42501';
end;
$$;

create or replace trigger clients_guard_coach_id
  before update of coach_id on public.clients
  for each row execute function public.clients_guard_coach_id();

-- READ-BACK: the function (invoker rights, fixed search_path) and every trigger on clients (this one, plus audit_clients).
select 'function' as kind, p.proname::text as name,
       'security_definer=' || p.prosecdef || ' | config=' || coalesce(array_to_string(p.proconfig, ','), '-') as detail
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'clients_guard_coach_id'
union all
select 'trigger', t.tgname::text, pg_get_triggerdef(t.oid)
from pg_trigger t
where t.tgrelid = 'public.clients'::regclass and not t.tgisinternal
order by 1, 2;
