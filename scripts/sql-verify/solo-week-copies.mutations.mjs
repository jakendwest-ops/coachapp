// Deliberate breakages of scripts/fix-solo-week-copies-delete-update-2026-10-31.sql. run-mutations.mjs applies each one and requires the verifier to FAIL -
// proof the checks can fail, so a green run means something.
const DEL = 'for delete to authenticated\n  using ('
const UPD = 'for update to authenticated\n  using ('
const DEL_END = 'and c.coach_id is null));\n\ndrop policy if exists "solo user update'
const UPD_USING_OWNER = 'where c.user_id = (select auth.uid()) and c.coach_id is null))\n  with check ('
const CHECK_OWNER = 'where c.user_id = (select auth.uid()) and c.coach_id is null));\n\n-- READ-BACK'
export const MUTATIONS = {
  m1: { why: 'the delete policy grants nothing (a solo user still cannot delete their own copy)',
        pairs: [[DEL, 'for delete to authenticated\n  using (false and ']] },
  m2: { why: 'the update policy grants nothing (a solo user still cannot renumber their own copy)',
        pairs: [[UPD, 'for update to authenticated\n  using (false and ']] },
  m3: { why: 'the delete policy drops the NULL-coach test (a COACHED client could delete their own plan\'s copies)',
        pairs: [[DEL_END, 'and true));\n\ndrop policy if exists "solo user update']] },
  m4: { why: 'the update policy drops the owner test in both clauses (any solo user could renumber another solo user\'s copies)',
        pairs: [[UPD_USING_OWNER, 'where c.coach_id is null))\n  with check ('], [CHECK_OWNER, 'where c.coach_id is null));\n\n-- READ-BACK']] },
  m5: { why: 'the WITH CHECK is "true" (a solo user could move their copy onto someone else\'s plan)',
        pairs: [['with check (', 'with check (true or ']] },
  m6: { why: 'the delete policy is to anon, not authenticated (no signed-in user is covered)',
        pairs: [['for delete to authenticated', 'for delete to anon']] },
  m7: { why: 'the delete policy is not re-creatable (a plain create fails on the second run)',
        pairs: [['drop policy if exists "solo user delete own client_program_workouts" on public.client_program_workouts;\n', '']] },
  m8: { why: 'the rollback in the header names a policy that does not exist',
        pairs: [['-- ROLLBACK (additive): drop policy "solo user delete own client_program_workouts"', '-- ROLLBACK (additive): drop policy "solo user delete own client_program_workout"']] },
  m9: { why: 'the delete policy is "true" (any signed-in user could delete any visible copy)',
        pairs: [[DEL, 'for delete to authenticated\n  using (true or ']] },
  m10: { why: 'the update policy drops the NULL-coach test in both clauses (a COACHED client could renumber their own plan\'s copies)',
        pairs: [[UPD_USING_OWNER, 'where c.user_id = (select auth.uid())))\n  with check ('], [CHECK_OWNER, 'where c.user_id = (select auth.uid())));\n\n-- READ-BACK']] },
  m11: { why: 'the update policy is to anon, not authenticated (no signed-in user can renumber)',
        pairs: [['for update to authenticated', 'for update to anon']] },
}
