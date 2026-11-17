---
id: 2026-11-17-weight-goals-save-reports-success-without-a-row-count
status: open
priority: low
reported: 2026-11-17
status_detail: "Not fixed. Whether the client role has an UPDATE policy on clients is unverified."
---

# Saving weight goals says "saved" even if no row changed

`saveWeightGoals` (`js/app-progress.js:1099-1106`) updates `clients` with no `.select()` or row count, so an update RLS refuses returns no error and the toast says "Weight goals saved". Sibling writes in the file count rows.

Found by the full-file multi-agent-review of app-progress, app-workouts and app-dashboard, 2026-11-17; the cited lines were re-read by the verifier.

**Closes when:** the update counts its rows and a spec where the write is refused shows an error, red on the current code.
