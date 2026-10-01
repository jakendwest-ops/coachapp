---
id: 2026-10-01-pre-push-review-leftovers
status: open
priority: low
reported: 2026-10-01
status_detail: "The pre-push multi-agent review (2026-10-01; three reviewers over everything unpushed, including the other sessions' commits) found NO blocking issue and about 20 findings; everything checkable was fixed in the same push with a test that ran RED first. This row holds what was deliberately NOT fixed, so none of it lives only in a chat. The client Goals tab question was decided (item 1). Not Jake-reported."
closing_conditions: "Each remaining item is either fixed with a test or consciously accepted in writing in this row. Naming them is not closing them."
---

# What the pre-push review found that was not fixed in the same push

**Closes when:** each remaining item is either fixed with a test or consciously accepted in writing in this row. Naming them is not closing them.

## Decided by Jake (2026-10-01)

1. **Goals: a client does not add, edit or delete goals; a coach and a solo user do.** Jake's decision, built in the same push: the client's Goals tab and goal
   detail no longer offer "+ Add goal", Edit, Delete or a milestone "+ Add" (`_canManageGoals`, one definition; every function behind them refuses too). A client keeps
   the TRACKING controls (a check-in, a progress value, ticking a milestone). Tests: `tests/goals-client-readonly-2026-10-01.spec.js` (client sees none of the four,
   keeps check-ins; coach and solo keep all; the same render as a client is the control) and `tests-node/goals-manage-role.test.mjs` (the role matrix, fail closed).

## Noticed by the goals review (2026-10-01), not changed

- **Weight goals are a different feature and were left alone.** A client can still set a Goal weight (the Body Weight tab, `clients.goal_weight_kg`), one tab from a Goals tab
  that now says "Your coach sets your goals". Jake to say if that should go too.
- **'View as' (owner account only):** `sudoAsClient` sets the role to client without re-applying the coach navigation, so until you exit it the goal controls are hidden
  and a stale button would show "Only your coach can change your goals". Same pre-existing leak that makes `navigate('programs')` show "Page not found" in that mode.
- **A coach with a failed profile fetch** (`currentProfile` null) now gets no goal controls (fail closed); elsewhere the app treats a missing role as coach.

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

## Moved out

11. **A client's failed-save rollback cannot delete** — confirmed by behaviour and now its own row:
    `2026-10-01-client-failed-save-rollback-deletes-nothing.md`.

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
containing `*`; a client no longer has an Edit control at all (and the save path still reads its rowcount, for a coach or solo user whose goal someone else created); goal fields a coach types (metric label and unit) now escaped where they are shown; unescaped ids in the 1RM modal handler and the performance value on two dashboards;
the PowerShell preview server being reachable over the LAN with a forged Host header (and the ledger line that said it was loopback-only); `git -C <path>
commit` and quoted `cd` text fooling the commit gate; the module comparison passing over zero files.
