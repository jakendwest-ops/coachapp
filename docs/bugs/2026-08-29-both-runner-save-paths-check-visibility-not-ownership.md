---
id: 2026-08-29-both-runner-save-paths-check-visibility-not-ownership
status: closed
priority: high
reported: 2026-08-29
closed_by: "tests/review-fixes-2026-08-29.spec.js 'every client-scoped writer in app-runner calls _verifyClientAccess' — a source class guard, RED when the call is bypassed. Fixed fe58592. See the row for why a behavioural test was NOT possible here."
status_detail: "CLOSED fe58592. All 4 client-scoped writers now call _verifyClientAccess (was 2 of 4). Class guard RED when bypassed. saveRunnerSession and saveWorkoutSession prove the clients row is READABLE, not that it is ours. _verifyClientAccess asserts the latter and fails closed. Counted: 2 of the 4 client-scoped writers in app-runner.js use the strong check; the two save paths do not - and the helper was explicitly modelled on one of them."
---

# Both runner save paths do a *visibility* check where the extracted helper does an *ownership* check

**js/app-runner.js:2345** (`saveRunnerSession`) and **js/app-runner.js:2927** (`saveWorkoutSession`).

    const { data: clientRecord } = await dbq('...:clientLookup',
      db.from('clients').select('coach_id').eq('id', clientId).single(), { showUserError: false })
    if (!clientRecord) { ...refuse... }
    const coachId = clientRecord.coach_id || currentUser.id

This proves the `clients` row is **readable**. It does not prove
`coach_id === currentUser.id || user_id === currentUser.id`. `_verifyClientAccess`
(`app-core.js:1105-1112`) asserts exactly that and fails closed on anything else.

**Counted, not impressionistic — 4 client-scoped writers in this one file, 2 use the strong check:**

| Writer | calls `_verifyClientAccess`? |
|---|---|
| `_savePostSessionOneRM` :2543 | yes |
| `saveRunnerOneRM` :2663 | yes |
| `saveRunnerSession` :2345 | **no** |
| `saveWorkoutSession` :2927 | **no** |

**The asymmetry is itself the evidence.** `app-core.js:1093-1095` records that `_verifyClientAccess` was
*"deliberately modelled on saveRunnerSession (app-runner.js:2345)"*. The two originals were never upgraded
to the helper they inspired, while the two 1RM writers in the same file were.

**Concrete failure:** any `clients` SELECT policy broader than "mine" — a co-client view, a support role,
a future gym/team feature — and both save paths pass their own guard and insert `workout_logs` for that
client. Today the only thing refusing that is `workout_logs_insert_owned_client_only`
(`scripts/fix-workout-logs-insert-policy-2026-07-30.sql:67`) — the database, not the app. That policy
exists *because* a cross-tenant insert here was confirmed exploitable on 2026-07-30. The app-level guard
added alongside it is weaker than the helper later extracted from it.

**Fix:** call `_verifyClientAccess` in both, keeping the existing `coach_id` derivation from the same fetch.

**Closes when:** both call `_verifyClientAccess`, AND a spec drives each with a client id the caller can
READ but does not OWN — RED before, GREEN after. Note the other half:
[[feedback_guard_risk_is_refusing_the_legitimate_user]] — solo (coach_id NULL, user_id = uid) must still
pass, so the spec must assert the legitimate case too, not only the refusal.

---

## CLOSED 2026-08-29 (`fe58592`)

Both save paths now call `_verifyClientAccess`. **2 of 4 client-scoped writers had the strong check;
now 4 of 4.**

## 🔴 My closing condition was not satisfiable, and saying so is the point

I wrote: *"a spec drives each with a client id the caller can READ but does not OWN."* **No such id
exists.** RLS already refuses a read of a foreign `clients` row, so there is nothing to pass. A
behavioural test written anyway would pass with the fix removed — the decorative-test class.

So the evidence is a **source class guard** asserting all four writers call the helper, ratcheted and
proven RED by bypassing one:

    guard bypassed -> "these writers attribute rows to a clientId without an OWNERSHIP check"  (RED)

**This is the honest shape of the finding.** The fix is defence-in-depth against a future `clients`
SELECT policy broader than "mine" — a support role, a gym/team feature. Today the database is what
refuses the cross-tenant insert. A test cannot demonstrate a gap the database currently closes; what it
*can* do is refuse to let the app-level check silently disappear again, which is exactly how these two
drifted from the helper they inspired.

## 🔴 The class guard was DECORATIVE on first write

It **passed while the guard was bypassed** — because my own explanatory comment above the call contains
the string `_verifyClientAccess`, and the scanner read prose as code. It now strips comments first.

**Identical to the `guardReentry` class test's bug on 2026-08-28 — two days running.** Both were caught
only by neutering, never by re-reading. See [[feedback_reports_success_doing_nothing]] and
[[feedback_name_the_spec_before_neutering]].
