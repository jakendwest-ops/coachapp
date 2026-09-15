---
id: 2026-07-23-a-custom-blank-workout-was-counted-on-the-finish-screen-then
status: fixed-awaiting-jake
priority: high
reported: 2026-07-23
status_detail: "fixed — awaiting Jake"
---

# a custom/blank workout was counted on the finish screen then discarded on save

✅ **FIXED + LIVE 2026-07-23 (bd2e501) — a custom/blank workout was counted on the finish screen then discarded on save.** app-runner.js:1595 filters `e.loggedSets.length`; :1752 filters `e.name && e.loggedSets.length`. `_startFreshRunner:43` seeds a nameless exercise, and the strength TABLE renders no name input — so: Start → Custom/blank → log 3 sets → finish screen shows **3 Sets** with a full breakdown → Save → `No sets logged — nothing to save.` and the session is gone. Two filters over one collection that must agree and don't.
