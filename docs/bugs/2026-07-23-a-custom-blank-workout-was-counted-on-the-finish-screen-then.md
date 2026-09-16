---
id: 2026-07-23-a-custom-blank-workout-was-counted-on-the-finish-screen-then
status: closed
priority: high
reported: 2026-07-23
closed_by: tests/review-fixes-2026-07-23.spec.js
status_detail: "CLOSED 2026-09-15 via closure rule (b): tests/review-fixes-2026-07-23.spec.js's 'a nameless exercise with logged sets is saved, not discarded' test asserts exactly this defect, with an explicit RED-before/GREEN-after comment matching the bug's own description. Closed on test evidence, not inference — Jake never separately confirmed this one."
---

# a custom/blank workout was counted on the finish screen then discarded on save

✅ **FIXED + LIVE 2026-07-23 (bd2e501) — a custom/blank workout was counted on the finish screen then discarded on save.** app-runner.js:1595 filters `e.loggedSets.length`; :1752 filters `e.name && e.loggedSets.length`. `_startFreshRunner:43` seeds a nameless exercise, and the strength TABLE renders no name input — so: Start → Custom/blank → log 3 sets → finish screen shows **3 Sets** with a full breakdown → Save → `No sets logged — nothing to save.` and the session is gone. Two filters over one collection that must agree and don't.
