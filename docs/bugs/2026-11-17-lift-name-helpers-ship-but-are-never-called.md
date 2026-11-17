---
id: 2026-11-17-lift-name-helpers-ship-but-are-never-called
status: open
priority: low
reported: 2026-11-17
status_detail: "Not fixed."
---

# Two lift-name helpers ship to every user but are never called

`_liftNameSuggestions` (`js/app-progress.js:3542`) and `_canonLiftName` (:3590) have no caller in `js/` or `index.html`; only `tests-node/lift-names.test.mjs` uses them (the lift-name merge was planned as a later piece, decisions 2026-11-01).

Found by the full-file multi-agent-review of app-progress, app-workouts and app-dashboard, 2026-11-17; the cited lines were re-read by the verifier.

**Closes when:** Jake says whether the merge is still planned; then either a caller ships or both are deleted with their test.
