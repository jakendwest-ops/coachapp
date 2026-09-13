# Template builder: staged edits + explicit Save workout

**Date:** 2026-09-13
**Status:** Approved for planning
**Owner:** Jake (CoachApp)

## Why

Two related complaints, both about the same screen (`openTemplate`, `js/app-workouts.js`):

1. **2026-09-09 walkthrough (deferred as architectural):** the "update assigned copies?" /
   "apply to other sessions?" prompt chain fires after *every single edit* — add one exercise,
   answer the prompt; reorder, answer it again; edit another, answer it a third time. Reordering
   already partially fixed this for itself with a 1.5s debounce timer (`_reorderSettle`), but every
   other operation (add/edit/delete/rename) still interrupts immediately.
2. **2026-09-13 walkthrough:** "There should also be a clear 'Save workout' button so that the user
   does not need to click 'back to program' to save the changes" and "after a user has made
   changes to a workout and backs out ... they should be asked 'would you like to save your changes
   and update this program?'"

Both point at the same root cause: every exercise add/edit/delete/reorder/rename writes to the
database **the instant you do it**. There is no unsaved-changes state today — which is exactly why
there's nothing to gather up and ask about once. This spec introduces one: nothing in the editor
writes to the database until "Save workout" is tapped.

## Decisions already made (brainstorming session, 2026-09-13)

- **True staged changes**, not "keep auto-save, just delay the propagation prompt." Chosen over the
  smaller alternative explicitly, so the redesign has real teeth: the workout you're looking at is
  not the workout in the database until you Save.
- **Everything on the page stages** — add/edit/delete/reorder exercises, and the workout's own
  name/description (`showEditTemplateModal` → `saveEditTemplate`). The exercise-edit modal's own
  "Save" button becomes "stage this and close the modal," not "write to the database."
- **Leaving with unsaved changes always confirms** — never silent auto-save, never silent discard.
- **Approach: local draft + diffed batch commit** (over a wholesale delete-and-reinsert). A save
  replays a computed diff through the *existing*, already-ownership-checked write functions, so
  every exercise keeps its stable row id across a save. A delete-and-reinsert approach was
  considered and rejected: it would mint new ids for every exercise on every save, which breaks
  anything anchored to a stable exercise-row id (propagation's family-id matching in particular, and
  potentially set-history — needs confirming, see Open Questions).
- **Out of scope:** `deleteTemplate` (deleting the whole workout) stays its own immediate,
  already-`confirmDialog`-guarded action — it is not "several small edits," it's one terminal one.
  Starting the runner, Units, and the exercise picker itself are unaffected.

## Current architecture (verified against `js/app-workouts.js`, 2026-09-13)

Five write paths, each firing immediately on its own tap:

| Action | Function | Writes | Sets |
|---|---|---|---|
| Add exercise | `saveExerciseToTemplate(templateId)` | INSERT `workout_template_exercises` | `window._lastExerciseChange = {op:'add', matchName, row}` |
| Edit exercise | `saveEditTemplateExercise(texId, templateId)` | UPDATE `workout_template_exercises` | `{op:'update', matchName, row}` |
| Remove exercise | `deleteTemplateExercise(texId, templateId)` (called directly from the row's Remove button, or via the edit modal's own Remove) | DELETE `workout_template_exercises` | `{op:'delete', matchName, row:null}` |
| Reorder | `moveTemplateExercise(templateId, exId, dir)` | UPDATE `order_index` per swap, immediately, serialized via `_reorderChain` | `_scheduleReorderSettle` sets `{op:'reorder', names}` after a 1.5s debounce (`REORDER_SETTLE_DELAY_MS`) |
| Rename/describe | `saveEditTemplate(id)` | UPDATE `workout_templates.name/description` | `{op:'rename', name, description}` |

Every one of those (except the reorder debounce, which defers only the *propagation check*, not the
write) ends by calling `_afterTemplateExerciseSave(targetId)`, which repaints (`openTemplate`) and
immediately runs the propagation chain:

```
_afterTemplateExerciseSave
  -> _checkClientPlanPropagation      (#2: any REAL clients have this assigned? -> modal)
    -> _showClientCopyPropagateModal  ("Update assigned clients?")
    -> _continueAfterClientCopy       (button handler, applies via _applyChangeToTemplates)
  -> _checkSiblingPropagation         (#3: other sessions share this one's family_id? -> modal)
    -> _showPropagateModal            ("Apply to other sessions?")
    -> _applyToAllSessions            (button handler, applies via _applyChangeToTemplates)
-> _applyChangeToTemplates(change, ids)   dispatches by change.op to one of:
    _propagateExerciseChangeToTemplates / _propagateRenameToTemplates / _propagateReorderToTemplates
```

Everything downstream of `_afterTemplateExerciseSave` is keyed off **one** `window._lastExerciseChange`
object. That singular slot is the entire reason the prompt can only ever describe one change at a
time, and therefore can only ever fire once per edit.

`_templateGoBack()` (`js/app-workouts.js:1463`) is already the single exit point for this screen —
back button, and everything else routes through it (`ctx.backFn`, `openClientProgramsTab`, or
`navigate(ctx.backTo ...)`).

## New architecture

### The draft

`openTemplate(id, ctx)` builds `window._templateDraft` once the template loads:

```js
window._templateDraft = {
  templateId: id,
  ctx,                                    // same shape as window._templateCtx today
  meta: { name: t.name, description: t.description },
  metaBaseline: { name: t.name, description: t.description },
  exercises: [ ...draftRows ],            // current, editable order and content
  exercisesBaseline: [ ...originalRows ], // exactly what openTemplate fetched, untouched
}
```

Each draft exercise row carries:
- `_draftKey` — a stable local id (e.g. `crypto.randomUUID()` or an incrementing counter), used for
  React-less DOM diffing purposes (matching a row across re-renders) and never sent to the database.
- `id` — the real `workout_template_exercises.id` for a pre-existing row, or `null` for one added
  this visit.
- every field `saveExerciseToTemplate`/`saveEditTemplateExercise` already write
  (`exercise_id, exercise_name, exercise_type, metric_type, order_index, sets, sets_json, notes,
  superset_group`).

`window._templateDraft` replaces `window._openTemplateId` as the render's source of truth for the
exercise list. `_openTemplateId` itself stays — other code reads it for "which template is on
screen" — but the ONE thing it exists for today besides that (`openTemplate`'s check for a pending
reorder-settle timer belonging to a *different* template, so leaving mid-burst doesn't repaint a
stale "update the copies?" modal over the wrong screen) goes away along with the settle subsystem
itself — see "Reorder simplifies" below.

### Staged mutators

Each of the five actions gets a version that touches only the draft:

| Today | Becomes |
|---|---|
| `saveExerciseToTemplate` | `_stageAddExercise()` — reads the modal's picked exercise + set data (same `flushTemplateSets`/`_cleanTemplateSets` prep as today), pushes a new row (`id: null`) onto `_templateDraft.exercises`, closes the modal, re-renders the list from the draft |
| `saveEditTemplateExercise` | `_stageEditExercise(draftKey)` — same set-data prep, replaces the matching draft row's fields in place |
| `deleteTemplateExercise` | `_stageRemoveExercise(draftKey)` — removes the row from `_templateDraft.exercises` (no `confirmDialog` needed at this step anymore — see "Confirm dialogs that move" below) |
| `moveTemplateExercise` | `_stageReorderExercise(draftKey, dir)` — swaps two entries in `_templateDraft.exercises`, re-renders |
| `saveEditTemplate` | `_stageRenameTemplate()` — writes into `_templateDraft.meta`, re-renders the header |

None of these call the database, `_afterTemplateExerciseSave`, or any propagation check. All of them
call one shared `_markTemplateDraftDirty()` / re-render step, and the page header shows "Save
workout" (disabled/hidden, or just inert with no unsaved changes — exact visual state is an
implementation-time call) only when `_templateDraftIsDirty()` is true.

**Reorder simplifies.** The entire debounce subsystem (`REORDER_SETTLE_DELAY_MS`, `_reorderSettle`,
`_scheduleReorderSettle`, `_cancelReorderSettle`, `_reorderChain`) exists ONLY to serialize and
debounce *database writes* that no longer happen during editing. Reordering an in-memory array has
no write race to guard and nothing to debounce — `_stageReorderExercise` is a synchronous array swap
plus a re-render. This whole subsystem is deleted, not adapted.

**Confirm dialogs that move.** `deleteTemplateExercise`'s current behavior has no confirm at the
list-row level (added 2026-09-11) but the edit-modal's OWN Remove button also calls it directly,
unguarded, on purpose (documented as "modal-only path had no confirmation and stays that way — out
of scope"). Under staging, removing a row is no longer a database delete — it's removing a row from
the draft, fully undoable (edit it back, or Discard the whole visit). Whether a stage-remove still
warrants its own confirm, given "Discard" now exists as a bigger undo, is an open call for
implementation — leaning toward: drop the per-row confirm, since Discard already covers "I didn't
mean to change any of this."

### Save workout

A new `saveTemplateDraft()`:

1. If `!_templateDraftIsDirty()`, no-op (or the button simply isn't actionable).
2. **Diff** `_templateDraft.exercises` against `_templateDraft.exercisesBaseline`, keyed by `id`:
   - baseline rows whose `id` is missing from the draft → queue a delete
   - draft rows with `id === null` → queue an insert
   - draft rows whose `id` matches a baseline row but whose fields differ → queue an update
   - if the surviving rows' final order (by id) differs from baseline order → queue one reorder,
     carrying the WHOLE final order (matching how reorder propagation already treats it — see
     `_scheduleReorderSettle`'s `names` list today). This is not a diff of individual swaps; the
     replay step writes every reordered row's final `order_index` directly, since there's no
     per-tap write to keep small once it's all happening in one batch
   - `_templateDraft.meta` vs `metaBaseline` → queue a rename, if different
3. **Replay**, in a fixed order (deletes, then updates, then inserts, then reorder, then rename) —
   each queued item calls into the *existing* write logic (the ownership-check-and-write portion of
   `deleteTemplateExercise`/`saveEditTemplateExercise`/the insert body/a reorder write/`saveEditTemplate`,
   factored out from their current modal/DOM-reading responsibilities so the same core write can be
   called from staged data instead of live form fields).
4. **Stop at the first failure.** See "Partial-failure recovery" below.
5. On full success: collect every queued item into one array, `window._lastExerciseChanges` (plural
   — replaces the singular `window._lastExerciseChange` everywhere), and run the propagation chain
   **once** against that array.
6. Reset `_templateDraft` (`exercisesBaseline := exercises`, `metaBaseline := meta`) so the screen is
   clean, and repaint.

### Propagation chain: singular → plural

`_checkClientPlanPropagation`/`_checkSiblingPropagation` change their `changeOverride` parameter to
`changesOverride` (an array). `_applyChangeToTemplates(change, ids)` is unchanged — it already
dispatches by `change.op` for one change — the call site simply loops the array and sums failures,
rather than `_applyChangeToTemplates` growing a plural twin.

The modal copy (`_propagateModalHtml`, `_showClientCopyPropagateModal`) generalizes from "the
exercise you changed" / "only the ORDER changes" (singular, op-specific) to a short bulleted summary
built from the array, e.g.:

> 3 changes: Bench Press updated · Row removed · reordered

with the existing per-op detail line kept ONLY when the array holds exactly one change (so the
existing, already-reviewed-for-honesty single-change wording is preserved in the common case of one
edit before Save — a coach who adds one exercise and saves immediately still sees today's exact
sentence).

### Leaving with unsaved changes

`_templateGoBack()` gains one guard at its very top, before anything else it does today:

```js
function _templateGoBack() {
  if (_templateDraftIsDirty()) { _confirmLeaveTemplateDraft(); return }
  // ...unchanged from here
}
```

`_confirmLeaveTemplateDraft()` shows a three-way choice (using the existing `confirmDialog()`
primitive needs a third button — `confirmDialog` today is strictly yes/no; this needs either a small
extension to support a third, non-danger "Save" action alongside Confirm/Cancel, or a small
one-off modal reusing the same visual language). Options:
- **Save workout** — runs `saveTemplateDraft()`, then (once any propagation prompts are answered)
  calls the real `_templateGoBack()` logic to actually leave.
- **Discard changes** — resets `_templateDraft` to its baseline, then calls the real
  `_templateGoBack()` logic.
- **Keep editing** — dismisses, does nothing else.

Any other exit route from this screen (a nav-bar tap, switching clients) needs auditing during
planning to confirm it also passes through `_templateGoBack()` and not some other path that would
bypass this guard.

### Partial-failure recovery

A save's replay is not one atomic transaction — five separate writes in sequence. If write #3 of 5
fails (dropped connection, an ownership edge case surfacing only now):

1. Stop immediately — do not attempt #4 and #5.
2. Re-fetch the template fresh from the database (truth, not a guess).
3. Rebuild `_templateDraft` from that real state, but re-apply the *still-unsaved* remainder (the
   changes that hadn't been reached yet, plus the one that failed) on top of it — so the user's
   in-progress work for those specific changes isn't lost, only the successfully-applied ones are
   folded into the new baseline.
4. Tell the user plainly which changes landed and which didn't (e.g. "2 of 5 changes saved — Row
   removed and reordered didn't go through. Try Save again?").
5. Leave the retry-ready draft in place; tapping Save again only replays the remainder, never
   re-applies what already committed.

## Database changes

**None.** No schema change, no migration. This is a client-side state redesign — the same rows, the
same columns, just written in a batch instead of one at a time.

## Test impact

All 5 files flagged at the 2026-09-09 deferral are affected, at different depths:

- **`propagation-honesty-2026-09-06.spec.js`** — heaviest. Almost certainly asserts the exact
  wording of today's single-change modal copy; that copy is generalized to a change-list summary.
  Needs a real rewrite, not a patch.
- **`session-identity-2026-08-14.spec.js`** — drives the exercise-edit modal's real Save/Apply
  buttons and checks database state; needs a Save-workout step inserted before those checks fire,
  since the modal's own Save now stages rather than writes.
- **`programs.spec.js`, `personal-programs.spec.js`** — anywhere they add/edit/reorder a template
  exercise and check the database immediately after need the same Save-workout step inserted.
- **`ledger-fixes-2026-07-23.spec.js`** — flagged from memory, not yet re-confirmed against current
  content; first task in the implementation plan is reading it fresh to determine actual scope.

New tests needed (implementation-planning to enumerate precisely):
- The draft never writes to the database until Save (a spec that adds/edits/reorders, then asserts
  zero database change, then Saves, then asserts the database matches).
- Discard truly discards (make changes, Discard, database still matches original).
- Leaving via `_templateGoBack()` with a dirty draft shows the three-way prompt; each of the three
  choices does what it says.
- A multi-change Save produces one combined propagation prompt describing every change, not one
  prompt per change.
- Partial-failure recovery: simulate a write failing partway through a batch, confirm the successful
  ones aren't re-applied on retry and the failed ones are.
- Reorder's old debounce-specific tests are removed along with the subsystem; confirm none of them
  are secretly covering something else first.

## Open questions (for implementation planning, not blocking this spec's approval)

1. Does anything else (set-history charting, a report) key off `workout_template_exercises.id`
   staying stable across an edit, beyond propagation's family-matching? If the diffed-replay
   approach is right, this matters less (ids stay stable either way) — noted here mainly because it
   was the reasoning for rejecting the delete-and-reinsert alternative, and should be confirmed
   rather than assumed.
2. Exact visual treatment of the "Save workout" button when there's nothing to save (hidden vs.
   disabled vs. always present) — a UI-polish call better made with the actual screen in front of us
   during implementation than pre-decided here.
3. `confirmDialog()`'s current shape is yes/no; the three-way leave-prompt needs either a small
   extension or its own one-off modal. Worth deciding in the plan, not the spec.
4. Whether the per-row "Remove" confirm (added 2026-09-11) still earns its keep once Discard exists
   as a bigger undo — leaning toward dropping it (see "Confirm dialogs that move" above), final call
   at implementation time.

## Rollback

Nothing here is irreversible or migrates data. Reverting to auto-save is a code revert, same as any
other release.
