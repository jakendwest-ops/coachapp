---
id: 2026-11-16-new-workout-cannot-be-scheduled-or-seen-on-dashboard
status: fixed-awaiting-jake
priority: high
reported: 2026-11-16
status_detail: "open - REPORTED by Jake 2026-11-16, found on LIVE by a user: they created a workout to use in the gym today, but there is no way to add it to a calendar and it does not show on their dashboard. Filed before investigation (intake rule). INVESTIGATED 2026-11-16 (code + live columns, read-only): a feature gap, not a regression. The calendar and the dashboard show only (a) the sessions of an assigned plan and (b) calendar events; an events row has NO workout link (columns: id, client_id, created_by, title, date, type, notes, is_pt_assigned, created_at - measured), so '+ Add event' can only put a text title on a day. Nothing in the app puts a single library workout on a date. Today's only route is dashboard Rest day -> 'Train anyway' (Personal view) -> pick it, which starts it but never schedules it. Fix needs Jake's design choice + approval (likely a schema change). DESIGN approved by Jake 2026-11-16 (tappable prototype; Personal view only; schedule from the workout and from a day; a skipped one is missed like a plan session; stored as events.template_id; '+ Add a workout' replaces 'Train anyway'), BUILD approved 2026-11-16. BUILT 2026-11-16: scripts/add-event-workout-link-2026-11-16.sql (verified on PGlite 38/38, 15 mutations caught), _scheduledByDate/_mergePlanned feed Today, the week strip, the calendar and missed. multi-agent-review: no blocking; fixed before commit - guard tightened to Personal-library workouts only (no plan session, generated or coach-view workout) and created_by = caller, Remove double-tap, the add sheet closing the day sheet before its read, 'View plan' offered with no plan, a stray AM label. SQL APPLIED LIVE by Jake 2026-11-16. tests/schedule-workout-2026-11-16.spec.js GREEN against it (3/3, with dashboard-rework 38/38), and RED with the dashboard's _mergePlanned call removed (mutation, 2 of 3 fail) - the closing test exists. NOT YET LIVE for users: the app code ships with the next release tag; close on that release or Jake confirming it on live."
closing_conditions: "A user who has just created a workout can put it on a day (today included) from the app, and that day's dashboard shows it; proven by a test that fails before the fix and passes after, or Jake confirms it on live."
---

# A newly created workout cannot be added to the calendar and does not show on the dashboard

Reported on live: a user built a workout to train with today. They found no way to schedule it on the calendar, and the
dashboard did not show it.

**Expected:** a workout you just made can be put on a day (today included) and shows on that day's dashboard.

**Closes when:** a test that fails before the fix and passes after shows it, or Jake confirms it on live.
