---
id: 2026-10-01-effort-value-check-constraint-unverified
status: open
priority: medium
reported: 2026-10-01
status_detail: "Found by the multi-agent review of the RPE top-set work (2026-09-30 / 2026-10-01), not reported by Jake. UNVERIFIED and not verifiable from the repo: no scripts/*.sql file creates or constrains workout_log_sets.effort_value, and docs/schema.md never mentions effort. The runner and the manual Log Session save now both refuse anything outside 0..10 (_effortOrNull), a bound copied from the HTML min/max on the Log Session inputs, not from the database."
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
