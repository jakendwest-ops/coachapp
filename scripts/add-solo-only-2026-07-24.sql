-- Locks an account to the solo/personal experience only — no view-switcher, no path to a coach
-- dashboard, ever. Distinct from the existing master-account pattern (role stays 'coach' underneath;
-- a self-referential clients row still gives the solo dashboard something to query), but this flag
-- tells loadUserInfo() to skip window._masterAccount entirely.
-- To be applied by Jake in the Supabase SQL editor. Recorded here for the repo history.

alter table profiles add column if not exists solo_only boolean not null default false;
