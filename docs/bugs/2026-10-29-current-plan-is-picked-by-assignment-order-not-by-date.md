---
id: 2026-10-29-current-plan-is-picked-by-assignment-order-not-by-date
status: open
priority: high
reported: 2026-10-29
status_detail: "Found 2026-10-29 while designing the Coach experience (Jake approved the build the same day). Every screen that shows a client's 'current' training plan took the NEWEST-ASSIGNED one (client_programs ordered by created_at desc, limit 1): the client and solo dashboards (_dashLoadOwn), the calendar (renderCalendar), the Workouts page (renderClientWorkoutsPage), the coach's client Workouts tab and Overview, and the coach_client_summary view behind the coach Home and client list. So booking a client's NEXT block for a future date made it current at once, and the running block left their calendar and dashboard. Each of those screens also drew only ONE plan onto dates, so even a correct pick left next week empty until the new block started."
closing_conditions: "A red-then-green unit test for the date rule (_currentAssignment) and the two-plan calendar map (_programWorkoutsByDateAll); a spec where a coach books a next block and the running block stays current on the client's Overview and calendar while the next block's sessions appear from its start Monday; the view picks by the same rule once Jake has run scripts/fix-coach-client-summary-current-plan-2026-10-29.sql."
---

# The current plan is picked by assignment order, not by date

**Closes when:** Jake confirms on his phone that a client with a next block booked still shows the running block as current (Overview,
calendar, dashboard) and the next block from its start date. The automated half is already green: `tests-node/current-assignment.test.mjs`
and `tests/current-assignment-2026-10-29.spec.js` (each red on the old rule), and the view verifier against the applied SQL.

## What happened

A client can hold more than one assignment (`client_programs`), but every screen chose "the current one" as
whichever was assigned last. A PT books the next block for next Monday and, from that moment, the client's
dashboard, calendar and Workouts page show the block they have not started, and the one they are doing
vanishes. For a coach running back-to-back blocks this is the normal case, not an edge case.

## The rule now (Jake approved, 2026-10-29)

- **Current** = of the plans that have started, the one that started most recently. A plan with no start
  date counts as starting on the day it was assigned (as the block history already does).
- **Next** = the soonest plan that starts after today.
- With nothing started, the soonest upcoming plan is shown as current (as before, a future plan was shown).
- On dates, each plan owns its days until the next plan's start date (the day it becomes current). The dashboard's adherence tile reads the
  current plan's dates alone, so a booked next block never stretches "Week N of M".

## Review fixes (multi-agent-review, 2026-10-29, before the commit)

The first build handed over on the next plan's start MONDAY, which left a mid-week start's Monday-Wednesday empty on the dashboard; the adherence
tile counted the next block's weeks; "Assign next block" on a long-ended plan prefilled a past date and, with no known end, prefilled today; only
one of the two coach assign paths warned about an overlap, and it also warned for a back-dated plan; ties on `created_at` used `localeCompare`,
which does not order timestamps by time. All fixed in the same commit, each with a test that fails on the old code.

## Not changed (named)

- The Workouts page's "Up next" card reads the current plan only, so between a block's last session and the next block's start it says
  "Training plan complete".

## Named limit

The view uses the UTC day and the app the device's day, so on a changeover day Home and the client's own
screens can disagree until 01:00 BST (the same class as `2026-10-17-server-side-today-still-uses-the-utc-day`).
