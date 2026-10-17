---
id: 2026-10-17-server-side-today-still-uses-the-utc-day
status: open
priority: low
reported: 2026-10-17
status_detail: "OPEN, found by the multi-agent review of the local-date fix (2026-10-17): two database objects still take 'today' from the UTC day, so for the first hour after midnight in the UK summer (more east of it) they disagree with the app, which now stamps the LOCAL day. Both are display-level and heal on their own; neither touches ownership. Needs SQL, which Jake runs. Not fixed, on purpose: one is a function signature change."
closing_conditions: "Jake decides on the two SQL changes below. Each gets a verifier under scripts/sql-verify/ (and a mutation) before he runs it, and a check that fails with the UTC day put back."
---

# Server-side "today" is still the UTC day (the coach summary view and the plan-restart function)

## Where it came from

The app side of "today taken from the UTC day" was fixed on master 2026-10-17 ([2026-10-13 row](2026-10-13-dates-defaulted-from-the-utc-day-are-wrong-outside-utc.md), [2026-10-04 row](2026-10-04-runner-saves-the-session-date-as-the-utc-day.md)). A session now carries the day the person started it, on THEIR clock. Two objects in the database were written against the old stamp.

## 1. `coach_client_summary` hides a session dated "tomorrow" in UTC

`scripts/add-coach-client-summary-2026-09-20.sql` lines 105, 110, 114 and 115 cap and window on `(now() at time zone 'utc')::date`, and ignore a log dated after it (its header says a future-dated log is a typo). With the fix, a session started at 00:30 BST on 16 July is dated `2026-07-16` while the UTC date is `2026-07-15`, so `16 <= 15` is false and the row is dropped from `last_session_date`, `sessions_7d` and `sessions_28d` until 01:00 BST. Readers: the Clients list label (`js/app-clients.js:137`) and the dashboard "Needs attention" (`js/app-dashboard.js:541`). Window: 1 hour in the UK, 2 in central Europe, most of a morning in Australia or New Zealand; west of UTC the cap does not bite. Before the fix the same session was stored as the 15th, so it showed, a day early.

A cap of `+ 1` day would cover every zone up to UTC+14 and still exclude the deliberate typo row the verifier pins (T+400). `scripts/sql-verify/coach-client-summary.verify.mjs` is the place to add the 00:30 BST case.

## 2. `assign_program()` stamps `ended_at = current_date` on a restart

`scripts/add-assign-program-rpc-2026-09-27.sql` line 101 (and the column default in `add-program-blocks-2026-08-15.sql:57`) write the server's date, which is the UTC day. The JS twin `_archiveAssignmentBlock` (`js/app-programs.js:372`) now writes the local day, and its comment says "change one, change the other". In the same 00:00 to 01:00 BST window the two archive copies of a block's end date differ by a day. The only reader (`_loadProgramBlocks`) tolerates a one-day skew, so this is cosmetic history. The honest fix is a `p_today date` argument the browser fills with `_ymdLocal(new Date())`, which changes the function signature (and every caller), so it wants its own decision rather than riding along.

**Closes when:** Jake has decided on both changes and run the SQL that was verified locally first (a verifier plus a mutation under scripts/sql-verify/, the 00:30 BST case failing with the UTC day put back), and the coach summary shows a session started at 00:30 local time on the Clients list straight away.

## Not tested

Nothing here is covered by a test that fails today: `coach-client-summary-2026-09-21.spec.js` uses UTC days at least a day back. The fix should add the 00:30 BST case first.
