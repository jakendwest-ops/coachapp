---
id: 2026-07-13-app-workouts-js-749-inside-the-success-branch
status: fixed-awaiting-jake
priority: critical
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# app-workouts.js:749, inside the *success* branch

🔴 **CRITICAL — LIVE DATA LOSS: stale `_phaseWorkoutContext` drops solo into a COACHING program, then Generate-weeks wipes real clients weeks 2+.** Chain, all 3 links verified: (1) `_phaseWorkoutContext` (set app-programs.js:1817) is cleared in ONE place — app-workouts.js:749, inside the *success* branch — never on cancel/empty-name/insert-error/switchView. (2) In Personal view, `saveNewTemplate` (app-workouts.js:735-764) reads the stale ctx and inserts a template with `is_personal:true` + the COACHING `program_id`, binds it into that program day slot, and opens `openProgram(coachingProgramId)`. (3) There, `_cleanupPhaseWeeksBeyond` (app-programs.js:1489-1494) deletes `client_program_workouts` + template clones for **every** assignee unfiltered, while the rebuild (app-programs.js:1425-1426) restores only `_propagationTargets()` = solo self. **Found by the first-ever full-file review.**
