const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')
const { installCappedApi } = require('./capped-api')

// ─── My progress > Per exercise: fold-up cards (Jake, 2026-10-04) ──────────────────────────────────────────────────────────────
//
// "include a collapse/expand button so I dont have to scroll through all exercise data." Every exercise was a card about 800px tall, so a
// long history was a long scroll, and every chart was drawn at once. A card now starts FOLDED - its name and one line of answer - and opens
// with a tap; a Collapse all / Expand all button sits above the list; only OPEN cards have a body or a chart. Which cards are open survives
// the search box, the range select and the measure pills; a search that finds exactly one exercise opens it unless the person folded it.
//
// The page is rendered for real (renderProgressStrength) from tests/capped-api.js - a read-only stand-in that caps responses at 200 rows -
// so nothing is written to the database. The numbers inside an opened card are pinned in tests/exercise-stats-shared-2026-10-03.spec.js.

const ME = 'pf-me'
let rowNo = 0
// One logged exercise exactly as the read returns it. Strength sets are [kg, reps]; cardio sets are [metres, seconds].
const row = (name, { date, sets, metric = 'weight_reps' }) => ({
  id: 'pf-row-' + String(++rowNo).padStart(6, '0'),
  exercise_name: name, metric_type: metric,
  workout_logs: { date, client_id: ME },
  workout_log_sets: sets.map(([a, b], k) => (metric === 'cardio'
    ? { set_number: k + 1, distance_m: a, duration_seconds: b }
    : { set_number: k + 1, weight_kg: a, reps_achieved: b })),
})
// Three lifts (Lay A has the longest history, Lay C a single session) and one cardio exercise - listed A to Z, so the indexes below are
// Lay A 0, Lay B 1, Lay C 2, Row 2k 3.
const WORLD = [
  ...['2026-08-18', '2026-08-25', '2026-09-01', '2026-09-08', '2026-09-15'].map((d, k) => row('Lay A', { date: d, sets: [[90 + k * 5, 5], [90 + k * 5, 5]] })),
  row('Lay B', { date: '2026-09-02', sets: [[60, 8]] }), row('Lay B', { date: '2026-09-09', sets: [[62.5, 8]] }),
  row('Lay C', { date: '2026-09-03', sets: [[40, 10]] }),
  row('Row 2k', { metric: 'cardio', date: '2026-09-04', sets: [[2000, 480]] }), row('Row 2k', { metric: 'cardio', date: '2026-09-11', sets: [[2000, 470]] }),
]

async function showMyProgress(page, world = WORLD) {
  await installCappedApi(page, { workout_log_exercises: world })
  await page.evaluate(async (me) => {
    window._getCurrentClientId = async () => me
    window._trendState = { range: 'All', metricByEx: {} }
    document.getElementById('pf-host')?.remove()
    const el = document.createElement('div'); el.id = 'pf-host'; el.className = 'main-content'; document.body.appendChild(el)
    await renderProgressStrength(el)
  }, ME)
  await expect(page.locator('#pf-host [data-pf-card]').first()).toBeVisible()
}

const head = (page, name) => page.locator('#pf-host .pf-head', { hasText: name })
// Every card, as plain data.
const state = page => page.evaluate(() => [...document.querySelectorAll('#pf-host [data-pf-card]')].map(c => ({
  name: c.querySelector('.xs-card-name').textContent,
  open: c.querySelector('.pf-head').getAttribute('aria-expanded') === 'true',
  hidden: c.querySelector('.pf-body').hidden,
  bodyLen: c.querySelector('.pf-body').innerHTML.length,
  sum: c.querySelector('.pf-sum').textContent,
})))
// The charts of the list under test - not the dashboard's weigh-in sparkline, which sits behind it for a client who has weigh-ins.
const charts = page => page.evaluate(() => (typeof Chart === 'undefined' ? -1 : Object.values(Chart.instances).filter(c => !c.canvas.closest('#dash-root')).length))

test.describe('My progress: fold-up exercise cards (2026-10-04)', () => {
  test.beforeEach(async ({ page }) => { await loginAsClient(page) })

  test('every card starts folded: its name and one line of answer, no body, and not one chart drawn', async ({ page }) => {
    await showMyProgress(page)
    const s = await state(page)
    expect(s.map(c => c.name)).toEqual(['Lay A', 'Lay B', 'Lay C', 'Row 2k'])
    expect(s.every(c => !c.open && c.hidden && c.bodyLen === 0), 'folded: collapsed, hidden and empty').toBe(true)
    expect(s[0].sum).toBe('Best top set: 110 kg × 5 · 5 sessions')
    expect(s[1].sum).toBe('Best top set: 62.5 kg × 8 · 2 sessions')
    expect(s[2].sum, 'one session reads as one session').toBe('Best top set: 40 kg × 10 · 1 session')
    expect(s[3].sum, 'the other kinds of exercise fold too').toMatch(/^Best .+ · 2 sessions$/)
    expect(await charts(page), 'the page used to draw every chart at once').toBe(0)
  })

  test('tapping a card opens it - the whole card as before - and draws only its chart; tapping again folds it and frees the chart', async ({ page }) => {
    await showMyProgress(page)
    await head(page, 'Lay A').click()
    await expect(page.locator('#pf-host [data-pf-card="0"] [data-xs-tile]').first()).toBeVisible()
    let s = await state(page)
    expect(s[0]).toMatchObject({ open: true, hidden: false })
    expect(s.slice(1).every(c => !c.open), 'the others stay folded').toBe(true)
    expect(await charts(page)).toBe(1)
    await expect(page.locator('#pf-host [data-pf-card="0"] .pf-sum'), 'the open card\'s own caption says it, so the folded line is hidden').toBeHidden()
    await expect(page.locator('#pf-host [data-pf-card="0"] [data-xs-caption]')).toHaveText('Best top set: 110 kg × 5 · 5 sessions')

    await head(page, 'Lay A').click()
    s = await state(page)
    expect(s[0]).toMatchObject({ open: false, hidden: true, bodyLen: 0 })
    expect(await charts(page), 'a folded card keeps no chart running').toBe(0)
  })

  test('folding one card leaves another card\'s chart exactly as it was (it is not redrawn)', async ({ page }) => {
    await showMyProgress(page)
    await head(page, 'Lay A').click()
    await head(page, 'Lay B').click()
    await expect(page.locator('#pf-host [data-pf-card="1"] [data-xs-tile]').first()).toBeVisible()
    expect(await charts(page)).toBe(2)
    await page.evaluate(() => { window.__a = Chart.getChart(document.getElementById('ps-chart-0')) })
    await head(page, 'Lay B').click()
    expect(await charts(page)).toBe(1)
    expect(await page.evaluate(() => Chart.getChart(document.getElementById('ps-chart-0')) === window.__a), 'the same chart instance').toBe(true)
  })

  test('a card with other kinds of data (cardio) folds and opens the same way, with its chart', async ({ page }) => {
    await showMyProgress(page)
    await head(page, 'Row 2k').click()
    await expect(page.locator('#pf-host [data-pf-card="3"] canvas')).toBeVisible()
    expect(await charts(page)).toBe(1)
    await head(page, 'Row 2k').click()
    await expect(page.locator('#pf-host [data-pf-card="3"] canvas')).toHaveCount(0)
    expect(await charts(page)).toBe(0)
  })

  test('Collapse all / Expand all: one button for the whole list, and it says which it will do', async ({ page }) => {
    await showMyProgress(page)
    const btn = page.locator('#pf-all')
    await expect(btn).toHaveText('Expand all')
    await btn.click()
    expect((await state(page)).every(c => c.open && !c.hidden)).toBe(true)
    await expect(btn).toHaveText('Collapse all')
    expect(await charts(page), 'Lay A, Lay B and Row 2k have a line to draw; Lay C has one session').toBe(3)
    await btn.click()
    expect((await state(page)).every(c => !c.open && c.hidden && c.bodyLen === 0)).toBe(true)
    await expect(btn).toHaveText('Expand all')
    expect(await charts(page)).toBe(0)
    // With one card open, the button folds (not opens) - it follows what is on screen.
    await head(page, 'Lay C').click()
    await expect(btn).toHaveText('Collapse all')
  })

  test('the list says how many exercises there are, and the button disappears when there is nothing to fold', async ({ page }) => {
    await showMyProgress(page)
    await expect(page.locator('#pf-count')).toHaveText('4 exercises')
    await page.fill('#perf-ex-search', 'lay')
    await expect(page.locator('#pf-count')).toHaveText('3 of 4 exercises')
    await expect(page.locator('#pf-all')).toBeVisible()
    await page.fill('#perf-ex-search', 'row')
    await expect(page.locator('#pf-count')).toHaveText('1 of 4 exercises')
    await expect(page.locator('#pf-all'), 'one card: nothing to fold all of').toBeHidden()
    await page.fill('#perf-ex-search', 'zzz')
    await expect(page.locator('#pf-count')).toHaveText('0 of 4 exercises')
    await expect(page.locator('#perf-ex-list')).toContainText('No matching exercises.')
  })

  test('open cards stay open while you search, change the range and tap a measure pill', async ({ page }) => {
    await showMyProgress(page)
    await head(page, 'Lay A').click()
    await expect(page.locator('#pf-host [data-pf-card="0"] [data-xs-tile]').first()).toBeVisible()

    await page.fill('#perf-ex-search', 'lay')
    expect((await state(page)).find(c => c.name === 'Lay A').open, 'a search').toBe(true)
    await expect(page.locator('#pf-host [data-pf-card="0"] [data-xs-tile]').first()).toBeVisible()

    await page.evaluate(() => _setTrendRange('1Y'))
    expect((await state(page)).find(c => c.name === 'Lay A').open, 'the range select').toBe(true)

    await page.locator('#pf-host [data-pf-card="0"] [data-xs-metric="e1rm"]').click()
    await expect(page.locator('#pf-host [data-pf-card="0"] [data-xs-metric="e1rm"]')).toHaveAttribute('aria-pressed', 'true')
    expect((await state(page)).find(c => c.name === 'Lay A').open, 'a measure pill').toBe(true)

    await page.fill('#perf-ex-search', '')
    const s = await state(page)
    expect(s.map(c => c.open), 'and the others were never opened').toEqual([true, false, false, false])
    expect(await charts(page), 'only the open card has a chart').toBe(1)
  })

  test('a search that finds exactly one exercise opens it - unless you folded it yourself', async ({ page }) => {
    await showMyProgress(page)
    await page.fill('#perf-ex-search', 'lay c')
    let s = await state(page)
    expect(s.length).toBe(1)
    expect(s[0], 'one result: opened for you').toMatchObject({ name: 'Lay C', open: true })

    await head(page, 'Lay C').click()
    expect((await state(page))[0].open, 'you folded it').toBe(false)
    await page.fill('#perf-ex-search', 'lay ')                 // a different search that still finds only... three; then narrow again
    await page.fill('#perf-ex-search', 'lay c')
    expect((await state(page))[0].open, 'your choice is respected on the next keystroke').toBe(false)

    await page.fill('#perf-ex-search', 'lay b')
    expect((await state(page))[0], 'a different single result you have not touched opens').toMatchObject({ name: 'Lay B', open: true })

    await page.fill('#perf-ex-search', '')
    expect((await state(page)).map(c => c.open), 'with the whole list back everything is folded again: the automatic opening was only for the lone result').toEqual([false, false, false, false])
  })

  test('a card is a real button for the keyboard: Enter opens it, Space folds it, and the state is announced', async ({ page }) => {
    await showMyProgress(page)
    const h = head(page, 'Lay B')
    await expect(h).toHaveAttribute('aria-expanded', 'false')
    const controls = await h.getAttribute('aria-controls')
    expect(await page.evaluate((id) => !!document.getElementById(id), controls), 'aria-controls points at the body').toBe(true)
    expect(await h.evaluate(el => el.tagName)).toBe('BUTTON')
    await h.focus()
    await page.keyboard.press('Enter')
    await expect(h).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Space')
    await expect(h).toHaveAttribute('aria-expanded', 'false')
  })

  test('an exercise name is shown as text, never run as markup', async ({ page }) => {
    const evil = '<img src=x onerror="window.__pwned=1">'
    await showMyProgress(page, [row(evil, { date: '2026-09-02', sets: [[60, 8]] }), row(evil, { date: '2026-09-09', sets: [[62.5, 8]] })])
    const s = await state(page)
    expect(s[0].name).toBe(evil)
    expect(s[0].open, 'the only exercise in the list opens by itself').toBe(true)
    await expect(page.locator('#pf-host [data-pf-card="0"] [data-xs-tile]').first()).toBeVisible()
    await expect(page.locator('#pf-host img'), 'in the header and in the opened card').toHaveCount(0)
    await head(page, 'onerror').click()                        // folded: the header alone, still text
    expect((await state(page))[0]).toMatchObject({ name: evil, open: false })
    await expect(page.locator('#pf-host img')).toHaveCount(0)
    expect(await page.evaluate(() => window.__pwned ?? null)).toBeNull()
  })

  test('on a phone the folded list is compact: each card is a comfortable tap target and nothing sticks out', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await showMyProgress(page)
    const m = await page.evaluate(() => ({
      heights: [...document.querySelectorAll('#pf-host .pf-head')].map(h => Math.round(h.getBoundingClientRect().height)),
      cardHeights: [...document.querySelectorAll('#pf-host [data-pf-card]')].map(c => Math.round(c.getBoundingClientRect().height)),
      overflow: document.documentElement.scrollWidth - innerWidth,
    }))
    expect(Math.min(...m.heights), 'a tap target of at least 44px').toBeGreaterThanOrEqual(44)
    expect(Math.max(...m.cardHeights), 'folded, a card is a line or two - not 800px').toBeLessThan(110)
    expect(m.overflow, 'no sideways scroll').toBeLessThanOrEqual(0)
    await page.locator('#pf-all').click()
    const open = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(open, 'and none with every card open').toBeLessThanOrEqual(0)
  })
})
