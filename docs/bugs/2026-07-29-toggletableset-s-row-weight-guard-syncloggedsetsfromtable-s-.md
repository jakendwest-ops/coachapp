---
id: 2026-07-29-toggletableset-s-row-weight-guard-syncloggedsetsfromtable-s-
status: confirmed
closed_by: "clause (b) — ledger-fixes-2026-07-29.spec.js ran GREEN 2026-08-20 in a serialized 192-test run; red-before is recorded in this file's body. Closed on test evidence, NOT on a Jake confirmation."
priority: high
reported: 2026-07-29
status_detail: "fixed — awaiting Jake"
---

# toggleTableSet's !row.weight guard, _syncLoggedSetsFromTable's r.weight || null, and both saveRunnerSession we

✅ **FIXED + LIVE 2026-07-29 (`eb9ec3f`)** — `toggleTableSet`'s `!row.weight` guard, `_syncLoggedSetsFromTable`'s `r.weight || null`, and both `saveRunnerSession` weight_kg writes (`s.weight && ...`) all treated a real `0` the same as blank/cleared — JS falsy-zero. A bodyweight-only set logged as literal "0" was blocked at the tick, and even past the block would have saved as `null`. Fixed all 4 sites with an explicit not-null/not-empty check (`_hasWeightVal`). Red→green `tests/ledger-fixes-2026-07-29.spec.js` (A1). — **Runner: entering 0 as weight is rejected ("Enter weight first"), should be a valid value.** Jake, live: "I tried to enter 0 as the weight used (as technically I was using 0 weight and just bodyweight)... 0 should be a value."
