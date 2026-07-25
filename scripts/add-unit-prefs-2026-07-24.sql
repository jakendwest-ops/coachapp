-- Metric/imperial unit preference — account-wide, per-metric-type. Storage everywhere else stays
-- canonical (kg, cm, metres); these columns only drive display/entry conversion.
-- To be applied by Jake in the Supabase SQL editor. Recorded here for the repo history.

alter table profiles add column if not exists weight_unit text not null default 'kg' check (weight_unit in ('kg','lb'));
alter table profiles add column if not exists jump_height_unit text not null default 'cm' check (jump_height_unit in ('cm','in'));
alter table profiles add column if not exists cardio_distance_unit text not null default 'km' check (cardio_distance_unit in ('km','mi'));
