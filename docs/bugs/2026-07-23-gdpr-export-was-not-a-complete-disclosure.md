---
id: 2026-07-23-gdpr-export-was-not-a-complete-disclosure
status: confirmed
closed_by: "clause (b) — gdpr-export.spec.js ran GREEN 2026-08-20 in a serialized 192-test run; red-before is recorded in this file's body. Closed on test evidence, NOT on a Jake confirmation."
priority: critical
reported: 2026-07-23
status_detail: "fixed — awaiting Jake"
---

# GDPR export was not a complete disclosure

✅ **FIXED + LIVE 2026-07-23 (7fe41e0) — GDPR export was not a complete disclosure.** Shipped: both bundle halves now run ungated (PT view dropped all health data; Personal view dropped the user's own programmes/templates — contents depended on a UI toggle); `workout_logs` exported `name,date` ONLY so 200 sessions meant 200 empty headers and zero sets/weights/reps/HR — now nested; `client_check_ins` (Art. 9) was in NO branch; `resting_hr` + free-text notes were missing from stale select allowlists (les-036); the discarded-error `.single()` is gone. — (orig) **GDPR export dropped ALL personal data in PT view.** **⚠️ The review's stated root cause was WRONG and I repeated it before checking.** Agents A and B both claimed a master account holds TWO `clients` rows so `.single()` threw and the export returned `{exportedAt, profile}`. **`clients.user_id` is UNIQUE** (`clients_user_id_idx`) — proven by attempting the insert, which Postgres refuses. That failure mode is impossible. **The real bug:** `downloadMyData` was an `if/else` — `role === 'coach'` exported clients/templates/programs ONLY, so a coach who also trains (Jake's own account) could never export their weights, workouts, PBs, goals, events or 1RMs by any route. Special-category health data absent from a legal disclosure, UI reporting success. Fixed: both halves now run independently; reads use `.in('client_id', …)`; the discarded-error `.single()` is gone. Red→green in `tests/gdpr-export.spec.js` (3 tests, incl. one pinning the UNIQUE constraint so the wrong story can't be re-derived). Lesson les-049.
