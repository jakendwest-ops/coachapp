---
id: 2026-10-13-progress-page-needs-a-ui-rework-starting-with-the-body-weight-section
status: open
priority: medium
reported: 2026-10-13
status_detail: "OPEN. Built 2026-10-13 and awaiting Jake on his phone: the form-class fix, the Body Weight section (goal card, log sheet, list by month) and Personal Bests (a row per lift, a page per lift). Goals is NOT built: it needs a prototype and his reaction (he said: cramped or cluttered, progress unclear, milestones clumsy). The row stays open until Goals is done."
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

## Body Weight, built (2026-10-13)

Jake's reactions to the prototype: the goal card, the log sheet and the lift page are right as drawn. Built and committed (`07dfa23`): one goal card, the log sheet (pre-filled with the last entry, stored kg verbatim when untouched, the LOCAL day as the date default, extras folded away), the list grouped by month. `tests/weight-section-2026-10-13.spec.js` (10), nine breakages caught. Not pushed yet.

## Personal Bests, build plan (2026-10-13)

- The grid of number boxes and "Save all" is **removed** (`saveOneRMGrid`, the row estimate and date boxes). The list is one row per lift (name, recorded date, change since the one before, the best) and each row opens that lift's page. Lifts with no best yet (the Big 5 not yet recorded) show "Record best".
- **The lift page** (full page, Back): the best and what it replaced; **best history** (a chart and the dated entries, each deletable with the existing `delete1RM`); **best sets by reps** (the heaviest set logged for at least 1, 3, 5, 8 and 10 reps, with its date: a 6 counts for the 5); **estimated 1RM** (one estimate per logged session from the shared stats engine `_xsSessionMetrics`, as a chart, against the recorded best).
- **Update best** is the existing Add 1RM sheet (type it or estimate it from a set, with a date), which appends a dated row to `client_1rms` (append-only, so the history is those rows). The weight is typed fresh, so the lb round-trip drift the grid guarded against cannot occur. The Big 5 library-id resolution the grid did moves into `save1RM`.
- The same renderer serves the coach's client-profile 1RMs tab, so a coach gets the lift page too.
- Specs that drove the grid (date-only edit drift, "Save all writes only changed rows", the per-row estimate box) are retired or ported to the sheet. Their intent that still matters is covered by new tests on `save1RM` (a lb value typed, the Big 5 id, append-only).

## Personal Bests, built (2026-10-13)

Built as planned: `renderClient1RMs` is a row per lift, `openLiftPage` / `renderLiftPage` the page (best, history chart and entries with delete, best sets by reps, estimated 1RM), `updateBest` / `recordBest` open the existing Add 1RM sheet, `save1RM` resolves the Big 5 library id and refuses a missing date. The grid (`saveOneRMGrid` and its helpers) is removed. `tests/personal-bests-2026-10-13.spec.js` (11), eight breakages caught; the specs that drove the grid were ported (date-only edit drift became an Update-best-in-pounds test; Save all became Update best writes one row). Found on the way: the app's late start-up navigation (`_navigateNow`) closes every open modal, which made modal tests flaky about one run in six; the specs now ignore that stray navigation. **Left, and named:** the Personal Bests tab also holds the "Log a PB / performance record" form and the cardio/other records below the lifts (not part of this rework); "best sets by reps" can show an outlier a person logged by mistake (Jake's Back Squat shows a 255 kg set on 2 Aug).

## Review (2026-10-13, three angles, diff mode)

No security or tenancy blocker. Real findings, all fixed and tested (each fix broken on purpose and caught): both goals set with nothing logged hid the goals editor behind a button that was not on the page; `save1RM` lost the re-entry guard `saveOneRMGrid` had (a double tap could create a Big 5 library exercise twice and throw on the vanished sheet); a lift page repainted for a write to a different client; the lift page tore down every chart on the page (the Performance records below it); the 1RM reads were not paged (the API caps a response at 200 rows without saying so); a change under a tenth read as "0.0 kg"; the sheet opened from a lift offered Change (which saved a different lift while the page repainted the first); out-of-range weights were accepted (the inputs' min/max do nothing without a form); the Body Weight chart labels read dates as UTC instants. **Known, left:** a lift's best sets are matched by the exact exercise name, so the Big 5 names (Bench Press, Barbell Row) do not meet the starter library's (Barbell Bench Press, Bent-Over Barbell Row): the page then says no weighted sets are logged under that name; two 1RM rows on the same date have no tie-break (I could not confirm a created_at column); the phone Back button leaves Progress rather than returning to the list.
