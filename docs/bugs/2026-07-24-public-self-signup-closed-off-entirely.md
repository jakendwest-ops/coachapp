---
id: 2026-07-24-public-self-signup-closed-off-entirely
status: closed
priority: critical
reported: 2026-07-24
status_detail: "CLOSED 2026-09-06, both halves. Client-side path removed 2026-07-24 (57a188a, tests/signup-removed-2026-07-24.spec.js). Server half done by Jake in the Supabase dashboard 2026-09-06 after a probe found it had never been flipped; re-probed independently, /auth/v1/settings now reports disable_signup=true."
---

# Public self-signup closed off entirely

✅ **FIXED + LIVE 2026-07-24 (57a188a) — Public self-signup closed off entirely.** Jake, live: *"I gave my brother the URL and from the login screen he was able to create an account. It looks like the system has automatically given him a PT account."* Confirmed as designed-but-unwanted: anyone with the URL got a full PT/coach account, no invite/approval gate. Removed the signup form, its handlers, and the show-signup/show-login toggle entirely (not hidden — `db.auth.signUp` is callable directly via devtools regardless of UI). **Jake still needs to turn off "Allow new users to sign up" in the Supabase Auth dashboard** separately — this closes the client-side path only. `tests/signup-removed-2026-07-24.spec.js` (3 tests).


---

## 2026-09-06 — probed, and the server half is STILL OPEN

`GET /auth/v1/settings` on the live project (read-only, public endpoint, creates nothing) returns:

    disable_signup : false
    external.email : true

**So the second half of this row was never done.** The UI is gone and
`tests/signup-removed-2026-07-24.spec.js` proves it stays gone — but that spec covers only the half
that was fixed. `db.auth.signUp` remains callable against the anon key, which is public in the
shipped bundle by design, so a signup is still a plain HTTP POST away. That is exactly the reason the
2026-07-24 fix removed the form rather than hiding it, and the note that a dashboard toggle was still
required has sat unactioned since.

**Why this row must NOT close on clause (b).** It is a two-part row with a spec covering one part.
`closure-candidates` flags it as a candidate because the spec names its subject; opening the spec —
which is what that check tells you to do — shows it asserts the login screen has no signup affordance
and nothing about the server. A date match is a lead, never a closure, and so is a *subject* match
when the row has two halves. Left `fixed-awaiting-jake` deliberately.

**Blast radius, stated honestly:** an account created this way is an `auth.users` row. Whether it
becomes a usable coach account depends on profile provisioning, which is not re-verified here — Jake's
2026-07-24 report (*"the system has automatically given him a PT account"*) is the evidence that it
did then. Unverified today, and not worth probing by creating an account on production.

**Closes when** `disable_signup` reads `true` on that endpoint. That is a one-setting change and a
re-probe, not a code change.

---

## 2026-09-06 — CLOSED, both halves, 44 days after the first

Jake turned "Allow new users to sign up" off in the Supabase dashboard. **Re-probed independently
rather than taking the click as proof** — `GET /auth/v1/settings` now returns:

    disable_signup : true

**Closed under clause (a): Jake did the action and confirmed it, and the state was verified at the
source.** The spec (`tests/signup-removed-2026-07-24.spec.js`) never could have closed this row and
still cannot — it asserts the login screen offers no signup affordance, which is the half that was
already done. Kept as the regression guard for that half only.

### One thing the dashboard showed that the probe had not

**"Confirm email" is OFF.** So for the 44 days this was open, a signup needed no working email
address — the account was live immediately, no verification step. That is why the exposure was total
rather than partial: no button, and also no barrier once the endpoint was found. Left OFF
deliberately: one change at a time, and with signups disabled it no longer gates anything an attacker
can reach. **If public signup is ever re-enabled, this must be reconsidered in the same breath.**

### The regression test, and what it did NOT cover

Jake sent a live invite immediately after the change, through **Settings → "Invite a personal user"**
→ `invite-solo-user`, and the database confirms it completed **all three** of its steps while
`disable_signup` was already `true`:

| step | evidence |
|---|---|
| auth user created | `profiles` row exists |
| role set to solo | `role = 'solo'` (the `handle_new_user` trigger defaults to `'coach'`, so this is the function's own overwrite) |
| self-referential clients row | joined `clients` row with `coach_id IS NULL` |

Timestamp `2026-09-06 14:24:39+00` = 15:24:39 BST, matching the minute the invite was sent.

**This verifies the admin API bypasses `disable_signup`** — previously an inference from reading
`auth.admin.inviteUserByEmail` in the function source, now observed end-to-end on this project. It is
the regression evidence for the setting change, and it did not depend on the invite email arriving.

**Still unverified: `invite-client`** (the "✉ Send invite" button on a client's profile,
`js/app-progress.js:981`). Its source is **not in this repo** — deployed only — so it was never read.
Its sibling uses admin invite and the solo path now demonstrably survives the setting, so the risk it
calls the public `signUp` is low. Low is not zero and not measured. **First client invite after
2026-09-06 is the test**; if it fails with "Signups not allowed for this instance", that is the cause.

