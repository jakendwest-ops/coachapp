---
id: 2026-10-13-progress-page-needs-a-ui-rework-starting-with-the-body-weight-section
status: open
priority: medium
reported: 2026-10-13
status_detail: "OPEN. Scoped with Jake 2026-10-13 (clickable questions): the weight log form, the start/goal line and cards, and the dated list; then Personal Bests and Goals; and the unstyled form classes fixed everywhere (17 uses). Method: a tappable prototype and his reaction before any real build. Nothing built."
---

# My Progress: the Body Weight section needs a UI rework, and the whole page after it

## Jake's report (verbatim, 2026-10-13)

> the UI in this section needs a rework
>
> In fact, whole page needs a UI rework

Attached: My Progress > Body Weight with the "+ Log weight" form open (Date, Weight (kg), Body fat %, Resting HR, Notes: the labels butt against bare browser-default boxes of different widths, with no spacing), then "Start 114 kg > Goal 100 kg  Edit", three stat cards (Starting / Current / Change), the weight chart, and the dated list.

## What the code does

- `renderProgressWeight` (`js/app-progress.js`, near line 1772) builds the form with `class="form-label"` and `class="form-input"`. **Neither class has a rule in `css/main.css`, `index.html` or anywhere else** (the stylesheet defines `.field-label` and `.field-input`), so every one of those inputs is an unstyled native control. The same two classes are used on 17 lines: `js/app-progress.js` (5), `js/app-programs.js` (12, the plan create/edit and phase forms) and `js/app-core.js` (6).
- The page has four tabs (`Body Weight`, `Personal Bests`, `Performance`, `Goals`), each rendered by its own function in the same module.

## Parts

- (a) The weight form and its section: the form, the start/goal line, the three stat cards, the chart and the list.
- (b) The class-wide cause: the 17 uses of the unstyled form classes in three modules.
- (c) "The whole page": which of the other tabs, and what is wrong with them, is not yet said.

## What would close it

**Closes when** the scope is agreed with Jake (his method: a tappable prototype in the app's tokens with example data, and his reaction first), built with specs that fail without it, and he confirms on his phone.

## Decisions (Jake, 2026-10-13, from clickable questions)

1. **Body Weight, what is wrong:** the log form, the start/goal line and the three cards, and the dated list. **Not selected: the chart** (it stays as it is).
2. **Other tabs, in order:** Personal Bests, then Goals. Performance and the tab bar were not selected.
3. **The same fault everywhere:** give `form-input` and `form-label` real styles so all 17 uses (`app-progress` 5, `app-programs` 12, `app-core` 6) match the rest of the app; check each of those screens before and after.

## Plan to approve (not built)

- **Step 0, the class fix:** `.form-label` / `.form-input` in `css/main.css` on the existing `.field-label` / `.field-input` tokens (one rule set, not a second family); a before/after look at the three modules' forms (the weight form, the plan create/edit and phase forms, and the `app-core` ones) at 480px; a spec that every element carrying either class has a computed border, padding and width.
- **Step 1, a tappable prototype** (private Artifact, the app's tokens, his real-shaped example data) of: the Body Weight section (form, start/goal and cards, list), then Personal Bests, then Goals. His reaction before the real build.
- **Step 2, the build** per his reactions, tab by tab, each with specs and a mutation check; the chart code is not touched.

## Personal Bests (Jake, 2026-10-13, a second message and clickable questions)

> page needs UI rework. you should be able to click into an exercise and see exercise/personal best data for that exercise

Decisions:

1. **Tap a lift** and it opens **its own full page with Back** (like opening a plan), not a sheet.
2. The page shows **your best history** (every recorded best with its date, newest first, and a small chart of how it moved), **best sets by reps** (the heaviest weight actually lifted for 1, 3, 5, 8 and 10 reps, with the date, taken from logged sessions) and the **estimated 1RM trend** (what logged sets say the max is, over time). *Not selected: recent sessions.*
3. **Editing moves onto that page** ("Update best"); the list becomes clean rows (name, best, date) with no number boxes and no "Save all". `client_1rms` stays append-only (each update is a new dated row, so the history is the list).

Build notes (not yet checked in code): the numbers come from the shared exercise-stats engine behind the runner's Stats sheet and the Per-exercise cards (`_xsSessionMetrics`, `_xsRecords`, `js/app-progress.js`), so the page reuses it rather than adding a second set of rules; whether `_xsRecords` already yields best-by-rep-count is the first thing to read before the prototype. Add lift (a lift with no best yet) stays on the list.

## Progress (2026-10-13)

- **Step 0 done:** `.form-label` / `.form-input` now share the `.field-*` rules (selector lists in `css/main.css`). Test: `tests/form-classes-styled-2026-10-13.spec.js` (3; both aliases broken on purpose and caught). Checked on the weight form and the plan modal at 480px.
- **Step 1 prototype published** (private): https://claude.ai/artifact/AvgWLiWo4ogERWiRzJJomm . Body Weight (a goal card instead of the start/goal line and three cards; a log sheet with a stepper, the date, and body fat / resting HR / note folded away; the list grouped by month with the change since the last entry) and Personal Bests (clean rows, a lift page with best history, best sets by reps and estimated 1RM, and an Update best sheet). Goals is not drawn: it needs Jake's notes. Awaiting his reaction before Step 2.
