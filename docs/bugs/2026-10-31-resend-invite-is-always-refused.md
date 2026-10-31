---
id: 2026-10-31-resend-invite-is-always-refused
status: open
priority: medium
reported: 2026-10-31
status_detail: "open — found reading the code 2026-10-31 (not reproduced live). MVP 7 (invite state) removes the button that cannot work; a working resend is a separate task (the deployed invite-client function must change, and it needs a real email to test)."
---

# "Resend invite" can never succeed

The client profile shows "✉ Resend invite" whenever `clients.invited_at` is set (`js/app-clients.js`, `openClient`). It calls the
`invite-client` Edge Function, which refuses any client already linked to a login: `if (client.user_id) return 409 "This client
already has an account"` (`supabase/functions/invite-client/index.ts:53`). The FIRST invite is what links them: it creates the login
straight away and writes `clients.user_id` (lines 69-103), and only after that succeeds does the app stamp `invited_at`. So every client
the button is shown for is already linked, and every press is refused - the button briefly reads "✗ This client already has an account".

A client who never got (or lost) the email therefore cannot be sent another one from the app.

**Found by:** reading the code while designing MVP 7, 2026-10-31. Not pressed live - the refusal is certain from the two lines above,
but nothing here has been observed.

**MVP 7** replaces the button with what the app actually knows ("Invited 6 Oct · not signed in yet", from
`coach_client_summary.signed_in`), so it no longer offers something that fails.

**Closes when:** a coach can send a linked-but-never-signed-in client a fresh invite email from the app, and a test that pressed it
went red before the fix and green after. The likely shape (unverified): the function, for a linked login that has never signed in,
sends a new invite link to that same login instead of refusing - checked against a real inbox before it is trusted.
