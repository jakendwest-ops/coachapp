---
id: 2026-10-12-programs-page-has-no-add-to-my-plan-or-remove-from-my-plan
status: open
priority: medium
reported: 2026-10-12
status_detail: "OPEN. Reported by Jake 2026-10-12. A feature gap he wants scoped: from the Programs page (and a program's own page) put a program on his plan/calendar, or take it off, without deleting it. 'Add to my plan' already exists inside a program for a solo account; 'remove from my plan' does not. Not built; questions to Jake first."
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
