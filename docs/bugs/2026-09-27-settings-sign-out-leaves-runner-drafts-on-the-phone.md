---
id: 2026-09-27-settings-sign-out-leaves-runner-drafts-on-the-phone
status: closed
priority: medium
reported: 2026-09-27
status_detail: "CLOSED 2026-09-27 by rule (b): tests/app-audit-quickfixes-2026-09-27.spec.js 'signing out from Settings on a phone clears runner drafts' went RED before the fix (draft still present) and GREEN after. All four sign-out routes now call signOutAndClearDrafts() (app-core.js); checks.sh rule 9q refuses any other db.auth.signOut() call. Live once the next release is cut. Two residuals, accepted, below."
---

# Signing out from Settings left the in-progress workout draft on the device

**Plain English.** The 2026-07-10 fix that wipes in-progress workout drafts (client name, exercises, weights) at sign-out
was wired only to the sidebar's Sign out button. On phones the sidebar is hidden, so everyone signs out from Settings, and
that button wiped nothing. The device the fix was written for (a shared gym phone) was the one it never ran on.

## Evidence

- Reproduced 2026-09-27 by a throwaway Playwright probe at 390x844: sidebar `#sign-out-btn` hidden; a seeded
  `_runnerDraft_` key survived signing out via `#settings-sign-out-btn`.
- Cleanup lived only in the `#sign-out-btn` handler (`js/app-core.js`). Three other routes called `db.auth.signOut()`
  directly: Settings (`js/app-progress.js`), the consent gate (`js/app-core.js`), and account deletion (`js/app-progress.js`).

## Fix

One helper, `signOutAndClearDrafts()` in app-core.js, used by all four routes; rule 9q (`scripts/check-sign-out-path.mjs`)
refuses a direct call anywhere else in js/ or index.html.

Deliberately NOT wiped in `onAuthStateChange`: that also fires when a session expires, and wiping there would throw away the
genuine user's unsaved workout.

## Residuals (accepted, from the multi-agent review)

- **A second tab running a workout rewrites the draft.** The runner's 10-second safety net (`js/app-runner.js`
  `_startRunnerDraftSafetyNet`) keeps writing `_runnerDraft_<id>` while `_runner` is set, so a workout open in another tab
  puts the draft back within 10 s of a sign-out in this one. Not fixed: stopping the safety net on SIGNED_OUT would also stop
  it for a user whose session merely expired mid-workout, and nothing restarts it after re-login. Needs two tabs on a
  shared device; the same tab can't hit it, because the runner overlay covers every sign-out button.
- **Walking away without signing out** leaves the draft until that client's runner is next opened (same-day staleness
  check). Unchanged, by design.
