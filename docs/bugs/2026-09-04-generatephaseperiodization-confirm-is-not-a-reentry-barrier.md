---
id: 2026-09-04-generatephaseperiodization-confirm-is-not-a-reentry-barrier
status: fixed-awaiting-jake
priority: high
reported: 2026-09-04
closed_by: tests-node/exemptions.test.mjs (the check that found it) + tests/reentry-guard-2026-08-28.spec.js guard-shape
status_detail: "GUARDED 2026-09-04, same session it was found. A confirm() sitting AFTER three awaits cannot stop a second invocation already past them, so two taps could both run a body that DELETES every Week 2+ row before rebuilding it. Structurally verified (guard-shape asserts all 13 guarded names are genuinely wrapped) but NOT yet proven by a function-specific double-invoke test — see 'What is not yet proven'."
---

# `generatePhasePeriodization`'s confirm() is not a re-entry barrier, and the function deletes before it writes

Found by `tests-node/exemptions.test.mjs` **on its first run**, 2026-09-04 — the check written to close
[[2026-08-29-saveworkoutsession-is-double-pressable-and-my-exemption-was-wrong]]. Second false
exemption on that list, found the same way the first was: by checking a claim instead of reading it.

## The exemption said

    generatePhasePeriodization: 'confirm()-gated before any write — the dialog blocks re-entry'

**The literal words are true. The conclusion is false.** The `confirm()` genuinely does precede every
write. But it sits after **three awaits** (`app-programs.js:1766`):

```js
async function generatePhasePeriodization(phaseId, programId) {
  if (!(await _verifyPhaseOwnership(...)))              // await 1
  const { data: phase } = await db.from('program_phases')…   // await 2
  const { data: baseWorkouts } = await db.from('program_phase_workouts')…  // await 3
  if (!confirm(`Generate weeks 2–${…}? This deletes any existing Week 2+ content…`)) return
  await _cleanupPhaseWeeksBeyond(phaseId, 1, programId)   // DELETE
  …inserts…
}
```

A `confirm()` blocks the main thread **only once it opens**. Two rapid taps both clear the (entirely
asynchronous) preamble, both reach their own dialog, and accepting both runs the body twice. The dialog
is a barrier against a second *click*, never against a second *invocation already past the first await*.

## Why this is worse than a duplicate row

`_cleanupPhaseWeeksBeyond` **deletes** every `program_phase_workouts` row beyond week 1
(`app-programs.js:2015`), and the generation then rebuilds them. Two interleaved runs can therefore
**delete what the other has just inserted**, leaving a partially generated phase.

That is data loss, not a duplicate. It is reachable from a real button — the "Generate weeks" control
at `app-programs.js:1166` — on a coach's own programme.

## The sibling was checked, not assumed

`savePhase` (`app-programs.js:1572`) calls the same destructive `_cleanupPhaseWeeksBeyond`. It stays
exempt, deliberately: its call is **idempotent** — it trims rows beyond the phase's new duration, so
running it twice deletes the same rows twice and the second run is a no-op. The hazard here is
specifically the delete-then-rebuild interleaving, which `savePhase` does not do.
[[feedback_fix_the_class_not_the_instance]] — the class was enumerated, and one member genuinely did
not need the fix.

## Fixed

`guardReentry('generatePhasePeriodization')` added. The confirm-gated category on `FROZEN_UNGUARDED` is
now empty, with its comment kept as a warning: *"there is a confirm() somewhere in the body" is not a
re-entry barrier; only a confirm reached SYNCHRONOUSLY from the gesture is.*

## What is NOT yet proven, and should be

The guard is verified **structurally** — `tests-node/guard-shape.test.mjs` asserts all 13 guarded names
resolve to a real wrapper by their bare name — and the mechanism is verified generically by
`reentry-guard-2026-08-28.spec.js`. But **no test double-invokes THIS function** and asserts one
generation, the way `saveWorkoutSession` now has.

That is exactly the gap this row's predecessor was closed for, so it should not be left indefinitely.
It needs a real fixture: a programme, a phase of 2+ weeks with a `periodization_type`, and at least one
Week-1 session. Stated plainly rather than quietly skipped — see
[[feedback_reports_success_doing_nothing]].

**Closes when** a spec double-invokes `generatePhasePeriodization` and asserts exactly one set of
generated weeks, RED with the guard removed.
