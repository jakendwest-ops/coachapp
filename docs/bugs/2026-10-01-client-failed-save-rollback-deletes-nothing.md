---
id: 2026-10-01-client-failed-save-rollback-deletes-nothing
status: open
priority: medium
reported: 2026-10-01
status_detail: "CONFIRMED BY BEHAVIOUR 2026-10-01 (not just by reading policies). When a CLIENT's workout save fails part-way, the app's rollback (delete the exercises, then the session row) is silently refused by the database: the client has no DELETE policy on workout_log_exercises, workout_log_sets or workout_logs. A throwaway probe ran the runner's exact rollback as the client on a session the client had just created: both deletes returned no error and the exercise and the session row were still there afterwards. Coach and solo are unaffected (their ALL / delete policies cover it). Found by Claude from the live pg_policies read Jake pasted; not Jake-reported. Waiting on Jake's decision (options in the body)."
closing_conditions: "A test that makes a client's session save fail after the log row exists (or runs the rollback sequence as the client) and then finds NO half-written session left behind, RED before and GREEN after the chosen fix. Jake chooses the fix; nothing is built until he does."
---

# A client's failed save leaves a half-written session behind, because the rollback cannot delete

**Closes when:** a test runs the client's rollback sequence (or forces a client save to fail after the log row exists) and finds no half-written session left, RED before and GREEN after the fix Jake chooses.

## What happens

`saveRunnerSession` and `saveWorkoutSession` write a session in steps: the `workout_logs` row, then the `workout_log_exercises`, then one batched
insert of the `workout_log_sets`. If a later step fails (a CHECK constraint, a network drop) they try to undo the earlier ones with plain `delete()`
calls (`js/app-runner.js`, around the exercises insert and the sets batch insert, and the matching spots in `saveWorkoutSession`). A policy-refused
delete returns `{ data: [], error: null }`, so the code never notices it did nothing.

The live policies (Jake pasted `pg_policies`, 2026-10-01) give a CLIENT INSERT and SELECT on these tables but **no DELETE** on
`workout_log_exercises`, `workout_log_sets` or `workout_logs`. Only the coach ("Coach deletes own workout logs", `coach_id = auth.uid()`) and the coach
`ALL` policies can delete. A solo user's `coach_id` is their own uid, so solo can. A client's session has `coach_id` = their COACH's id, so the client
cannot.

**Proved by behaviour:** as the E2E client, a probe inserted a session and an exercise, then ran the exact rollback. Rollback errors: `[null, null]`.
Afterwards the exercise and the session were both still readable. (The probe was deleted, not committed; its rows were removed by the coach, 1 and 1.)

## Impact

Only when a client's save fails part-way, which needs a failing insert, so it is rare. When it happens the client is told "Save failed, try again"
while a session row (and possibly its exercises) stays in their history and in their COACH's view of them as an empty or set-less workout; the retry
then saves the real one, so the history shows a duplicate. The coach can delete the stray row; the client cannot.

## Options (for Jake)

1. **A narrow client DELETE policy: "only if nothing was saved in it."** A client may delete their own `workout_logs` row, and its
   `workout_log_exercises`, only while no `workout_log_sets` exist under it. That is exactly the state a rollback is in (the sets batch is
   all-or-nothing, so a failed save has written no sets), and it does not let a client erase real history. Needs a migration (sql-safety, a PGlite
   verifier with mutations, and Jake running it). **Recommended.**
2. **Do nothing.** Accept the rare stray row; the coach can delete it.
3. **App side only:** make the rollback read its rowcount and tell the client "your workout partly saved — let your coach know". Honest, but it leaves
   the stray row in place. Worth doing together with option 1, not instead of it.
