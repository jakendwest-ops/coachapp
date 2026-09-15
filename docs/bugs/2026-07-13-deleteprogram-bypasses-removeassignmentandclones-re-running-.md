---
id: 2026-07-13-deleteprogram-bypasses-removeassignmentandclones-re-running-
status: fixed-awaiting-jake
priority: high
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# deleteProgram bypasses _removeAssignmentAndClones, re-running the debris factory you just cleaned

**HIGH — `deleteProgram` bypasses `_removeAssignmentAndClones`, re-running the debris factory you just cleaned.** `app-programs.js:1124` does a bare `client_programs.delete().in(id, soloOwnIds)`. The helper at :244 exists *precisely* because `client_program_workouts` cascade but the client-owned `workout_templates` clones they point at do NOT. It was wired into `unassignProgram`, `saveAssignProgram` and `saveAssignProgramToClient` — and not this one. Deleting a self-assigned personal program strands ~30 client-owned templates that are invisible to every library query (`.is(client_id, null)`), so they can never be found or removed. This is the same generator behind the 2013-templates / 1223-dead figure.
