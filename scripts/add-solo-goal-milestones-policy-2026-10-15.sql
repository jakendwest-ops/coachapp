-- A SOLO account can add a STEP (a goal_milestones row) to its OWN goals. Additive: one new INSERT policy; nothing existing is changed or removed.
--
-- WHY. Ledger row 2026-10-01-solo-user-cannot-add-milestones-to-their-own-goals (confirmed by behaviour on the live project): a solo user can add a goal, edit it, add a
-- check-in and delete it, but adding a step to their own goal is refused ("new row violates row-level security policy for table goal_milestones"). The live policies on the
-- table (read by Jake 2026-10-15) show why: "Coach manages milestones" (ALL) matches only clients.coach_id = auth.uid(), and a solo record has coach_id NULL; the CLIENT policies
-- ("Client reads own milestones" SELECT, "Client updates own goal milestones" UPDATE) match user_id = auth.uid(), so a solo user can already READ and TICK their steps - but
-- no policy lets them INSERT. The 2026-08-11 fix gave the `goals` policy a WITH CHECK for solo; goal_milestones never got an INSERT path. Since the Goals rework (2026-10-14)
-- the goal page's one-line "Add a step" is the main way to add one, and it is offered to a solo user, so the refusal is the first thing a solo user meets there.
--
-- WHAT IT DOES. Postgres ORs permissive policies, so a NEW policy can only GRANT, never revoke. This one lets the signed-in user INSERT a step onto a goal whose clients row
-- is THEIR OWN SOLO record: coach_id IS NULL and user_id = auth.uid() (the shape Jake gave the goals policy on 2026-08-11: "deliberately narrower than the usual
-- .or(coach_id.eq, user_id.eq) pattern"). A step belongs to a goal and a goal to a clients row, so the check follows goal_id to the owning record.
--
-- WHAT IT DOES NOT DO. INSERT only, because adding is all the app does: no policy for DELETE (nothing in the app deletes a step; the ledger row asked for it as a
-- "while we are here", and least privilege says wait for a feature that needs it) and none for UPDATE or SELECT (a solo user already ticks and reads through the client
-- policies). The coach policies are untouched; a COACHED client still cannot add a step (their record has a coach, so this never matches) - UNTIL THEY DETACH THEMSELVES: the live
-- clients_update_own_row policy lets a client set their own coach_id to NULL, which the 2026-09-26 guard deliberately still allows (Jake accepted detaching), and that record is then
-- solo, so this policy matches it. Not a meaningful new power (a client who detaches can already rewrite the text of the steps and goals their coach made), and pinned in the verifier.
-- A solo record that later gets a coach attached stops matching; another solo user's goals and another coach's clients never match (user_id must be the caller's). `to authenticated`:
-- anon has no identity to match. Verified locally (scripts/sql-verify/solo-goal-milestones.verify.mjs) against the LIVE policy text of goals, goal_milestones and goal_check_ins as
-- Jake read it on 2026-10-15 (their role lists were not in that read, so the local copies are `to public`; the `clients` policies the check depends on are from the older reads of
-- 2026-09-20, 09-26 and 10-01 in live-schema.mjs, not from 10-15); the live proof is
-- tests/solo-goal-milestones-2026-10-15.spec.js, which adds a step on the master account's solo record against the live database and fails until this is run.
--
-- ROLLBACK (additive): drop policy "Solo adds steps to own goals" on public.goal_milestones;
-- Safe to run twice (drop if exists, then create).

drop policy if exists "Solo adds steps to own goals" on public.goal_milestones;
create policy "Solo adds steps to own goals" on public.goal_milestones
  for insert to authenticated
  with check (exists (select 1 from public.goals g join public.clients c on c.id = g.client_id
                      where g.id = goal_milestones.goal_id and c.coach_id is null and c.user_id = (select auth.uid())));

-- READ-BACK. Every policy on the table, so the new one can be seen beside the existing ones (an ALTER returns no rows by itself).
select policyname, cmd, roles::text as roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'goal_milestones'
order by policyname;
