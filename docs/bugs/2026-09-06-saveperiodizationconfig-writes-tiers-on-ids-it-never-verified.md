---
id: 2026-09-06-saveperiodizationconfig-writes-tiers-on-ids-it-never-verified
status: closed
priority: medium
reported: 2026-09-06
closed_by: tests/periodization-rpe-2026-10-04.spec.js
status_detail: "CLOSED 2026-10-11 via closure rule (b). All three problems are fixed in js/app-programs.js (app-programs v72): the tier write is checked for an error and for zero rows, it is anchored on the verified phase (.eq('phase_id', phaseId)), and the phase update is row-checked with .select('id'). Red before, green after: the refused-write and failed-write tests and the 'session list that belongs to ANOTHER phase' test all failed on the old code (the dialog closed as if the save had worked, and the other phase's session was given a tier); the phase-row test is covered by a deliberate-breakage run (removing its check turns it red). Of the four deliberate breakages, three turn a test red; the fourth (dropping the explicit error check on the tier write) is an equivalent change, since a server error also returns no rows. The 108-test periodization / builder / programs / progress-trend set passes. Not a Jake-reported row."
---

# savePeriodizationConfig verifies the phase, then writes on ids from a stale-able global

`js/app-programs.js:1777` (at the time) — the function takes **no arguments**. Both `phaseId` and the slot list come
from `window.*` globals.

Three separate problems in four lines:

1. **The verified id is not the written id.** `_verifyPhaseOwnership` checks `phaseId`; the UPDATE at
   `:1806` keys on `slot.id`. `_verifyPhaseWorkoutOwnership` exists at `:62` and is used correctly by
   `removePhaseWorkout:2695` — this is the one `program_phase_workouts` write that skips it, against
   the file's own header comment at `:27-28` saying every such write goes through one of them. Third
   site of the verify-one-id-write-another shape (`removePhaseWorkout` 2026-08-22,
   `_resolveEditableTemplateId` 2026-08-29).
2. **No rowcount check and no error check** on the slot update. The result is discarded, so a refusal
   is silent.
3. **The phase update at `:1810` has no `.select()`.** It destructures the error, but a policy-refused
   UPDATE returns `data:null, error:null` — so the success log fires at `:1812` and the modal closes on
   a write that did not happen. Two siblings do this correctly and say why: `savePhase:1604` and
   `moveProgramToPersonal:1367`.

## The stale-global race

`_pzPhaseId` is set synchronously by `showPeriodizationModal:1679`. `_pzDaySlots` is set at `:1760`, on
resolution of an async query started at `:1750`. Open Configure on phase A, close before its query
resolves, open phase B: the reset at `:1679` clears the list, B's query starts, and whichever response
lands last wins. If A's lands last, saving writes A's tiers while the guard passes on B.

**Blast radius is the user's own data, not tenancy** — both phases belong to whoever opened them, so
the outcome is wrong tiers on your own other phase. Graded medium for that reason, against Agent A's
framing.

## Fix (2026-10-11)

Points 2 and 3 were fixed first (the tier write checked, then the phase update); the 2026-10-11 pre-push review of that change pointed out that
it did not close this row, because the verified id was still not the written id. The tier write is now anchored on the verified phase, so a
stale list's ids match nothing and the save is refused with a message rather than writing into the other phase. The race itself is not
prevented (the list can still be stale); its effect is.

Left, and named: the stale list can still hold a session that was deleted from another tab or device, which is refused too (the message says to
close and reopen the dialog); tiers written before the failing session stay written; and a Save pressed before the session list has loaded
saves the phase with no tier writes (`loadDayTierAssignment` ignores a read error).

**Closes when** the slot writes are anchored on the verified phase, or verified per slot, AND both
writes rowcount-check — proven by a spec where the write is refused and the UI does not report success,
red before, green after.
