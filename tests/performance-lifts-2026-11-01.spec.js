const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')
const { installCappedApi } = require('./capped-api')

// ─── Performance > Lifts: a chart that says what it shows (Jake, 2026-11-01) ─────────────────────────────────────────────────────
// Each open lift card gets a plain-words title for its measure, a one-line explainer (what it is, which way is good), the change since the
// first point in the range, and the best point marked. A one-session lift says so instead of drawing nothing. The runner's Stats sheet
// mounts the same card WITHOUT these (they are opt-in from the Performance list), so it must not gain them.
// Read-only: the page is rendered for real from tests/capped-api.js, nothing is written to the database.

const ME = 'pl-me'
let rowNo = 0
// A date relative to today, for the lift whose range test must keep one session inside the range whatever day this runs.
const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const row = (name, { date, sets }) => ({
  id: 'pl-row-' + String(++rowNo).padStart(6, '0'),
  exercise_name: name, metric_type: 'weight_reps',
  workout_logs: { date, client_id: ME },
  workout_log_sets: sets.map(([a, b], k) => ({ set_number: k + 1, weight_kg: a, reps_achieved: b })),
})
// Lay A: five weekly sessions climbing 90 to 110 kg (best on the last); Lay B: peaks in the MIDDLE then drops; Lay C: a single session.
const WORLD = [
  ...['2026-08-18', '2026-08-25', '2026-09-01', '2026-09-08', '2026-09-15'].map((d, k) => row('Lay A', { date: d, sets: [[90 + k * 5, 5]] })),
  ...['2026-08-18', '2026-08-25', '2026-09-01', '2026-09-08'].map((d, k) => row('Lay B', { date: d, sets: [[[80, 100, 90, 85][k], 5]] })),
  row('Lay C', { date: '2026-09-03', sets: [[40, 10]] }),
  ...['2026-08-18', '2026-08-25', '2026-09-01'].map((d, k) => row('Lay D', { date: d, sets: [[[100, 95, 90][k], 5]] })),   // only goes down
  ...['2026-08-18', '2026-08-25'].map(d => row('Lay E', { date: d, sets: [[70, 5]] })),   // flat
  row('Lay F', { date: ago(300), sets: [[60, 5]] }), row('Lay F', { date: ago(2), sets: [[65, 5]] }),   // one session in a 3M range, one outside it
]

async function showLifts(page) {
  await installCappedApi(page, { workout_log_exercises: WORLD })
  await page.evaluate(async (me) => {
    window._getCurrentClientId = async () => me
    window._trendState = { range: 'All', metricByEx: {} }
    document.getElementById('pl-host')?.remove()
    const el = document.createElement('div'); el.id = 'pl-host'; el.className = 'main-content'; document.body.appendChild(el)
    await renderProgressStrength(el)
  }, ME)
  await expect(page.locator('#pl-host [data-pf-card]').first()).toBeVisible()
}
const card = (page, i) => page.locator(`#pl-host [data-pf-card="${i}"]`)
const open = async (page, i) => { await card(page, i).locator('.pf-head').click(); await expect(card(page, i).locator('[data-xs-title]')).toBeVisible() }

test.describe('Performance > Lifts: the chart says what it shows (2026-11-01)', () => {
  test.beforeEach(async ({ page }) => { await loginAsClient(page) })

  test('an open lift names its measure in plain words, says what it is and which way is good', async ({ page }) => {
    await showLifts(page)
    await open(page, 0)
    await expect(card(page, 0).locator('[data-xs-title]')).toHaveText('Heaviest set')
    await expect(card(page, 0).locator('[data-xs-explain]')).toContainText('Higher is better')
    const titles = {}
    for (const [key, title] of [['e1rm', 'Estimated 1-rep max'], ['volume', 'Total weight lifted'], ['intensity', 'Average weight per rep'], ['reps', 'Total reps']]) {
      await card(page, 0).locator(`[data-xs-metric="${key}"]`).click()
      titles[key] = await card(page, 0).locator('[data-xs-title]').textContent()
      expect(titles[key]).toBe(title)
      await expect(card(page, 0).locator('[data-xs-explain]')).not.toBeEmpty()
    }
  })

  test('it shows the change since the first point: up with a plus, down with a minus, flat says so', async ({ page }) => {
    await showLifts(page)
    await open(page, 0)
    await expect(card(page, 0).locator('[data-xs-since]')).toHaveText('+20 kg since 18 Aug')
    await open(page, 1)   // Lay B: 80 then 85 now
    await expect(card(page, 1).locator('[data-xs-since]')).toHaveText('+5 kg since 18 Aug')
    await open(page, 3)   // Lay D: 100 down to 90
    await expect(card(page, 3).locator('[data-xs-since]')).toHaveText('−10 kg since 18 Aug')
    await open(page, 4)   // Lay E: 70 and 70
    await expect(card(page, 4).locator('[data-xs-since]')).toHaveText('No change since 18 Aug')
  })

  test('the change follows the range: a range with none of the lift\'s sessions quotes no change', async ({ page }) => {
    await showLifts(page)
    await page.evaluate(() => { window._trendState.range = '1M'; _renderPerfExerciseList('') })   // every fixture session is older than a month
    await card(page, 0).locator('.pf-head').click()
    await expect(card(page, 0)).toContainText('No sessions in this range')
    await expect(card(page, 0).locator('[data-xs-since]')).toHaveCount(0)
  })

  test('a range that holds one of a lift\'s two sessions says so, rather than "one session so far"', async ({ page }) => {
    await showLifts(page)
    await page.evaluate(() => { window._trendState.range = '3M'; _renderPerfExerciseList('') })
    await card(page, 5).locator('.pf-head').click()   // Lay F
    await expect(card(page, 5).locator('[data-xs-chartnote]')).toContainText('Only one session in this range')
  })

  test('the best point is marked on the chart and named under it, even when it is not the latest session', async ({ page }) => {
    await showLifts(page)
    await open(page, 1)
    const marked = await page.evaluate(() => {
      const c = Object.values(Chart.instances).find(ch => ch.canvas.closest('#pl-host'))
      const best = c.data.datasets.find(d => d.label === 'Best')
      return { has: !!best, at: best ? best.data.findIndex(v => v != null) : -1, value: best ? best.data.find(v => v != null) : null, n: best ? best.data.filter(v => v != null).length : 0 }
    })
    expect(marked, 'exactly one best point, on the second session (100 kg)').toEqual({ has: true, at: 1, value: 100, n: 1 })
    await expect(card(page, 1).locator('[data-xs-best]')).toContainText('Best 100 kg')
    await expect(card(page, 1).locator('[data-xs-best]')).toContainText('25 Aug')
  })

  test('the best marker keeps its size when the best session is also the selected one, and when touched', async ({ page }) => {
    await showLifts(page)
    await open(page, 0)   // Lay A: the newest session is the best AND the selected one
    const r = await page.evaluate(() => {
      const c = Object.values(Chart.instances).find(ch => ch.canvas.closest('#pl-host'))
      const best = c.data.datasets.findIndex(d => d.label === 'Best'), at = c.data.datasets[best].data.findIndex(v => v != null)
      const el = c.getDatasetMeta(best).data[at]
      return { radius: el.options.radius, hover: el.options.hoverRadius, line: c.getDatasetMeta(0).data[0].options.radius }
    })
    expect(r.radius, 'bigger than the selection ring (6)').toBe(8)
    expect(r.hover, 'does not shrink on touch').toBeGreaterThanOrEqual(8)
    expect(r.line, 'an ordinary point is unchanged').toBe(3)
  })

  test('a one-session lift says so, and shows no change line', async ({ page }) => {
    await showLifts(page)
    await open(page, 2)
    await expect(card(page, 2).locator('[data-xs-chartnote]')).toContainText('One session so far')
    await expect(card(page, 2).locator('[data-xs-since]')).toHaveCount(0)
  })

  test('the same card mounted for the runner Stats sheet gets none of it', async ({ page }) => {
    const r = await page.evaluate(() => {
      const host = document.createElement('div'); document.body.appendChild(host)
      const ex = { name: 'X', metricType: 'weight_reps', sessions: [{ date: '2026-09-01', sets: [{ set_number: 1, weight_kg: 90, reps_achieved: 5 }] }, { date: '2026-09-08', sets: [{ set_number: 1, weight_kg: 95, reps_achieved: 5 }] }] }
      _mountExerciseStats(host, ex, { chartId: 'pl-runner-chart' })
      const out = { title: host.querySelectorAll('[data-xs-title]').length, since: host.querySelectorAll('[data-xs-since]').length, best: host.querySelectorAll('[data-xs-best]').length, pills: host.querySelectorAll('[data-xs-metric]').length }
      host.remove()
      return out
    })
    expect(r.title + r.since + r.best, 'no plain-words extras outside the Performance list').toBe(0)
    expect(r.pills, 'its measure pills are untouched').toBeGreaterThan(1)
  })

  for (const width of [390, 320]) {
    test(`an open lift does not scroll the page sideways at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await showLifts(page)
      await open(page, 0)
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      expect(over).toBeLessThanOrEqual(0)
    })
  }
})
