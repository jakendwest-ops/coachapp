---
id: 2026-07-19-both-tab-surfaces-now-show-a-sequential-1-n
status: confirmed
closed_by: "clause (b) — ledger-fixes-2026-08-01.spec.js ran GREEN 2026-08-20 in a serialized 192-test run; red-before is recorded in this file's body. Closed on test evidence, NOT on a Jake confirmation."
priority: medium
reported: 2026-07-19
status_detail: "fixed — awaiting Jake"
---

# both tab surfaces now show a sequential 1..N

✅ **FIXED + LIVE (LOCAL) 2026-08-01 — both tab surfaces now show a sequential 1..N.** Builder (`app-programs.js`'s week-tabs) labels with `weekNums.indexOf(w) + 1`; the client Workouts read page (`app-workouts.js`) already had the array index (`wi`) in scope from its own `.map((w, wi) => ...)`, so it labels with `wi + 1` directly. `data-week` attributes and `onclick` handler arguments are UNCHANGED (still the real `week_number`) — only the visible text changed. Red→green tests for both surfaces (`tests/ledger-fixes-2026-08-01.spec.js`), each planting a phase with non-contiguous week_number (2, 3, skipping 1) to reproduce the exact reported shape. — (orig) **Week-tab labels show raw `week_number`, not a sequential 1..N.**
