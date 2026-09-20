---
id: 2026-09-20-runner-survives-a-session-ending-mid-workout-and-now-holds-the-wake-lock
status: open
priority: low
reported: 2026-09-20
status_detail: "open — found by the multi-agent review of R1b–R1e (Agent C); read from code, not reproduced. The overlay half is pre-existing; the wake-lock half is new with R1e. Deliberately NOT fixed in the review follow-ups: the obvious fix loses a workout."
---

# The runner overlay (and now the screen wake lock) outlive a session that ends mid-workout

If the session ends while a workout is open — a refresh-token failure, or signing out in another tab — the
`onAuthStateChange` else-branch (`js/app-progress.js`) only resets flags and calls `showAuth()`, which hides
`#app-shell` and drops the consent gate (`js/app-core.js`, `showAuth` — its own comment explains that a
`position:fixed` overlay left over the login form is the reason). `#workout-runner` is **not** on that list: it is
created with `document.body.appendChild` (`js/app-runner.js`, `renderRunner`), so it stays painted over the login
screen at z-index 300 with its timers still running and the previous person's exercises visible, and `_runner` stays set.

**Two consequences.**
- *Pre-existing:* the runner overlay covers the login form, and on a shared or gym device the next person sees the last
  person's workout until the page is reloaded.
- *New with R1e (2026-09-20):* the screen wake lock is still held (the `visibilitychange` handler even re-takes it on
  each return to the tab). It ends on page unload, so the cost is bounded, but it is a lock outliving its owner.

**Why it was not fixed with the review follow-ups.** The obvious fix — call `discardRunner()` from the sign-out branch —
also runs `_clearRunnerDraft`, and a *token failure* mid-workout is exactly when the user most wants the draft kept so
they can log back in and be offered "Resume in-progress workout?". Discarding there trades a cosmetic problem for
losing someone's workout. And the sign-out branch cannot be exercised by a test without really signing the shared E2E
account out (which invalidates its refresh token for every other spec).

**Fix shape when it is wanted.** A `_suspendRunnerForSignOut()` that does everything `discardRunner` does **except**
clear the draft: clears the timers, releases the lock, removes the overlays, nulls `_runner`; called from `showAuth()`
next to the consent-gate removal. Extract the sign-out branch's work into a named function so a spec can call it
directly instead of signing out. Assert: overlay gone, no live interval, lock released, and the draft still present so the
resume prompt appears after the next login.

**Evidence that would close it:** that spec going red → green, or Jake reproducing the overlay staying up after a
session expiry on a real phone.
