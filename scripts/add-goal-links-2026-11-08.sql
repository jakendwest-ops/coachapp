-- Linked goals (Phase 2b of docs/superpowers/plans/2026-11-08-solo-audit-response.md, approved by Jake 2026-11-08).
-- A goal can follow body weight or a lift's heaviest logged set. Additive: two nullable columns, no existing row changes, no policy changes.
-- Progress is derived from logged data when read and is never stored here. A lift's name stays in metric_label, so a deleted exercise (on delete set null) keeps tracking by name.
-- ROLLBACK: alter table public.goals drop column linked_metric, drop column linked_exercise_id;

alter table public.goals
  add column if not exists linked_metric text check (linked_metric in ('bodyweight', 'top_set')),
  add column if not exists linked_exercise_id uuid references public.exercises(id) on delete set null;

-- READ-BACK: two rows, both nullable.
select column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'goals' and column_name in ('linked_metric', 'linked_exercise_id');
