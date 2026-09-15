---
id: 2026-08-12-client-self-service-writes-zero-anchor-app-clients
status: confirmed
priority: medium
reported: 2026-08-12
closed_by: "clause (b) 2026-08-21. ONE shared _verifyOwnClientId(fnName, clientId) helper in app-clients.js, called by all three writes; app-clients v12->v13. New tests/own-client-writes-2026-08-21.spec.js asserts the APP-LEVEL refusal (RLS already refuses, so a DB probe cannot go red before the fix) AND a happy-path test that a client CAN still write to their own record - a guard that refused everything would pass the refusal test and break every real save. Red-before proven by neutering the helper: refusal test failed, happy path still passed. Guard sits immediately before the write, deliberately not before input validation: pb-consolidation-2026-08-17.spec.js:79/:143 drive saveClientPB with a dummy id precisely to reach validation, and for a real caller the ordering changes nothing. checks.sh green; 46 affected-spec tests pass."
status_detail: "RLS-backstopped (behaviourally verified 2026-08-12, see body) — was High. found by the full-codebase architecture audit; directly matches the 2026-07-12 storage-leak incident's table family"
---

# Client self-service writes (saveClientPB / saveClientCheckIn / saveClientWeight) have NO ownership check at all — not even coach_id

Found by the 2026-08-12 full-codebase audit (`architecture-audit-2026-08-12.md`).

## The three sites

`js/app-clients.js`:
- `saveClientPB` (19-23) — `db.from('performance_logs').insert({ client_id: clientId, ... })`
- `saveClientCheckIn` (49) — `db.from('client_check_ins').insert({ client_id: clientId, ... })`
- `saveClientWeight` (65-71) — `db.from('weight_logs').insert({ client_id: clientId, ... })`

In all three, `clientId` is a bare function parameter. Traced the call sites (app-dashboard.js, app-progress.js): it originates from `_getCurrentClientId()` at render time and is embedded into an inline `onclick`. Nothing re-verifies `clientId` belongs to `currentUser` at save time.

## Failure scenario

A signed-in client with devtools access can call e.g. `saveClientWeight('<some-other-clients-uuid>')` directly from the browser console — nothing in the app-level code stops the insert from targeting a different client's record. This is directly the table family (`performance_logs`, `client_check_ins`, `weight_logs`) named in the 2026-07-12 storage cross-tenant leak incident (a different vector — bucket policy — but the same class of "coach A can touch coach B's client's data").

Compare `js/app-workouts.js:2560` (`_verifyTemplateOwnership`), which exists precisely to close this class of gap for tables lacking their own `coach_id` column. app-clients.js has no equivalent anywhere.

**Not independently verified against live RLS** — unconfirmed whether Postgres policies on `performance_logs`/`client_check_ins`/`weight_logs` already block a client writing to another client's row via `client_id`. Given this shape (client-authored write, not coach-authored) is different from the already-confirmed-safe pattern on `workout_template_exercises` (`bugs/2026-08-01-...`), it should not be assumed safe without its own probe.

## Suggested fix direction

A `_verifyOwnClientId(clientId)` check — resolve the caller's own client record (the same lookup `_getCurrentClientId()` already does) and refuse the write if the passed `clientId` doesn't match it — added to all three functions before the insert.

## Cross-reference

Related but distinct root cause from `bugs/2026-08-12-client-scoped-writes-no-ownership-anchor-progress-runner.md` (same table family, but that finding is coach/runner-side unverified writes; this one is client-side self-service writes with literally zero anchor of any kind).

---

## ⬇️ VERIFIED 2026-08-12 — RLS backstops this. Downgraded High → Medium.

The audit filed this as High **unverified**, and named the verification as its own item 6. Done:
`tests/audit-ownership-anchors-rls-2026-08-12.spec.js` (commit `15ff641`).

Logged in as the E2E **client**, attempting each write against a **different** client's id:

| attempt | result |
|---|---|
| `weight_logs.insert` | refused — "violates row-level security policy" |
| `client_1rms.insert` | refused — "violates row-level security policy" |
| `performance_logs.insert` | refused — "violates row-level security policy" |
| `client_check_ins.insert` | refused — "violates row-level security policy" |
| `clients.update(goal_weight_kg)` | **0 rows matched** — RLS filtered it |

Victim row counts confirmed unchanged from a **separate PT session**, not from the attacker's own view,
and both planted-row checks returned 0. Note the `clients` UPDATE returned **no error at all** — an
UPDATE that matches nothing is silent, which is why the row count is the authority here and not the
caller's error object. That is also the specific reason the audit's "worst of the seven" framing for
`saveWeightGoals` does not hold: it cannot write, and it never could.

**So the audit's sharpest claim — "a signed-in client could call `saveClientWeight('<another clients
uuid>')` directly from devtools" — is false in practice.**

**This does NOT close the row.** The finding is real as defence-in-depth: there is still no
`_verifyClientOwnership` helper, the app layer still trusts a bare `clientId` parameter, and RLS is the
only thing standing between a bug here and a cross-tenant write. The audit is right that the helper
should exist. It is simply Medium, not High — nothing is leaking today.

**Still unverified on this row's tables:** the coach → *another coach's client* vector. `weight_logs`
alone is already covered by `ledger-fixes-2026-08-02.spec.js`; the others are not.
