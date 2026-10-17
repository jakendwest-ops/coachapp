---
id: 2026-10-16-week-actions-should-sit-on-the-program-page-not-behind-the-three-dot-menu
status: confirmed
priority: medium
reported: 2026-10-16
status_detail: "CONFIRMED by Jake 2026-10-16 ('looks good!', in a clickable form after seeing it). Built in commit feca794 (on master, NOT yet released): Duplicate week and Delete week are two buttons under the week tabs; the week's three-dot menu is gone. Scope and placement were chosen by Jake in a clickable form (week only, row under the tabs). The phase card's own three-dot menu (Edit phase, Remove phase) is unchanged, by his choice. Ships with the next release."
---

# Program page: the week's actions should be on the page, not behind the three-dot (⋯) menu

## Jake's report (verbatim, 2026-10-16)

> buttons need to be moved from the ... and put directly on this screen

Attached: a screenshot of the program page at phone width, cropped to the right edge: an "Add periodization" button at the top, then the week row with the three-dot button (aria-label "Week actions", `onclick="openWeekMenu('<phaseId>')"`, class `pgm-ibtn`, inside `div.pgm-wk` in the phase's `phase-workouts-<phaseId>` block), a chevron below it, and "+ Add workout…" under that.

## What the code does

- `_renderPhaseBody` (`js/app-programs.js` ~1507-1524) paints the week row: the week tabs (when the phase has more than one week of sessions) and ONE `⋯` button (`aria-label="Week actions"`, `openWeekMenu(phaseId)`), then the active week's grid. `.pgm-wk` is a flex row (`css/main.css` ~1097); the tabs scroll sideways and the `⋯` is a 34px circle at the right edge.
- `openWeekMenu` (~1572) opens a bottom sheet titled "Week N" with exactly TWO actions: **Duplicate week** (`showDuplicateWeekModal`, the `#dup-week-modal` count picker) and **Delete week** (`deletePhaseWeek`, which already asks first through `#confirm-dialog`). A week with no workouts gets only the note "This week has no workouts yet. Add one first, then you can duplicate or delete the week."
- The sheet rows carry only a literal `kind`; which phase and week are kept in `window._pgmMenu` (so no id sits in a handler string), and `pgmMenuDo` re-checks that the phase is still on the page.
- SIBLING doing the same job: the phase card header's own `⋯` (`openPhaseMenu`, ~1448/1561) with **Edit phase** and **Remove phase**. Jake pointed at the week's; whether the phase's moves too is a question for him.
- **What changed (commit feca794):** `_renderPhaseBody` paints the tabs row only when there are tabs, then a `.pgm-wk-actions` strip from `_pgmWeekActionsHtml` (nothing for a week with no workouts); `_selectBuilderWeek` repaints it with the grid; `pgmWeekAction(phaseId, kind, week)` calls the existing `pgmMenuDo`, so the phase re-check and the ownership checks are unchanged. The week the button was PAINTED for is used, not `_builderActiveWeek` (a "Duplicate x N" run moves that early). `deletePhaseWeek` is now re-entry guarded, because on the page it can be tapped twice (the closing sheet used to prevent that). `openWeekMenu` is removed. On a phone the buttons are side by side and 44 px tall; on a desktop they keep their own width.
- **Proof:** 177 passed (18 specs that open the program page), 426 unit tests, 13 deliberate breakages each caught by a test, a three-angle review with no blocking finding (its fixes are in), and a look at a real plan at 480 px.
- **Named, not changed:** a week with no workouts no longer explains why it has no buttons ("+ Add workout…" is on the page); switching to an empty week moves the grid up about 60 px (only reachable when a tab exists for an empty week).
- Tests that named the week menu: `tests/program-page-rework-2026-10-04.spec.js` (5 tests, lines ~329-416: the sheet, Delete asks first, the week count updating, the empty-week note, the button hugging the right edge, Duplicate adding the new tab) and `tests/programs.spec.js` lines 51, 841, 974. They would change with the move.
