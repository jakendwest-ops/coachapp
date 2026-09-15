---
id: 2026-08-01-needs-a-live-probe
status: confirmed
priority: medium
reported: 2026-08-01
status_detail: "confirmed (behaviourally probed, already safe)"
---

# Needs a live probe

**Needs a live probe — can a client write to their own plan clone's `workout_template_exercises` and have it render, unescaped, in the coach's runner?** This is the client→coach direction of the XSS cluster fixed above (now fixed regardless of direction, but the WRITE PATH itself — whether a client even has UPDATE access to their plan clone's exercise rows — was never independently confirmed this session). Same shape as the 3+ prior client→coach stored-XSS incidents in this codebase. — ✅ **PROBED LIVE 2026-08-10 — ANSWERED: NO, a client cannot write to their own plan clone's exercises.** This is the client→coach direction behind 4 separate stored-XSS incidents (2026-07-13, -18, -23, -28), so it was settled behaviourally rather than by reading policy text. The probe (`tests/template-exercise-write-rls-2026-08-10.spec.js`) builds a genuine plan-clone-shaped row (coach-owned, `client_id` set to that client) and, as the real client, attempts an XSS-shaped payload via UPDATE, DELETE and INSERT. Result: **read 1 row (correct — read access is intended and needed), UPDATE 0 rows, DELETE 0 rows, INSERT 0 rows.** The row survived with its original name and notes; no payload landed. **The client→coach WRITE path on this table is closed at the RLS layer** — a stronger guarantee than the escaping sweep, since escaping defends the render whereas this defends the write. Permanent regression test added.
