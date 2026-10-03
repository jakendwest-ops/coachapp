---
id: 2026-10-03-sign-out-ends-every-device-session
status: open
priority: low
reported: 2026-10-03
status_detail: "Found by Claude 2026-10-03 while root-causing the pb-consolidation SOLO test (2026-09-30-pb-consolidation-solo-write-path-fails-only-in-the-full-suite.md); not reported by Jake. supabase-js signOut() defaults to scope 'global' (confirmed in the pinned 2.117.2 bundle): it revokes every session of the account on the server, not just this device's. Nothing is broken today and nothing was changed - it is a product and security call for Jake."
closing_conditions: "Jake decides. If 'this device only' (scope 'local', recommended): change the sign-out handler, add a spec that signs out in one browser context and proves a second context's session still saves, and simplify the saved-login workaround in tests/session-store.js. If 'keep every device': record that decision in docs/decisions.md and close this row."
---

# Sign out ends the session on every device, not just this one

**Closes when:** Jake chooses between "this device only" and "every device", and the choice is built or recorded (see `closing_conditions`).

## What happens

The app's Sign out calls the login service's `signOut()` with its default scope, `global`. That revokes **every**
session the account holds, on the server, not only the one in this browser. A second device still *looks* signed in:
the app shell renders from the token stored on that device, and the database API only checks the token's signature
and expiry. It stays that way until something talks to the login service itself (a save that calls `getUser()`, a
profile update, or the hourly token refresh), and then it fails with "session expired".

Since `v2026.09.13` the two saves that call `getUser()` (`savePerformanceLog`, `saveEvent`) say "Your session has
expired - please sign in again." instead of crashing; saves that go straight to the database keep working until the
access token's 60 minutes run out.

## Why it matters

A coach who signs out on a shared tablet and then logs a set on their phone gets a "session expired" they did not
cause. It is also what made the test suite fail late in a long run: the specs that click Sign out revoked the one
saved login every later test reuses. That was fixed in the tests, not in the app - see
[the closed record](2026-09-30-pb-consolidation-solo-write-path-fails-only-in-the-full-suite.md).

## The choice

- **This device only (`signOut({ scope: 'local' })`) - recommended.** What people expect from the button. A lost or
  shared device is then ended separately, by a "Sign out of all devices" action added later in Settings
  (`scope: 'global'`).
- **Keep every device.** Safer if a device is lost or shared, because signing out anywhere cuts everything off, at the
  price of the side effect above - which should then be explained to the user rather than left as a surprise.
