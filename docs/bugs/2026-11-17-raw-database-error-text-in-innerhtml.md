---
id: 2026-11-17-raw-database-error-text-in-innerhtml
status: open
priority: low
reported: 2026-11-17
status_detail: "Not fixed. No user input reaches these queries, so hygiene only."
---

# Two library screens put a raw database error message into the page unescaped

`js/app-workouts.js:1040` and `:1134` write `error.message` into `innerHTML` without `escapeHtml`.

Found by the full-file multi-agent-review of app-progress, app-workouts and app-dashboard, 2026-11-17; the cited lines were re-read by the verifier.

**Closes when:** both are wrapped in `escapeHtml`, checked by grep in the same commit.
