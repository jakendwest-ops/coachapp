---
id: 2026-10-29-client-check-ins-get-no-response
status: open
priority: high
reported: 2026-10-29
status_detail: "A client submits a weekly check-in and hears nothing back: the coach only sees it by opening that client's Overview, with no way to mark it seen or reply. The client's form pre-fills last week's answers, so submitting without touching it sends last week's numbers as this week's. Planned 2026-09-19 (docs/superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md, 'Commit B - the loop'); approved by Jake 2026-10-29 as MVP item 2 of the Coach experience. scripts/add-checkin-review-2026-10-29.sql applied by Jake 2026-10-29 (first version; read-back matched)."
closing_conditions: "The behavioural spec tests/checkin-loop-2026-10-29.spec.js is green (each refusal red before its policy existed); Jake confirms as coach that a real client check-in appears in 'Check-ins to review', Seen and Reply work, and the client sees the reply."
---

# Client check-ins get no response

**Closes when:** the behavioural spec is green against the live policies, and Jake confirms the live path as coach (a real client check-in
appears, Seen ✓ and Reply work, the client sees the reply) - the one leg that cannot be automated across real accounts.

## What was wrong

- The coach saw a check-in only on that client's Overview, with no Seen state and no reply. Nothing told the client anyone had read it.
- The client form was four range sliders pre-filled with last week's answers: untouched, they submitted last week's numbers.

## What changes (approved 2026-10-29)

- `client_check_ins` gains `coach_reply`, `reviewed_at`, `reviewed_by`. A coach may UPDATE only those three columns, only on their own
  clients' rows; the server stamps who and when (`stamp_check_in_review`), so neither can be forged, cleared or back-dated. A client may
  delete their own rows. A row is always INSERTED unreviewed: a client cannot pre-fill a reply or a "seen" on their own check-in.
- Coach Home: "Check-ins to review" (unreviewed, last 14 days, flagged first) with Seen ✓ / Reply. Overview shows seen and the reply.
- Client: five tap buttons per question, no default, submit disabled until all four are answered; the coach's reply and "Seen by your coach".

## Found while building

The first version of the SQL (run 2026-10-29) left INSERT table-wide with no guard on the new columns, so a client could insert a check-in
already marked reviewed, with a reply of their own, and keep it out of the coach's inbox. The script now also clears the three review
columns on INSERT; re-run it (idempotent) to apply.
