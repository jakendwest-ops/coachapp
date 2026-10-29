-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- 2026-10-29: close the check-in loop - a coach can mark a client's check-in seen and reply; a client can delete their own.
-- (docs/bugs/2026-10-29-client-check-ins-get-no-response.md; planned 2026-09-19, approved 2026-10-29.)
--
-- WHAT IT DOES
--   1. Three columns: coach_reply (<= 500 chars, never blank), reviewed_at, reviewed_by.
--   2. UPDATE narrowed to those three columns. The live table had a table-wide UPDATE grant to authenticated (read 2026-10-29), so without
--      this a coach policy would let a coach rewrite a client's ratings and notes.
--   3. Policies: the coach UPDATEs their own clients' rows; the client DELETEs their own rows. (The table-wide DELETE grant already exists.)
--   4. A trigger an app caller cannot bypass: on UPDATE of a review column the SERVER stamps reviewed_at and reviewed_by (the first review
--      and the first reviewer - never cleared, back-dated or forged); on INSERT the three are cleared and created_at is the server's time, so
--      a client cannot create a check-in that already reads "seen by your coach", nor date one out of (or to the top of) the coach's inbox.
--      Applied in three rounds on 2026-10-29 (the INSERT guard, then created_at / first reviewer / the database-role exemption after review);
--      re-running this whole script applies the latest.
--
-- Idempotent: safe to run twice. Ends with a read-back SELECT (it returns rows). No data is changed.
-- ROLLBACK: drop trigger stamp_check_in_review; drop function public.stamp_check_in_review(); drop the two policies; revoke the column
--           grant and `grant update on public.client_check_ins to authenticated` (the old table-wide state); drop the three columns.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────

-- 1. Review columns
alter table public.client_check_ins add column if not exists coach_reply text;
alter table public.client_check_ins add column if not exists reviewed_at timestamptz;
alter table public.client_check_ins add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.client_check_ins drop constraint if exists client_check_ins_coach_reply_chk;
alter table public.client_check_ins add constraint client_check_ins_coach_reply_chk
  check (coach_reply is null or (length(coach_reply) <= 500 and btrim(coach_reply) <> ''));

-- 2. UPDATE only on the three review columns (table-wide UPDATE exists today)
revoke update on public.client_check_ins from public, anon, authenticated;
grant update (coach_reply, reviewed_at, reviewed_by) on public.client_check_ins to authenticated;

-- 3. The coach reviews their own clients' check-ins; the client deletes their own
drop policy if exists "Coach reviews client check-ins" on public.client_check_ins;
create policy "Coach reviews client check-ins" on public.client_check_ins for update to authenticated
  using (client_id in (select clients.id from public.clients where clients.coach_id = (select auth.uid())))
  with check (client_id in (select clients.id from public.clients where clients.coach_id = (select auth.uid())));
drop policy if exists "Client deletes own check-ins" on public.client_check_ins;
create policy "Client deletes own check-ins" on public.client_check_ins for delete to authenticated
  using (client_id in (select clients.id from public.clients where clients.user_id = (select auth.uid())));

-- 4. The server stamps who reviewed and when; it can never be cleared, back-dated, or pre-filled on insert.
--    Only app callers (authenticated, anon) are guarded: the database's own roles (a restore, a migration) pass untouched, as the clients
--    coach_id guard does (add-clients-coach-id-guard-2026-09-26.sql) - otherwise a data-only restore would silently wipe every reply.
--    On INSERT the server also sets created_at: a client choosing it could back-date a check-in out of the coach's 14-day inbox, or pin one
--    to the top with a future date (review, 2026-10-29). reviewed_by is the FIRST reviewer, as reviewed_at is the first review.
create or replace function public.stamp_check_in_review() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.coach_reply := null;
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.created_at := now();
    return new;
  end if;
  new.reviewed_at := coalesce(old.reviewed_at, now());
  new.reviewed_by := coalesce(old.reviewed_by, (select auth.uid()));
  return new;
end $$;
revoke execute on function public.stamp_check_in_review() from public, anon, authenticated;
drop trigger if exists stamp_check_in_review on public.client_check_ins;
create trigger stamp_check_in_review before insert or update of coach_reply, reviewed_at, reviewed_by
  on public.client_check_ins for each row execute function public.stamp_check_in_review();

-- 5. Read-back
-- EXPECT: 3 "column" rows; 3 "update grant" rows (authenticated coach_reply / reviewed_at / reviewed_by); NO "table update" row;
--         5 "policy" rows; 2 "trigger" rows (lock_created_at, stamp_check_in_review); "trigger events" = INSERT, UPDATE;
--         "execute" = false
select 'column' as kind, column_name || ' ' || data_type as detail from information_schema.columns
 where table_schema = 'public' and table_name = 'client_check_ins' and column_name in ('coach_reply', 'reviewed_at', 'reviewed_by')
union all
select 'update grant', grantee || ' ' || column_name from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'client_check_ins' and privilege_type = 'UPDATE' and grantee in ('anon', 'authenticated')
union all
select 'table update', grantee || ' ' || privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'client_check_ins' and privilege_type = 'UPDATE' and grantee in ('anon', 'authenticated')
union all
select 'policy', policyname || ' | ' || cmd from pg_policies where schemaname = 'public' and tablename = 'client_check_ins'
union all
select 'trigger', tgname from pg_trigger where tgrelid = 'public.client_check_ins'::regclass and not tgisinternal
union all
select 'trigger events', string_agg(event_manipulation, ', ' order by event_manipulation) from information_schema.triggers
 where event_object_schema = 'public' and event_object_table = 'client_check_ins' and trigger_name = 'stamp_check_in_review'
union all
select 'execute', 'authenticated may run stamp fn = ' || has_function_privilege('authenticated', 'public.stamp_check_in_review()', 'EXECUTE')::text
order by 1, 2;
