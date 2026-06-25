---
name: playwright
description: Run the Playwright E2E test suite and report results in plain English. Use after any significant feature change or before a deploy.
---

# Run Playwright tests

## Step 1 — Ensure the local server is running

Check if a preview server is already up on port 3001. If not, call `preview_start("CoachApp")` before proceeding — the tests hit `http://localhost:3001`.

## Step 2 — Run the suite

```
cd C:\Users\jaken\coachapp
npm test
```

Timeout: allow up to 3 minutes. Tests run headless with 3 workers.

## Step 3 — Report results

Structure your report as:

### Result: X/14 passed

| Test | Status | Notes |
|------|--------|-------|
| Auth › PT login | ✅ / ❌ / ⚠️ flaky | ... |
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
- **Green — safe to deploy** (14/14, no console errors)
- **Amber — deploy with caution** (flaky tests only, no hard failures, no console errors)
- **Red — do not deploy** (any hard failure or console errors pointing to a real bug)

---

## Test account credentials (for reference)

- PT: `coachapp.e2e.pt@gmail.com` / `E2eTestPass123!`
- Client: `coachapp.e2e.client@gmail.com` / `E2eTestPass123!`

If tests fail at login, run `node scripts/seed-test-data.js` to recreate the accounts.

## Key files

- `tests/fixtures.js` — shared fixture (console error capture); all specs must import from here
- `tests/helpers.js` — `loginAsPT` / `loginAsClient`
- `playwright.config.js` — viewport 390×844, retries 1, screenshot + video + trace on failure
- `test-results/` — failure artefacts (gitignored)
