---
id: 2026-07-30-fmtdistancem-app-workouts-js-had-the-same-falsy-zero-bug-as-
status: fixed-awaiting-jake
priority: medium
reported: 2026-07-30
status_detail: "fixed — awaiting Jake"
---

# fmtDistanceM (app-workouts.js) had the same falsy-zero bug as weight/height

✅ **FIXED 2026-07-30 (round 2) — `fmtDistanceM` (app-workouts.js) had the same falsy-zero bug as weight/height.** `if (!n) return ''` treated a real 0m the same as "no distance," which had left jump_distance's diary display inert (the earlier `_setDetailsLine` fix was correct but blocked one layer down by this). Fixed. **Review then found the fix's own regression**: `_cardioDistanceM(s)` returns a literal 0 (not null) by design, so 2 unguarded cardio display sites (app-runner.js finish-screen set line, app-workouts.js cardio target prescription) started showing "0 m" on every duration-only cardio set. Fixed both with an explicit `> 0` guard, matching every other call site's existing pattern. Red→green tests.
