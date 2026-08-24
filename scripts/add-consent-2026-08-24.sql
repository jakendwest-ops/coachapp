-- UK GDPR consent capture — 2026-08-24
--
-- WHY: the app handles special-category (health) data and had NO consent capture anywhere, while a
-- real outside beta tester was onboarded 2026-08-09. privacy-policy.html has existed since
-- 2026-06-29 but was linked from nowhere; the checkbox and link were removed by 57a188a
-- (2026-07-24) along with the public signup form they sat on.
--
-- Consent is stored on `profiles` because it is a property of the ACCOUNT (the data subject),
-- alongside solo_only / starter_seeded / the unit preferences — not of the `clients` record.
--
-- The version column is not optional bookkeeping. Consent is only meaningful against a SPECIFIC
-- text: without pinning the version, editing the policy would silently re-interpret an old consent
-- as covering wording the person never saw. It must match PRIVACY_POLICY_VERSION in js/app-core.js
-- and the "Last updated:" date in privacy-policy.html.

alter table public.profiles add column if not exists consented_at            timestamptz;
alter table public.profiles add column if not exists consent_policy_version  text;

comment on column public.profiles.consented_at is
  'When this user affirmatively accepted the privacy policy. NULL = no consent on record. Never back-fill this: a consent never taken is not repaired by stamping a date on it.';
comment on column public.profiles.consent_policy_version is
  'The privacy-policy.html version consented to (its "Last updated" date, e.g. 2026-06-29). Must match PRIVACY_POLICY_VERSION in js/app-core.js.';

-- Verification — run after applying. Expect the two columns, both nullable.
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles'
--      and column_name in ('consented_at', 'consent_policy_version');

-- Who currently has NO consent on record (expected: every pre-2026-08-24 account, incl. the
-- 2026-08-09 beta tester). This is a REPORT, not something to fix with an UPDATE.
--   select id, full_name, consented_at from public.profiles where consented_at is null;

-- ── RLS check (sql-safety, "adding a new role or account type" §3) ───────────────────────────────
-- The consent write is `db.from('profiles').upsert({ id, ... }).select('id')` — that is an INSERT,
-- an UPDATE (on conflict) AND a SELECT (the returning). If ANY of the three has no policy covering
-- "my own profiles row", PostgREST returns { data: [], error: null } — no error, zero rows — and the
-- account activates with no consent recorded. js/app-progress.js asserts on the returned row and
-- logs loudly for exactly this reason, but the policy is what makes it actually work.
--
-- profiles is already upserted on this same path by app-core.js loadUserInfo, so all three very
-- likely exist — "very likely" is not verified. Run this and confirm INSERT, UPDATE and SELECT are
-- all present and anchored on auth.uid():
--   select policyname, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename = 'profiles'
--    order by cmd, policyname;
--
-- Expect each to anchor on `id = auth.uid()`. Per sql-safety: never `auth.users`, always the
-- function. No new policy is created here — this migration is purely additive.
