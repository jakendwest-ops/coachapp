---
id: 2026-09-30-pb-consolidation-solo-write-path-fails-only-in-the-full-suite
status: open
priority: medium
reported: 2026-09-30
status_detail: "UPDATE 2026-10-01: it FAILED AGAIN in a second full-suite run, on a different commit (845a533: 924 passed / 1 failed, this spec the only failure) — now 2 of 2 full runs, and still green in isolation. That makes 'a one-off' much less likely. Found by the full suite on merged master (a33039d), 2026-09-30 — not reported by Jake, not a regression from the RPE work (the merge touched neither js/app-progress.js nor js/app-dashboard.js; verified with `git diff --name-only 6d1598b..a33039d`). Order-dependent: FAILED twice in the 912-test run, then PASSED in isolation on the same commit minutes later. Pre-existing on master's unpushed commits (dd61a20 / 6d1598b), which no full suite has ever run against — a push runs no browser tests since 2026-09-27 and no release has been cut since v2026.09.11."
closing_conditions: "Either (a) the root cause of the null is found and fixed with a test that goes RED before and GREEN after, or (b) three consecutive full-suite runs on the same commit show it green, which would reclassify it as environmental rather than a defect. Passing once in isolation is NOT a closing condition — that is the state it was found in."
---

# `savePerformanceLog` throws on a null lookup — only when the full suite runs

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
