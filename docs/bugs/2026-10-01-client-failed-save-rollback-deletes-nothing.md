---
id: 2026-10-01-client-failed-save-rollback-deletes-nothing
status: open
priority: medium
reported: 2026-10-01
status_detail: "FIX BUILT 2026-10-01, NOT YET APPLIED. Jake chose option 1 (a narrow client DELETE grant). scripts/add-client-empty-session-delete-2026-10-01.sql adds two read-only SECURITY DEFINER functions and two DELETE policies: a client may delete their own session, and its exercise rows, only while NO set is saved under it AND the session was created in the last 15 minutes. Verified locally on PGlite loaded with the live schema and every live policy on these tables (scripts/sql-verify/client-empty-session-delete.verify.mjs, 62 checks, 19 mutations all caught). Reviewed by three reviewers before the commit (no blocking finding; the 15-minute window, a strict refusal check, a blanket-delete probe and the read-back showing execute privileges all came from that review). The FIRST draft, which wrote the no-sets test straight into the policies, failed on the real engine with infinite recursion and would have broken the coach's and solo user's existing deletes too. Waiting on Jake to run the script in the Supabase SQL editor. The closing spec (a client's exact rollback sequence, expected to delete) is written but deliberately NOT committed until the script is applied, because it is RED against the live database by design and would block the release gate."
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

## Status of the fix (2026-10-01)

Built, reviewed, verified locally, not applied. **Closes when** (unchanged): a test makes a client's save fail after the log row exists (or runs the rollback sequence as the
client) and finds no half-written session left, RED before and GREEN after. The "before" half is already shown (the probe: the rollback deleted nothing). The "after" half
needs the script applied to the live project; then `tests/client-rollback-2026-10-01.spec.js` is run (it must pass) and committed.

What the script does, in one line: a client may delete their own session, and its exercise rows, only while no set is saved under it and it is under 15 minutes old, which is
the state a failed save leaves. It adds no DELETE on `workout_log_sets` and no UPDATE or INSERT change.

## What the review found that is NOT fixed (non-blocking, named here)

- **A lost response after a successful commit is still not rolled back for a client.** If the network drops AFTER the server saved the sets, the client sees an error although the
  sets exist; the rollback is refused (sets exist), and a retry duplicates the session. Coach and solo would have deleted it. The app's six unchecked rollback deletes
  (`js/app-runner.js` ~3173, 3275, 3276, 3839, 3889, 3890) never read their rowcount. **Recommended follow-up (ledger option 3, not chosen yet):** add `.select('id')`, compare
  with what was expected, `log.error` with ids only, and when a rollback matched nothing change the toast to "may have saved — check your history before retrying".
  `deleteWorkoutLog` already does this (~4160).
- **The foreign key `workout_log_exercises.log_id` -> `workout_logs` was never read** (its delete rule is unknown). It matters only when the exercises committed but their
  response was lost and the app then deletes just the log. Probably ON DELETE CASCADE (the coach's single-statement delete of a session with exercises would otherwise fail).
- **The functions are callable as RPCs by any signed-in user** (Supabase's linter flags authenticated-executable SECURITY DEFINER functions). They return false for anyone who
  does not own the row, so it is surface, not a leak; a non-exposed schema would remove it.
- **`drop policy` + `create policy` take a brief exclusive lock** on the two tables; harmless unless a long transaction is open on them. No `lock_timeout` is set because the
  SQL editor may or may not wrap a paste in one transaction.
- **The manual "Log session" modal can save exercises with no sets** (coach-only UI). A client could delete such a recent session through the API; it holds no sets, but it
  could hold a coach's note (`workout_logs.notes`) — the reason for the 15-minute window.
