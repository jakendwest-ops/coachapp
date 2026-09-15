---
id: 2026-09-06-saveperiodizationconfig-writes-tiers-on-ids-it-never-verified
status: open
priority: medium
reported: 2026-09-06
status_detail: "Found by the 2026-09-06 full-file review (Agent A), verified at source. js/app-programs.js:1785 verifies phaseId, then :1806 writes tier onto slot.id taken from the window._pzDaySlots global with no verification, no error check and no .select(). The function takes no arguments, so both values come from globals -- one set synchronously, one filled by an async query. Damage is within the user's own data, not cross-tenant."
---

# savePeriodizationConfig verifies the phase, then writes on ids from a stale-able global

`js/app-programs.js:1777` — the function takes **no arguments**. Both `phaseId` and the slot list come
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

**Closes when** the slot writes are anchored on the verified phase, or verified per slot, AND both
writes rowcount-check — proven by a spec where the write is refused and the UI does not report success,
red before, green after.
