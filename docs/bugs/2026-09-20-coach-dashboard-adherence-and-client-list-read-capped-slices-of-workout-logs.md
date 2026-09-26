---
id: 2026-09-20-coach-dashboard-adherence-and-client-list-read-capped-slices-of-workout-logs
status: closed
priority: medium
reported: 2026-09-20
closed_by: tests/coach-summary-screens-2026-09-21.spec.js, tests/coach-client-summary-2026-09-21.spec.js
status_detail: "CLOSED 2026-09-21 on rule-(b) evidence: red before (8 of 9 tests red on the unchanged screens), green after (13), neuter-proved (25 deliberate breakages of the screens' code and the test stand-in, 16 then 9 more after the review, each caught), and the deployed view proved through the live API by a second spec. Found by reading the code (the 2026-09-19 product review), not reported. Jake ran the migration on the live database on 2026-09-21 and its read-back matched (34 rows: security_invoker on, 19 view columns, anon no privileges, authenticated SELECT only, all five indexes). NOT released: the screens change only when a tag ships. A useful check after that release, not a closure gate: on Jake's own roster a client who last trained 3+ weeks ago shows the true 'Nd ago' in red, and the adherence panel matches what he knows. Named, not fixed (see the end of this file): the unpaged roster reads, a raw c.status in the list badge, an unanchored Goals-due-soon read."
---

# The coach dashboard's adherence panel and the client list read capped slices of workout_logs

**Plain English.** The API returns at most 200 rows per request and says nothing when it cuts a list short. Both coach screens
work out "who trained" from a slice of session logs, so the numbers are right for a small roster and quietly wrong for a busy one:

- **The dashboard** ("Sessions this week", "At risk", the adherence list) reads the *current month's* logs, newest 100. Past
  about 33 clients at three sessions a week, the oldest days drop out and active clients read as at risk. It also **cannot see
  last month at all**: on UTC days 1 to 7 of every month a client who trained on the 28th reads as inactive.
- **The client list** takes each client's "last session" from the newest 200 logs across ALL clients. A client not in that
  window reads **"No sessions"** (grey) instead of "35d ago" (red) — the very clients a coach needs to chase. The list also
  ignores a failed logs read, which reads the same way.

## The fix (Release 2b)

`scripts/add-coach-client-summary-2026-09-20.sql`: five missing indexes and `public.coach_client_summary`, a
`security_invoker` view with one row per client of the calling coach (last session, 7- and 28-day session counts, last
weigh-in, latest check-in scores, newest programme). The database does the arithmetic, so nothing is capped and nothing is
guessed. Then the two screens read it. **Deploy order:** the script is run FIRST (inert until something reads it), then the
code ships. **Done 2026-09-21:** Jake ran the script and its read-back matched; the code is built and unreleased.

**Live schema read 2026-09-20:** Postgres 17.6; RLS on all seven tables; no index on the `client_id` of `workout_logs`,
`weight_logs` or `client_check_ins`, nor on `clients.coach_id` or `program_phases.program_id` (only primary keys); check-in
scores are `integer`; `clients.invited_at` exists; nothing in the app reads `client_programs.status`.

## How it was verified before anyone ran it

An in-memory Postgres (PGlite) loaded with the exact live columns, indexes and SELECT/ALL policies runs the script twice and
asserts 47 things: the numbers for eight scenarios (window edges, a 62-log client, a future-dated log, a NULL-created_at
assignment, a programme with no phases, a client with no data at all), zero rows for another coach / a client / a caller with
no identity, `anon` refused, no writes, the five index definitions exactly, and that re-running over a re-granted view takes
the privileges away again. Nine deliberate breakages (no `security_invoker`, no coach scope, no revoke, a different window,
NULLs last, a wrongly shaped index, a useless index, a zero-week default, no future bound) each fail exactly the intended checks.
This is the first local way this project has had to execute RLS SQL before running it on the live database.

## Review (2026-09-21): no blocking finding, no tenant leak

Three pinned angles (tenant isolation, roles and parity with today's screens, SQL correctness and test honesty) tried to break
it: another coach, a client, a solo caller, a caller with no identity, `service_role`, a planted look-alike function, a
cross-coach programme, a leaky-predicate pushdown. All failed. Changes made because of it: a programme with no phases is
**NULL** weeks, not 0 (otherwise "programme complete" would fire on day one); the newest programme is picked with the same
`created_at desc` ordering every screen uses, so coach and client see the same one; a log dated in the **future** is ignored
(a mistyped year would otherwise make a client look active for a year); the read-back shows full index definitions; three
mutations the first harness did not catch are now caught; and the header states what it really does (windows are 8 and 29
calendar days inclusive; `anon` gets "permission denied", `service_role` gets zero rows).

## The JS switch (built 2026-09-21, not released)

- **Dashboard** (`renderDashboard`, js/app-dashboard.js): "Sessions this week", the adherence rows and the "N at risk · M on track"
  header come from the view's `sessions_7d`, read with `_fetchAllRows` ordered `full_name, client_id`. The tile sums EVERY client
  (any status); the rows, at-risk and on-track use active clients only — exactly as before. A failed read shows "—" on the tile, a
  "Couldn't load this week's sessions" line in the card and "session summaries" in the failure banner (with Retry) — never zeros.
  The activity list is now what its heading says (the last 7 days: the newest 20 sessions by when they were logged, merged with
  weigh-ins as before). The dead `quietClients` code is gone.
- **Client list** (`renderClients`, js/app-clients.js): each client's last session comes from the view's `last_session_date`, paged
  the same way; the newest-200-logs read is gone; a failed read shows "—"; "No sessions" now means the client genuinely has none.
- **Tests.** `tests/coach-summary-screens-2026-09-21.spec.js`: 13 tests, the real `renderDashboard` / `renderClients` against the
  capped stand-in (no rows created) — 8 red / 1 green on the unchanged screens, all green now. `tests/coach-client-summary-2026-09-21.spec.js`:
  4 tests, the deployed view through the live API — the numbers for an active and an inactive client; another coach, a client
  account and an anonymous caller see nothing; the coach's own solo record (coach_id NULL) is not in it; writes are refused. The
  stand-in gained `head: true` (with its own self-test). 25 deliberate breakages of the screens' code and the stand-in, and 6
  test-side mutations of the live spec, are each caught; every restore was byte-identical.
- **Second review (2026-09-21), the three pinned angles: no blocking finding, no tenant leak.** Fixed because of it: the activity
  list pooled sessions by `date` but sorted by `created_at`, so a session logged just now for an earlier day could be crowded out
  (now pooled by `created_at`, with a test); a live "no writes" test that could pass with the view missing (now has a control and
  pins the code); list paging tests whose fixtures also passed on UNPAGED code under one sort order; a "red" check that accepted
  amber; the `Total clients` tile (a HEAD count) had no assertion; the hostile-name test never asserted the list showed the name as
  text; a cleanup that did not filter by coach and could mask a failure; and a comment that claimed "any roster size" while the
  roster read is one request.
- **Measured on the live API, 2026-09-21.** `head: true` with `count: 'exact'` returns no rows and the TRUE total (5,650 on
  `exercises`, far past the 200 cap), unchanged by `.limit(5)`, and 0 for a filter that matches nothing. A write through the view
  returns `55000` ("view not updatable" — it joins and aggregates), so PostgreSQL refuses it BEFORE privileges are consulted: the
  no-write-grant layer is covered by the local verifier and the migration's read-back, not by any API-level test.

## What the JS had to do (from the parity review) — all done

- Page the view read with `_fetchAllRows`, ordered `full_name, client_id` — **the API cap applies to a view too**, so a coach
  with more than 200 clients would otherwise be truncated silently.
- Filter `status === 'active'` for "at risk" but sum ALL rows for "Sessions this week", exactly as the dashboard does today.
- The list still needs `clients` for `email` (the view carries none); join by id.
- Escape `full_name` (a client controls it); treat NULL check-in scores with `_checkInTone` (`null <= 2` is true in JS); a NULL
  `program_start` is legal.
- A failed read must show as unavailable, never as "No sessions" or zero.
- `quietClients` in the dashboard is dead code (defined, never rendered) — nothing to preserve.

## Named, not fixed (found while reviewing; none is made worse by the view)

- **A client can rewrite their own `clients.coach_id`** — **CONFIRMED live 2026-09-26** by Jake's read-only policy query (policy
  `clients_update_own_row` pins only `user_id`). Detaching was already known and accepted; pointing the row at another coach's id
  is the new part. It would let a client appear on another coach's dashboard. Own row: `2026-09-26-a-client-can-rewrite-the-coach-id-of-their-own-clients-row`.
- **A coach can attach another coach's programme id to their own client** (`client_programs` ALL policy has no check on the
  programme's owner). Write side only: the view returns the id with a NULL name and no phase weeks — nothing leaks.
- **Five policies use a bare `auth.uid()`** (evaluated per row rather than once): the client policies on `client_programs`,
  `program_phases`, `programs`, the solo policy on `client_programs`, and `workout_logs`' coach policy. Performance, not security.
- **A client can raise the cost of their own coach's dashboard** by inserting very many logs (an unbounded client write, a general
  exposure). The view plus the new indexes is cheaper than today's unindexed reads.
- **The manual "Log session" date input has no `max`**, which is how a future-dated log can be entered; the view now ignores such
  logs but the input is unchanged.
- **"Session" means every `workout_logs` row**, as on every coach screen; client-facing screens hide logs with no exercises, so a
  coach and a client can already disagree by such rows.

**Found by the second review (2026-09-21), none introduced by the JS switch:**

- **The roster reads are unpaged.** Both screens read `clients` in one request, so past 200 clients the API cuts the roster itself;
  then the dashboard's "Sessions this week" (which sums every view row) would disagree with its rows (which cover only the first
  200 clients). The view side is paged; the `clients` side is not. How many clients any coach has today is unmeasured here, so
  no fix yet — evidence first.
- **The list badge renders `c.status` raw** (`badge-${c.status}` and the text, js/app-clients.js ~184), and a roster read error's
  message raw (~139). **Not exploitable (checked live 2026-09-26):** a client can update their own row, but `clients_status_check`
  limits `status` to `active` / `inactive` / `archived`, so no markup can be stored there. `check-escaping`'s free-text list does
  not include `.status`, so it cannot see it; one `escapeHtml` would still be tidy, but nothing is at risk.
- **"Goals due soon" has no tenant anchor** (js/app-dashboard.js ~55: `status` and dates only, while the count above it has
  `.in('client_id', coachClientIds)`). It relies on the goals RLS policy, which is not in any committed script; for the owner's
  master account it may list personal goals on the coach dashboard.
- **The list's failure UX is quiet:** "—" on every row, no banner and no Retry (the dashboard has both). Left for R2c, which
  rebuilds the list.
- **A failed `clients` read with a working view** renders "No active clients." beside a real non-zero tile (the banner names "your
  clients"). The old code zeroed everything.
- **The live spec cannot see `security_invoker` being dropped by a later `create or replace view`** — the view's own filter and the
  revoke would still satisfy every leg. Only the migration's read-back and the local verifier watch that (docs/critical.md, 2026-09-21).
