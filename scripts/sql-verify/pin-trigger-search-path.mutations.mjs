// Deliberate breakages of scripts/pin-trigger-search-path-2026-10-25.sql. run-mutations.mjs applies each one and requires the verifier to FAIL -
// proof the checks can fail, so a green run means something.
export const MUTATIONS = {
  m1: { why: 'the updated_at trigger function is not pinned',
        pairs: [['alter function public.touch_workout_template_updated_at() set search_path = public, pg_temp;\n', '']] },
  m2: { why: 'the family_id trigger function is not pinned',
        pairs: [['alter function public.set_workout_template_family_id() set search_path = public, pg_temp;\n', '']] },
  m3: { why: 'the family_id function is pinned to an empty path (its table would no longer resolve)',
        pairs: [['alter function public.set_workout_template_family_id() set search_path = public, pg_temp;', 'alter function public.set_workout_template_family_id() set search_path = \'\';']] },
  m4: { why: 'the wrong function is altered the second time (the one named in the lint is left unpinned)',
        pairs: [['alter function public.set_workout_template_family_id() set search_path = public, pg_temp;', 'alter function public.touch_parent_workout_template() set search_path = public, pg_temp;']] },
  m5: { why: 'the read-back no longer lists the family_id function',
        pairs: [[", 'set_workout_template_family_id')\norder by 1;", ")\norder by 1;"]] },
  m6: { why: 'the documented rollback has a typo and would not run',
        pairs: [['--   alter function public.set_workout_template_family_id() reset search_path;', '--   alter function public.set_workout_template_family_id() reset search_pathx;']] },
}
