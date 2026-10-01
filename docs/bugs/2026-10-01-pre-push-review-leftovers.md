---
id: 2026-10-01-pre-push-review-leftovers
status: open
priority: low
reported: 2026-10-01
status_detail: "The pre-push multi-agent review (2026-10-01; three reviewers over everything unpushed, including the other sessions' commits) found NO blocking issue and about 20 findings; everything checkable was fixed in the same push with a test that ran RED first. This row holds what was deliberately NOT fixed, so none of it lives only in a chat. One item needs Jake (the client Goals tab). Not Jake-reported."
closing_conditions: "Jake decides item 1 (should a client see Add / Edit / Delete on goals), and each remaining item is either fixed with a test or consciously accepted in writing here. Reading this row is not a closing condition."
---

# What the pre-push review found that was not fixed in the same push

**Closes when:** Jake decides item 1, item 11 is answered by the `workout_logs` policy read and fixed or accepted, and each remaining item is either fixed with a test or consciously accepted in writing in this row. Naming them is not closing them.

## Needs Jake

1. **A client sees "+ Add goal", Edit and Delete on the Goals tab, but goals RLS makes the COACH the only creator.**
   The Goals tab (commit dd61a20, the second walkthrough) mounts `renderClientGoals` for a client. `tests/progress.spec.js` itself says a client
   inserting a goal is refused "by design: the coach sets goals, the client tracks progress", yet the same file asserts "+ Add goal" is visible
   to a client. Today: Add shows the raw RLS message; Edit used to vanish silently (fixed in this push: it now says "only the person who set
   this goal can edit it"); Delete already had a rowcount check. Question for Jake: should a client see Add / Edit / Delete at all, or only
   their own progress controls? Not verified: client RLS on `goals`, `goal_milestones` and `goal_check_ins` is not in the repo SQL.

## Answered by the live policy read (Jake pasted `pg_policies`, 2026-10-01)

2. **Exercise library access for a CLIENT — checked, and proved by behaviour.** Policy text: a client can INSERT into `exercises` only with
   `coach_id` IN (their own coach's id) (`exercises_insert_by_client`), can SELECT only that coach's rows (`exercises_select_by_client`), and has NO
   UPDATE or DELETE policy; a coach or solo user manages `coach_id = auth.uid()`. New spec
   `tests/exercise-client-cross-tenant-2026-10-01.spec.js` attacks as the client against an unrelated coach (insert, read) and against their own
   coach's row (rename, delete), with positive controls that the same client's insert/read into their OWN coach's library succeed: all refused, as the text
   says. (Not shown able to fail by mutation: the policy cannot be weakened from here; the positive controls are what make a refusal mean something.)
3. **The runner's library-owner fallback** (`clientRecord?.coach_id || currentUser.id`) — accepted as harmless. If the `clients` read is denied the
   exercise would be inserted with `coach_id` = the caller's own uid, which the `coaches manage own exercises` policy allows: it lands in the caller's own
   namespace, not anyone else's. A functional oddity (the coach would not see it), not a tenancy hole.

## NEW from the same policy read — needs one more query from Jake

11. **A CLIENT's failed-save rollback may not be able to delete.** `saveRunnerSession` / `saveWorkoutSession` clean up a half-written session with
    unchecked `delete()`s on `workout_log_exercises` and `workout_logs` (`js/app-runner.js` around the batched set insert). The pasted policies give a
    client NO delete policy on `workout_log_exercises` or `workout_log_sets` (only coach `ALL` policies and the client INSERT/SELECT ones); the policies on
    `workout_logs` itself were not in the paste. A policy-refused delete returns no error, so if a client's set insert ever fails (a CHECK, a network
    drop mid-save) the rollback would leave a session row with exercises and no sets while the app says the save failed, and a retry would duplicate it.
    Coach and solo are unaffected (their `ALL` policies cover the deletes). Needs the `workout_logs` policies read, then either a client DELETE policy
    scoped like the INSERT ones, or a rollback that checks its rowcount and says so.

## Not fixed — small, named so they are not forgotten

4. The new-coach starter seed reads `exercises` by `coach_id` only (no `is_personal`): on a master account holding both libraries it could link the
   solo sample template to a coach-mode exercise. Pre-existing, slightly widened by the case-folded key; only matters at first login.
5. `_createExerciseFromPicker` picks an ARCHIVED match silently (the UI hides the Create row for one, so it is reachable only by a race).
6. Neither preview server calls `realpath`, so a symlink inside the served root pointing outside it would be served; `GIT_DIR` / `GIT_WORK_TREE` in the
   hook's environment would override its git calls (hypothetical — nothing sets them here).
7. The exercise-name key (`trim().toLowerCase()`) now exists in five places (`starter-content`'s `_exerciseKey`, `_findExerciseByName`, the picker's
   `exactExists`, `nameByKey`, and the tests). They agree today; `_exerciseKey` could be the one definition.
8. Dead code: `css/main.css` `.solo-strip-btn` (orphaned by the dashboard merge); `tests/rpe-journey-steps.js` `cleanupJourney`'s unused `exId`.
9. The finish-screen note says a left-out set had "reps or weight blank" even if the lifter refilled it but did not tick it again (still correct that it
   is not saved).
10. `guardrails.mjs` now compares the two repositories by real path (symlinks / junctions), but that is not demonstrable on this machine: the junction
    case passes with or without it, so it is defence in depth that no test can fail.

## Fixed in the same push (for the record, each with a test that ran RED first)

A builder effort box that rendered a stored 0 as blank (and the next save erased it); a zero-kg load on a one-sided set lost in the read-back; the
single-top-set delete hole; the picker saying "No exercises yet" over a failed read; renaming an exercise onto an existing name; an exercise name
containing `*`; a silent no-op when a client edits a coach's goal; unescaped ids in the 1RM modal handler and the performance value on two dashboards;
the PowerShell preview server being reachable over the LAN with a forged Host header (and the ledger line that said it was loopback-only); `git -C <path>
commit` and quoted `cd` text fooling the commit gate; the module comparison passing over zero files.
