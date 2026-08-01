-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠ RUN THIS MANUALLY. This is still the correct, expected step — do not skip it because the app
-- code shipped a safety net. js/app-core.js's loadUserInfo and js/starter-content.js's
-- _seedStarterContent both now treat `role='coach' AND solo_only=true` the same as a native
-- `role='solo'` account (added 2026-08-01, see the "defense against migration/deploy ordering"
-- comments at each site) — including reassigning the in-memory role to 'solo' for that transitional
-- shape, not just skipping the master-account branch. That fallback exists ONLY so this app's
-- auto-deploy-on-push can't hurt the one real account if the code lands before this script runs: it
-- closes BOTH failure modes — no reopened escape hatch to the coach view (_masterAccount never gets
-- set), AND no getting stuck rendering the coach dashboard shell with no path to the solo view either
-- (role gets reassigned to 'solo' in memory, so nav/pages render solo-shaped). It is not a substitute
-- for running the migration. Until you run it, the account keeps being treated via that transitional
-- `solo_only` check instead of a genuine, natively-stored `role='solo'` value, and `solo_only` stays
-- load-bearing rather than the inert legacy column it's meant to become.
--
-- Solo becomes a genuine, stored role. See docs/superpowers/specs/2026-08-01-solo-genuine-role-design.md
--
-- STEP 1 — diagnostic. Run first. Confirms whether profiles.role has a CHECK constraint today, shows
-- exactly which account(s) are currently solo_only (should be exactly one), whether each one actually
-- has the self-referential clients row the app depends on, and the overall role distribution (so you
-- can eyeball whether Step 2's ADD CONSTRAINT is likely to succeed before running it).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.profiles'::regclass and contype = 'c';

select id, role, solo_only, starter_seeded from public.profiles where solo_only = true;

-- Does each solo_only account actually have the self-referential clients row (coach_id IS NULL) that
-- the app's native-solo branch looks up? If this is false for a row, flipping its role is still safe
-- (the app just won't populate window._soloClientId — no fallback to coach view either way, by
-- design), but it likely means the account isn't fully set up and is worth investigating first.
select p.id, p.role, p.solo_only,
       exists (select 1 from public.clients c where c.user_id = p.id and c.coach_id is null) as has_solo_client_row
from public.profiles p where p.solo_only = true;

-- Role distribution today — check this has no surprise values before Step 2's ADD CONSTRAINT runs;
-- any value outside ('coach','client','solo') will make the ADD fail.
select role, count(*) from public.profiles group by role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 2 — widen the constraint (if Step 1 showed one restricting role to specific values), then
-- flip the existing solo_only account(s) to the real role. Defensive: drop-then-recreate is safe to
-- run even if the constraint's exact current definition differs from the guess below — adjust the
-- `check (...)` list if Step 1's output shows different allowed values.
--
-- Wrapped in an explicit transaction: the DROP and the ADD CONSTRAINT are separate statements, and
-- without begin/commit a failed ADD (e.g. some row's role value falls outside the new check) would
-- leave the DROP already committed — the column silently left with no CHECK constraint at all. The
-- data UPDATE is included in the same transaction so a failure anywhere rolls everything back.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.profiles add constraint profiles_role_chk
  check (role in ('coach', 'client', 'solo'));

-- Guarded: only flips accounts that actually have the self-referential clients row the app depends
-- on for window._soloClientId (Finding 2 of the final whole-branch review) — mirrors the diagnostic
-- query above, so nothing gets flipped that Step 1 didn't already show as safe.
update public.profiles p set role = 'solo'
where p.solo_only = true and p.role = 'coach'
  and exists (select 1 from public.clients c where c.user_id = p.id and c.coach_id is null);

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 3 — verify. Should show role='solo' for the same row(s) Step 1's second query found.
-- solo_only is deliberately left in place, unused, rather than dropped.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

select id, role, solo_only, starter_seeded from public.profiles where role = 'solo';
