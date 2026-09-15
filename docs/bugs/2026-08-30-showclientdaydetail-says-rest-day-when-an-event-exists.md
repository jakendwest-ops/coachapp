---
id: 2026-08-30-showclientdaydetail-says-rest-day-when-an-event-exists
status: open
priority: low
reported: 2026-08-30
status_detail: "Tapping a calendar day reads only window._calProgramWorkouts and renders 'Rest day' when no programmed session falls on it — even when a calendar EVENT exists on that same date. renderCalendar keeps events and programmed days in two separate maps and merges them only visually inside a grid cell, so the day modal sees half the picture."
---

# Tapping a calendar day says "Rest day" even when an event is booked that day

**js/app-calendar-goals.js:222** (`showClientDayDetail`), reading only `window._calProgramWorkouts`
at `:226`, with the "Rest day" copy at `:292-296`.

`renderCalendar` keeps **two separate maps** — `byDate` for events and `programWorkoutsByDate` for
sessions — and merges them only *visually*, inside one grid cell's template literal. The day modal reads
only the second one. So a day with a booked massage, a competition or a holiday and no programmed
session reports **"Rest day"**, contradicting the dot the user just tapped.

**The solo dashboard's "Next up" tile now does merge them** — `_soloUpcoming`
(`js/app-dashboard.js`) combines events and programmed days into one date-ordered timeline. So as of
2026-08-30 the app has one surface that merges correctly and one that does not, which is worse than two
that agree: the dashboard will list an event the day modal denies exists.

**Fix:** have `showClientDayDetail` read the events map too — or better, reuse `_soloUpcoming`'s
merge so there is one definition of "what is on this day". The pieces are now in place:
`_programWorkoutsByDate` was extracted the same day.

**Closes when:** a date carrying an event and no programmed session opens a day modal that names the
event and does NOT say "Rest day" — RED before the fix.
