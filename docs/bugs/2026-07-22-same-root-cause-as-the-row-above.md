---
id: 2026-07-22-same-root-cause-as-the-row-above
status: fixed-awaiting-jake
priority: high
reported: 2026-07-22
status_detail: "fixed — awaiting Jake"
---

# Same root cause as the row above

✅ **Same root cause as the row above — see 2026-07-29 fix.** — (orig) **Adding an exercise to a workout from the Programs page doesn't show until you refresh.** Jake, 2026-07-22, reported alongside the re-report above (same action, two distinct symptoms — the missing propagate prompt is the row above; this row is the stale render). Same *shape* as the 2026-07-12 "assigning a program showed stale data until refresh" bug, which was a fire-and-forget `_cloneProgramForClient` that wasn't awaited. Suspect an un-awaited write or a missing re-render on the Programs-page add path specifically — the flat Workouts-page path may well be fine, which is why this survived.
