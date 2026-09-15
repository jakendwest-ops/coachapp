---
id: 2026-08-22-resolveeditabletemplateid-writes-before-the-ownership-check
status: confirmed
priority: medium
reported: 2026-08-22
closed_by: "clause (b) 2026-08-22. Gate placed INSIDE _resolveEditableTemplateId, immediately after tmpl is fetched and before any write — not at the call sites. The row said four callers; a grep found SIX (moveTemplateExercise, showAddExerciseToTemplateModal, saveExerciseToTemplate, saveEditTemplateExercise, deleteTemplateExercise, saveEditTemplate), which is itself why the guard belongs in the helper: six call sites is six chances to miss one. Free — tmpl is already fetched, so it is a field comparison, not a round-trip. app-workouts v75->v76. NEW TEST: ownership-anchors-2026-08-21.spec.js '_resolveEditableTemplateId refuses to fork a template owned by another coach', asserting the clone is never ATTEMPTED (a refusal that still clones has prevented nothing — the orphan is the damage). Red-before proven by neutering the gate. Legitimate forking verified intact: programs.spec.js 'editing a workout assigned to two slots forks a copy' still passes. One fixture updated — silent-refusal-2026-08-18.spec.js:160 stubbed coach_id 'COACH-1', which the new gate refuses, so the repoint path became unreachable; stub and its assertion both moved to currentUser.id together, keeping the ownership-anchor assertion intact. 45 affected-spec tests pass; checks.sh green."
status_detail: "Found by multi-agent-review (Agent C, then Agent A independently) 2026-08-22. PRE-EXISTING convention across all four sibling call sites, not introduced by the 2026-08-21/22 guards — but those guards are what now documents the ordering as 'verified', which is the part that makes it worth fixing."
---

# `_resolveEditableTemplateId` inserts and repoints BEFORE `_verifyTemplateOwnership` runs

All four template write paths share this ordering (`js/app-workouts.js`):

```js
const { templateId: targetId } = await _resolveEditableTemplateId(templateId, exId)   // <- writes
const coachId = await _resolveTemplateOwnerCoachId()
if (!(await _verifyTemplateOwnership(targetId, coachId))) { ...refuse... }            // <- verifies
```

Sites: `moveTemplateExercise` and `saveExerciseToTemplate` (guards added 2026-08-22), plus the two
pre-existing `saveEditTemplateExercise` and `deleteTemplateExercise`.

## The problem

`_resolveEditableTemplateId` is not a resolver. On the shared-slot path it:

1. **inserts a cloned `workout_templates` row plus its exercises** (`_cloneSharedMasterTemplate`), and
2. **updates `program_phase_workouts` by id alone**, keyed on `window._templateCtx.phaseWorkoutId` —
   a window global.

So an unverified `templateId` can produce a clone and a slot repoint *before* the ownership check ever
runs, and the guard's `return` leaves the clone behind as orphaned debris.

## Why it is not currently exploitable

The clone is inserted carrying the **source template's own `coach_id`** (`tmpl.coach_id`), so RLS
refuses it for a foreign template and the function falls back safely. Confirmed by reading the clone
path, not by probe.

## Why it is still worth fixing

Two reasons:

1. **The guards I added on 2026-08-22 are what now makes this ordering read as deliberate.** A future
   reader sees `_verifyTemplateOwnership` in the function and reasonably assumes nothing wrote before
   it. That is the same "reads as anchored when it is not" trap as
   `2026-08-22-guard-verifies-one-id-while-the-write-keys-on-another`.
2. It depends on RLS for a *write ordering* property, in a codebase whose stated premise for this whole
   commit family is app-level defence that does not assume RLS.

## Fix direction

Verify the ORIGINAL `templateId` before calling `_resolveEditableTemplateId`, then verify the resolved
`targetId` after (the fork may legitimately produce a new row we also own). Two calls, both cheap. Do
all four sites together — this is a class, and the last three attempts at this class each missed
members.

**Closes when:** all four sites verify before the resolve, and a test proves an unverified templateId
produces no clone row — red before, green after.
