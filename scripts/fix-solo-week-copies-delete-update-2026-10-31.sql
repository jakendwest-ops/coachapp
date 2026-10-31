-- A solo user can delete and renumber the week copies of their OWN self-assigned plan (2026-10-31).
--
-- THE BUG (docs/bugs/2026-10-31-personal-view-delete-of-client-copies-refused-three-times.md, reproduced by a probe the same day).
-- client_program_workouts had four policies (schema read 2026-09-27): coach_manage_cpw (ALL) anchors on clients.coach_id = auth.uid(),
-- and a solo record's coach_id is NULL, so it never matches; the solo user had INSERT and SELECT only. In Personal view a delete or a
-- renumber of one's own week copies returned 0 rows and NO error. Deletes were rescued by the clone cascade
-- (workout_template_id -> workout_templates ON DELETE CASCADE); the renumber in deletePhaseWeek was not, so a deleted week left the
-- solo plan's later copies with stale week numbers. client_programs, the table above, already has all four solo policies; this
-- table was left with two. The same shape as the four earlier solo coach_id bugs.
--
-- THE FIX. The two missing verbs, anchored exactly like the existing solo policies (a clients row whose user_id is the caller and
-- whose coach_id is NULL), to authenticated only. The UPDATE also has a WITH CHECK, so a copy cannot be moved onto a plan that is
-- not the caller's own solo plan. Nothing else changes: the coach and client policies are untouched.
--
-- KNOWN EDGE (review, 2026-10-31): permissive UPDATE policies combine with OR, separately for USING and WITH CHECK, so the MASTER account (a coach
-- who also has a solo record) can now move a copy from one of its own clients' plans onto its own solo plan (coach USING + solo CHECK), and back.
-- Both ends belong to the same person; nothing in the app does it and no data crosses accounts. Pinned in the verifier, not endorsed.
--
-- SAFE TO RE-RUN (drop-if-exists, then create).
-- ROLLBACK (additive): drop policy "solo user delete own client_program_workouts" on public.client_program_workouts; drop policy "solo user update own client_program_workouts" on public.client_program_workouts;
-- Verified locally first: scripts/sql-verify/solo-week-copies.verify.mjs (+ its mutations, run by run-mutations.mjs).

drop policy if exists "solo user delete own client_program_workouts" on public.client_program_workouts;
create policy "solo user delete own client_program_workouts" on public.client_program_workouts
  for delete to authenticated
  using (client_program_workouts.client_program_id in (select cp.id from public.client_programs cp join public.clients c on c.id = cp.client_id
                                                       where c.user_id = (select auth.uid()) and c.coach_id is null));

drop policy if exists "solo user update own client_program_workouts" on public.client_program_workouts;
create policy "solo user update own client_program_workouts" on public.client_program_workouts
  for update to authenticated
  using (client_program_workouts.client_program_id in (select cp.id from public.client_programs cp join public.clients c on c.id = cp.client_id
                                                       where c.user_id = (select auth.uid()) and c.coach_id is null))
  with check (client_program_workouts.client_program_id in (select cp.id from public.client_programs cp join public.clients c on c.id = cp.client_id
                                                            where c.user_id = (select auth.uid()) and c.coach_id is null));

-- READ-BACK: every policy on the table. Expect 6: the four that were there, plus the two above (DELETE and UPDATE, to authenticated).
select policyname, cmd, roles::text as roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'client_program_workouts'
order by policyname;
