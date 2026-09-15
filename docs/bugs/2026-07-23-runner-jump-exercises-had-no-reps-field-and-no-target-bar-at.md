---
id: 2026-07-23-runner-jump-exercises-had-no-reps-field-and-no-target-bar-at
status: fixed-awaiting-jake
priority: high
reported: 2026-07-23
status_detail: "fixed — awaiting Jake"
---

# Runner: jump exercises had NO reps field, and no target bar at all

✅ **FIXED + LIVE 2026-07-23 (bd2e501) — Runner: jump exercises had NO reps field, and no target bar at all.** Jake, live: *"the runner for depth jumps (likely affects all jump exercise type) only displays height in CM and does not have reps fields (in fact, its missing the wizard entirely)"*. **Two layers, both regressions from that morning's c72eb14.** (1) The jump table row rendered one measurement cell only — a coach could prescribe "4×3 jumps @40cm" and the athlete could not record contacts, so jump volume was unrecordable and never reached the charts. (2) **`showTargets` (app-runner.js) was gated `weight_reps || unilateral`**, so the `_buildTargetCols` jump branch added the SAME DAY was dead code — computed, never rendered. That is the "missing the wizard": no target, no rest, no RPE. `timed_hold` was silently in the same state. Fixed: JUMPS column ghosted with the prescribed count + reps carried to `reps_achieved`; `showTargets` widened to every table metric type. Verified by screenshot at 390px (40cm TARGET · 3 JUMPS · RPE 8 · 2:00 REST). **My tests that morning asserted the builder SAVED the values and that `_buildTargetCols` RETURNED the columns — neither asserted anything rendered.**
