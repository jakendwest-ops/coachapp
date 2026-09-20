---
id: 2026-09-18-savenewtemplate-writes-program_phase_workouts-with-no-ownership-check
status: closed
priority: high
closed_by: tests/savenewtemplate-ownership-2026-09-20.spec.js
reported: 2026-09-18
status_detail: "CLOSED 2026-09-20 on rule-(b) evidence — RED before the fix, GREEN after; see the resolution at the bottom. The row understated the gap (RLS did not backstop the first write). Originally: Found by the weekly full-file review (Angle A — security/multi-tenant scoping), js/app-workouts.js + js/app-core.js + js/app-programs.js read end-to-end. Verified directly by re-reading the cited lines before filing, not taken on the sub-agent's word alone."
---

# `saveNewTemplate` writes to `program_phase_workouts` with no ownership check

`js/app-workouts.js:1302-1317`, inside `saveNewTemplate`: when a new template is created from a
phase's day-slot picker (`ctx.phaseId`/`ctx.dayOfWeek`/`ctx.weekNumber`, from
`window._phaseWorkoutContext`), it INSERTs into `program_phase_workouts` using `ctx.phaseId` with
**no ownership verification anywhere in the chain** — not in this function, and not in anything
upstream of it (`showCreateTemplateModal` → `_createWorkoutFromPicker` in `app-programs.js`, which
passes `phaseId` straight from `_workoutPickerState`).

Every other write to `program_phase_workouts`/`program_phases`/`programs` in `app-programs.js` (34
sites, grepped in full by the review) goes through `_verifyPhaseOwnership`/`_verifyProgramOwnership`/
`_verifyPhaseWorkoutOwnership` first. The closest sibling, `_quickAssignPhaseWorkout`
(`app-programs.js:2759-2789`), does the equivalent insert correctly:

```js
if (!(await _verifyPhaseOwnership('_quickAssignPhaseWorkout', phaseId))) { ...; return }
if (!(await _verifyTemplateOwnership(templateId, await _resolveTemplateOwnerCoachId()))) { ...; return }
```

`saveNewTemplate` has neither check before its own insert at `app-workouts.js:1312-1314`.

**Exposure:** in normal UI flow `ctx.phaseId` only ever comes from a phase the coach already has
open (itself gated by RLS on the `programs` SELECT), but `showCreateTemplateModal` is reachable
directly (e.g. from devtools) with an arbitrary `phaseId`, and the JS-side query carries no
coach_id/ownership anchor — RLS on the `program_phase_workouts` INSERT is the only backstop, which
is exactly the "don't trust RLS alone on a write" principle this codebase otherwise enforces
everywhere (see `docs/critical.md`, and `docs/decisions.md`'s 2026-08-22 duplicate-ownership-helper
entry, archived at `docs/archive/decisions-pre-2026-09-15.md`).

**Fix shape:** add `_verifyPhaseOwnership('saveNewTemplate', ctx.phaseId, ctx.programId)` before the
insert, mirroring `_quickAssignPhaseWorkout` exactly (cross-file call into `app-programs.js`'s
helper — already done elsewhere in this codebase, e.g. `_verifyTemplateOwnership` is called from
`app-programs.js`).

**Not fixed in this pass** — full-file review is report-only per its own rule; fixing happens under
normal build gates (this is ownership/RLS-shaped, so `multi-agent-review` before the commit, per
`CLAUDE.md`).

---

## 2026-09-20 — fixed; closed on rule-(b) evidence

**Fix.** `saveNewTemplate` (`js/app-workouts.js`) now verifies the programme/phase **pair** before its first write —
`_verifyPhaseOwnership('saveNewTemplate', ctx.phaseId, ctx.programId)` when a phase is passed,
`_verifyProgramOwnership` when only a programme is — and refuses with "Could not create — permission denied." It
also snapshots `#ct-desc` and the role before that guard's awaits: all three review angles found the form read
landing after them (see [the class row](2026-09-20-nine-save-functions-read-form-values-after-an-awaited-ownership-check.md)).

**Red → green** (`tests/savenewtemplate-ownership-2026-09-20.spec.js`). On the unguarded code the load-bearing test
failed: with two programmes of my own and a phase of A, `{ programId: B, phaseId: phaseOfA }` created a template
stamped with B **and** slotted it into A's phase, with no message shown. It passes after. Neuter proofs: the pair
check reduced to "the phase is mine" → the load-bearing test failed at its named assertions; the guard removed
entirely → the load-bearing, UI and cross-tenant tests failed while the three mirrors (own matched pair, no
context, Personal view) stayed green. 68 specs across the builder, ownership-anchor and re-entry files pass with it.

**The row understated the gap.** It assumed only the second insert lacked a backstop. Measured: RLS refuses the
`program_phase_workouts` insert for a foreign coach, but **accepts the first write** — another coach's programme id
landed in `workout_templates.program_id`. Filed separately, still open, needs Jake:
[2026-09-20-workout-templates-insert-accepts-another-coachs-program-id](2026-09-20-workout-templates-insert-accepts-another-coachs-program-id.md).

**Sibling sweep.** 5 `workout_templates` insert sites in `js/` (`app-workouts.js` ×2, `starter-content.js`,
`app-programs.js` ×2). This was the only one stamping a programme id taken from caller state: two write `null`, the
seed uses its own new programme, `generatePhasePeriodization` verifies its phase up front, and
`_cloneSharedMasterTemplate` copies from a source row that has already passed an ownership check.

**Named, not fixed.** The header comment at `js/app-programs.js:37-39` says `saveProgram` and the starter seed are
"the only two" writers of `programs`; `copyProgramToCoaching` is a third (it also stamps `currentUser.id`, so the
invariant holds — the sentence is just stale).
