// Deliberate breakages of scripts/add-solo-goal-milestones-policy-2026-10-15.sql. run-mutations.mjs applies each one and requires the verifier to FAIL -
// proof the checks can fail, so a green run means something.
const PRED = 'where g.id = goal_milestones.goal_id and c.coach_id is null and c.user_id = (select auth.uid())'
export const MUTATIONS = {
  m1: { why: 'the policy grants nothing (a solo user is still refused)',
        pairs: [[PRED, 'where false']] },
  m2: { why: 'the NULL-coach test is gone (a COACHED client could add steps to their own goals)',
        pairs: [[PRED, 'where g.id = goal_milestones.goal_id and c.user_id = (select auth.uid())']] },
  m3: { why: 'the owner test is gone (any solo user could add steps to anyone\'s solo goal)',
        pairs: [[PRED, 'where g.id = goal_milestones.goal_id and c.coach_id is null']] },
  m4: { why: 'the step is no longer tied to its goal (owning ANY solo goal grants every goal)',
        pairs: [[PRED, 'where c.coach_id is null and c.user_id = (select auth.uid())']] },
  m5: { why: 'the policy is FOR ALL with a USING clause (it would also grant DELETE of a step, which nothing in the app needs)',
        pairs: [['for insert to authenticated\n  with check (', 'for all to authenticated\n  using (exists (select 1 from public.goals g join public.clients c on c.id = g.client_id\n                 ' + PRED + '))\n  with check (']] },
  m6: { why: 'the policy is to anon, not authenticated (no signed-in user is covered)',
        pairs: [['for insert to authenticated', 'for insert to anon']] },
  m7: { why: 'the policy is not re-creatable (a plain create fails on the second run)',
        pairs: [['drop policy if exists "Solo adds steps to own goals" on public.goal_milestones;\n', '']] },
  m8: { why: 'the check is "true" (any signed-in user could add a step to any goal)',
        pairs: [['with check (exists (select 1 from public.goals g join public.clients c on c.id = g.client_id\n                      ' + PRED + '));', 'with check (true);']] },
  m9: { why: 'the rollback in the header names a policy that does not exist',
        pairs: [['-- ROLLBACK (additive): drop policy "Solo adds steps to own goals" on public.goal_milestones;', '-- ROLLBACK (additive): drop policy "Solo adds step to own goals" on public.goal_milestones;']] },
}
