const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Sub-project ②d — manual HR capture.
// ②b already proved saveRunnerSession PERSISTS avgHr/maxHr (runner-save-metrics.spec.js constructs a
// loggedSet with HR already in it). What ②d adds is the runner UI actually COLLECTING avg/max HR from
// input fields, and a resting-HR body metric on the bodyweight form. These tests guard the collection.
test.describe('Sub-project 2d — manual HR capture', () => {
  test('cardio input UI collects avg/max HR into the logged set', async ({ page }) => {
    await loginAsPT(page)
    await page.click('text=Personal') // solo view — self-owned client, no cross-tenant setup
    await page.waitForTimeout(1000)

    const set = await page.evaluate(async () => {
      const clientId = await _getCurrentClientId()
      // Construct a minimal in-progress runner with ONE duration-based cardio exercise, then render it.
      // Bare `_runner` (not window._runner) — it's a top-level `let` in app-workouts.js (same gotcha the
      // ②b test documents), so the bare identifier is the binding renderRunner/logRunnerSet actually read.
      _runner = {
        clientId, name: '[E2E] 2d hr-capture', date: new Date().toISOString().split('T')[0],
        exIdx: 0, startTime: Date.now(), lastSession: {},
        exercises: [{ name: 'HR Row', type: 'cardio', metricType: 'cardio', exerciseId: null,
          targetSets: 0, loggedSets: [], sets_json: [{ duration: '20:00' }] }]
      }
      renderRunner()
      // The avg/max HR inputs are exactly what ②d adds — before it, these getElementById calls are null
      // and the .value assignment throws (the RED state).
      document.getElementById('wr-cardio-dur').value = '20:00'
      document.getElementById('wr-cardio-avg-hr').value = '142'
      document.getElementById('wr-cardio-max-hr').value = '168'
      logRunnerSet()
      return _runner.exercises[0].loggedSets[0]
    })

    expect(set.duration).toBe('20:00')
    expect(set.avgHr).toBe('142')
    expect(set.maxHr).toBe('168')
  })

  test('bodyweight log with resting HR round-trips to weight_logs', async ({ page }) => {
    await loginAsPT(page)
    await page.click('text=Personal') // solo — own weight_logs, no cross-tenant setup
    await page.waitForTimeout(800)
    // Render the Body Weight tab and open the log form (same pattern as progress.spec.js).
    await page.evaluate(() => { window._progressTab = 'Body Weight'; renderProgress(document.getElementById('main-content')) })
    await page.click('button:has-text("+ Log weight")')
    await page.fill('#cwf-weight', '82.5')
    await page.fill('#cwf-resting-hr', '58') // this input is exactly what ②d adds — RED before it exists

    const row = await page.evaluate(async () => {
      const clientId = await _getCurrentClientId()
      await saveClientWeight(clientId)
      const { data } = await db.from('weight_logs')
        .select('id, weight_kg, resting_hr')
        .eq('client_id', clientId).eq('resting_hr', 58)
        .order('id', { ascending: false }).limit(1)
      const r = data?.[0]
      if (r) await db.from('weight_logs').delete().eq('id', r.id) // own-fixture cleanup (les-041)
      return r
    })

    expect(row.resting_hr).toBe(58)
    expect(Number(row.weight_kg)).toBe(82.5)
  })
})
