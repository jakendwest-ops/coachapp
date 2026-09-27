---
id: 2026-07-13-assignment-silently-drops-sessions-then-reports-success
status: unverified-accepted
priority: medium
reported: 2026-07-13
status_detail: "UNVERIFIED-ACCEPTED by Jake 2026-09-27 (batch reply 'ok'): the fix is present in current code (checked 2026-09-27, commit 134140f), but no red->green test proves it, so it is no longer tracked."
---

# assignment silently drops sessions, then reports success

**MEDIUM — assignment silently drops sessions, then reports success.** `_cloneProgramForClient` (app-programs.js:346-369): a nulled `workout_templates` embed level → `_cloneTemplateForClient` returns null → `continue` → slot skipped → then logs `cloned N workouts` OK. Client gets a program with missing sessions and no error. Same silent-skip at generatePhasePeriodization (:1434), duplicatePhaseWeek (:1640), and `_getProgramOneRMStatus` (:376) — where it means a %1RM program is assigned with the missing-1RM checklist showing nothing. `copyProgramToCoaching` (:1074) already does this correctly and fails loudly. Four siblings, one guard.
