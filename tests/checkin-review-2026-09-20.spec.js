const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── Check-in scores: stress and soreness are good when LOW (R1d, 2026-09-20) ───────────────────────
//
// Ledger: bugs/2026-09-19-check-in-stress-soreness-colours-inverted.
//
// The coach's client Overview coloured all four weekly check-in scores with one function that treated a
// HIGH number as good. Right for sleep and energy; backwards for stress and soreness — so a client
// reporting stress 5/5 and soreness 5/5, the two answers a coach most needs to notice, showed GREEN, and
// a calm, fresh client (1/5) showed red.
//
// This renders the REAL renderClientOverview against a stubbed database (fixture rows in, no writes, no
// rows anywhere — nothing to strand, nothing to reap; the stub throws on any table it was not given, so
// it fails closed). The polarity is asserted RELATIONALLY, on the colours the browser actually painted:
// "stress 5/5 must look exactly like energy 1/5". That keeps the tests true whatever green and red the
// design uses, and the absolute mirror only asks that good is greenish and bad is reddish.
//
// Three places colour a score and all three are covered: the latest-check-in tiles, the small trend bars
// under each tile, and the S/E/St/So abbreviations in the previous-check-ins list.
test.describe('client Overview colours each check-in score by its own polarity', () => {
  const NOW = '2026-09-20T09:00:00.000Z'
  const WEEK_AGO = '2026-09-13T09:00:00.000Z'
  const row = (created_at, sleep, energy, stress, soreness) => ({ id: created_at, client_id: 'cid', created_at, sleep, energy, stress, soreness, notes: null })

  // Renders the real function and returns the painted colours. checkIns is newest-first, as the query is.
  const render = (page, checkIns) => page.evaluate(async ({ checkIns }) => {
    const realFrom = db.from
    const fake = (rows) => {
      const b = {
        select: () => b, eq: () => b, order: () => b, limit: () => b,
        single: async () => ({ data: rows[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej)
      }
      return b
    }
    db.from = (t) => {
      if (t === 'clients') return fake([{ id: 'cid', full_name: '[E2E-CI] Overview', status: 'active', email: null, phone: null, date_of_birth: null, height_cm: null, notes: null }])
      if (t === 'client_check_ins') return fake(checkIns)
      if (t === 'client_programs') return fake([])
      throw new Error('unexpected table in a stubbed render: ' + t)
    }
    const el = document.createElement('div')
    document.body.appendChild(el)
    try { await renderClientOverview('cid', el) } finally { db.from = realFrom }

    const LABELS = ['Sleep', 'Energy', 'Stress', 'Soreness']
    const leaf = (label) => [...el.querySelectorAll('div')].find(d => d.children.length === 0 && d.textContent.trim() === label)
    const colourOf = (n) => (n ? getComputedStyle(n).color : null)
    const latest = {}, trend = {}
    for (const l of LABELS) {
      const label = leaf(l)
      latest[l] = colourOf(label?.previousElementSibling)
      trend[l] = [...(label?.nextElementSibling?.children || [])].map(b => getComputedStyle(b).backgroundColor)
    }
    const prev = {}
    for (const abbr of ['S', 'E', 'St', 'So']) {
      const span = [...el.querySelectorAll('span')].find(s => s.textContent.startsWith(abbr + ':'))
      prev[abbr] = colourOf(span)
    }
    return { latest, trend, prev }
  }, { checkIns })

  const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number)
  const isGreenish = (s) => { const [r, g, b] = rgb(s); return g > r && g > b }
  const isReddish = (s) => { const [r, g, b] = rgb(s); return r > g && r > b }

  test('stress and soreness are read as good-when-LOW in the tiles, the trend bars and the previous list', async ({ page }) => {
    await loginAsPT(page)
    // latest: sleep 5 (good), energy 1 (bad), stress 5 (BAD), soreness 1 (GOOD)   |   a week earlier: the mirror image
    const r = await render(page, [row(NOW, 5, 1, 5, 1), row(WEEK_AGO, 1, 5, 1, 5)])
    const GOOD = r.latest.Sleep, BAD = r.latest.Energy
    expect(GOOD, 'the reference colours must differ or every assertion below is vacuous').not.toBe(BAD)

    // latest tiles
    expect.soft(r.latest.Stress, 'stress 5/5 is the BAD answer — it must look like energy 1/5, not like sleep 5/5').toBe(BAD)
    expect.soft(r.latest.Soreness, 'soreness 1/5 is the GOOD answer — it must look like sleep 5/5').toBe(GOOD)
    // trend bars, oldest first: stress went 1 -> 5 (good -> bad), soreness 5 -> 1 (bad -> good)
    expect.soft(r.trend.Stress, 'stress bars 1 -> 5 must run good -> bad, like energy 5 -> 1').toEqual(r.trend.Energy)
    expect.soft(r.trend.Soreness, 'soreness bars 5 -> 1 must run bad -> good, like sleep 1 -> 5').toEqual(r.trend.Sleep)
    // previous check-ins list (the week-ago row): S:1 and E:5 are the references, St:1 is GOOD, So:5 is BAD
    expect.soft(r.prev.St, 'previous list: St:1 is the GOOD answer — it must look like E:5').toBe(r.prev.E)
    expect(r.prev.So, 'previous list: So:5 is the BAD answer — it must look like S:1').toBe(r.prev.S)
  })

  test('the boundaries fall the same way: 2 and 4 are the first bad / good answers for a high-is-good metric, mirrored for the low-is-good ones', async ({ page }) => {
    await loginAsPT(page)
    const r = await render(page, [row(NOW, 4, 2, 4, 2)])   // sleep 4 good, energy 2 bad, stress 4 BAD, soreness 2 GOOD
    // Absolute, so a shifted THRESHOLD cannot hide behind the relational checks below (moving "bad" to <= 1
    // would leave stress 4 still equal to energy 2 — both merely neutral).
    expect.soft(isGreenish(r.latest.Sleep), `sleep 4/5 is the first good answer (got ${r.latest.Sleep})`).toBe(true)
    expect.soft(isReddish(r.latest.Energy), `energy 2/5 is the last bad answer (got ${r.latest.Energy})`).toBe(true)
    expect.soft(r.latest.Sleep, 'sleep 4 is good, energy 2 is bad — the references').not.toBe(r.latest.Energy)
    expect.soft(r.latest.Stress, 'stress 4/5 is already a bad answer').toBe(r.latest.Energy)
    expect(r.latest.Soreness, 'soreness 2/5 is still a good answer').toBe(r.latest.Sleep)
  })

  test('MIRROR: sleep and energy still read high-is-good, and a middling 3 is neutral for every metric', async ({ page }) => {
    await loginAsPT(page)
    const r = await render(page, [row(NOW, 5, 1, 3, 3)])
    expect(isGreenish(r.latest.Sleep), `sleep 5/5 is greenish (got ${r.latest.Sleep})`).toBe(true)
    expect(isReddish(r.latest.Energy), `energy 1/5 is reddish (got ${r.latest.Energy})`).toBe(true)

    const mid = await render(page, [row(NOW, 3, 3, 3, 3)])
    const colours = Object.values(mid.latest)
    expect(new Set(colours).size, 'a 3 is the same neutral colour whichever metric it is').toBe(1)
    expect(colours[0], 'and it is neither the good nor the bad colour').not.toBe(r.latest.Sleep)
    expect(colours[0]).not.toBe(r.latest.Energy)
  })

  test('MIRROR: the tiles, labels and values are unchanged — only their colours move', async ({ page }) => {
    await loginAsPT(page)
    const html = await page.evaluate(async () => {
      const realFrom = db.from
      const fake = (rows) => { const b = { select: () => b, eq: () => b, order: () => b, limit: () => b, single: async () => ({ data: rows[0] ?? null, error: null }), maybeSingle: async () => ({ data: rows[0] ?? null, error: null }), then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej) }; return b }
      db.from = (t) => t === 'clients' ? fake([{ id: 'cid', full_name: '[E2E-CI] Overview', status: 'active', email: null, phone: null, date_of_birth: null, height_cm: null, notes: null }])
        : t === 'client_check_ins' ? fake([{ id: 'a', client_id: 'cid', created_at: '2026-09-20T09:00:00.000Z', sleep: 4, energy: 3, stress: 2, soreness: 5, notes: null }])
        : t === 'client_programs' ? fake([]) : (() => { throw new Error('unexpected table ' + t) })()
      const el = document.createElement('div'); document.body.appendChild(el)
      try { await renderClientOverview('cid', el) } finally { db.from = realFrom }
      return el.textContent
    })
    for (const expected of ['Latest check-in', 'Sleep', 'Energy', 'Stress', 'Soreness', '4/5', '3/5', '2/5', '5/5']) {
      expect(html, `"${expected}" is still rendered`).toContain(expected)
    }
  })
})
