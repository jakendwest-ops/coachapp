---
id: 2026-11-17-runner-reads-saved-1rms-in-no-order
status: closed
priority: medium
reported: 2026-11-17
status_detail: "CLOSED 2026-11-17: _oneRMLookup (js/app-runner.js) keeps the newest row per lift and the read is now ordered by date; tests-node/one-rm-best.test.mjs hands the rows in four orders and gets the newest each time. Its red on the old code was only that the function did not exist yet (the old maps were inline), so the old wrong pick was argued from the code, not reproduced. Fix approved by Jake 2026-11-17."
---

# The runner reads saved 1RMs in no order, so a % of 1RM target can use an old 1RM

Starting a workout (`js/app-runner.js:44`) reads every `client_1rms` row for the client with no `order`, then builds a name map and an id map with `Object.fromEntries`, where the LAST row read wins. `client_1rms` is append-only (one row per test), so a lift with several entries gets whichever the database happens to return last. That is usually the newest, but nothing guarantees it, and the % of 1RM target weights are worked out from it.

Its two siblings already order by date and take the newest: `_lookupClientOneRM` (`app-runner.js:3093`) and the plan's needed-1RMs check (`app-programs.js:766`).

**Closes when:** a node test hands the rows in shuffled order and gets the newest 1RM per lift, red on the current code and green after the fix.
