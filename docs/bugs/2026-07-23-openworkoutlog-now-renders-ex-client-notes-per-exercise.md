---
id: 2026-07-23-openworkoutlog-now-renders-ex-client-notes-per-exercise
status: confirmed
closed_by: "clause (b) — ledger-fixes-2026-08-02.spec.js:43 ran GREEN 2026-08-20 in a serialized 192-test run; red-before is recorded in this file's body. Closed on test evidence, NOT on a Jake confirmation."
priority: medium
reported: 2026-07-23
status_detail: "fixed — awaiting Jake"
---

# openWorkoutLog now renders ex.client_notes per exercise

✅ **FIXED + LIVE (LOCAL) 2026-08-02 — `openWorkoutLog` now renders `ex.client_notes` per exercise.** The query (`app-runner.js`) already fetched it (`select('*, workout_log_exercises(*)')` — a `*` allowlist), it just was never rendered anywhere. Added an escaped "Client note" card right after the existing per-exercise summary, visible to whichever role opens that session (coach or client). Red→green test in `tests/ledger-fixes-2026-08-02.spec.js` plants an HTML-payload `client_notes` value and asserts both the escaped render AND that the raw payload string is absent (proves escaping, not just presence). Cache-bust: app-runner v49→50. — (orig) **Client notes typed in the runner are write-only.** `saveRunnerSession:1778` persists `workout_log_exercises.client_notes` from the prominent "Your notes" box; grep across `js/` returns exactly one hit — that write. Nothing renders it: not openWorkoutLog, not the diary, not the coach's profile. Every note a client types mid-session is stored and shown to nobody.
