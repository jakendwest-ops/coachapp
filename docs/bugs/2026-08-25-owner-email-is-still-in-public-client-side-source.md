---
id: 2026-08-25-owner-email-is-still-in-public-client-side-source
status: open
priority: low
reported: 2026-08-25
status_detail: "reduced from 3 copies to 1 in d361f87 (OWNER_EMAIL + _isOwnerAccount in app-core). NOT eliminated — a client-side gate needs the value client-side. Real remediation is a server-side flag; scoped here, not built."
---

# The owner's email is still readable in the shipped JS

`js/app-core.js` defines `const OWNER_EMAIL = 'jakendwest@gmail.com'`, and CoachApp is a static site
on GitHub Pages — so the literal is in the page source anyone can read.

## What changed on 2026-08-25 and what did not

**Changed:** it was pasted at **three** call sites (`sudoAsClient` in app-dashboard, the "View as"
button in app-clients, the solo-invite card in app-progress) plus once more in a comment. Now it is
**one** named constant behind `_isOwnerAccount()`, and `checks.sh` rule 5b blocks any second copy —
proven to fire on an injected email. That is `feedback-fix-the-class-not-the-instance` applied.

**Not changed:** the value is still shipped. Reducing four copies to one reduces drift, not exposure.

## Why it is `low` and not higher

This is a **UI-affordance gate, not a security boundary** — the same category as `is_personal`. RLS
decides what any account can read or write; this only decides which buttons render. `sudoAsClient`
sets `window._sudoClientId` and navigates; every subsequent query is still RLS-scoped. The Edge
Function behind the solo invite does its own server-side authorization.

So the exposure is a personal email address in public source, not a privilege path.

## What would actually close it

An `is_owner` (or role) column on `profiles`, read at login, replacing the email comparison. That is
a schema change plus an RLS review, and it is not worth bundling into a lint fix.

**Deliberately NOT solved by reusing `window._masterAccount`.** That flag means only "this user holds
both a coached and a solo `clients` row" — a different predicate. Collapsing the two would hand
impersonation to any dual-row user. The two look interchangeable and are not; that near-miss is the
most useful thing in this row.
