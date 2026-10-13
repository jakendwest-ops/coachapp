---
id: 2026-10-13-progress-page-needs-a-ui-rework-starting-with-the-body-weight-section
status: open
priority: medium
reported: 2026-10-13
status_detail: "OPEN. Reported by Jake 2026-10-13 against v2026.10.2: the Body Weight section of My Progress needs a UI rework, and then the whole page. Scoping; nothing built. Root cause of the weight form's look found: its two form classes have no CSS rule anywhere."
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
