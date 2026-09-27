---
id: 2026-07-13-openworkoutlog-has-no-role-gate
status: closed
priority: high
reported: 2026-07-13
status_detail: "CLOSED 2026-09-27 via closure rule (b): commit 134140f role-gated openWorkoutLog; tests/regression-2026-07-13.spec.js 'a client sees read-only coach notes and no Delete button; solo (own coach) keeps both' is one of that commit's 9 red->green regression tests; green in the v2026.09.8 full-suite run."
---

# openWorkoutLog has NO role gate

🔴 **HIGH — `openWorkoutLog` has NO role gate: a client gets the coach Delete button and can overwrite the coach notes about them.** Reachable by clients from their own session history (app-workouts.js:400). Renders a Delete button (app-runner.js:2193) and a Coach notes textarea + Save (: 2265-2266). `deleteWorkoutLog` (:2292) and `saveCoachNotes` (:2283) both filter by `.eq(id, logId)` with **no ownership anchor** — they rely entirely on RLS, which likely permits a client to write their own `workout_logs` row. Contrast `openSessionDetail`, which DOES gate on role (app-workouts.js:102).
