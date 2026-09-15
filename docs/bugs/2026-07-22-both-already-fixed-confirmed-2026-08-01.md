---
id: 2026-07-22-both-already-fixed-confirmed-2026-08-01
status: confirmed
priority: high
reported: 2026-07-22
reported_detail: confirmed 2026-08-01
status_detail: "confirmed (code-verified; already covered by the 2026-07-23 GDPR export rewrite, see below)"
---

# BOTH ALREADY FIXED, CONFIRMED 2026-08-01

✅ **BOTH ALREADY FIXED, CONFIRMED 2026-08-01 — same underlying fix as the 2026-07-23 GDPR export rewrite below.** Re-checked live: `_buildMyDataBundle` (app-progress.js:2056-2105) now exports the full `workout_log_exercises(...workout_log_sets(...))` nested embed (weights/reps/durations/distances/HR/watts — everything), and resolves client rows via `.select('id').eq('user_id', currentUser.id)` with **no `.single()` at all** (a comment at :2081 explicitly documents why: "clients.user_id is UNIQUE today... but an export should not be brittle about a row count"). Both this row and its sibling below describe exactly the two gaps that fix closed — reported a day BEFORE the 07-23 fix shipped and never cross-referenced/closed against it. No code change needed tonight; ledger hygiene only. — (orig) **GDPR — `downloadMyData()` exports NO workout set data at all.** ... **`downloadMyData()` resolves the client record with an ambiguous `.single()`**...
