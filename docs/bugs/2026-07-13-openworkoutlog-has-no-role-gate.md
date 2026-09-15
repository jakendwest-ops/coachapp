---
id: 2026-07-13-openworkoutlog-has-no-role-gate
status: fixed-awaiting-jake
priority: high
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# openWorkoutLog has NO role gate

🔴 **HIGH — `openWorkoutLog` has NO role gate: a client gets the coach Delete button and can overwrite the coach notes about them.** Reachable by clients from their own session history (app-workouts.js:400). Renders a Delete button (app-runner.js:2193) and a Coach notes textarea + Save (: 2265-2266). `deleteWorkoutLog` (:2292) and `saveCoachNotes` (:2283) both filter by `.eq(id, logId)` with **no ownership anchor** — they rely entirely on RLS, which likely permits a client to write their own `workout_logs` row. Contrast `openSessionDetail`, which DOES gate on role (app-workouts.js:102).
