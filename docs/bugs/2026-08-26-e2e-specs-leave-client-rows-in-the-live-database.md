---
id: 2026-08-26-e2e-specs-leave-client-rows-in-the-live-database
status: open
priority: medium
reported: 2026-08-26
status_detail: "INTERMITTENT, reproduced twice 2026-08-28/29 — own-workout-fixture-2026-08-11.spec.js:61 went RED in a full-suite run with a surviving template, so the cleanup demonstrably does not run (not merely that rows are present). Measured, not estimated: 14 [E2E] clients rows and 12 [E2E] client_1rms rows present on the live coach account. None from the specs written 2026-08-26 — those clean up correctly."
---

# Several E2E specs leave `clients` and `client_1rms` rows behind on the real coach account

Found 2026-08-26 while discriminating a suspected regression from contamination (the `progress-trend`
B4 failure). A leftover probe against the live DB returned:

- **14 `clients` rows** whose `full_name` starts `[E2E]` — repeating names, so multiple runs each
  stranded a row: `[E2E] event xss client` (×4), `[E2E] 1RM xss client` (×4), `[E2E] 1RM inline` (×4),
  `[E2E] 1RM save client` (×2).
- **12 `client_1rms` rows** with an `[E2E]` `exercise_name`.
- 0 stray `weight_logs` — that fixture cleans up.

**Not from the 2026-08-26 specs.** `session-identity` (END TO END), `weight-roundtrip` and the throwaway
probes all delete their own rows in a `finally`; the leftover query found none of their tags
(`[E2E] rt`, `[E2E] join`, `[E2E] probe`, `[E2E] snap`, `[E2E] wheel`). The offenders are older specs.

## Why this matters beyond tidiness

1. **It is on Jake's real coach account**, so these rows appear in his own client list. Same class as
   the 12 orphaned clone rows cleaned on 2026-08-20 and the ~350 purged earlier.
2. **It is a plausible contamination source for the flakiness already tracked** in
   `2026-08-14-test-gate-flakiness-returned-across-two-unrelated-files`. A spec that resolves "the
   coach's clients" and takes an index, or asserts a count, will drift as this pile grows — which is
   exactly the shape of a test that passes alone and fails in a full run.
3. It is the standing fixture-ownership rule being broken:
   [[feedback_test_fixture_isolation]] — a test must own and destroy its own data.

## CORRECTION — the cleanup is not MISSING, it is NOT RUNNING

My first framing here (“give each spec a finally”) was wrong. Counted 2026-08-26:

- **16** client fixtures created across **7** specs (`full_name: ‘[E2E]…’`):
  `regression-2026-07-13` (8), `progress-session-detail-2026-08-15` (2),
  `screenshot-feedback-2026-08-14` (2), and one each in `client-workout`, `gdpr-export`,
  `intervals-redesign-2026-07-25`, `programs`.
- **23** `from(‘clients’).delete` calls, and 18 `finally` blocks across those files.

So deletes OUTNUMBER creates and the teardown is written. The rows are stranded anyway, which means
the cleanup **does not execute or does not take**: a test failing before its `finally`, a delete
refused by RLS and never rowcount-checked, or the id it keys on coming back null (the exact shape
already documented for the cross-tenant probes, and the reason they were kept out of the push gate).

That reframes the fix: **do not add more teardown — make the existing teardown prove it worked.**
A delete whose rowcount is unchecked is the “reports success while doing nothing” class
([[feedback_reports_success_doing_nothing]]), and there is already an open row for exactly this in the
test suite: [[2026-08-22-cleanup-deletes-without-rowcount-across-four-probe-specs]].

## What to do

- Identify the specs producing each tag (grep the four names above), and give each a `finally` that
  deletes what it created — the pattern the newer specs already use.
- Then purge the existing 26 rows. **Read before deleting**: confirm every candidate really is an
  `[E2E]` fixture and not a real client whose name happens to match, and delete `client_1rms` children
  before the `clients` parents.
- Do NOT write the cleanup as a one-off script Jake runs — see
  [[feedback_privileged_ops_need_inapp_ui]]; if it needs doing repeatedly, it needs a real mechanism.

**Closes when:** a leftover probe returns zero `[E2E]` rows immediately after a full suite run — i.e.
the specs clean up, not just that someone purged once.

---

## 2026-08-28/29 — a test that ASSERTS the cleanup went RED in a full-suite run

`own-workout-fixture-2026-08-11.spec.js:61` — *"leaves no [E2E] own templates or logs behind"* — failed
in the full suite:

```
Error: the fixture must delete every template it created
  expect(left.templates).toEqual([])
  - Array []
  + Array [ "[E2E] own 1787855650460-ab55x" ]
```

**CORRECTION (2026-08-29).** I first wrote this up as a reproduction. It is not — in the clean full
suite it failed attempt 1 and PASSED on retry, so Playwright classes it **flaky**, not failed. The
honest reading is weaker but still load-bearing: **the teardown failed its first attempt in two
independent runs and succeeds on a re-run.** That upgrades the row from a measurement to an
intermittent reproduction. Until now the evidence was a leftover
probe finding rows *after the fact* — consistent with cleanup that never ran, but also with cleanup that
ran and was refused. This failure is the fixture's own teardown asserting it deleted what it created,
and finding a survivor. The mechanism is inside `ownWorkout`, not somewhere upstream — and because a retry clears it, it is a
RACE (the delete issued before the row is visible, or against a session that has already gone), not a
missing delete call.

Verified this is NOT an artefact of the run being killed: the assertion failed at output line 362, and
the first `ERR_CONNECTION_REFUSED` (the server going down when the run was terminated) is at line 537.
The teardown failure precedes any server loss. The two `progress-trend.spec.js` failures in the same
run ARE that artefact and should not be read as regressions.

**Note the shape:** `expect(...).toEqual([])` is a cleanup assertion that can only be trusted if the
fixture actually created something — an empty-vs-empty comparison would pass vacuously. Here it caught a
real survivor, so it is a live check, not a decorative one. See [[feedback_reports_success_doing_nothing]].

---

## 2026-08-30 — measured, reaped, and the two tests that DEPENDED on the debris

**Measured before deleting** (test account `coachapp.e2e.pt@...`, not Jake's personal account — an
earlier version of this row said "the live coach account", which was imprecise):

| Table | `[E2E]` | Total | Share |
|---|---|---|---|
| `workout_templates` | 74 | 77 | **96%** |
| `programs` | 101 | 147 | 69% |
| `clients` | 18 | 20 | 90% |
| `workout_logs` | 43 | 143 | 30% |
| `exercises` | 6 | 3,707 | 0.2% |

The Workouts page rendered **48 rows, 47 of them `[E2E]`** — one real template under forty-seven fakes.

**Reaped, Jake-approved: 242 rows, all counts verified 0 afterwards.** Every delete was anchored on
`coach_id = currentUser.id` **as well as** the `[E2E]` prefix, so it could not reach another tenant even
if the prefix matched there; children before parents.

## The debris was load-bearing for two tests — that is the real finding

Removing it broke two specs, and in both cases the debris had been silently propping up a test that
**borrowed shared data instead of owning a fixture** — [[feedback_test_fixture_isolation]]:

1. **`runner.spec.js:41`** clicked `.list-row` **first**, i.e. whatever was at the top. With the account
   96% debris that was a leftover probe template. **This sits in the 57-test pre-push gate, so it
   blocked the push.** Now creates its own template, clicks it by name, reaps it with a rowcount check.
2. **`health-data-write-rls-2026-08-10.spec.js:35`** searched for *any* coach-owned client with no
   `user_id` to use as its cross-tenant "victim". With the stale fixture clients gone there was exactly
   one client left and it has a `user_id`, so the test failed with *"no non-login client available as
   victim"* — **a fixture failure wearing the costume of a security-test failure**, which is the worst
   way for a security test to fail. Now creates its own victim and reaps it only if this run created it
   (never a pre-existing client, which would make a security test destructive).

**So the debris was not merely clutter: it was undeclared shared state that two tests silently
depended on.** Cleaning it up is what revealed that, and neither test would have been fixed without it.

**Still open on this row:** the cleanup RACE itself. `own-workout-fixture-2026-08-11.spec.js:61` has
been failing on a stranded template since 2026-08-28; that specific survivor is now gone with the sweep,
but nothing yet proves the teardown will not strand the next one. **Closes when a full suite run leaves
zero `[E2E]` rows behind** — measured before and after, not assumed.
