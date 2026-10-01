---
id: 2026-09-30-pb-consolidation-solo-write-path-fails-only-in-the-full-suite
status: closed
priority: medium
reported: 2026-09-30
closed: 2026-10-01
status_detail: "CLOSED 2026-10-01 on condition (a). Failed a THIRD time, on a third different commit (76a445b, the v2026.09.12 release gate's own full run: 973 passed / 1 failed, this spec the only failure) — root cause found: db.auth.getUser() round-trips to Supabase Auth to validate the live token (unlike getSession()'s local-only read), and can legitimately resolve with user: null once the harness's cached test-session token has gone stale, which only enough wall-clock time (a ~40min, 974-test full run) produces. savePerformanceLog dereferenced user.id with no guard. Fixed with a fail-closed guard matching this codebase's own pervasive convention, plus the identical latent bug found and fixed proactively at the one other unguarded db.auth.getUser() call site (js/app-calendar-goals.js's saveEvent, never observed failing itself). Each fix has a dedicated test that stubs db.auth.getUser to return a null user and asserts no throw, no row inserted, and a session-expired message shown — both RED on the old code, GREEN after. Reviewed (critic subagent, fresh context): re-ran both new tests and the full static check suite itself rather than trusting the claim; confirmed by independent reconciliation against this doc's own recorded stack trace (js/app-progress.js:750:21 is exactly `user.id` on the pre-fix line); ruled out the most likely alternative explanation (a different test leaking a monkey-patched getUser) by grepping all of tests/ — only the two new tests ever stub it, both restore in a finally. SHIP WITH CONCERNS, no blocking findings."
closing_conditions: "MET 2026-10-01 under condition (a): the root cause of the null is found and fixed, with a test that goes RED before and GREEN after."
---

# `savePerformanceLog` throws on a null lookup — only when the full suite runs

**Closed 2026-10-01** under condition (a) below: the root cause was found and fixed, with a test that went RED before and GREEN after. See `status_detail` above for the fix and its verification.

**Closes when:** Either (a) the root cause of the null is found and fixed with a test that goes RED before and GREEN after, or (b) three consecutive full-suite runs on the same commit show it green, which would reclassify it as environmental rather than a defect. Passing once in isolation is NOT a closing condition — that is the state it was found in.

## What happens

`tests/pb-consolidation-2026-08-17.spec.js:130` — *"SOLO: the real write path (Progress → Personal
Bests) actually writes a row"* — fails with:

```
TypeError: Cannot read properties of null (reading 'id')
    at savePerformanceLog (js/app-progress.js?v=71:750:21)
```

It failed on the first attempt **and** on Playwright's retry inside the full run, then passed when
the same spec was run on its own against the same commit.

## Why it matters more than a flake normally would

The line is in the **real write path** for Personal Bests, which `6d1598b` ("Personal Bests: the one
page for all of it") has just reworked — `_soloTileMyProgress`'s own comment names this very spec as
the proof that the consolidation works. A null-dereference there is the difference between a saved
personal best and a silent failure, so "it passes on its own" is not good enough.

The failing call reads `.id` off something that came back null. The two candidates worth checking
first are the client-record resolution (solo's `clients` row is reached differently — a `coach_id`
filter silently excludes it) and a fixture the suite's earlier tests had already consumed or
reaped, which would explain why only the full run sees it.

## Not to be confused with

`tests/dashboard-benchmarks-best-2026-09-19.spec.js`'s SOLO case, which failed in the same run for
an unrelated and now-fixed reason: `dd61a20` deliberately replaced the solo Benchmarks card with the
"My progress" tile, so the test's selector pointed at UI that no longer exists. Retargeted
2026-09-30 (the rule it pins is still live), not deleted.
