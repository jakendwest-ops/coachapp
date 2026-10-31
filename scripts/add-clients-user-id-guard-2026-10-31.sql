-- Stops a signed-in END USER from setting or changing clients.user_id at all - the link between a client record and a login. Only the
-- invite Edge Functions (service role) and the SQL editor may write it. Read-only to existing data: it adds a function and a trigger.
--
-- WHY. clients.user_id is what lets a login read a client record and everything hanging off it. The coach policy on clients ("Coach
-- manages clients", FOR ALL, coach_id = auth.uid()) pins only coach_id, so a coach could write ANY user id into user_id - on a new row
-- (INSERT) or on an existing one (UPDATE) - and that person would then read the record. Confirmed against the live API on 2026-10-31
-- with the two E2E coach accounts: both an INSERT and an UPDATE linking the second coach's login to a client of the first were
-- accepted (the probe rows were deleted straight away). The unique index clients_user_id_idx only stops an id already linked. Found by
-- the MVP 7 security review (2026-10-31); the coach_id half of this column pair was closed on 2026-09-26 (clients_guard_coach_id).
--
-- WHAT IT DOES. A BEFORE INSERT OR UPDATE row trigger (on every update, not only those naming user_id, so a value changed by another
-- trigger is still seen). For a signed-in end user (the database role the API switches to: authenticated or anon): an INSERT must leave
-- user_id NULL, and an UPDATE must leave it unchanged. Anything else is refused (SQLSTATE 42501). The SQL editor (postgres), the service
-- role - the invite-client and invite-solo-user Edge Functions, the only writers of user_id - and functions owned by an admin role run as
-- a different current_user and are never refused.
--
-- THE CLAIM PATH IS CLOSED TOO (review, 2026-10-31). The live policy "Client stamps own user_id on invite acceptance" lets a signed-in user
-- set user_id NULL -> their own id on an unclaimed row carrying their email. Nothing in the app uses it (invite-client links the login
-- itself, with the service role), and the email on a client row is the COACH's to type, so anyone who could sign up with that address could
-- claim the record. A coach could likewise link THEMSELVES to their own unclaimed client. All of that is refused now. Unlinking a client
-- (user_id -> NULL) is likewise SQL-editor-only.
--
-- WHAT IT DOES NOT DO. It does not touch any policy (the claim policy stays, and is now inert for user_id). It does not stop a SECURITY DEFINER function (which runs as its owner) from writing
-- user_id; none owned by a non-admin role is known. Nothing in js/ writes user_id (every insert and update on clients was read on
-- 2026-10-31). It is PREVENTIVE only: it does not look for rows already linked this way (that is a separate read-only audit).
--
-- ROLLBACK (both additive): drop trigger clients_guard_user_id on public.clients;
--                           drop function public.clients_guard_user_id();
--
-- Safe to run twice (create or replace on both). Verified locally on PGlite loaded with the live schema and the live clients policies
-- (scripts/sql-verify/clients-user-id-guard.verify.mjs), including that the hole is REPRODUCED before the script and that the rollback
-- reopens it; the read-back at the bottom is the last check.

create or replace function public.clients_guard_user_id()
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

  if tg_op = 'INSERT' then
    -- A new row is linked to nobody; the invite functions link it.
    if new.user_id is null then
      return new;
    end if;
  else
    -- user_id is not changing (whatever else the update does).
    if new.user_id is not distinct from old.user_id then
      return new;
    end if;
  end if;

  raise exception 'clients.user_id cannot be set from the app' using errcode = '42501';
end;
$$;

-- A trigger function cannot be called directly, but every sibling carries the same revoke (harden-anon-access-2026-10-18.sql).
revoke all on function public.clients_guard_user_id() from public, anon;

create or replace trigger clients_guard_user_id
  before insert or update on public.clients
  for each row execute function public.clients_guard_user_id();

-- READ-BACK: the function (invoker rights, fixed search_path) and every trigger on clients (this one, clients_guard_coach_id, audit_clients).
select 'function' as kind, p.proname::text as name,
       'security_definer=' || p.prosecdef || ' | config=' || coalesce(array_to_string(p.proconfig, ','), '-') as detail
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'clients_guard_user_id'
union all
select 'trigger', t.tgname::text, pg_get_triggerdef(t.oid)
from pg_trigger t
where t.tgrelid = 'public.clients'::regclass and not t.tgisinternal
order by 1, 2;
