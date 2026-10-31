---
id: 2026-10-31-personal-view-delete-of-client-copies-refused-three-times
status: closed
priority: medium
reported: 2026-10-31
status_detail: "closed 2026-10-31 — red before, green after: tests/solo-week-copies-2026-10-31.spec.js (2 tests) failed on the live database and passed once Jake applied scripts/fix-solo-week-copies-delete-update-2026-10-31.sql (read-back: 6 policies, the two new ones as written). Root cause: no solo DELETE or UPDATE policy on client_program_workouts."
---

# In Personal view, deleting a programme's stale week copies was refused three times

`_deleteClientCopiesForSlots` (`js/app-programs.js`) found `client_program_workouts` rows it was allowed to delete (the user's
own solo self-assignment, after `_propagationTargets`), asked the database to delete them, and got **zero rows back**. Zero with
no error means the delete was refused by row-level security or the rows were already gone. Its own comment says the result is
"clients keep stale copies": the solo copy of the plan can keep old week slots that a rebuild then sits on top of.

Seen in `app_errors` on 2026-09-28, 2026-10-06 and 2026-10-08, all from Jake's account in the solo view on the Programs page
(builds core39/core40). Not seen since; that does not mean it is fixed (the action may simply not have been repeated).

Related but different: [2026-09-06 deletePhaseWeek renumber](2026-09-06-deletephaseweek-renumber-fans-out-past-propagationtargets.md).

**Closes when:** the refusal is reproduced (generate weeks / duplicate / delete a week on a programme self-assigned in
Personal view), its cause named, and a spec goes red before the fix and green after.

## Investigation, 2026-10-31

**Reproduced** with a throwaway probe (deleted after the run) as the E2E PT account in solo view, on a self-assigned
programme built for the purpose and removed afterwards:

| What | Result |
|---|---|
| Delete one of the solo plan's week copies | 0 rows removed, **no error**, the row is still there |
| Renumber one (`week_number` 3 → 2), as `deletePhaseWeek` does | 0 rows updated, **no error**, still week 3 |
| `_deleteClientCopiesForSlots` on a copy that has its own clone | logs this row's error, but the copy is gone afterwards |

**Root cause.** `client_program_workouts` policies (schema read 2026-09-27, `scripts/sql-verify/live-schema-programs.mjs:107-110`):
`coach_manage_cpw` (ALL) requires `clients.coach_id = auth.uid()`, and the solo record's `coach_id` is NULL; the two solo
policies cover INSERT and SELECT only. So the solo user can create and read their plan's week copies but never delete or
renumber them. `client_programs`, the table above it, does have all four solo policies; this table was left with two.
Same class as the four earlier solo `coach_id` bugs.

**What it actually does to data.**
- **Deletes: harmless today, by luck.** Every copy the app writes has its own per-slot clone template, and
  `client_program_workouts.workout_template_id` is ON DELETE CASCADE. The helper then deletes the clone (allowed: the clone's
  `coach_id` is the user's own id), and the cascade removes the copy the policy refused. The logged error is real, the
  stale copy is not.
- **Renumber: a real silent bug.** Deleting a week from a programme in Personal view renumbers the master weeks but not the
  solo copies, and `step('renumberClientCopy')` does not check the row count. The solo plan's later weeks keep their old
  week numbers. Not yet seen on Jake's data (unverified).

## Fixed, 2026-10-31

- `scripts/fix-solo-week-copies-delete-update-2026-10-31.sql` (applied by Jake; the read-back showed all 6 policies): solo DELETE and UPDATE on
  `client_program_workouts`, anchored like the existing solo policies, the UPDATE with a WITH CHECK. Verified locally first by
  `scripts/sql-verify/solo-week-copies.verify.mjs` (53 checks, 11 mutations all caught).
- `deletePhaseWeek` (`js/app-programs.js`): both renumbers now check their row count, so a refused renumber says "only partly deleted"
  instead of "Week N deleted".
- Evidence: `tests/solo-week-copies-2026-10-31.spec.js`, red on the live database before the SQL, green after.
- Not changed: [2026-09-06 deletePhaseWeek renumber](2026-09-06-deletephaseweek-renumber-fans-out-past-propagationtargets.md) (the
  renumber still reaches every assignee, not only `_propagationTargets`) stays open.
