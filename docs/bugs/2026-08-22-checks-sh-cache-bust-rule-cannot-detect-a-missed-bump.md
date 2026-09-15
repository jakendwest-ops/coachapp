---
id: 2026-08-22-checks-sh-cache-bust-rule-cannot-detect-a-missed-bump
status: confirmed
closed_by: "clause (b), 2026-08-23. checks.sh rule 3 rewritten to compare a CHANGED file's ?v= between origin/master and HEAD, enumerating from disk (so starter-content.js is covered for the first time). Red-before proven with a committed probe: a changed module with no bump is refused BY NAME; the same change WITH a bump passes. Three further false-pass doors were found and closed during review — CI base == HEAD, a nonexistent all-zeroes event.before, and an empty CB_HEAD_SHA. Fired for real on the 857c5e1 push: Every changed module ?v= rose."
priority: high
reported: 2026-08-22
status_detail: "found by /save Step 2 on 2026-08-22 after three modules shipped un-bumped; the instance is fixed and pushed (42acf65), the CLASS is not"
---

# `checks.sh` rule 3 asserts a `?v=` EXISTS — never that a changed module's `?v=` went UP

Three modules shipped on 2026-08-22 with no cache-bust: `js/app-clients.js`,
`js/app-calendar-goals.js`, `js/app-progress.js`. Commits `3abe2b7` and `f5e0f8e` changed all three
and never touched `index.html`.

**This is security-relevant, not cosmetic.** The content those commits added is the ownership-guard
family — `_verifyClientAccess` on the client self-service writes, the goal/milestone guards, and
`saveOneRMGrid`. A returning browser holding a cached copy would have run the **old, unguarded**
code while `index.html` told it nothing had changed. The guards would be live in the repo and absent
in the client, which is the worst possible split: the repo reads as defended.

Instance fixed and pushed (`42acf65`, clients v14 / calendar-goals v16 / progress v50).

## Why nothing caught it

`scripts/checks.sh` rule 3 checks that every module **has** a `?v=` tag. All nine always did. The
rule cannot express "this module changed in this commit, so its number must be higher than its
parent's" — so it was structurally incapable of failing here, and it passed on every one of the
pushes that shipped the gap.

Same class as `feedback-reports-success-doing-nothing`: a check that inspects an artefact at a
boundary rather than the transition that matters.

## Why the save ritual caught it and the gate did not

`/save` Step 2 compares the shipped `?v=` against the session's base commit — a *diff over time*,
which is exactly the shape rule 3 lacks. But `/save` runs once at the end of a session, long after
the push. The check belongs at the push.

## Fix direction

A pre-push rule that is a diff, not a snapshot:

```sh
# for each js/*.js changed between @{push} and HEAD, its ?v= in index.html must differ too
git diff --name-only @{push}..HEAD -- 'js/*.js'
```

Then compare each module's `?v=` at both revisions and fail if a changed module's number did not
rise. Note `@{push}` is not always available (first push of a branch, detached HEAD) — fall back to
`origin/master` and skip cleanly rather than failing open silently, and make that fallback visible
in the output so a skipped check never reads as a passed one.

**Prove it can fail before trusting it**: stage a one-line change to a module without bumping, and
confirm the gate refuses. `checks.sh` rule 2b shipped DEAD on this same day because it was never
shown refusing.

**Closes when:** a changed-module-without-a-bump is refused at push time, demonstrated red before
the fix and green after.
