---
id: 2026-08-22-no-delete-in-the-programs-family-is-rowcount-checked
status: fixed-awaiting-jake
priority: medium
reported: 2026-08-22
closed_by: tests/delete-rowcount-programs-2026-09-04.spec.js
status_detail: "FIXED 2026-09-04. All 16 deletes in app-programs.js now rowcount-check (14) or carry an explicit reason why zero is legitimate (2); enumeration re-run shows 0 unchecked. Red-before/green-after proven: reverting the branch gave zero toasts (the user was told nothing). Reviewing the diff also caught a gap it had just created — generatePhasePeriodization ignored the cleanup helper failure and rebuilt on top of rows that were never removed."
---

# Every DELETE in app-programs reports success when it deletes nothing

PostgREST returns `error: null` for a DELETE that matches **zero** rows — the same property this repo
already documents for UPDATE at `moveProgramToPersonal`, and the reason `.select()` + a rowcount check
is the house rule.

The 2026-08-22 ownership-anchor commit applied that rule to three UPDATEs (`saveEditStartDate`,
`saveProgram`, `savePhase`). **It applied it to none of the DELETEs those same gates guard:**

- `removePhaseWorkout` — `dbq(... .delete().eq('id', pwId))`, `if (error) return` only, then
  re-renders as though it succeeded
- `deletePhase` — the `program_phase_workouts` delete and the `program_phases` delete
- `deleteProgram` — `program_phase_workouts.delete().in('phase_id', phaseIds)`
- `_cleanupPhaseWeeksBeyond`
- `deletePhaseWeek`

A refused DELETE at any of these tells the user it worked. This is the "reports success while doing
nothing" class, which is the dominant OS bug class here.

## Why it was not fixed in the same commit

Two reasons, both deliberate. It is **pre-existing**, not introduced by the ownership work — so folding
it in would have mixed a security change with a behavioural one in the same diff. And it is a genuine
class of its own (5+ sites across 5 functions, each with a different "what should the user see when the
delete was refused?" answer). The ownership commit was already at 45 writes across 23 functions.

## Fix direction

`.select('id')` on every delete, then branch on rowcount. Note the correct branch differs per site:
`deleteProgram`'s zero-row delete of phase slots is LEGITIMATE when a program has no phases, so a bare
`length !== 1` check would be wrong there. Do not apply one template mechanically — that is how a
guard ends up refusing the legitimate user.

**Closes when:** every DELETE in js/app-programs.js either checks its rowcount or carries a comment
saying why zero rows is expected, and a test proves at least one refused delete no longer reports
success.

---

## FIXED 2026-09-04 — all 16, with four different correct answers

**Enumerated rather than sampled.** 16 deletes in `js/app-programs.js`: 2 already checked (the clone
rollbacks), 14 were not. All 16 now either rowcount-check or carry an explicit
`ZERO ROWS IS LEGITIMATE` comment. Re-running the enumeration afterwards: **14 checked, 2 excused with
a reason, 0 unchecked.**

The row warned *"do not apply one template mechanically — that is how a guard ends up refusing the
legitimate user"*. It needed four different branches:

| behaviour | sites | why |
|---|---|---|
| refuse + tell the user | `removePhaseWorkout`, `deletePhase`, `deleteProgram`, `_removeAssignmentAndClones` | one row, by id, that the user just pressed Delete on — zero is never legitimate |
| log, do not toast | `_deleteOwnedUnreferencedTemplates`, `_deleteClientCopiesForSlots`, `copyProgramToCoaching`'s rollback | cleanup inside a larger operation whose success reporting belongs to the caller |
| **zero is legitimate** | `deleteProgram`'s and `deletePhase`'s phase-slot sweeps | a programme/phase with no sessions has no slot rows; refusing would block deleting an empty one — both named in this row for exactly that reason |
| warn on zero, never fail | `_removeAssignmentAndClones`' clone cleanup | its `.not('client_id','is',null)` filter deliberately spares masters, so deleting nothing can be correct. Logs actual-vs-expected. |

## The diff review caught a gap the fix itself created

`_cleanupPhaseWeeksBeyond` toasted *"Could not clear the old weeks"* and returned — but
`generatePhasePeriodization` ignored the return and **rebuilt weeks 2+ anyway**, on top of rows that
were never removed. That is strictly worse than the silence it replaced: the user is told it failed
while the app does the damaging thing regardless.

The helper now returns `true`/`false` and generation aborts on `false`.

Its other caller, `savePhase`, deliberately does **not** abort — the phase's duration UPDATE has
already committed and is what the user asked for, so refusing there would report a failed save that in
fact succeeded. **Two callers, two different correct answers**, which is the concrete proof that a
single template would have been wrong.

## Red before, green after

`tests/delete-rowcount-programs-2026-09-04.spec.js` builds a real programme, phase, template and slot,
then makes **only** the `program_phase_workouts` DELETE resolve as `{ data: [], error: null }` — the
genuine refusal shape, not a simulated error — while the ownership check and every other query run for
real against the fixture.

    reverted:  "a refused delete must surface an error toast; got []"     <- ZERO toasts
    fixed:     "Could not remove that session — try again."

Note the spec asserts across ALL toasts rather than the first: `log.error()` itself calls `showToast`
(`app-core.js:37`) with the technical `<tag>: <message>` line and the human sentence follows. Since
`showToast` keeps a single node, the screen shows the sentence and the console keeps the detail.

**Verification:** full suite 605 passed, 4 skipped, **0 failed, 0 flaky** (31.1m). Ownership review
completed before the commit: anchors unchanged (`check-query-scope` clean), and all four callers of
`_removeAssignmentAndClones` already handled a `false` return.

**Closes when** Jake confirms deleting a phase/programme/session still behaves normally on live.
