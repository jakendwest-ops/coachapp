---
id: 2026-09-28-template-builder-edit-and-remove-buttons-squeeze-the-set-text
status: closed
priority: low
reported: 2026-09-28
closed_by: tests/template-exercise-card-actions-2026-09-29.spec.js
status_detail: "CLOSED 2026-09-29 on rule-(b) evidence, this row's own stated closing condition. The new spec's line-wrap check went RED against the unfixed markup (Range.getClientRects() found 2 distinct line tops for the exact string this doc quotes, at the real ~163px squeezed column width — confirmed against the live app, not just the test) and GREEN after the fix; reviewed (critic subagent, fresh context) with no blocking findings. Uncommitted-to-a-release until it ships."
---

# Template builder: the Edit and Remove buttons are too big and push the set text onto separate lines

## What Jake saw

On the template builder ("Upper Body"), each exercise card shows `Bench Press`, then `Set 1: 5–8 reps · RPE 8 · 2:00 rest`
and `Set 2: …`, with an **Edit** button and a red **Remove** button to the right. At phone width the two buttons leave the
text about 140px, so every set line wraps in the middle of "5–8 reps · RPE 8 · 2:00 rest" and each card grows to four or five
lines. His words: "edit and remove buttons are too big and force the text on the left to be on separate lines."

## Where

`js/app-workouts.js:1570-1571`, inside the card's flex row:

    <button class="btn-secondary" style="font-size:var(--text-md, 12px);padding:4px 10px" onclick="showEditTemplateExerciseModal(…)">Edit</button>
    <button class="btn-danger"    style="font-size:var(--text-md, 12px);padding:4px 10px" onclick="_stageRemoveExercise(…)">Remove</button>

Text buttons, side by side, in the same row as the up/down arrows, the number badge and the text column.

## Resolution (2026-09-29)

Jake was offered the icon-button direction below alongside a full-width-row alternative and picked words on their own
row ("Words on their own row (Recommended)"). Built as proposed: `js/app-workouts.js`'s `_renderTemplateExerciseList()`
now closes the card's top flex row after the number/name/set-text column (dropping the button `<div>` from that row
entirely) and opens a new sibling row below it, full card width, with Edit and Remove each `flex:1` — same idea as the
runner's bottom action bar. The set-text column now has the row's full width instead of sharing it with a ~130px
button pair, so nothing there wraps at 390px. Behaviour unchanged: both buttons still call the same
`showEditTemplateExerciseModal`/`_stageRemoveExercise` handlers, just relocated.

**Proposed direction not taken:** icon buttons (pencil, cross) of the same 32px size the runner uses for its
delete-set control. Left here for reference in case Jake wants tighter cards later — not pursued once the full-width
row was picked instead.

**Closes when** at a 390px viewport a two-set exercise card's set lines each fit on one line, shown by a spec that measures them.
