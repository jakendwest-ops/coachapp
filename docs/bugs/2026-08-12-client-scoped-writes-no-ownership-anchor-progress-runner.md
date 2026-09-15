---
id: 2026-08-12-client-scoped-writes-no-ownership-anchor-progress-runner
status: confirmed
priority: medium
reported: 2026-08-12
closed_by: "clause (b) 2026-08-21. ONE shared _verifyClientAccess(fnName, clientId) in app-core.js, used by all 9 caller-supplied-clientId writes (7 in app-progress, 2 in app-runner); the 10th, sendClientInvite invited_at, got a direct coach_id anchor instead since it runs after the Edge Function has already authorised. app-core v13->v14, app-progress v48->v49, app-runner v73->v74. Modelled on saveRunnerSession (app-runner.js:2345) which REFUSES on an invisible client row, NOT on _effectiveCoachIdForClient which ends || currentUser.id and is its own open bug. Accepts two shapes - coach_id===me or user_id===me - so solo (coach_id NULL by design) is not excluded. New tests/client-scoped-writes-2026-08-21.spec.js covers coach refusal, coach happy path, client own-record allowed, foreign refused, and null fails closed. Red-before proven by neutering the helper: both refusal tests failed, coach happy path still passed. One regression caught and fixed in a fixture (silent-refusal-2026-08-18.spec.js:74 drove delete1RM with a fabricated clientId). checks.sh green; 43 affected-spec tests pass."
status_detail: "RLS-backstopped (behaviourally verified 2026-08-12, see body) — was High. found by the full-codebase architecture audit; app-level code review only, RLS not independently verified"
---

# Eight write functions across app-progress.js and app-runner.js write to client-scoped tables (client_1rms, performance_logs, weight_logs, clients) with no app-level ownership anchor

Found by the 2026-08-12 full-codebase audit (`architecture-audit-2026-08-12.md`). All eight either update/delete a row by `.eq('id', someId)` alone with no `client_id`/`coach_id` check, or insert a row with `client_id: clientId` taken straight from a caller-supplied parameter that is never re-verified.

## The eight sites

**js/app-progress.js:**
- `save1RM` (208-238, write at 226/228) — `client_1rms`
- `delete1RM` (240-249, write at 242) — `client_1rms`; `clientId` param accepted but never used in the query
- `savePerformanceLog` (533-560, write at 546) — `performance_logs`
- `deletePerfLog` (562-569, write at 565) — `performance_logs`; `clientId` param unused
- `saveWeightLog` (840-865, write at 853) — `weight_logs`
- `saveWeightGoals` (867-886, write at 873) — writes directly to the canonical `clients` row (`starting_weight_kg`/`goal_weight_kg`), highest-severity of the eight
- `deleteWeightLog` (888-895, write at 891) — `weight_logs`; `clientId` param unused
- `sendClientInvite`'s `invited_at` stamp (832) — `clients`, lower stakes (cosmetic field, runs after the invite Edge Function has already succeeded)

**js/app-runner.js:**
- `saveRunnerOneRM` (2619) and `_savePostSessionOneRM` (2500) — both insert into `client_1rms` keyed on `_runner.clientId`/a passed-through `clientId`, same gap as `save1RM` above (same table)

## Why this matters

This codebase has an established, hard-won convention for exactly this shape: `saveRunnerSession` (js/app-runner.js:2308) looks up and verifies a client record's real `coach_id` before trusting a caller-supplied `clientId`, with an explicit comment: *"Confirmed exploitable via a live cross-tenant probe, 2026-07-30"* — the unverified version of that exact function was proven to let one coach's session-save silently attribute a workout log to a client that wasn't theirs. `workout_logs` got that fix; `client_1rms`/`performance_logs`/`weight_logs`/`clients` never did.

**Failure scenario:** `save1RM`'s update path writes `row = { client_id: clientId, ... }` anchored only by `.eq('id', existingId)`. If RLS on `client_1rms` doesn't independently block cross-tenant updates, a coach could pass an `existingId` belonging to a different coach's client alongside their own `clientId`, silently reassigning that record's ownership. `saveRunnerOneRM`/`_savePostSessionOneRM` are bare top-level functions reachable from devtools with an arbitrary `clientId` string.

**Not independently verified against live RLS in this pass** — this repo has no RLS SQL tracked, so whether Postgres policies already block this is unconfirmed either way. Treat as High until a live 2-account probe (same method used for the 2026-07-30 `workout_logs` incident and the 2026-07-12 storage-bucket incident) settles it either way.

## Suggested fix direction

A shared `_verifyClientOwnership(clientId, coachId)` helper, mirroring `_verifyTemplateOwnership` (js/app-workouts.js:2560), that all eight (and any future write to these four tables) route through — rather than patching each call site individually, which would leave the next new write function free to reintroduce the same gap. No app-level ownership-anchor helper currently exists for this table family at all.

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
