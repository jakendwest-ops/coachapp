const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Sub-project ③ — metric_type-aware progress trends. Pure helpers are unit-tested here (same
// lightweight in-page evaluate pattern the existing progress.spec.js regression tests use).
test.describe('Sub-project 3 — progress trend helpers', () => {
  test('Epley 1RM + weight_reps points (topWeight / volume / best-set e1RM) compute per session', async ({ page }) => {
    await loginAsPT(page)
    await page.waitForTimeout(500)
    const r = await page.evaluate(() => {
      const e1 = _epley1RM(100, 5) // 100 * (1 + 5/30) = 116.67
      const p = _metricPointsFor({ name: 'Bench', metricType: 'weight_reps',
        sessions: [{ date: '2026-07-01', sets: [
          { weight_kg: 100, reps_achieved: 5 },   // Epley 116.7
          { weight_kg: 90,  reps_achieved: 10 }    // Epley 120.0  ← the session's best
        ] }] }).points[0]
      return { e1: Math.round(e1), topWeight: p.topWeight, volume: p.volume, e1rm: Math.round(p.e1rm) }
    })
    expect(r.e1).toBe(117)
    expect(r.topWeight).toBe(100)
    expect(r.volume).toBe(100 * 5 + 90 * 10) // 1400
    expect(r.e1rm).toBe(120)                 // max Epley across the session's sets
  })

  test('aggregation buckets a >40-point window instead of plotting every point', async ({ page }) => {
    await loginAsPT(page)
    const n = await page.evaluate(() => {
      const pts = Array.from({ length: 60 }, (_, i) => ({
        date: `2026-0${1 + Math.floor(i / 30)}-` + String((i % 28) + 1).padStart(2, '0'),
        topWeight: 100 + i
      }))
      return _aggregateSeries(pts, 'topWeight', 'max').length
    })
    expect(n).toBeLessThan(60)
    expect(n).toBeGreaterThan(0)
  })

  test('Per-exercise view renders the range selector + a trend card for a logged session (smoke)', async ({ page }) => {
    await loginAsPT(page)
    await page.click('text=Personal') // solo — own data, cleaned up below
    await page.waitForTimeout(1200)
    const errors = []
    page.on('pageerror', e => errors.push(e.message))

    // Provision one weight_reps session via the real save path (owns its fixture, les-041).
    const tag = await page.evaluate(async () => {
      const clientId = await _getCurrentClientId()
      const tag = '[E2E] trend ' + Date.now()
      _runner = { clientId, name: tag, date: new Date().toISOString().split('T')[0], exercises: [
        { name: tag + ' Bench', type: 'strength', metricType: 'weight_reps', exerciseId: null,
          loggedSets: [{ weight: '100', reps: '5' }, { weight: '100', reps: '5' }] }
      ] }
      await saveRunnerSession()
      return tag
    })
    // Reload clears the post-save 1RM-estimate sheet (which would otherwise intercept the pill click);
    // _activeView='solo' persists in localStorage, so we stay in the solo view the data belongs to.
    await page.reload()
    await page.waitForTimeout(1000)
    await page.evaluate(() => { window._progressTab = 'Performance'; window._perfTab = 'Per exercise'; renderProgress(document.getElementById('main-content')) })
    await page.waitForTimeout(1200)

    await expect(page.locator('#trend-range-row')).toBeVisible()
    await expect(page.getByText(tag + ' Bench', { exact: true })).toBeVisible() // the card header span
    await page.click('#trend-range-row button[data-range="3M"]') // range switch must not crash
    await page.waitForTimeout(300)

    // cleanup (own fixture, runs regardless of assertion outcome above via a fresh evaluate)
    await page.evaluate(async (tag) => {
      const clientId = await _getCurrentClientId()
      const { data: log } = await db.from('workout_logs').select('id').eq('client_id', clientId).eq('name', tag).single()
      if (log) {
        const { data: exs } = await db.from('workout_log_exercises').select('id').eq('log_id', log.id)
        await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exs.map(e => e.id))
        await db.from('workout_log_exercises').delete().eq('log_id', log.id)
        await db.from('workout_logs').delete().eq('id', log.id)
      }
    }, tag)
    expect(errors).toEqual([])
  })
})
