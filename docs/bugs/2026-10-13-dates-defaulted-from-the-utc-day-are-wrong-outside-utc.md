---
id: 2026-10-13-dates-defaulted-from-the-utc-day-are-wrong-outside-utc
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-13
status_detail: "FIXED 2026-10-17 and released in v2026.10.5, after Jake said to work on the fixes. All 13 places that took today from the UTC day now use _ymdLocal(new Date()) (the weight, PB, log-session, add-event and add-to-plan forms, the session date, the three 1RM saves, a plan block's end date, the data download name); 48 spec fixtures moved to the local date too. tests/local-today-2026-10-17.spec.js pins the clock to 00:30 in London and 20:30 in New York and fails when any one of the 13 is put back (each tried alone); three count ratchets keep it out (including the display twin: six screens that showed a stored date a day early west of UTC now use _dateOnly). The review also found two SQL leftovers (the coach summary view's UTC cap and the plan-restart function), both fixed and applied, see 2026-10-17-server-side-today-still-uses-the-utc-day. NOT tested: a real phone, or a session saved for real across midnight. Closes when Jake confirms."
---

# "Today" taken from the UTC day: wrong for a day's worth of hours in every timezone but UTC

## How it was found

The first full-suite run of `v2026.10.2` failed two Library tests that build "today" this way (the run crossed local midnight in BST). The same expression is in the app itself.

## What the code does

`new Date().toISOString().split('T')[0]` is the UTC calendar date. The app shows and compares LOCAL dates everywhere else (`_ymdLocal`, `js/app-core.js`). 13 real sites (the first count of 19 included full timestamps): `js/app-progress.js` (3: the weight and PB forms, the data download name), `js/app-runner.js` (4, including the **date a session is saved under**), `js/app-programs.js` (4, including the assign dialog's default start date) and `js/app-calendar-goals.js` (2).

## Who it hurts

- A UK user (BST, UTC+1): from 00:00 to 01:00 every default date is yesterday.
- A user west of UTC (the Americas): from their local evening (4 pm in New York in summer, 7 pm in Los Angeles) every default date is TOMORROW, so a session logged at 8 pm is dated the next day and the streak, week strip and "today" cards place it wrongly.
- Jake is in the UK, so he sees the first case rarely; the second would be a real problem for any client outside Europe.

## Fix (built 2026-10-17)

All 13 now use `_ymdLocal(new Date())`; two count ratchets (js at 0, tests at 8) keep the expression out; 48 spec fixtures moved to the local date. The multi-agent review (3 angles, no blockers) found three more things, handled as follows. **Fixed:** six screens that format a stored date (`new Date('2026-07-15')` is UTC midnight, so west of UTC they showed the day before, and a New York evening session had only looked right because it used to be stamped with the UTC day) now go through `_dateOnly()` in `app-core`, with a third ratchet at 0. **Fixed the same day with SQL Jake ran, see [2026-10-17-server-side-today-still-uses-the-utc-day](2026-10-17-server-side-today-still-uses-the-utc-day.md):** the coach summary view caps at the UTC day, and the plan-restart function stamps `current_date`. **Left, named:** `created_at.split('T')[0]` as a block-start fallback when `start_date` is null (app-progress.js, two lines), and the dev seed script `scripts/seed-test-data.js`.

## What would close it

**Closes when** Jake agrees the fix, it is built with a spec that fails without it (a pinned clock set to 00:30 in BST and to 20:00 in New York, asserting the default date and a saved session's date), and he confirms.
