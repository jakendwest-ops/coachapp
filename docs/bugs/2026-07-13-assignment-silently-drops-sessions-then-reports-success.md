---
id: 2026-07-13-assignment-silently-drops-sessions-then-reports-success
status: fixed-awaiting-jake
priority: medium
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# assignment silently drops sessions, then reports success

**MEDIUM — assignment silently drops sessions, then reports success.** `_cloneProgramForClient` (app-programs.js:346-369): a nulled `workout_templates` embed level → `_cloneTemplateForClient` returns null → `continue` → slot skipped → then logs `cloned N workouts` OK. Client gets a program with missing sessions and no error. Same silent-skip at generatePhasePeriodization (:1434), duplicatePhaseWeek (:1640), and `_getProgramOneRMStatus` (:376) — where it means a %1RM program is assigned with the missing-1RM checklist showing nothing. `copyProgramToCoaching` (:1074) already does this correctly and fails loudly. Four siblings, one guard.
