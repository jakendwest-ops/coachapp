---
name: playwright
description: Run the Playwright E2E test suite and report results in plain English. Use after any significant feature change or before a deploy.
---

# Run Playwright tests

## Step 1 — Ensure the local server is running

The tests hit `http://localhost:3001`. Confirm it's up and serving the right app:

```bash
curl -s http://localhost:3001/ | grep -o '<title>[^<]*</title>'   # must be <title>CoachApp</title>
```

If it isn't, start it via the `run-coachapp` skill first. (A mass failure — most/all tests red — is almost
always a dead server, not a code regression. Check this before diagnosing anything else; it cost a whole
false investigation on 2026-07-08.)

## Step 2 — Run the suite

```
cd C:\Users\jaken\OneDrive\coachapp
npm test
```

Timeout: allow up to 3 minutes. Tests run headless with retries: 1.

## Step 3 — Report results

Structure your report as:

### Result: X/Y passed

Read the actual total Y from the run output — the suite grows, so never hard-code it (it was 56 as of 2026-07-03).

| Test | Status | Notes |
|------|--------|-------|
| PT Workouts page › workouts page is not blank | ✅ / ❌ / ⚠️ flaky | ... |
| ... | | |

Use:
- ✅ passed first attempt
- ⚠️ flaky — passed on retry (note the retry count)
- ❌ failed both attempts

### Console errors found
If any tests have `console errors` or `page crash` annotations in the output, list them here with the test name they appeared on. These don't fail tests but indicate real app problems.

### Failures — root cause
For each ❌, include:
- The exact error message
- Which line in which spec file failed
- Likely root cause (selector mismatch, timing, real app bug, RLS issue)
- Recommended fix

### Verdict
One of:
- **Green — safe to deploy** (whole suite passes, no console errors)
- **Amber — deploy with caution** (flaky tests only, no hard failures, no console errors)
- **Red — do not deploy** (any hard failure or console errors pointing to a real bug)

---

## Test accounts

Three: a coach (PT), a client, and a second coach (PT2, who owns nothing — the cross-tenant fixture for
the RLS audit). **Credentials live in `tests/helpers.js`** (`loginAsPT` / `loginAsClient` / `loginAsPT2`) —
read them there, and never copy them into a skill file. This repo is pushed to GitHub, and this file
held live account passwords in plaintext until 2026-07-13 (when it lived at `~/.claude/skills/playwright/`,
before moving into this repo 2026-09-16 — the same rule applies wherever the file lives).
`os-lint`'s `skills-pii` check now goes RED on any email or UUID in any skill.

If tests fail at login, run `node scripts/seed-test-data.js` to recreate the accounts.

## Key files

- `tests/fixtures.js` — shared fixture (console error capture); all specs must import from here
- `tests/helpers.js` — `loginAsPT` / `loginAsClient`
- `playwright.config.js` — viewport 390×844, retries 1, screenshot + video + trace on failure
- `test-results/` — failure artefacts (gitignored)
