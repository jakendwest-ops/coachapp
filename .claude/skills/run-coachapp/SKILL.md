---
name: run-coachapp
description: Run, start, launch, preview, screenshot, or interact with CoachApp — the PT/coach management web app. Use whenever asked to start the dev server, take a screenshot, verify a UI change, or drive a feature in the browser.
---

# run-coachapp

CoachApp is a static vanilla-JS + Supabase app. No build step. Two things you need: a **file server**, and a **browser driver**.

> **The `preview_*` tools do not exist in this harness.** Every version of this skill before 2026-07-13
> was built on them, which meant this skill was 100% dead for 8 days while still being the broadest-
> triggered skill in the set. Do not call any of the `preview_*` tools — they will not resolve. Use the
> two paths below. (`os-lint`'s dead-tool check now goes RED if any skill starts calling them again.)

## 1. Start the server

It is usually already running. **Check before starting** — a second listener on 3001 just errors out:

```bash
curl -s http://localhost:3001/ | grep -o '<title>[^<]*</title>'
```

- `<title>CoachApp</title>` → done, it's up. Use it.
- Empty / connection refused → start it: run the **exact** `runtimeArgs` command from
  `C:/Users/jaken/OneDrive/coachapp/.claude/launch.json` (a PowerShell `HttpListener` on port 3001)
  via Bash or PowerShell with `run_in_background: true`, then re-run the curl above.
- Real HTML but the **wrong** `<title>` → a dead config (e.g. PTHub, ended) is being served. Remove that config
  from `.claude/launch.json` entirely — do not just reorder it — then restart. This step blocks until
  CoachApp *specifically* is confirmed serving.

Serving *something* and serving the *right app* are different checks. Always assert the title.

## 2. Drive the browser

Use **Playwright**, via a throwaway spec. This reuses the real config (390×844 mobile-first viewport,
`baseURL` localhost:3001) and the real login helpers — no new infrastructure, no auth to reinvent.

```js
// tests/_adhoc.spec.js  — gitignored; DELETE IT when you're done
const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsClient, loginAsPT2 } = require('./helpers')

test('adhoc', async ({ page }) => {
  await loginAsPT(page)                                  // or loginAsClient / loginAsPT2
  await page.goto('/#workouts')
  await page.waitForSelector('.list-row', { timeout: 10000 })
  await page.screenshot({ path: 'adhoc.png', fullPage: true })
  console.log(await page.locator('#main-content').innerText())
})
```

```bash
npx playwright test tests/_adhoc.spec.js --reporter=list
```

Then `Read` the PNG to actually look at it. **Delete the spec afterwards** — it is gitignored so it can
never be committed, but a stray one will still confuse the next session.

- **Different viewport?** Pass it in the test: `test.use({ viewport: { width: 1280, height: 800 } })`.
- **Console errors?** `page.on('pageerror', e => console.log('PAGEERROR', e.message))` — this is how the
  stray-character syntax corruption was caught on 2026-07-07. A wide, unrelated-looking spread of test
  failures usually means a full-script parse error, not flakiness.
- **Solo view?** Log in as PT, then switch: `await page.click('text=Personal')`.

## Prerequisites

- Supabase project `avilxuiacmtgeoxxhfhc` must be reachable (needs internet).
- Sessions persist in `localStorage`; the helpers handle login. Credentials live in `tests/helpers.js` —
  never copy them into a skill file (`~/.claude` is pushed to GitHub; `os-lint` will go RED on it).
