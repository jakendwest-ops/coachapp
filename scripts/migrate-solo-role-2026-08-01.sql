-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Solo becomes a genuine, stored role. See docs/superpowers/specs/2026-08-01-solo-genuine-role-design.md
--
-- STEP 1 — diagnostic. Run first. Confirms whether profiles.role has a CHECK constraint today, and
-- shows exactly which account(s) are currently solo_only (should be exactly one).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.profiles'::regclass and contype = 'c';

select id, role, solo_only, starter_seeded from public.profiles where solo_only = true;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 2 — widen the constraint (if Step 1 showed one restricting role to specific values), then
-- flip the existing solo_only account(s) to the real role. Defensive: drop-then-recreate is safe to
-- run even if the constraint's exact current definition differs from the guess below — adjust the
-- `check (...)` list if Step 1's output shows different allowed values.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

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

update public.profiles set role = 'solo' where solo_only = true and role = 'coach';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 3 — verify. Should show role='solo' for the same row(s) Step 1's second query found.
-- solo_only is deliberately left in place, unused, rather than dropped.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

select id, role, solo_only, starter_seeded from public.profiles where role = 'solo';
