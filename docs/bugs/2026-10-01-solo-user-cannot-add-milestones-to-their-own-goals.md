---
id: 2026-10-01-solo-user-cannot-add-milestones-to-their-own-goals
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-01
status_detail: "FIXED 2026-10-15, not yet released. Jake ran scripts/add-solo-goal-milestones-policy-2026-10-15.sql (one INSERT policy on goal_milestones for a solo user's own goals, read back and confirmed live), and tests/solo-goal-milestones-2026-10-15.spec.js went from RED to GREEN against the live database: a solo user adds and ticks a step through Add a step, and a coached client's direct insert is still refused. Goes out in v2026.10.4. Closes when Jake confirms on his phone. Deleting a step is NOT granted (nothing in the app deletes one)."
closing_conditions: "A solo user can add and tick a step on their own goal, proved by a spec that went RED before the policy change and GREEN after (done 2026-10-15); a client and an unrelated coach still cannot (pinned live and in the local verifier). Delete was dropped from the condition: nothing in the app deletes a step. Jake confirms on his phone."
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

## Applied and verified (2026-10-15)

Jake ran the script and pasted the read-back: the five policies on goal_milestones, mine reading `FOR INSERT TO authenticated WITH CHECK (EXISTS (... c.coach_id IS NULL AND c.user_id = (SELECT auth.uid())))`. Then the live spec: before the SQL the page showed "new row violates row-level security policy for table goal_milestones" and the test failed; after it, 2 passed (the solo add and tick; the coached client refused and the coach allowed).
