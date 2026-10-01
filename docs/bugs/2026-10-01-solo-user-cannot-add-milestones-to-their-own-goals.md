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
