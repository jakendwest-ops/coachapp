---
id: 2026-10-12-workouts-page-wants-a-ui-refresh-and-its-day-n-wording-counts-the-weekday-not-the-plan
status: confirmed
priority: low
reported: 2026-10-12
status_detail: "CONFIRMED by Jake 2026-10-17 on his phone (the phone-check checklist, item W2). FIXED 2026-10-12, released in v2026.10.2; awaits Jake on his phone. (a) Day headings read 'WEDNESDAY' with no 'DAY 3'. (b) The Workouts page refresh was built with Step 2 of the on-the-fly row. Tests: the solo Workouts page spec (tests/solo-workouts-page-2026-10-12.spec.js) and the day-heading specs."
---

# The Workouts page UI could do with updating, and "Day 3" is the day of the week, not the day of the plan

## Jake's report (verbatim, 2026-10-12)

> 4. The UI on this page could do with updating. Also, day 3 is day 3 of the week but not day 3 of the plan. We could probably drop this wording.

Attached: the Workouts page (hero "Up next · Wed 14 Oct, Heavy Lower Body", the Operation 240 > Mesocycle 1 list with "MONDAY · DAY 1", "WEDNESDAY · DAY 3", "FRIDAY · DAY 5", "SATURDAY · DAY 6").

## What the code does

`_dayHeadingLabel` (`js/app-programs.js:1020`) prints `${weekday} · DAY ${n}` where n is the stored `day_of_week` (Monday = 1). Both the client's Workouts page and the coach's Programs page use it. Jake asked for the weekday on 2026-09-28 (a bare "DAY 1 / DAY 3 / DAY 5" read as nonsense with the gaps); the number that remained is the weekday number, which reads as the Nth day of the plan. Dropping the suffix leaves "WEDNESDAY".

## Parts

- (a) Wording: print only the weekday; keep the bare "DAY n" fallback for a day past 7. One function, so both pages change together.
- (b) "Needs updating" is not yet a spec: which parts (the hero, the phase list, Recent sessions, the PT/Personal toggle sitting over the list)? A prototype and his reaction first.

## What would close it

**Closes when** Jake confirms on his phone that the day headings read right, and that the refreshed layout (once scoped and approved) is what he wanted.

## Decisions (Jake, 2026-10-12)

- (a) Drop the "DAY n" wording: approved and built.
- (b) The refresh should cover **the "Up next" hero card, the plan and day list, and Recent sessions**. The PT / Personal toggle was not selected.
- Method (his own rule): a tappable prototype first, in the app's tokens with example data, and his reaction before any real build.

## Prototype reaction (Jake, 2026-10-12; prototype https://claude.ai/artifact/2Qu78DKistXV61n1JhWStu)

The page order drawn in the prototype is right: start buttons, then "Up next" (only while a plan is on), then Your workouts, then Recent sessions. It is built as part of Step 2, with its plan in [the on-the-fly row](2026-10-12-scope-creating-a-workout-on-the-fly-and-renaming-programs-to-training-plans.md).

## Built (2026-10-12)

(a) shipped on master earlier the same day; (b) is the solo Workouts page of the on-the-fly row: start buttons first, then "Up next", the plan folded away, "Your workouts", Recent sessions.
