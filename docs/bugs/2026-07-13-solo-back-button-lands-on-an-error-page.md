---
id: 2026-07-13-solo-back-button-lands-on-an-error-page
status: fixed-awaiting-jake
priority: high
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# solo Back button lands on an error page

**HIGH — solo Back button lands on an error page.** Workouts → program session → Edit → Back. `_templateGoBack` (app-workouts.js:899-908) has no solo branch, so `ctx.clientId` routes to `openClient()` → app-clients.js:229-231 queries `.eq(coach_id, currentUser.id)`, but a solo client record has `coach_id = NULL` → 0 rows → `.single()` errors → raw PostgREST error rendered into #main-content. Same shape as the 298d88d solo-runner bug.
