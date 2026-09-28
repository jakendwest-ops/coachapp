---
id: 2026-09-28-template-builder-edit-and-remove-buttons-squeeze-the-set-text
status: open
priority: low
reported: 2026-09-28
status_detail: "Reported by Jake from a phone screenshot of the template builder (item 1 of a second 2026-09-28 walkthrough note). Read but not yet reproduced or fixed. Cause is visible in the markup: the exercise row is one flex line and the two text buttons take about a third of its width."
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

## Proposed direction (not applied)

Icon buttons (pencil, cross) of the same 32px size the runner already uses for its delete-set control, each with an
`aria-label` ("Edit exercise", "Remove exercise"), so the text column gets back roughly 90px. Needs Jake's yes on icons over words.

**Closes when** at a 390px viewport a two-set exercise card's set lines each fit on one line, shown by a spec that measures them.
