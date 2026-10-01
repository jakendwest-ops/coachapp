---
id: 2026-10-01-rpe-top-set-has-no-solo-role-coverage
status: open
priority: low
reported: 2026-10-01
status_detail: "Found by the multi-agent review of the RPE top-set work (2026-09-30 / 2026-10-01), not reported by Jake. Verified: every test in tests/rpe-top-set-2026-09-29.spec.js logs in with loginAsPT and builds a coach-owned client (coach_id set). All three reviewers traced the production paths and found them solo-correct, so this is a missing PROOF, not a known break."
closing_conditions: "One solo-account spec for the runner top-set path using window._soloClientId with the skip-if-absent pattern already used elsewhere, whose cleanup NEVER deletes the solo client record, RED before and GREEN after a deliberate break of the solo path."
---

# The RPE top-set feature has no solo-role test

**Closes when:** One solo-account spec for the runner top-set path using window._soloClientId with the skip-if-absent pattern already used elsewhere, whose cleanup NEVER deletes the solo client record, RED before and GREEN after a deliberate break of the solo path.

Solo shares the coach's `auth.uid()` and its `clients` row has `coach_id = NULL`; four shipped bugs have had
that shape. The new code adds no `coach_id` filter and no role branch, so I expect it to be fine — but
nothing pins it, and the in-gym runner write (`workout_log_sets.effort_*`) and the post-session `client_1rms`
insert now fire on almost every top-set session.

**Cleanup hazard, so nobody is surprised:** this spec's `cleanupFixture` ends with
`db.from('clients').delete().eq('id', clientId)`. A solo test MUST NOT reuse it — that would delete Jake's
real solo client record. It needs its own cleanup that removes only the logs, sets and `client_1rms` rows
the test created, by id.
