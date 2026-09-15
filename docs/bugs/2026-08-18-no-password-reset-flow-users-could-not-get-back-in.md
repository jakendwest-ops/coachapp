---
id: 2026-08-18-no-password-reset-flow-users-could-not-get-back-in
status: fixed-awaiting-jake
priority: high
reported: 2026-08-18
status_detail: "FIXED commit f7a8105, live 2026-08-18 (app-progress v47). 7 red-before tests in tests/password-reset-2026-08-18.spec.js. Awaiting Jake: Colin West has not yet completed a reset."
---

# A real beta user could not get back into the app — there was no reset flow at all

**Jake, 2026-08-18:** *"user colin west was not sent the correct login credentials and therefore cannot
create an account. Are we able to import him"*

Colin (`bouncer358@outlook.com`, solo account, auth id `e9e2d113-…`) was invited **2026-08-09 10:43** and
never confirmed — `email_confirmed_at` and `last_sign_in_at` both NULL eight days later. Supabase invite
links expire, so his was long dead.

He needed no import: his `auth.users` row, `clients` row and `profiles.role = 'solo'` all already existed.
What did not exist was any route back in. **Three gaps, each independently fatal:**

1. **No reset flow at all** — zero `resetPasswordForEmail` anywhere in `js/`, no "forgot password" link.
2. **Re-inviting silently sends nothing.** `invite-solo-user` is deliberately idempotent —
   `if (already) { userId = already.id }` skips `inviteUserByEmail` entirely — so it reports success and
   sends no email.
3. **A dashboard-sent recovery link was INERT.** `onAuthStateChange` did
   `if (event === 'PASSWORD_RECOVERY') return` — swallowed, no form shown. So even the manual workaround
   did nothing.

Recovering him would have needed hand-written SQL to delete the dead auth row. That is not an onboarding
process, and he is the SECOND real user to need manual intervention.

## The load-bearing fix, and the least obvious one

A recovery link **establishes a session**. Without a guard, `currentUser` is set, `showApp()` fires, and the
app boots straight past any password form into the dashboard — the user lands logged in, with the
single-use link already burned and no password set. Both the URL hash and the event now show the form, and
the app shell stays hidden until a password is set. That is the specific thing the test asserts.

Also: the request copy is deliberately non-committal (*"If that email has an account…"*) — confirming
whether an address exists would let anyone enumerate which emails have accounts. And an expired link now
explains itself instead of surfacing Supabase's raw "Auth session missing!".

## Collateral, caught by the gate

The new "Send reset link" button broke 24 runner assertions: Playwright's `has-text()` is a
case-insensitive SUBSTRING match, so `has-text("End")` matched "S**end** reset link". 30 locators across 5
files moved to `:text-is("End")`. The locators were too loose, not the button wrong.

**Closes when:** Colin (or Jake) completes a password reset end to end on live.
