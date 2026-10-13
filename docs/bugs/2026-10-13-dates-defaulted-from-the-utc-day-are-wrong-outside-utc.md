---
id: 2026-10-13-dates-defaulted-from-the-utc-day-are-wrong-outside-utc
status: open
priority: medium
reported: 2026-10-13
status_detail: "OPEN. Found 2026-10-13 (not reported by Jake): 19 places in the app take 'today' from the UTC day (new Date().toISOString().split('T')[0]), so the default date is yesterday after local midnight in the UK summer (UTC+1) and tomorrow in the evening for anyone west of UTC. Proposed fix awaits Jake."
---

# "Today" taken from the UTC day: wrong for a day's worth of hours in every timezone but UTC

## How it was found

The first full-suite run of `v2026.10.2` failed two Library tests that build "today" this way (the run crossed local midnight in BST). The same expression is in the app itself.

## What the code does

`new Date().toISOString().split('T')[0]` is the UTC calendar date. The app shows and compares LOCAL dates everywhere else (`_ymdLocal`, `js/app-core.js`). 19 lines: `js/app-progress.js` (8: the weight form's default date, the 1RM date, the log-weight sheet), `js/app-runner.js` (4, including the **date a session is saved under**), `js/app-programs.js` (4, including the assign dialog's default start date) and `js/app-calendar-goals.js` (3).

## Who it hurts

- A UK user (BST, UTC+1): from 00:00 to 01:00 every default date is yesterday.
- A user west of UTC (the Americas): from their local evening (4 pm in New York in summer, 7 pm in Los Angeles) every default date is TOMORROW, so a session logged at 8 pm is dated the next day and the streak, week strip and "today" cards place it wrongly.
- Jake is in the UK, so he sees the first case rarely; the second would be a real problem for any client outside Europe.

## Proposed fix (not built)

Replace the 19 with `_ymdLocal(new Date())` (one helper, already in `app-core`), and make `checks.sh` refuse the expression in `js/` (a count ratchet pinned at 0). The 22 spec files that use it for fixtures are named in `docs/technical-debt.md`; they follow in a second pass.

## What would close it

**Closes when** Jake agrees the fix, it is built with a spec that fails without it (a pinned clock set to 00:30 in BST and to 20:00 in New York, asserting the default date and a saved session's date), and he confirms.
