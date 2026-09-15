---
id: 2026-07-29-reproduced-live-fixed-2026-07-29-eb9ec3f
status: confirmed
closed_by: "clause (b) — ledger-fixes-2026-07-29.spec.js ran GREEN 2026-08-20 in a serialized 192-test run; red-before is recorded in this file's body. Closed on test evidence, NOT on a Jake confirmation."
priority: high
reported: 2026-07-29
status_detail: "fixed — awaiting Jake"
---

# REPRODUCED LIVE + FIXED 2026-07-29 (eb9ec3f)

✅ **REPRODUCED LIVE + FIXED 2026-07-29 (`eb9ec3f`)** — NOT a date bug. Reproduced via direct Playwright repro against real test data: a fresh AND a restart self-assign both worked correctly with a real program (2/2 slots cloned, showed on Workouts page immediately). The actual mechanism: assigning a program with **zero phases** (e.g. one just created, not yet built out) hit `_cloneProgramForClient`'s early-return (`!phases?.length`) — the `client_programs` row got created, but with zero `client_program_workouts` and no error shown, so the Workouts page's `hasProgram` check (which doesn't distinguish "assigned but empty" from "not assigned") showed nothing, matching Jake's exact symptom. Now fails loud with a toast. Multi-agent review then found the solo self-assign flow's own unconditional success toast was instantly overwriting this new warning (single-DOM-node toast, no queue) — fixed by having `_cloneProgramForClient` return a success flag the caller checks first. Red→green `tests/ledger-fixes-2026-07-29.spec.js` (B). — **If I assign a program to myself starting today, then when I navigate to the workouts page the program is not there.** Jake, live.
