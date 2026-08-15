-- ============================================================================
-- Session identity: workout_templates.family_id          (applied live 2026-08-14)
-- ============================================================================
-- WHY
-- The app had no concept of "these template rows are the same session". It inferred it from an EXACT
-- NAME STRING in one place (_checkSiblingPropagation) and ignored names entirely in another (the
-- Add-workout picker). Both of Jake's 2026-08-14 reports trace to that one gap:
--
--   * "when I click 'Save' ... I should be asked whether I want to update all duplicated sessions" —
--     a periodization clone is named `${name} — W2`, and "X" never equals "X — W2", so the prompt was
--     STRUCTURALLY IMPOSSIBLE for any generated phase, for any edit.
--   * "threshold intervals is being used ... however when I try to add this session into the Thursday
--     workout slot it does not appear to be in use" — the picker rendered every copy as its own row.
--
-- Jake chose a real identity column over smarter name-matching (2026-08-14).
--
-- WHY THE BACKFILL GROUPS ON CONTENT, NOT ON NAME
-- Measured against his real data before writing this. 213 templates. Grouping by name alone yields 39
-- families; grouping by name AND identical exercise list yields 67. That 28-family gap is sessions that
-- SHARE A NAME BUT ARE NOT THE SAME SESSION — e.g. "Upper Body STR" existed on 2026-07-14 as both a
-- 6-exercise and a 9-exercise prescription, almost certainly different phases of one block. Merging
-- those would let a Phase 1 edit later propagate into Phase 3: exactly the destructive outcome the
-- feature exists to prevent. Names also move independently of content in this data — on 2026-07-14
-- "Upper Body PWR" held precisely the nine exercises "Upper Body STR" held the same day.
--
-- The week-suffix strip below matches JAKE'S ACTUAL NAMING ("- week 1"), not only the "— W1" the code
-- generates. His 16 week-copies use the former; a "— W" only pattern missed every one of them.
-- Note also: zero rows carried generated_from_phase_id, so a migration keyed off that column would
-- have found nothing.
--
-- SAFETY
-- Additive and reversible. The column is nullable, nothing read it until the code shipped alongside,
-- and `update workout_templates set family_id = null;` undoes the backfill completely.
-- ============================================================================

-- 1. Column + index -----------------------------------------------------------
alter table workout_templates add column if not exists family_id uuid;
create index if not exists workout_templates_family_id_idx on workout_templates (family_id);

-- 2. Backfill -----------------------------------------------------------------
-- Partitioned by coach_id AND is_personal so a family can never span two tenants, nor cross the
-- PT/Personal split (Jake's master account genuinely holds "Lower Body STR" as both).
with sig as (
  select wt.id, wt.coach_id, wt.is_personal, wt.created_at,
    lower(btrim(regexp_replace(wt.name,
      '\s*[-—–]\s*(week\s*[0-9]+|w[0-9]+)\s*$', '', 'i'))) as norm_name,
    (select string_agg(lower(btrim(e.exercise_name)), '|'
              order by lower(btrim(e.exercise_name)))
       from workout_template_exercises e where e.template_id = wt.id) as ex_sig
  from workout_templates wt
),
grp as (
  select id, first_value(id) over (
           partition by coach_id, is_personal, norm_name, ex_sig
           order by created_at, id) as fam
  from sig
  where ex_sig is not null          -- an empty template has no content to compare; see step 3
)
update workout_templates wt
   set family_id = g.fam
  from grp g
 where g.id = wt.id and wt.family_id is null;   -- `is null` makes this safe to re-run

-- 3. Everything else becomes its own family ------------------------------------
-- Empty templates and genuine one-offs. Deliberately NOT grouped: several empty templates sharing a
-- name have no content to prove they are the same session.
update workout_templates set family_id = id where family_id is null;

-- 4. Structural guarantee for every future insert -------------------------------
-- Five code paths insert a workout_template today, and this codebase's most-repeated failure is a rule
-- landing in one function while its siblings drift. A trigger means a sixth path written next month
-- cannot forget. Clones pass the parent's family_id explicitly; anything else becomes its own family.
-- A clone that forgets is merely unhelpful (its own family), never wrong.
create or replace function set_workout_template_family_id()
returns trigger language plpgsql as $$
begin
  if new.family_id is null then
    new.family_id := new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_workout_template_family_id on workout_templates;
create trigger trg_workout_template_family_id
  before insert on workout_templates
  for each row execute function set_workout_template_family_id();

-- 5. Verify --------------------------------------------------------------------
-- unassigned_must_be_zero has to be 0. On Jake's account this returned 213 templates / 64 families.
-- select count(*) as templates,
--        count(distinct family_id) as families,
--        count(*) filter (where family_id is null) as unassigned_must_be_zero
--   from workout_templates
--  where coach_id = (select id from auth.users where email = '<owner email>');

-- NOT A SECURITY BOUNDARY. family_id is a grouping/display key only — it must never appear in an RLS
-- policy. Tenancy is coach_id + client_id. (See the is_personal near-miss, 2026-07-11.)
