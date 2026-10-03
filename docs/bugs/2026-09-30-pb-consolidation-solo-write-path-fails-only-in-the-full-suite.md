---
id: 2026-09-30-pb-consolidation-solo-write-path-fails-only-in-the-full-suite
status: closed
priority: medium
reported: 2026-09-30
closed: 2026-10-03
status_detail: "CLOSED 2026-10-03, root cause found and CONFIRMED BY EXPERIMENT (reproduced in ~25 s, fixed, re-run). Specs that click the real Sign out button as the PT (auth.spec.js 'PT can sign out', app-audit-quickfixes-2026-09-27.spec.js, solo-only, units; plus a local untracked probe) revoke the shared PT test session on the server, because the app calls db.auth.signOut() with supabase-js's default scope 'global'. Every later test still injects that dead session, and it still LOOKS alive (the app shell renders from the local token; PostgREST reads keep working because they check the JWT's signature, not the session). db.auth.getUser() asks the auth server; savePerformanceLog is the only call of that kind a test reaches with a live injected session, and this was the only test exercising it. Fix: this one test signs in for real (NO_SESSION_REUSE set around its login, previous value restored). Un-quarantined. The app-level null-session guard from 2026-10-01 stands. Earlier theories (token expiry, a refresh, memory pressure, test count) were all wrong; see History."
closing_conditions: "MET 2026-10-03: (1) the failure reproduces on demand with tracked specs only: with the fix switched off, `npx playwright test tests/auth.spec.js tests/pb-consolidation-2026-08-17.spec.js -g \"PT can sign out|SOLO: the real write path\"` fails the SOLO test with 'Your session has expired' while the same test alone passes; (2) with the fix that two-spec run passes, and so does the whole of pb-consolidation after the sign-out spec (13/13 with the local probe included); (3) the test is un-quarantined. The release gate's full-suite run is the final confirmation (still to come when this is released)."
---

# `savePerformanceLog` throws on a null lookup — only when the full suite runs

**CLOSED 2026-10-03.** Root cause and fix below; the history that led to it is kept further down, unedited, because three of its
theories were wrong and the next person should see why.

## Root cause (2026-10-03)

The suite signs in once per role at the start and replays that saved session into every test (`tests/session-store.js`). Several
specs click the real **Sign out** button as the PT: `auth.spec.js` ("PT can sign out"), `app-audit-quickfixes-2026-09-27.spec.js`,
`solo-only-2026-07-24.spec.js` and `units-2026-07-24.spec.js` (the last two also sign the client out); the first two sort before
`pb-consolidation`. A local, untracked probe, `_debug-adhoc-audit.spec.js` (gitignored), does it as test #2 on a machine that has
it, and runs first. The app's sign-out calls `db.auth.signOut()` with no argument, and supabase-js defaults that to
`scope: 'global'` (confirmed in the pinned 2.117.2 bundle), which revokes **every** session of that account on the server —
including the saved one every later test is about to use.

A revoked session does not look dead:
- the app shell renders from the token in local storage;
- PostgREST reads keep working until the JWT expires, because PostgREST checks the token's signature and expiry, not whether the
  session still exists — which is why `_verifyClientAccess`'s read one line before the failing call always succeeded;
- only the auth server notices, and only calls that ask it: `db.auth.getUser()` (in `savePerformanceLog` and `saveEvent`) and
  `updateUser()` (elsewhere in `app-progress.js`), plus supabase-js's own token refresh. `savePerformanceLog` is the only such call
  a test reaches with a live injected session — `saveEvent` and `updateUser` are stubbed in their specs.

So the failure needs "a sign-out spec ran earlier", which is why it appeared only in the full suite and never alone. It was never
about time or load. `tests/error-capture-2026-09-19.spec.js` already carries a comment showing the original authors knew a
sign-out kills the shared session ("so they fall back to a form login"), but the fallback only triggers when the app shell
fails to come up, which a revoked-but-unexpired session does not cause.

## Fix

`tests/pb-consolidation-2026-08-17.spec.js`: the test signs in for real by setting `process.env.NO_SESSION_REUSE = '1'` around its
`loginAsPT`, putting the previous value back afterwards (a `finally`; so a whole run launched with `NO_SESSION_REUSE=1` keeps it).
`injectSession` reads it on every call and the suite runs one test at a time, so it cannot leak. The earlier
`db.auth.refreshSession()` workaround is removed: it could not work, because the refresh token is revoked too. The test is no
longer `test.fixme`.

## Related hazard found on the way, fixed the same day

The saved session's access token lives exactly **60 minutes** (measured: exp − iat) and is captured once, at the start of the run.
The full suite takes 47–59 minutes, so a run that got a few minutes slower would have had its last tests hit an expired token
whose refresh token is revoked: every late login would wait out a 15-second timeout and fall back to a slow form login.
`tests/session-store.js` now re-captures a role's session when the saved one is more than 25 minutes old
(`SESSION_MAX_AGE_MS` overrides, for testing), never throws, and does not retry a failed capture on every later login.
On master 2026-10-03; ships with the next release.

## Open question for Jake (product, not a test problem)

The app's Sign out is global: signing out on one device ends the session on every other device. That other device keeps looking
signed in and its reads keep working until its token lapses, then saves that need the auth server fail with "Your session has
expired". `db.auth.signOut({ scope: 'local' })` would sign out only the current device — and would also remove this whole class of
test-harness problem at its root — but whether sign-out should end every session is a product and security decision, so it was
not changed.

## What happens (original report)

`tests/pb-consolidation-2026-08-17.spec.js:130` — *"SOLO: the real write path (Progress → Personal
Bests) actually writes a row"* — fails with:

```
TypeError: Cannot read properties of null (reading 'id')
    at savePerformanceLog (js/app-progress.js?v=71:750:21)
```

It failed on the first attempt **and** on Playwright's retry inside the full run, then passed when
the same spec was run on its own against the same commit.

## Why it mattered more than a flake normally would

The line is in the **real write path** for Personal Bests, which `6d1598b` ("Personal Bests: the one
page for all of it") had just reworked — `_soloTileMyProgress`'s own comment names this very spec as
the proof that the consolidation works. A null-dereference there is the difference between a saved
personal best and a silent failure, so "it passes on its own" was not good enough.

## Not to be confused with

`tests/dashboard-benchmarks-best-2026-09-19.spec.js`'s SOLO case, which failed in the same run for
an unrelated and now-fixed reason: `dd61a20` deliberately replaced the solo Benchmarks card with the
"My progress" tile, so the test's selector pointed at UI that no longer exists. Retargeted
2026-09-30 (the rule it pins is still live), not deleted.

## History (kept verbatim; superseded by the root cause above)

**2026-10-01 — closed on condition (a), wrongly.** The null dereference of `user.id` after `db.auth.getUser()` was guarded in
`savePerformanceLog` and, pre-emptively, in `saveEvent` (commit 809daee). That fix is real and stays. The closure's claim that the
cause was "the harness's cached token going stale over a long run" was a guess and wrong.

**2026-10-02 — reopened and quarantined, status_detail as written then:**

> REOPENED 2026-10-02. The 2026-10-01 closure was half right: the APP-LEVEL crash (savePerformanceLog dereferencing a null user)
> IS genuinely fixed and stays fixed. What the closure got wrong was treating the guard firing cleanly as proof the underlying
> cause was gone. It is not: a 4th full-suite run, after adding an UNCONDITIONAL db.auth.refreshSession() call immediately before
> the real write path specifically to force a fresh token, failed the exact same way a 4th time (4/4 on this exact test now). An
> unconditional refresh not helping rules out 'just needs any refresh attempt' and points at something stronger than plain
> access-token expiry -- plausibly (NOT confirmed) a global (non-'local'-scoped) sign-out somewhere in this ~975-test suite
> revoking the shared pt test account's session server-side, which would explain why _verifyClientAccess's own authenticated REST
> read keeps succeeding: PostgREST validates a JWT's signature/exp locally and does not care about server-side revocation, while
> GoTrue's /auth/v1/user endpoint does. QUARANTINED (test.fixme) so it stops blocking the release gate. A second test
> (tests/progress-hr.spec.js) timed out in the same run; CORRECTION (critic review): its code path makes ZERO calls to
> db.auth.getUser(), so a recurrence would be evidence AGAINST sharing this root cause, not for it.

(The "plausibly" theory in that entry turned out to be exactly right; it was confirmed on 2026-10-03.)

**What was tried and did not work:** `db.auth.getSession()` before the write (a critic review showed `getUser()` and `getSession()`
share the same refresh logic in the pinned supabase-js 2.117.2, so there was never an asymmetry to exploit); `db.auth.refreshSession()`
(the refresh token was revoked too); freeing memory on the dev machine; retrying. The four release runs that died at "exactly 40:00"
were a separate problem: the assistant had given those runs a 40-minute timeout, shorter than the 47–59-minute suite (all four
output files show launch-to-last-write of exactly 40.0 minutes).

**Update 2026-10-03 (save):** the open Sign-out question above is now its own row, so `os-lint` can see it while this
record stays closed: [2026-10-03-sign-out-ends-every-device-session.md](2026-10-03-sign-out-ends-every-device-session.md).
