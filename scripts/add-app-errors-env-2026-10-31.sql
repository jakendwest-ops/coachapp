-- Error reports say what kind of device they came from (2026-10-31). APPLIED by Jake 2026-10-31.
--
-- WHY. Five reports on 2026-10-31 came from Jake's iPhone, from the home-screen app, and nothing in them said so: a
-- report could not tell a phone-only failure from a desktop one, an installed app from Safari, or a request cut off
-- because the phone was offline or had put the app in the background. js/app-core.js (_reportEnv) now sends one short
-- line, e.g. "ios app online visible": platform (ios / android / desktop / other), installed app or browser, online or
-- offline, visible or hidden. Nothing that identifies a person or a device; the privacy policy's "Usage data" line
-- names "device type" (reworded the same day).
--
-- NO POLICY CHANGE. Grants on app_errors are table-level (select, insert, delete to authenticated), so a new column is
-- covered by them; the INSERT policy checks user_id only. The flood trigger is unaffected.
--
-- ORDER. This must be applied BEFORE the app code that sends `env` is released: PostgREST refuses an insert naming a
-- column that does not exist, and every report would then fail to store.
--
-- SAFE TO RE-RUN.  TO UNDO:  alter table public.app_errors drop column env;

alter table public.app_errors add column if not exists env text check (char_length(env) <= 40);
