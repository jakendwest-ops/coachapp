// Deliberate breakages of scripts/add-client-empty-session-delete-2026-10-01.sql. run-mutations.mjs applies each one and requires
// the verifier to FAIL — proof the checks can fail, so a green run means something. Every anchor is matched EXACTLY once
// (applyMutation refuses a stale one). Reviewed 2026-10-01: m9/m13 are caught by the READ-BACK (definer=true), not behaviourally — the wrapper
// function, not SECURITY DEFINER, breaks the policy cycle — and their `why` says so.
const LOG_EMPTY = `  and not exists (
    select 1 from public.workout_log_exercises e
    join public.workout_log_sets s on s.workout_log_exercise_id = e.id
    where e.log_id = p_log_id
  )
`
const EX_EMPTY = '  and not exists (select 1 from public.workout_log_sets s where s.workout_log_exercise_id = p_exercise_id)\n'
const LOG_TIME = "where l.id = p_log_id and c.user_id = auth.uid()\n      and l.created_at > now() - interval '15 minutes'\n"
const EX_TIME = "where e.id = p_exercise_id and c.user_id = auth.uid()\n      and l.created_at > now() - interval '15 minutes'\n"
export const MUTATIONS = {
  m1: { why: 'the "nothing saved in it" test is gone from the log function (a client could erase a finished session)',
        pairs: [[LOG_EMPTY, '']] },
  m2: { why: 'the ownership test is gone from the log function (a client could delete anyone\'s empty session)',
        pairs: [['where l.id = p_log_id and c.user_id = auth.uid()', 'where l.id = p_log_id']] },
  m3: { why: 'the "no sets under this exercise" test is gone from the exercise function (a client could delete an exercise that has sets)',
        pairs: [[EX_EMPTY, '']] },
  m4: { why: 'the ownership test is gone from the exercise function (a client could delete anyone\'s empty exercise rows)',
        pairs: [['where e.id = p_exercise_id and c.user_id = auth.uid()', 'where e.id = p_exercise_id']] },
  m5: { why: 'the workout_logs policy is FOR ALL instead of FOR DELETE (a client could also UPDATE their empty session)',
        pairs: [['  for delete to authenticated\n  using (public.client_may_delete_log(', '  for all to authenticated\n  using (public.client_may_delete_log(']] },
  m6: { why: 'the workout_log_exercises policy is FOR ALL instead of FOR DELETE (a client could also UPDATE their empty exercise rows)',
        pairs: [['  for delete to authenticated\n  using (public.client_may_delete_log_exercise(', '  for all to authenticated\n  using (public.client_may_delete_log_exercise(']] },
  m7: { why: 'the workout_logs policy is not re-creatable (a plain create fails on the second run)',
        pairs: [['drop policy if exists "Client deletes own empty workout logs" on public.workout_logs;\n', '']] },
  m8: { why: 'the workout_log_exercises policy is not re-creatable (a plain create fails on the second run)',
        pairs: [['drop policy if exists "Client deletes own empty log exercises" on public.workout_log_exercises;\n', '']] },
  m9: { why: 'the log function runs with the CALLER\'s rights (security invoker): caught by the READ-BACK (definer=true). The cycle does NOT return, because the wrapper function breaks it',
        pairs: [['create or replace function public.client_may_delete_log(p_log_id uuid)\nreturns boolean\nlanguage sql\nstable\nsecurity definer', 'create or replace function public.client_may_delete_log(p_log_id uuid)\nreturns boolean\nlanguage sql\nstable\nsecurity invoker']] },
  m10: { why: 'the log function has no fixed search_path (the read-back must show it)',
         pairs: [['security definer\nset search_path = public, pg_temp\nas $$\n  select exists (\n    select 1 from public.workout_logs l', 'security definer\nas $$\n  select exists (\n    select 1 from public.workout_logs l']] },
  m11: { why: 'anon can still execute the log function (execute is not revoked from it)',
         pairs: [['revoke all on function public.client_may_delete_log(uuid) from public, anon;', 'revoke all on function public.client_may_delete_log(uuid) from public;']] },
  m12: { why: 'ownership is tested against the COACH column instead of the client\'s own user_id (the legitimate client would be refused)',
         pairs: [['where l.id = p_log_id and c.user_id = auth.uid()', 'where l.id = p_log_id and c.coach_id = auth.uid()']] },
  m13: { why: 'the exercise function runs as the caller (security invoker): caught by the READ-BACK (definer=true), not behaviourally',
         pairs: [['create or replace function public.client_may_delete_log_exercise(p_exercise_id uuid)\nreturns boolean\nlanguage sql\nstable\nsecurity definer', 'create or replace function public.client_may_delete_log_exercise(p_exercise_id uuid)\nreturns boolean\nlanguage sql\nstable\nsecurity invoker']] },
  m14: { why: 'the 15-minute window is gone from the log function (a client could delete a set-less session of any age)',
         pairs: [[LOG_TIME, 'where l.id = p_log_id and c.user_id = auth.uid()\n']] },
  m15: { why: 'the 15-minute window is gone from the exercise function',
         pairs: [[EX_TIME, 'where e.id = p_exercise_id and c.user_id = auth.uid()\n']] },
  m16: { why: 'the log function is not re-creatable (a plain create fails on the second run)',
         pairs: [['create or replace function public.client_may_delete_log(p_log_id uuid)', 'create function public.client_may_delete_log(p_log_id uuid)']] },
  m17: { why: 'anon can still execute the exercise function (execute is not revoked from it)',
         pairs: [['revoke all on function public.client_may_delete_log_exercise(uuid) from public, anon;', 'revoke all on function public.client_may_delete_log_exercise(uuid) from public;']] },
  m18: { why: 'the workout_logs policy is granted to PUBLIC instead of authenticated only',
         pairs: [['  for delete to authenticated\n  using (public.client_may_delete_log(', '  for delete to public\n  using (public.client_may_delete_log(']] },
  m19: { why: 'a client is also given DELETE on workout_log_sets (they could remove a saved set)',
         pairs: [['-- READ-BACK: two functions', 'drop policy if exists "zz client deletes sets" on public.workout_log_sets;\ncreate policy "zz client deletes sets" on public.workout_log_sets for delete to authenticated using (true);\n-- READ-BACK: two functions']] },
}
