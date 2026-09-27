---
id: 2026-07-22-same-root-cause-as-the-row-above
status: unverified-accepted
priority: high
reported: 2026-07-22
status_detail: "UNVERIFIED-ACCEPTED by Jake 2026-09-27 (batch reply 'go ahead' to: accept rows whose fix is still in the code, and the general older rows; keep security/data-safety rows for an audit). No red->green test proves this one; no longer tracked."
---

# Same root cause as the row above

✅ **Same root cause as the row above — see 2026-07-29 fix.** — (orig) **Adding an exercise to a workout from the Programs page doesn't show until you refresh.** Jake, 2026-07-22, reported alongside the re-report above (same action, two distinct symptoms — the missing propagate prompt is the row above; this row is the stale render). Same *shape* as the 2026-07-12 "assigning a program showed stale data until refresh" bug, which was a fire-and-forget `_cloneProgramForClient` that wasn't awaited. Suspect an un-awaited write or a missing re-render on the Programs-page add path specifically — the flat Workouts-page path may well be fine, which is why this survived.
