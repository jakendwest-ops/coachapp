---
id: 2026-10-01-solo-user-cannot-add-milestones-to-their-own-goals
status: open
priority: medium
reported: 2026-10-01
status_detail: "Found by Claude 2026-10-01 while testing the goals controls, CONFIRMED BY BEHAVIOUR with a probe on the live project (the master account's own solo record): a solo user can add a goal, edit it, add a check-in and delete it, but adding a MILESTONE to their own goal is refused by the database ('new row violates row-level security policy for table goal_milestones'). The goal detail still shows the milestone '+ Add' button to a solo user, so it is a dead affordance. Same class as the 2026-08-11 solo-goals INSERT bug (solo's clients row has coach_id NULL, so a policy keyed on the coach never matches). Needs the live policy text for goal_milestones to write the fix; Jake runs the SQL."
closing_conditions: "A solo user can add, tick and delete a milestone on their own goal, proved by a spec that went RED before the policy change and GREEN after; a client and an unrelated coach still cannot."
---

# A solo user cannot add a milestone to their own goal

**Closes when:** a solo user can add, tick and delete a milestone on their own goal, proved by a spec that went RED before the policy change and GREEN after, and a client and an unrelated coach still cannot.

## What happens

A probe on the live project, as the master account acting on its own solo record (coach_id NULL, user_id = the account):

| Action on their own goal | Result |
|---|---|
| add a goal | works |
| edit the goal | works |
| add a check-in | works |
| delete the goal | works |
| **add a milestone** | **refused: row-level security policy for `goal_milestones`** |

The goal detail screen offers "+ Add" under Milestones to a solo user (it always did), so the button leads to an error.

## Why

The 2026-08-11 fix added a `WITH CHECK` clause for solo to the `goals` policy; the matching policy on `goal_milestones` was not given the same treatment (a milestone belongs to a goal, which belongs to a client record; for solo that record has no coach).

## What is needed

The live policies on `goals`, `goal_milestones` and `goal_check_ins` (a read-only `pg_policies` query, Jake runs it), then a migration with a local verifier and mutations, as for the other policy fixes. Nothing is built before that: a verifier written on a guessed policy proves nothing.

## Update 2026-10-14

The Goals rework made this more visible: the goal page's one-line "Add a step" (the new main way to add a milestone) is offered to a solo user and the database refuses it (the refusal is shown under the box, not swallowed). Still blocked on the read-only `pg_policies` query for `goals`, `goal_milestones` and `goal_check_ins`, then the migration with its local verifier.

## Fix prepared (2026-10-15), waiting for Jake to run the SQL

Jake pasted the live policies. They show a solo user can already READ and TICK their steps (the client policies match user_id = auth.uid()); only INSERT is missing ("Coach manages milestones" matches coach_id = auth.uid(), and a solo record has none). `scripts/add-solo-goal-milestones-policy-2026-10-15.sql` adds ONE policy, FOR INSERT to authenticated, WITH CHECK the step's goal belongs to the caller's own solo record (coach_id IS NULL and user_id = auth.uid()). Additive (it can only grant), and deliberately INSERT only: nothing in the app deletes a step, so DELETE is not granted (this row's original "and delete" is dropped on that ground). Verified locally on PGlite loaded with the live policies of goals, goal_milestones and goal_check_ins (`scripts/sql-verify/live-schema-goals.mjs`, `solo-goal-milestones.verify.mjs`, 28 checks; 9 breakages caught). Not proven locally: the live role lists (not in the read; the local copies are `to public`). The live proof is `tests/solo-goal-milestones-2026-10-15.spec.js`: it failed against the live database before the SQL (the page shows "new row violates row-level security policy for table goal_milestones") and passes after. Closes when Jake confirms on his phone.
