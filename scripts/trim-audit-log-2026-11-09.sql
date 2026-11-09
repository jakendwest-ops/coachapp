-- Empty audit_log once and keep 30 days from now on. Applied live by Jake on 2026-11-09; see docs/decisions.md.
-- audit_log had reached 583 MB of a 667 MB database (Free plan limit 0.5 GB, 408 MB of RAM). The database was left at 38 MB.
-- audit_log is a change history only. log_audit_event() copies each changed row from 17 tables into it; the app has no screen that reads it.
-- The one-off TRUNCATE is commented out so that running this file again cannot empty the log a second time. TRUNCATE cannot be undone.
-- ROLLBACK of the schedule: select cron.unschedule('audit-log-keep-30-days'); drop index if exists public.audit_log_changed_at_idx;

-- Ran once on 2026-11-09:
-- truncate table public.audit_log;

create index if not exists audit_log_changed_at_idx on public.audit_log (changed_at);

create extension if not exists pg_cron;

-- Every night at 03:17 UTC. Scheduling the same job name again updates the job, so this is safe to re-run.
select cron.schedule(
  'audit-log-keep-30-days',
  '17 3 * * *',
  $$delete from public.audit_log where changed_at < now() - interval '30 days'$$
);

-- READ-BACK: run on its own, after the script. Inside the same step the size still counts files that a TRUNCATE only frees when it commits.
-- select pg_size_pretty(pg_database_size(current_database())) as database_size,
--        pg_size_pretty(pg_total_relation_size('public.audit_log')) as audit_log_size,
--        (select count(*) from cron.job where jobname = 'audit-log-keep-30-days') as cleanup_jobs;
