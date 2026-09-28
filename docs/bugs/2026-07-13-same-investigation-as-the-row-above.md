---
id: 2026-07-13-same-investigation-as-the-row-above
status: open
priority: high
reported: 2026-07-13
reported_detail: re-measured 2026-08-05
status_detail: "2026-09-27: see 2026-07-06-tracking-prevention-theory-killed-2026-08-07's same-day finding — checked saveNewTemplate and renderWorkoutTemplates with the eager/unbounded-query lens, found nothing (both already bounded, saveNewTemplate is lean). No further code-level lead. Left open."
---

# Same investigation as the row above

**Same investigation as the row above — see 2026-08-05 measurement.** — (orig) **PT → create template → very slow to save AND to display the new template.** New report, same family as the Workouts-page delay — investigate together; a shared root cause is likely (`saveNewTemplate` → re-render → re-fetch). Screenshot 2026-07-13 11:38.
