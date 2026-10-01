---
id: 2026-10-01-rpe-top-set-has-no-solo-role-coverage
status: closed
priority: low
reported: 2026-10-01
status_detail: "CLOSED 2026-10-01 by a test proven able to fail. tests/rpe-e2e-roles-2026-10-01.spec.js has a solo journey (personal view: Library, build the top-set template, Start, log, End, Save, accept the 1RM) against window._soloClientId with the skip-if-absent pattern, and its cleanup never deletes the solo client record (cleanupJourney only deletes a client it was handed, and the solo test hands none). Deliberate break: with saveRunnerSession's solo fallback removed (coachId = clientRecord.coach_id, the exact four-times-shipped solo bug shape) the solo journey FAILED (the post-session modal never appeared because the save failed); with the code intact it passes. Not Jake-reported."
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
