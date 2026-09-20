---
id: 2026-09-20-workout-templates-insert-accepts-another-coachs-program-id
status: open
priority: medium
reported: 2026-09-20
status_detail: "open — measured by a red-first cross-tenant probe while fixing saveNewTemplate. The app-level guard closes the app path; the DATABASE still accepts it. Impact UNVERIFIED (see below); needs a read-only schema query before any SQL."
---

# `workout_templates` INSERT accepts another coach's `program_id`

**Measured 2026-09-20**, red-first, on the unguarded `saveNewTemplate`
(`tests/savenewtemplate-ownership-2026-09-20.spec.js`, the RECORDING test): coach PT2, using coach PT's programme
and phase ids, ended up owning two `workout_templates` rows stamped with **PT's** `program_id` — one from a matched
programme + phase pair, one from the programme id alone. The `program_phase_workouts` insert into PT's phase **was**
refused by RLS, so that layer works; the `workout_templates` INSERT policy evidently checks who the row belongs to
(`coach_id`) but not that `program_id` points at a programme the inserter owns.

**Plain English:** one coach can attach a workout of their own to another coach's programme, if they know that
programme's id. The other coach can't see it (row-level security hides it), so it can't be noticed from the app.

## What is NOT known (no schema for these tables is in the repo)

- The `ON DELETE` action of the foreign key on `workout_templates.program_id`. If it is not SET NULL / CASCADE, a
  foreign template pointing at PT's programme could **block PT from deleting that programme** — and PT could not see
  the row that blocks it. If it is SET NULL / CASCADE this is only clutter in the inserter's own rows. The spec's
  cleanup reaps PT2's rows before PT's programmes for exactly this reason.
- Whether a successful insert vs a foreign-key error tells the caller that a given programme uuid exists.

**Exposure today:** the app path is closed by the `saveNewTemplate` guard (row
[2026-09-18-savenewtemplate-writes-program_phase_workouts-with-no-ownership-check](2026-09-18-savenewtemplate-writes-program_phase_workouts-with-no-ownership-check.md),
closed). Reaching the gap needs a direct API call with a real programme uuid; uuids are not enumerable.

## What closes it

1. Jake runs **one read-only schema query**: the `workout_templates` policies (INSERT and UPDATE) and the foreign
   key definition on `program_id` (pasted inline, one query per message, per the SQL rules).
2. A reviewed script (`sql-safety`, `multi-agent-review`, Jake runs it, read-back) adding a `WITH CHECK` to the
   INSERT and UPDATE policies so that `program_id IS NULL OR program_id` is a programme the inserter owns
   (`(select auth.uid())`) — checked first against the legitimate writers: client clones and periodisation
   week-clones carry `program_id` NULL; the starter seed and `copyProgramToCoaching` stamp their own new programme.
   Remember the standing lesson: this is a tenancy column, unlike `is_personal`, which must never appear in a policy.
3. Evidence: the RECORDING test's first assertion goes green **against the database with the app guard neutered**,
   plus a control proving a coach can still stamp their own programme.
