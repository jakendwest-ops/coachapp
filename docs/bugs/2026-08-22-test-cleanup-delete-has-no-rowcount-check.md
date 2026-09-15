---
id: 2026-08-22-test-cleanup-delete-has-no-rowcount-check
status: confirmed
priority: low
reported: 2026-08-22
closed_by: "clause (b) 2026-08-22. The cleanup now does .select('id') and the test asserts reaped === landed, so a policy-refused delete fails the test instead of silently leaking a row onto a real fixture client. 3/3 in that spec; checks.sh green. The sweepProgramFixtures workers:1 coupling noted in the body is NOT fixed - filed as a separate note, not closed here."
status_detail: "Found by multi-agent-review (Agent C) 2026-08-22. In a NEW spec added the same day, in the commit immediately after the one that fixed this exact class. Unpushed."
---

# A new test's cleanup delete has no rowcount check — the class the previous commit just fixed

`tests/own-client-writes-2026-08-21.spec.js:85`

```js
if (ids.length) await db.from('weight_logs').delete().in('id', ids)
```

No `.select()`, no rowcount assertion. A policy-refused delete returns `{ data: [], error: null }` —
no error, zero rows — so the row leaks silently onto a real fixture client and the test still passes.

## Why this is the embarrassing one

This is the **same `{ data: [], error: null }` shape** that:

- commit `a4725d4`, one commit earlier the same day, fixed across four cross-tenant probes
- the source files *in this very diff* now guard against at ~20 sites
- `bugs/2026-08-17-a-policy-refused-write-reports-success-6-sites.md` documents at six shipped sites

I wrote the new test's cleanup without applying the lesson the adjacent commit exists to enforce. The
fix in `ledger-fixes-2026-08-01.spec.js:188` and now in `ledger-fixes-2026-08-02.spec.js` is the model;
this file did not inherit it either.

## Also noted by the same reviewer (lower stakes)

`sweepProgramFixtures` (`tests/programs.spec.js`) deletes all four fixture names from three different
describes' `afterEach`. Safe **only** because `playwright.config.js` sets `workers: 1` /
`fullyParallel: false`. If worker count ever rises above 1, that sweep will reap another describe's
in-flight fixtures. Worth a comment pinning the dependency, since nothing currently states it.

**Closes when:** the cleanup asserts its own effect (`.select('id')` + rowcount), red-before verified.
