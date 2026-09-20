---
id: 2026-09-20-runner-finish-screen-claims-false-prs-and-loses-typed-notes
status: closed
priority: medium
reported: 2026-09-20
closed_by: tests/runner-pr-baseline-2026-09-20.spec.js
status_detail: "CLOSED 2026-09-20 on rule-(b) evidence: red before, green after, neuter-proved, and the new query proved on the real database. Found by reading the code (plan item R4b), not reported. Whether a real athlete has seen a false PR is unmeasured. NOT built: the in-session PR badge and 'same as last' (Release 4c / 4d) — both gated on Jake's answers."
---

# The finish screen's "PR" was compared against a truncated history, flashed false PRs, and wiped typed notes

**Plain English.** When an athlete finishes a workout the app says "🏆 N PRs". That claim was wrong in four ways, and a
fifth thing on the same screen quietly lost what they typed.

1. **Old history was compared instead of all of it.** The lookup read the client's logged exercises, then their sets, with no
   order and no limit. The API returns at most 200 rows per request and, in practice, hands an un-ordered read back
   oldest-first (an assumption about the live table, modelled in the test stand-in, not measured on this table). So someone with
   more than about 50 sessions of a four-set lift was compared against their *oldest* sets: every later, heavier session read
   as a PR however many times they had beaten it before. The rows dropped are the newest, which is exactly where a progressing
   client's best lives.
2. **A renamed exercise lost its history.** The lookup matched on name only, although the runner already carries the exercise's
   library id (the "Beat last time" line uses it). Rename a lift and its next session was a PR.
3. **A flash of false PRs, and a stuck one.** The screen drew first "with no PR data", but no data meant a baseline of zero, so
   *every* weighted lift showed "🏆 PR" until the lookup returned, and kept showing it if the lookup failed.
4. **Two copies of the rule** (the header count and the per-exercise chip).
5. **Typed notes wiped.** When the lookup returned, the whole finish form was repainted, resetting the notes to empty and the
   session name to its default. Observed in the red run: notes `""`, name `[E2E] PR` after typing into both.

## Fix (`js/app-runner.js`)

- `_isWeightPr(bestKg, baselineKg)`: the one rule. A baseline of 0 means "no history" (the first ever log of a lift still counts,
  unchanged); a baseline that is null/absent means "unknown" and is never a PR.
- `_prBaseline(clientId, { name, exerciseId })`: the heaviest set ever, as **one row** (`order weight_kg desc, limit 1`, `weight_kg
  not null`), by library id and by exact name in parallel, the heavier winning — the id keeps a renamed lift's history, the name
  keeps rows logged before the id link existed. One two-level `!inner` embed filtered on the dotted path, so the read is
  bounded whatever the history size, scoped by client exactly as before.
- The screen claims nothing until each lift's baseline is known; a failed lookup leaves that lift with no PR; and the typed
  session name and notes are carried across the repaint.

## Evidence

`tests/runner-pr-baseline-2026-09-20.spec.js` (20 tests), the real `showRunnerFinish` against `tests/capped-api.js`. Red before,
as observed: the exercise read returned 200 rows; 120 kg showed as a PR against 140 kg of history; a renamed lift showed a PR;
the immediate render celebrated everything; a failed lookup left every lift a PR; notes and name wiped. Green after. **Real
database:** with its own tagged fixture (2 logs, 2 exercises, 4 sets, cleanup asserted to the row) the query returned the true
maximum by name (140), by library id (130 for a renamed lift), by both (140) and 0 for none. Neuter proofs, each failing exactly
the intended tests: unknown counted as zero; the id lookup dropped; sort direction reversed (also fails on the real database);
the client filter removed (another client's heavier lift then hides a real PR); the `limit(1)` removed; the typed-value
carry-over removed; the chip and the header on different rules.

The test stand-in gained three capabilities for this, each with self-tests and neuter proofs: dotted-path filters through
to-one embeds, an `unordered: 'insertion'` mode, and PostgREST's `!inner` rule (a filter on an embedded column excludes the
parent only when every embed on its path is `!inner`, so a dropped `!inner` now fails a test instead of quietly passing).

## Review of the first pass (2026-09-20)

Three pinned angles plus my own verification. **No tenant leak: the new read is scoped at least as strictly as the old.** Real
findings, all fixed: (1) **a save in flight could be clobbered** — `saveRunnerSession` disables its button on the node it
captured (its only re-entry guard) and the repaint put back a fresh, enabled Save, so a tap before the lookup returned could
insert a second log (two reviewers, independently; the old code had the same hazard for any client with history, and this
change widened it by repainting on every finish); (2) **the repaint was needless whenever no lift is a PR** (the common case)
and cost the athlete focus, caret, scroll and a phone keyboard — it now happens only when a PR chip appears, and never over a
save; (3) baselines were keyed by exercise *name*, so two same-named lifts with different library ids overwrote each other
(now a `Map` keyed by the exercise); (4) the real-database test never asked about *another* client, so a dropped client
filter or a dropped second-level `!inner` would have passed it (it now asks, and each breakage fails it); (5) most "no PR"
assertions would also pass if every lookup had thrown — each test now requires that the lookups succeeded; (6) tests for a
repeated lift (equal is not a PR), NULL-weight bodyweight rows, and no client id were missing; (7) an inert test (the new read
is always ordered, so the unordered-read mode could not matter) was removed. Not a finding after measuring: B's worry that a
converted lb weight could be stored rounded and a repeat then read as a PR — `weight_kg` round-trips a 15-digit float
exactly (measured), so equal compares equal.

**Measured on the real database (read-only or self-cleaning):** the one-query read agrees with the old two-step read on every
real exercise under a **client** session; under the **solo** view it runs without error (that record has no logged lifts, so
the answer is 0); the fixture test proves by-name, by-id, both, none and another client's history.

## Named, not fixed

- **The in-session PR badge (4c) and "same as last" (4d)** are unbuilt — they wait on Jake's answers (R4-0 Q3 / Q1).
- **First ever log counts as a PR** — unchanged, as the plan said, until Jake answers R4-0 Q4.
- **The rule is weight-only**, as it always was: a rep or estimated-1RM PR at the same weight is not celebrated.
- **Focus is lost on the repaint**: typed text is kept, but if the athlete is mid-sentence in the notes when the lookup returns
  (a fraction of a second to a few seconds on bad signal) the field loses focus and a phone keyboard may close.
- **Unilateral lifts never get a PR** — their sets carry left/right weights and no `weight`, so the best is 0. Unchanged, but
  it was never written down.
- **Nameless custom lifts are renamed "Exercise N"** at finish, so unrelated nameless lifts share a by-name baseline; the id
  lookup narrows it. Name matching is exact (case and whitespace).
- **My Progress groups by exact name**, so for a renamed lift its "heaviest weight" no longer equals this screen's baseline;
  this screen is the more correct of the two.
- **No client id means no PR, by design** (the calendar modal's runner cannot save either, `_verifyClientAccess` fails closed).
- **N lifts now issue up to 2N small parallel reads** (previously two large sequential ones): each returns one row.
- **`fetchRunnerLastSession` reads only the last 20 logs** for its "Beat last time" line — by design (it means "last time"), not a cap bug.
