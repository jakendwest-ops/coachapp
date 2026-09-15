---
id: 2026-08-29-a-deferred-rls-question-from-2026-07-30-was-never-answered
status: open
priority: medium
reported: 2026-08-29
status_detail: "scripts/fix-workout-logs-insert-policy-2026-07-30.sql Step 1 asks whether workout_log_exercises and workout_log_sets independently anchor on log ownership, and says 'confirm rather than assume'. Nothing in scripts/ or tests/ records an answer. The app never depends on those SELECT policies (every read is bounded by an already-scoped id list), so the residual exposure is a direct console INSERT against a foreign log_id - which no app code and no test exercises."
---

# A deferred RLS question from 2026-07-30 was never answered

**scripts/fix-workout-logs-insert-policy-2026-07-30.sql:27-34** — surfaced by the weekly full-file
review (Agent A).

That script's Step 1 asks whether `workout_log_exercises` and `workout_log_sets` *"independently anchor
on log ownership ... confirm rather than assume."* **Nothing in `scripts/` or `tests/` records the
answer.** It was deferred and then forgotten — which is the failure mode the bug ledger exists to prevent.

**Why it is medium and not high.** The app itself never depends on those tables' SELECT policies — every
read is bounded by an already-scoped id list:
- `fetchRunnerLastSession:199-213` derives `logIds` from a `client_id`-scoped query
- `openWorkoutLog:3046-3047` derives `exIds` from the RLS-bounded log embed
- `showRunnerFinish:2249-2253` derives from a `!inner`-joined, client-scoped query

So the residual exposure is a **direct console INSERT of `workout_log_sets` against a foreign
`log_id`** — which no app code and no test currently exercises. That is exactly the shape of the
2026-07-30 bug that this script was written to fix, one table down.

**This is the behavioural-probe lesson:** [[feedback_storage_bucket_behavioural]] — a policy that looks
right in the catalogue is not the same as one that refuses a real cross-tenant write. And
[[feedback_rls_embed_chains]] — check every table in the chain, not just the outer one.

**Closes when:** the Step-1 diagnostic is run and its result recorded here (SQL pasted inline for Jake to
run in Supabase per [[feedback_paste_sql_inline]]), and if a gap exists, a behavioural cross-tenant INSERT
probe goes RED before the policy fix and GREEN after.
