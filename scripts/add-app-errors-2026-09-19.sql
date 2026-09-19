-- Automatic error capture: one row per distinct failure the app reports (2026-09-19).
--
-- WHAT IT HOLDS. A code, a code LOCATION and technical context — never an error's text. The privacy policy
-- (privacy-policy.html, "Usage data") promises error logs hold "only internal IDs and timestamps — never your
-- name, email, or health values", and Postgres puts row values in error messages, so js/app-core.js
-- (ERROR CAPTURE) sends none of that. The column list below is the complete list of what can be stored.
--
-- WHO CAN DO WHAT (each verb decided separately):
--   INSERT  a signed-in user, for themselves only (user_id must equal their own auth.uid()).
--   SELECT  a user's OWN rows (so the GDPR export works and they can see what is held), or the owner's, all.
--   DELETE  a user's own rows, or the owner's any. Own-row delete is what lets the E2E accounts clean up after
--           themselves; it does not weaken flood protection, because a user who deletes rows is not growing the table.
--   UPDATE  nobody — the verb is not granted at all.
--   anon    nothing at all.
--
-- FLOOD PROTECTION. A trigger refuses a 61st row from one user within an hour. Without it any signed-in client
-- could fill the free tier.
--
-- ACCOUNT DELETION. user_id references auth.users ON DELETE CASCADE, so deleting an account removes its rows
-- without any change to delete_current_user() (whose existence in the database is unverified).
--
-- SAFE TO RE-RUN: every statement is create-if-not-exists / drop-then-create / create-or-replace.
-- TO UNDO:  drop table public.app_errors;   (the trigger function is dropped with:  drop function public.app_errors_rate_limit();)

-- 1. The table ------------------------------------------------------------------------------------------------
create table if not exists public.app_errors (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  role       text        check (char_length(role)   <= 12),
  kind       text        not null check (kind in ('log', 'uncaught', 'rejection')),
  tag        text        not null check (char_length(tag)    <= 80),
  detail     text        check (char_length(detail) <= 200),
  code       text        check (char_length(code)   <= 32),
  frame      text        check (char_length(frame)  <= 160),
  page       text        check (char_length(page)   <= 40),
  build      text        check (char_length(build)  <= 120)
);

comment on table public.app_errors is
  'Automatic error capture. Code, location and context only — never error text (privacy policy, Usage data). See js/app-core.js ERROR CAPTURE.';

create index if not exists app_errors_user_created_idx on public.app_errors (user_id, created_at desc);
create index if not exists app_errors_created_idx      on public.app_errors (created_at desc);

-- 2. Row-level security ---------------------------------------------------------------------------------------
alter table public.app_errors enable row level security;

-- Table privileges stop whole VERBS (RLS below decides which ROWS). No UPDATE for anyone; nothing for anon.
revoke all on table public.app_errors from anon, authenticated;
grant select, insert, delete on table public.app_errors to authenticated;

drop policy if exists "Signed-in user reports own errors" on public.app_errors;
create policy "Signed-in user reports own errors"
  on public.app_errors for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Read own reports, owner reads all" on public.app_errors;
create policy "Read own reports, owner reads all"
  on public.app_errors for select to authenticated
  using (user_id = (select auth.uid()) or (select auth.email()) = 'jakendwest@gmail.com');

drop policy if exists "Delete own reports, owner deletes any" on public.app_errors;
create policy "Delete own reports, owner deletes any"
  on public.app_errors for delete to authenticated
  using (user_id = (select auth.uid()) or (select auth.email()) = 'jakendwest@gmail.com');

-- 3. Flood protection -----------------------------------------------------------------------------------------
-- Runs as the inserting user, so the count sees exactly the rows their own SELECT policy allows: their own.
--
-- REVISED the same day (pre-commit review, confirmed on the live table): created_at is a column the CLIENT can
-- send, and this trigger counts rows BY created_at. Back-date the rows and none is ever counted (61 back-dated
-- inserts were all accepted); future-date them and they sit above every real report in the owner's newest-first
-- list. So the trigger now decides the time itself, first, and the count below can no longer be dodged.
-- The advisory lock serialises one user's concurrent inserts: without it, parallel requests each see fewer than
-- 60 committed rows and all pass. (Rows earlier in the SAME statement are visible to the count, so one 61-row
-- request is refused whole.)
create or replace function public.app_errors_rate_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := now();
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if (select count(*) from public.app_errors
        where user_id = new.user_id and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'app_errors: rate limit reached (60 reports per hour)';
  end if;
  return new;
end;
$$;

drop trigger if exists app_errors_rate_limit on public.app_errors;
create trigger app_errors_rate_limit
  before insert on public.app_errors
  for each row execute function public.app_errors_rate_limit();

-- 4. Read it all back -----------------------------------------------------------------------------------------
-- The editor shows only the LAST statement's result, and reports "Success. No rows returned." for every write
-- above — so this single query is the evidence. Expect: 11 columns, 3 policies, fk delete_rule=CASCADE,
-- authenticated = DELETE,INSERT,SELECT (no anon row), 1 trigger enabled, rls enabled=true, and a `function` row
-- reading "forces created_at to now(): YES | per-user lock: YES" (NO means the revised trigger is not in place).
select 'column' as kind, column_name as name,
       data_type || ' | nullable=' || is_nullable || ' | default=' || coalesce(column_default, '') as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'app_errors'
union all
select 'policy', policyname,
       cmd || ' | to=' || array_to_string(roles, ',') || ' | using=' || coalesce(qual, '') || ' | check=' || coalesce(with_check, '')
from pg_policies
where schemaname = 'public' and tablename = 'app_errors'
union all
select 'fk', conname,
       'delete_rule=' || case confdeltype when 'c' then 'CASCADE' when 'a' then 'NO ACTION' when 'n' then 'SET NULL'
                                          when 'r' then 'RESTRICT' else confdeltype::text end
from pg_constraint
where conrelid = 'public.app_errors'::regclass and contype = 'f'
union all
select 'grant', grantee, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'app_errors'
group by grantee
union all
select 'trigger', tgname, 'enabled=' || tgenabled::text
from pg_trigger
where tgrelid = 'public.app_errors'::regclass and not tgisinternal
union all
select 'rls', 'app_errors', 'enabled=' || relrowsecurity::text
from pg_class
where oid = 'public.app_errors'::regclass
union all
select 'function', 'app_errors_rate_limit',
       'forces created_at to now(): ' ||
       case when pg_get_functiondef('public.app_errors_rate_limit()'::regprocedure) like '%new.created_at := now()%'
            then 'YES' else 'NO - the revised trigger is NOT in place' end
       || ' | per-user lock: ' ||
       case when pg_get_functiondef('public.app_errors_rate_limit()'::regprocedure) like '%pg_advisory_xact_lock%'
            then 'YES' else 'NO' end
order by 1, 2;
