---
id: 2026-10-12-programs-page-has-no-add-to-my-plan-or-remove-from-my-plan
status: open
priority: medium
reported: 2026-10-12
status_detail: "OPEN. Scoped with Jake 2026-10-12; his four answers are below and form the plan. Not built; the plan is for his approval, ideally with a prototype of the list chip and the program page buttons."
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
