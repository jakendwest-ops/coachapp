// 2026-08-12 — every dashboard rendered a failed fetch as an EMPTY section.
//
// Found by the full-codebase architecture audit, and worse than it reported: not one of app-dashboard.js's
// **19** `db.from()` calls destructured `error`. All three dashboards bulk-fetch 6-8 things via
// Promise.all, so any failure — patchy gym wifi, a server hiccup, an RLS change — rendered as a blank
// section with no message.
//
// Why that specifically matters: the user's correct reaction to the two cases is OPPOSITE. An empty
// account should be ignored; a failed fetch should be retried. "No upcoming sessions" and "couldn't load
// your sessions" looked identical, on the first screen of every login. Showing nothing tells the user to
// ignore it, every single time.
//
// Failures are simulated by stubbing `db.from` for one table, which is the only way to exercise the
// error path deterministically — the real trigger is a network/RLS condition a test cannot summon.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

// Force the named table's query to resolve as a PostgREST-shaped error, leaving every other table alone.
async function breakTable (page, table) {
  await page.evaluate((table) => {
    if (!window.__realDbFrom) window.__realDbFrom = db.from.bind(db)
    db.from = (t) => {
      if (t !== table) return window.__realDbFrom(t)
      // A thenable that mimics a rejected PostgREST query through any chain of builder calls.
      const err = { message: `simulated failure on ${t}`, code: 'PGRST999' }
      const stub = new Proxy(function () {}, {
        get (_, prop) {
          if (prop === 'then') return (res) => res({ data: null, count: null, error: err })
          return () => stub
        },
        apply () { return stub },
      })
      return stub
    }
  }, table)
}

async function restore (page) {
  await page.evaluate(() => { if (window.__realDbFrom) db.from = window.__realDbFrom })
}

test.describe('dashboard fetch failures are visible (2026-08-12)', () => {
  test('the coach dashboard says so when a fetch fails, and offers Retry', async ({ page }) => {
    await loginAsPT(page)
    await breakTable(page, 'goals')
    await page.evaluate(() => navigate('dashboard', 'replace'))
    await page.waitForTimeout(2500)

    const seen = await page.evaluate(() => ({
      banner: document.body.innerText.includes("Couldn't load"),
      namesTheThing: document.body.innerText.includes('goals'),
      hasRetry: !!document.querySelector('button[onclick*="navigate(\'dashboard\'"]'),
    }))
    await restore(page)
    console.log('coach:', JSON.stringify(seen))

    // The regression: a failed goals fetch rendered a blank section and said nothing at all.
    expect(seen.banner, 'a failed fetch must be stated, not rendered as emptiness').toBe(true)
    expect(seen.namesTheThing, 'it must name WHAT failed — "something went wrong" is not actionable').toBe(true)
    expect(seen.hasRetry, 'a failed fetch is usually transient, so Retry must be one tap away').toBe(true)
  })

  test('the client dashboard does the same', async ({ page }) => {
    await loginAsClient(page)
    await breakTable(page, 'weight_logs')
    await page.evaluate(() => navigate('client-dashboard', 'replace'))
    await page.waitForTimeout(2500)

    const seen = await page.evaluate(() => ({
      banner: document.body.innerText.includes("Couldn't load"),
      namesTheThing: document.body.innerText.includes('weight history'),
    }))
    await restore(page)
    console.log('client:', JSON.stringify(seen))

    expect(seen.banner).toBe(true)
    expect(seen.namesTheThing).toBe(true)
  })

  test('a HEALTHY dashboard shows no banner — the fix must not cry wolf', async ({ page }) => {
    // The counterpart that matters just as much: a permanent warning is one nobody reads, which is the
    // alarm-fatigue failure this project has already had once in its own health checks.
    await loginAsPT(page)
    await page.evaluate(() => navigate('dashboard', 'replace'))
    await page.waitForTimeout(2500)
    const banner = await page.evaluate(() => document.body.innerText.includes("Couldn't load"))
    console.log('healthy dashboard shows banner:', banner)
    expect(banner, 'no banner when every fetch succeeded').toBe(false)
  })
})
