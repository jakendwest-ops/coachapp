---
id: 2026-09-18-savenewtemplate-writes-program_phase_workouts-with-no-ownership-check
status: open
priority: high
reported: 2026-09-18
status_detail: "Found by the weekly full-file review (Angle A — security/multi-tenant scoping), js/app-workouts.js + js/app-core.js + js/app-programs.js read end-to-end. Verified directly by re-reading the cited lines before filing, not taken on the sub-agent's word alone."
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
