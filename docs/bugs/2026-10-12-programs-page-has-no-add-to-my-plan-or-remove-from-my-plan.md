---
id: 2026-10-12-programs-page-has-no-add-to-my-plan-or-remove-from-my-plan
status: confirmed
priority: medium
reported: 2026-10-12
status_detail: "CONFIRMED by Jake 2026-10-17 on his phone (the phone-check checklist, item T5). FIXED 2026-10-12 (Step 1), released in v2026.10.2; awaits Jake on his phone. A solo account sees 'On my plan' on the list and the plan page with 'Remove from my plan' (otherwise 'Add to my plan'); adding a plan takes the other off; a coach gets the same wording for a client. Test: tests/plan-on-my-plan-2026-10-12.spec.js (7, seven deliberate breakages caught)."
---

# Programs: no "add to my calendar/plan" and no "remove from current plan"; the only action is delete

## Jake's report (verbatim, 2026-10-12)

> 5. There should be a 'add to my calendar/plan' and a 'remove from current plan' on this page. A user may want to create a plan but not assign it to themself. At the moment they can only delete.

Attached: the Programs list (one row, Operation 240, "1 phase", nothing else on it).

## What exists

- Inside a program, a solo account's header shows "Add to my plan" (`_assignBtnHtml`, `js/app-programs.js:1588`, which opens `showAssignProgramToClientModal`). The Programs LIST rows show no plan state and no action.
- Removing an assignment: `unassignProgram(clientId, assignmentId)` exists (`js/app-programs.js:784`) and is reached from a client's profile; a solo account has no "remove from my plan" on the program or the list. The program's own Manage menu offers delete.

## Questions for Jake (before any build)

1. Where: the list rows, the program's own page, or both? (My suggestion: a small "On my plan" chip on the list and the buttons on the program page.)
2. "Add to my plan" starts when, and does adding put the sessions on the calendar? (Today the assignment modal asks for a start date.)
3. "Remove from current plan": stop the plan but keep the history (sessions already logged stay), or erase its future sessions only? (My suggestion: keep everything logged, remove the future sessions from the calendar.)
4. A coach: does the same pair apply to a program assigned to a client (Remove from this client's plan), or only to the account's own plan?

## What would close it

**Closes when** the scope is agreed with Jake, built with a spec that fails without it, and he confirms on his phone.

## Decisions (Jake, 2026-10-12)

1. **Where:** an "On my plan" chip on each row of the Programs list, and "Add to my plan" / "Remove from my plan" on the program's own page.
2. **Start:** "Add to my plan" asks for a start date, as the assign dialog does today; the sessions then appear on the calendar from that date.
3. **Remove:** keep history, drop future sessions. Sessions already logged stay; the plan's upcoming sessions leave the calendar; the program itself stays in the list.
4. **Coaches:** yes, the same pair for a client's plan ("Remove from this client's plan"), keeping their logged history.

## Plan to approve (not built)

- A shared "is this program on the viewer's plan" read (the viewer's own current assignment for solo; the client's for a coach) driving the list chip and the buttons, scoped by the verified client, never a supplied id.
- "Remove" ends the assignment and deletes only future scheduled sessions (client_program_workouts and calendar events dated after today), never workout_logs; it asks first and says what stays.
- Reuse `showAssignProgramToClientModal` for add and `unassignProgram` as the starting point for remove, with a row check on every write and an RLS check for solo (coach_id NULL) and coach.
- Tests: add, remove (history kept, future gone), solo and coach, and the list chip; a mutation check for each write.

## Prototype reaction (Jake, 2026-10-12; prototype https://claude.ai/artifact/2Qu78DKistXV61n1JhWStu)

- **One plan at a time:** adding a plan while another is on takes the other off your plan (it stays in Training plans); the add sheet says so.
- **Remove wording, as written:** "Sessions you have logged stay in your history. Its upcoming sessions leave your calendar. The plan stays in Training plans, and you can add it again."
- Rename "Programs" to "Training plans" everywhere (Step 2). Build in two steps: this is Step 1.

## Step 1 build plan (for approval; nothing built)

What exists: the add dialog (`showAssignProgramToClientModal` > `saveAssignProgramToClient` > the `assign_program` RPC), and a remove helper `_removeAssignmentAndClones` that archives the block to `client_program_blocks` first, deletes the assignment (row-checked), and deletes only the client-owned template copies nothing has been logged from. Logged sessions are never touched. So no new table and no SQL are expected.

1. **"On my plan" chip** on each row of the Programs list, for a solo account (and a master account in Personal view): one read of the account's own assignments, newest first (the newest is the plan the dashboard follows); scoped by `client_id`, never a supplied id.
2. **The program page header** (`_assignBtnHtml`): on the plan, a chip "On my plan since 5 Oct" and **Remove from my plan**; otherwise **Add to my plan** (the existing dialog). A new `removeFromMyPlan(programId)` finds the assignment with `_existingAssignment`, verifies access with `_verifyAssignmentAccess`, asks with the approved wording, calls `_removeAssignmentAndClones`, then refreshes the page and says what stays in a toast.
3. **One plan at a time:** when adding while a different plan is the current one, the add dialog names it ("X comes off your plan"); after the RPC succeeds the old assignment is removed with the same helper. Assign first, remove second: a failure then leaves two assignments (the newest still wins) and a toast ("Added, but X could not be taken off"), never a person with no plan.
4. **Coaches:** the client's Programs tab already has Remove, Edit start date and + Assign program. Only the words change: "Remove from this client's plan", and "Their logged sessions stay in their history. Upcoming sessions leave their calendar." Adding stays "Assign program".
5. **Edge to handle:** if the account still has an OLDER assignment of another program (legacy data), removing the newest makes that one the current plan. The Remove sheet will say so ("Your plan goes back to X"); I will check what Jake's account holds before building.
6. **Tests:** a Playwright spec with its own [E2E] programme and cleanup (solo view): the chip; Remove keeps the logged session and drops the assignment (rows read back); Remove refused or failed shows an error and changes nothing; Add replaces the current plan; the coach wording; a mutation check on every write. Reviews: three angles before the push (the add and remove writes are ownership-sensitive, so before the COMMIT).

## Built (2026-10-12)

Step 1 as agreed: the chip on the list and the page, Add / Remove (Remove keeps every logged session and says so in the approved words), one plan at a time (assign first, remove second; a failed removal warns and leaves both), and the coach's "Remove from plan" wording. No SQL. Three reviewers (security, roles, duplicates) found nothing blocking; their notes were applied (the sweep is gated on the id being the viewer's own solo record, repaints are guarded). Known edge, left alone: an account with several OLDER stacked plans shows "On my plan" on each until the next Add sweeps them. Remove then Add is how a solo account restarts a plan now (the page offers Remove while the plan is on).
