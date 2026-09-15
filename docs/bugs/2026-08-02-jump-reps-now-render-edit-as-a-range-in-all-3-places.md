---
id: 2026-08-02-jump-reps-now-render-edit-as-a-range-in-all-3-places
status: fixed-awaiting-jake
priority: medium
reported: 2026-08-02
status_detail: "fixed — awaiting Jake"
---

# jump reps now render/edit as a range in all 3 places

✅ **FIXED + LIVE (LOCAL) 2026-08-02 — jump reps now render/edit as a range in all 3 places.** Jake, live, on "Full Body A → Box Jump": switching an exercise's metric type to Jump height turned a `3-5` rep range into a single `3` in the UI. **Root cause confirmed in 3 places, all built together on 2026-07-22 as a single deliberate (but now wrong) design choice** — the code comments at each site said so explicitly: (1) the builder's `isJump` branch (`renderTemplateSets`, app-workouts.js) rendered only ONE reps box ("Jumps per set" → `ts-rmin-${i}`), never a second `ts-rmax-${i}` box — fixed by adding the second box, same `dash` pattern every other branch uses. (2) The runner's target bar (`_buildTargetCols`, app-runner.js) had a comment explaining it *deliberately* forced `String(tgt.repsMin)` for jump types "because the builder never offered" a range — removed the special case now that (1) exists. (3) The day-row prescription formatter (`_fmtSetDetail`, app-workouts.js) had the same single-value shape — switched to the `range()` helper every sibling branch in the same function already used. **Was never data loss** — confirmed `flushTemplateSets` preserves `repsMax` via its existing `??` pattern even when the box wasn't rendered, so the underlying `3-5` survived in the database throughout; this was a display/edit gap only. 5 new tests in `tests/ledger-fixes-2026-08-02.spec.js`. Cache-bust: app-workouts v51→52, app-runner v50→51.
