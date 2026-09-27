---
id: 2026-07-13-deleting-a-workout-template-from-the-templates-page-drops-yo
status: closed
priority: medium
reported: 2026-07-13
status_detail: "CLOSED 2026-09-27 via closure rule (b): tests/delete-template-lands-on-library-2026-09-27.spec.js deletes a tagged personal template opened from the Personal Library and asserts the app stays on Library. Proven the same day: green on current code, RED with the old navigate('workouts') put back (failing on exactly that assertion), green again after a byte-identical restore. The bug was solo-only (fixed in 134140f)."
---

# Deleting a workout template from the Templates page drops you back to the Workouts page

**Deleting a workout template from the Templates page drops you back to the Workouts page** — Jake's read ("no built-in fallback page") is probably right: `deleteTemplate` almost certainly navigates to a hardcoded default instead of the caller's context (`_templateGoBack`/`backFn`). Same dead-nav shape as the "Log PB"/"Log weight" button bugs.
