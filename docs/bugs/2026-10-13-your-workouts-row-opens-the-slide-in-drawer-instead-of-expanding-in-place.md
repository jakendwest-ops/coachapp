---
id: 2026-10-13-your-workouts-row-opens-the-slide-in-drawer-instead-of-expanding-in-place
status: confirmed
priority: low
reported: 2026-10-13
status_detail: "CONFIRMED by Jake 2026-10-17 on his phone (the phone-check checklist, item W3). FIXED 2026-10-13, on master (not yet in a release); awaits Jake on his phone. A Your workouts row now expands and collapses in place (the name area or the chevron), showing the same exercise block as a plan day; no drawer. Test: tests/solo-workouts-page-2026-10-12.spec.js (expand test; four breakages caught)."
---

# Your workouts: a tapped row opens the slide-in drawer, not an in-place expansion

## Jake's report (verbatim, 2026-10-13)

> clicking a workout shouldnt open the slider, it should open the workout as collapsible (as shown in the 2nd screenshot)

Attached: the Your workouts list (rows "Heavy Press / Light Bench", "Heavy Upper Body"), the slide-in drawer a tap opens (the exercises with Set 1, Set 2 and rest), and the plan's Monday day expanded in place (exercise names, set counts, "3 × 4 reps · RPE 7 · 2:00 rest", a Start button).

## What the code does

`_yourWorkoutsHtml` (`js/app-workouts.js`) gives each row `onclick="openSessionDetail(id, name)"`, the slide-in drawer (it has an Edit button). A plan's day list expands in place (`toggleClientPhase`), with the grey exercise block rendered inline in `renderDays`.

## What would close it

**Closes when** a row expands and collapses in place, showing the same exercise block as a plan day, with no drawer, and Jake confirms on his phone. A test that fails without it: tapping a row shows the exercises inline and opens no `#session-detail-panel`.

## Built (2026-10-13)

The row is a card: tapping its name or chevron opens the exercises (name, set count, prescription) under it, tapping again closes it; Start stays on the row. The exercise block is one shared helper (`_wkExerciseBlockHtml`) used by the plan's day list too, so the two cannot drift. A saved workout with no per-set prescription shows its set count from the `sets` column. Three reviewers (diff mode) found nothing blocking; their notes were applied. **Left, and named:** (1) the drawer's Edit button is no longer reachable from Your workouts (a "Made by you" workout is edited from the Library; a "From a plan" copy only from Training plans); (2) two more hand-written copies of the same exercise block remain, at `js/app-programs.js` (the coach's client plan view, byte-identical) and `js/app-calendar-goals.js` (the calendar day sheet, a look-alike).
