---
id: 2026-10-12-workouts-page-wants-a-ui-refresh-and-its-day-n-wording-counts-the-weekday-not-the-plan
status: open
priority: low
reported: 2026-10-12
status_detail: "OPEN. Reported by Jake 2026-10-12. Two parts: (a) drop the 'DAY N' wording, a one-line change in _dayHeadingLabel that is waiting for his go; (b) 'the UI on this page could do with updating' is design work, to be scoped with him and shown as a prototype first. Nothing built."
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
