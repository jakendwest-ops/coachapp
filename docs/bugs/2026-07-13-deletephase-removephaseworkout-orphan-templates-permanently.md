---
id: 2026-07-13-deletephase-removephaseworkout-orphan-templates-permanently
status: fixed-awaiting-jake
priority: medium
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# deletePhase + removePhaseWorkout orphan templates permanently

**MEDIUM — `deletePhase` + `removePhaseWorkout` orphan templates permanently.** Neither (app-programs.js:1214, :1852) calls `_deleteOwnedUnreferencedTemplates`. Deleting one 4-week periodized phase with 4 sessions/week orphans **12 master templates forever** — periodization week-clones carry `program_id: null`, so no other code path can ever find them. Structural cause: the helper takes a single `phaseId`, so multi-phase `deleteProgram` cannot use it and hand-rolls its own check. **Widen the helper to `phaseIds[]` and there is one implementation for all five callers.**
