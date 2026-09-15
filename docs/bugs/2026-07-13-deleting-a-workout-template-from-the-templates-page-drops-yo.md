---
id: 2026-07-13-deleting-a-workout-template-from-the-templates-page-drops-yo
status: fixed-awaiting-jake
priority: medium
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# Deleting a workout template from the Templates page drops you back to the Workouts page

**Deleting a workout template from the Templates page drops you back to the Workouts page** — Jake's read ("no built-in fallback page") is probably right: `deleteTemplate` almost certainly navigates to a hardcoded default instead of the caller's context (`_templateGoBack`/`backFn`). Same dead-nav shape as the "Log PB"/"Log weight" button bugs.
