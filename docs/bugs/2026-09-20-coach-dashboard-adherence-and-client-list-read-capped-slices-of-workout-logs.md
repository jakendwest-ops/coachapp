---
id: 2026-09-20-coach-dashboard-adherence-and-client-list-read-capped-slices-of-workout-logs
status: open
priority: medium
reported: 2026-09-20
status_detail: "OPEN. Found by reading the code (the 2026-09-19 product review), not reported. The migration script is written and verified on a real Postgres engine (47 checks, 9 deliberate breakages each caught) and reviewed (no blocking finding, no tenant leak); it has NOT been run on the live database, and the JS switch and a real-database spec are not built. Closes on a red-to-green spec (adherence and last-session numbers right past the caps) or Jake confirming on his own roster."
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
code ships.

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

## What the JS must do (from the parity review)

- Page the view read with `_fetchAllRows`, ordered `full_name, client_id` — **the API cap applies to a view too**, so a coach
  with more than 200 clients would otherwise be truncated silently.
- Filter `status === 'active'` for "at risk" but sum ALL rows for "Sessions this week", exactly as the dashboard does today.
- The list still needs `clients` for `email` (the view carries none); join by id.
- Escape `full_name` (a client controls it); treat NULL check-in scores with `_checkInTone` (`null <= 2` is true in JS); a NULL
  `program_start` is legal.
- A failed read must show as unavailable, never as "No sessions" or zero.
- `quietClients` in the dashboard is dead code (defined, never rendered) — nothing to preserve.

## Named, not fixed (found while reviewing; none is made worse by the view)

- **A client may be able to rewrite their own `clients.coach_id`** (repo-documented, NOT verified live — no `clients` policy SQL is
  committed and my policy read covered SELECT/ALL only). It would let a client appear on another coach's dashboard. A read-only
  query of the `clients` policies for every command would settle it.
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
