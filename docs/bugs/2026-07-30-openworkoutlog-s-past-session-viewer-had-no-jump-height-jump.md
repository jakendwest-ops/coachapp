---
id: 2026-07-30-openworkoutlog-s-past-session-viewer-had-no-jump-height-jump
status: fixed-awaiting-jake
priority: low
reported: 2026-07-30
status_detail: "fixed — awaiting Jake"
---

# openWorkoutLog's past-session viewer had no jump_height/jump_distance column at all

✅ **FIXED 2026-07-30 (round 2) — `openWorkoutLog`'s past-session viewer had no jump_height/jump_distance column at all.** Added a third display branch (cardio / jump_height / jump_distance / weight-reps). Known incomplete: `saveWorkoutSession` (manual Log Session modal) never stamps `metric_type` on its exercise rows the way the runner's own save does, so a jump session logged through that specific modal still won't render under the new branch — not a regression, that modal has no jump entry UI today. Red→green test.
