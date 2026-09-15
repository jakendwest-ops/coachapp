---
id: 2026-08-14-session-edits-are-not-propagated-to-duplicated-sessions
status: fixed-awaiting-jake
priority: high
status_detail: "All 4 causes resolved. Clause (b) satisfied 2026-08-26 by an END-TO-END red-green test on the real path (real generator + real modal + real clicks). Jake’s live confirmation is now corroboration, not the only evidence."
reported: 2026-08-14
---

# Editing a session in a programme never offers to update its duplicates

**Jake, 2026-08-14, verbatim:** *"When adding amending/updating a session within a program (this includes
changing an exercise or chaning the session name) when I click 'Save' or 'Save edits' I should be asked
whether I want to update all duplicated sessions with the same edits. Currently I am not asked and I have
to go and make these edits 1 by 1."*

A propagation system ALREADY EXISTS (`_checkSiblingPropagation`, `_applyToAllSessions`,
`window._propagateTargets`, the `propagate-modal`). It is not firing for him. Four confirmed causes, each
independently sufficient:

1. **Renaming a session is not wired to propagation at all.** `saveEditTemplate` (`js/app-workouts.js:2565`)
   never sets `window._lastExerciseChange` and never calls `_afterTemplateExerciseSave`. Matches his words
   exactly — *"this includes… changing the session name"*.
2. **Reordering exercises isn't either** — `moveTemplateExercise` (`js/app-workouts.js:1261`), same shape.
3. **Periodization clones defeat the matcher.** `generatePhasePeriodization` names week 2+ copies
   `` `${tmpl.name} — W${week}` `` (`js/app-programs.js:1547`), and `_checkSiblingPropagation` matches on
   EXACT name equality (`js/app-workouts.js:2312`). `"X"` never equals `"X — W2"`, so for any phase built
   with "Generate weeks" the prompt is **structurally impossible**, for any edit, ever. The read-only
   Workouts page already strips that suffix cosmetically (`js/app-workouts.js:641`), so the failure is
   invisible from the UI.
4. **Editing from Library drops the programme context** the prompt requires — `openTemplate('${t.id}')`
   with `ctx = {}` (`js/app-workouts.js:788`) vs the `ctx.programId` gate at `:2302`.

Also: `_propagateTargets` maps one id per SLOT (`js/app-programs.js:2318`), so "3 other sessions" can mean
3 slots sharing 1 template, and `_propagateExerciseChangeToTemplates` writes the same target 3×.

**Root cause shared with [[2026-07-22-rows-now-carry-used-in-phase-wk-n-mon-vs-not-used-yet-plus-t]]:**
the app has no concept of "these template rows are the same session". It infers it from a name string in
one place and ignores names entirely in the other.

**Decision (Jake, 2026-08-14):** fix with a real identity column (`family_id`), not smarter name-matching.
Scope of "update all" is **the same programme only** — never a client's live assigned plan, which keeps
its own existing prompt.

**Planned session 2 of 3.** Ships together with the picker fix; both depend on the same migration.

**PARTIAL — cause 1 of 4 is closed, 2026-08-18.** `saveEditTemplate` now sets
`window._lastExerciseChange = { op: 'rename', … }` and calls `_afterTemplateExerciseSave`
(`js/app-workouts.js:2791`), so renaming IS wired to propagation. Verified in shipped code during /save.

**Cause 2 is NOT fixed** — `moveTemplateExercise` still never sets `_lastExerciseChange` nor calls
`_afterTemplateExerciseSave` (grep returns 0 matches in its body). Causes 3 and 4 not re-checked.

Deliberately left `open` rather than restatused: the closure condition below is explicit and none of it has
happened. Recorded here so the next session does not re-derive cause 1 from scratch — that near-miss is why
this note exists.

**CAUSE 2 CLOSED 2026-08-19 (`7f66634`).** Reordering now captures a `reorder` change and hands off to
`_afterTemplateExerciseSave`, so the prompt fires. The hard part was not the wiring but the permutation: a
sibling copy legitimately holds a DIFFERENT SET of exercises, so copying order_index values across would
collide with, or displace, exercises the target has and the source does not.
`_propagateReorderToTemplates` permutes only the SHARED names, into the source's relative order, reusing the
slots they already occupy — so a collision is impossible by construction. 7 red-before tests.

**Still open: causes 3 and 4.** Periodization clones defeating the name matcher, and editing from Library
dropping programme context. Neither re-checked. Row stays `open`.

**CAUSES 3 AND 4 RE-CHECKED 2026-08-26 — both resolved. Row stays `open` for Jake only.**

- **Cause 3 is FIXED.** `_checkSiblingPropagation` matches on `family_id`, not name — verified in the
  QUERY, not just the comment claiming it: it selects `workout_templates(id, name, family_id)` and
  filters `r.workout_templates?.family_id === fam`. `generatePhasePeriodization` carries
  `family_id: tmpl.family_id ?? null` onto every week clone (`js/app-programs.js:1777`), so the
  `— W2` rename can no longer break the link. Covered by `session-identity-2026-08-14.spec.js`:
  *“generated week clones inherit the base session’s family_id”*, which asserts the clones ARE renamed
  so identity provably cannot be coming from the name.

- **Cause 4 was a FALSE PREMISE.** The Library list is filtered
  `.is(‘client_id’,null).is(‘program_id’,null).is(‘generated_from_phase_id’,null)`
  (`js/app-workouts.js:826`) and its own empty state reads *“No standalone templates”*. It shows only
  templates that belong to NO programme, so there are no programme siblings to offer. Passing no ctx at
  `:837` is correct behaviour, not a dropped context. Jake’s scope decision (“same programme only”) makes
  the empty set the right answer here.

- **All five change ops are wired AND handled:** `add`/`delete`/`update` (`js/app-workouts.js:2255-2263`),
  `rename` (`:2603`), `reorder` (`:2604`).

- **Every change shape named in the closure condition has a test, and all are GREEN today**
  (34 passed, 2.7m, 2026-08-26): exercise edit — `programs.spec.js:594` + `:686`; rename —
  `session-identity-2026-08-14.spec.js:52`; reorder — `reorder-propagation-2026-08-19.spec.js` (7).

**TESTED END TO END 2026-08-26 — Jake: “you need to test this”. He was right.**

I had verified the code and the two existing tests, then handed the actual verification to him. That was
wrong twice over. **The two existing tests each cover only HALF of his scenario, and nothing joined them:**

- `generated week clones inherit the base session’s family_id` runs the REAL generator — but never renames.
- `renaming a session offers to rename its copies` renames — but **hand-sets `family_id` on its fixture**
  and calls `saveEditTemplate()` against **stubbed DOM** (`mk(‘et-name’)`, `mk(‘edit-template-modal’)`).

So “real generator produces the clones, THEN renaming the base offers the prompt” — literally what Jake
does — was never asserted. Two green halves are not a green whole; that is the “adjacent flow” the closure
rule explicitly refuses as evidence, and I was about to offer it as evidence.

**New test:** `session-identity-2026-08-14.spec.js` → *“END TO END: real generated weeks, then a real
rename click, offers the real prompt”*. No stubs — real `generatePhasePeriodization`, real `openTemplate`
(the way `app-programs.js:2150` enters the editor, which is what sets `_templateCtx`), real
`showEditTemplateModal` DOM, real Playwright clicks on the real Save and Apply buttons.

**RED→GREEN, both directions run:**
- GREEN as shipped: passes in 15.1s.
- RED with `family_id: tmpl.family_id ?? null` neutered at the clone site: **fails on Jake’s exact
  symptom** — `#propagate-modal` never appears (15s timeout), exit 1. Restore verified byte-identical.
- The neuter matched **2 sites** (`app-programs.js:470` client clone, `:1777` periodization week), so the
  identity is carried at both clone paths, not one.
- Full set green afterwards: **35 passed** (session-identity + reorder-propagation + programs).

**Status → `fixed-awaiting-jake`.** Clause (b) is now genuinely satisfied for the scenario, so Jake’s live
check is corroboration rather than the only evidence. Still not `confirmed`: the row’s own closure
condition names his live pass as well, and relaxing a condition I wrote because I met the easier half of
it is precisely the goalpost-move the rule exists to stop.
**Closes when:** Jake renames a session in a periodized phase and is offered — and takes — the propagation
prompt, plus a red→green test per change shape (rename, reorder, exercise edit).
