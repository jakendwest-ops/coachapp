---
id: 2026-10-01-effort-value-check-constraint-unverified
status: closed
priority: medium
reported: 2026-10-01
status_detail: "CLOSED 2026-10-01 on Jake's own result. He ran the read-only pg_constraint query on public.workout_log_sets and pasted it: the only effort-related constraint is workout_log_sets_effort_type_check (effort_type = ANY (rpe, rir); NULL passes). There is NO constraint on effort_value, so the 0..10 guard (_effortOrNull) is simply conservative and cannot be tripped by a value the database would refuse; no scale-aware change is needed. Recorded in docs/schema.md. Not Jake-reported; closed by the data he supplied."
closing_conditions: "Jake runs the one read-only query in this row and pastes the result. Then EITHER the constraint is 0..10 for both scales (record it in docs/schema.md and close), OR it is scale-dependent (e.g. RIR 0..5) and _effortOrNull is made scale-aware with a test that goes RED before and GREEN after. Reading the repo is not a closing condition."
---

# Is there a CHECK on workout_log_sets.effort_value, and does it depend on effort_type?

**Closes when:** Jake runs the one read-only query in this row and pastes the result. Then EITHER the constraint is 0..10 for both scales (record it in docs/schema.md and close), OR it is scale-dependent (e.g. RIR 0..5) and _effortOrNull is made scale-aware with a test that goes RED before and GREEN after. Reading the repo is not a closing condition.

## Why it matters

Every set in a session rides ONE batched `workout_log_sets` insert, and its failure handler deletes the
exercises and the `workout_logs` row. So a single value that trips a CHECK costs the whole session, not
one field. `_effortOrNull` (js/app-runner.js) is the one guard on both writers, and it assumes 0..10 fits
both RPE (1-10) and RIR (0-5).

Two things make that assumption worth checking rather than trusting. The builder lets a coach prescribe RIR
up to 10 (`min="1" max="10"` on both scales) while the runner's own placeholder for an RIR row says `0–5`;
and nothing in the repo records what the database actually enforces.

## The query (read-only — paste into the Supabase SQL editor)

```sql
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.workout_log_sets'::regclass;
```

Anything mentioning `effort_value` or `effort_type` is what matters. An empty result for those columns
means there is no constraint and the 0..10 guard is simply conservative.

## Result (Jake, 2026-10-01)

`pg_constraint` on `public.workout_log_sets` holds: `workout_log_sets_effort_type_check` (`effort_type` is `'rpe'` or `'rir'`),
`workout_log_sets_set_type_check`, the `wls_*` CHECKs on pace, phase, side and stroke rate, the primary key, and the foreign
key to `workout_log_exercises` (ON DELETE CASCADE). **Nothing constrains `effort_value`.** So the worry in "Why it matters"
does not apply: a value outside 0..10 is blocked only by the app's own guard, never by the database, and a session cannot be
lost to a constraint on that column. If a CHECK on `effort_value` is ever added, `_effortOrNull` is the one place to align it with.
