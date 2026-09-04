-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Library page "Last used" — updated_at on workout_templates, maintained by trigger.
-- Run in the Supabase SQL editor. Additive, idempotent, reversible. No user-visible change alone.
--
-- WHY A TRIGGER, AND WHY ON THE CHILD TABLE.
-- Editing a session almost never touches the workout_templates row. Adding an exercise, reordering,
-- changing sets — all of it writes to workout_template_exercises, and the parent is left alone. So an
-- updated_at maintained by app code, or by a trigger on workout_templates only, would report
-- "edited 6 months ago" on a session changed this morning.
--
-- Counted 2026-09-04: 13 write paths touch workout_template_exercises, across three modules. Asking
-- each of them to remember is the rule-that-nobody-follows pattern this codebase is already full of,
-- and a 14th path written next month would silently not update it. Same reasoning the family_id
-- trigger records (scripts/add-family-id-2026-08-14.sql): a trigger cannot be forgotten.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- 1. Column ----------------------------------------------------------------------
alter table workout_templates add column if not exists updated_at timestamptz;

-- 2. Backfill --------------------------------------------------------------------
-- Seed from created_at rather than now(). now() would stamp every existing row with the SAME instant,
-- which makes the new ordering meaningless on day one — the list would look sorted while being
-- arbitrary. created_at gives a real spread immediately. coalesce guards a null created_at.
update workout_templates
   set updated_at = coalesce(created_at, now())
 where updated_at is null;

-- 2b. AMENDMENT 2026-09-04 (later the same day) -----------------------------------
-- The original migration gave EXISTING rows an updated_at and kept it current on UPDATE, but set
-- nothing on INSERT. Probed against production: a freshly inserted template came back with
-- updated_at = NULL. So every session created from that point on would sort LAST in the Library and
-- its row would read "Last used -".
--
-- A DEFAULT, not a BEFORE INSERT trigger. The trigger function assigns unconditionally
-- (new.updated_at := now()), so on INSERT it would also clobber an explicitly supplied value -- which
-- is exactly how the tests seed a known "edited last month" row. A DEFAULT fills the gap when nothing
-- is supplied and yields when something is.
alter table workout_templates alter column updated_at set default now();

-- 3. Keep it current on the template row itself ----------------------------------
create or replace function touch_workout_template_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touch_workout_template on workout_templates;
create trigger trg_touch_workout_template
  before update on workout_templates
  for each row execute function touch_workout_template_updated_at();

-- 4. And when its EXERCISES change — the case that actually matters ---------------
-- SECURITY DEFINER is deliberate and is the risky part of this migration, so it is narrow: the
-- function updates exactly one column on exactly one row, addressed by primary key.
--
-- Without it the bump runs as the calling user and is subject to RLS on workout_templates. If any
-- path can write a child row but not update its parent, the trigger's UPDATE is refused, the refusal
-- fails the whole statement, and EDITING A SESSION BREAKS. That failure mode is far worse than the
-- feature is valuable — a "last used" label is not worth risking the editor for.
create or replace function touch_parent_workout_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update workout_templates
     set updated_at = now()
   where id = coalesce(new.template_id, old.template_id);
  return null;                                   -- AFTER trigger: return value is ignored
end $$;

drop trigger if exists trg_touch_parent_workout_template on workout_template_exercises;
create trigger trg_touch_parent_workout_template
  after insert or update or delete on workout_template_exercises
  for each row execute function touch_parent_workout_template();

-- 5. Index ------------------------------------------------------------------------
-- The Library list orders by updated_at within one coach's templates.
create index if not exists workout_templates_coach_updated_idx
  on workout_templates (coach_id, updated_at desc);

-- 6. Verify -----------------------------------------------------------------------
-- nulls_must_be_zero has to be 0, and oldest/newest should differ (proving the backfill spread).
-- select count(*)                                    as templates,
--        count(*) filter (where updated_at is null)  as nulls_must_be_zero,
--        min(updated_at)                             as oldest,
--        max(updated_at)                             as newest
--   from workout_templates;

-- ROLLBACK ------------------------------------------------------------------------
-- drop trigger if exists trg_touch_parent_workout_template on workout_template_exercises;
-- drop trigger if exists trg_touch_workout_template on workout_templates;
-- drop function if exists touch_parent_workout_template();
-- drop function if exists touch_workout_template_updated_at();
-- drop index if exists workout_templates_coach_updated_idx;
-- alter table workout_templates alter column updated_at drop default;
-- alter table workout_templates drop column if exists updated_at;
