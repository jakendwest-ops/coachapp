---
id: 2026-11-17-progress-filters-parse-date-only-strings-as-utc
status: open
priority: low
reported: 2026-11-17
status_detail: "Not fixed. At most an hour off in the UK."
---

# Two Progress filters read a date-only string as UTC midnight

`js/app-progress.js:3613` and `:3906` use `new Date(s.date).getTime()` on `YYYY-MM-DD`, against the file's own rule (every other date-only parse adds `T00:00:00` or uses `_dateOnly`).

Found by the full-file multi-agent-review of app-progress, app-workouts and app-dashboard, 2026-11-17; the cited lines were re-read by the verifier.

**Closes when:** both use the local-day parse, with a node test at a boundary date, red on the current code.
