-- New-coach starter content: one-time-per-account seed flag.
-- Applied by Jake in the Supabase SQL editor 2026-07-12. Recorded here for the repo history.
alter table profiles add column if not exists starter_seeded boolean not null default false;

-- Existing accounts have already onboarded (incl. Jake) — never retro-seed them.
update profiles set starter_seeded = true where starter_seeded = false;

-- Role default: verified 2026-07-12 that handle_new_user already sets role = 'coach' for a
-- self-signup (it only assigns 'client' when a matching invited-clients row exists), so the
-- app-side seed guard `currentProfile.role === 'coach'` fires correctly for new coaches. No
-- trigger change needed.
