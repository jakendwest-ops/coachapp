const { test, expect } = require('@playwright/test')
const { loginAsPT, clickVisible } = require('./helpers')

// 2026-08-08 — Jake, live: "I would like to fix the intervals and cardio runner. A user needs to be
// able to record some data from their workout... a toggle so they can choose to save pace, watts,
// heart rate etc." HR/watts capture already worked end-to-end (saveRunnerSession has always persisted
// them) but was unreachable during a session: the fullscreen interval/cardio timer overlay
// (wr-interval-overlay, z-index:350) painted over the pre-Start card's inputs for almost the entire
// wall-clock duration of a cardio or interval exercise. Pace was half-built (an input existed, the
// value was silently dropped before save). Stroke rate didn't exist at all.
//
// Fix: capture moved to ONE new card, shown once when a cardio/interval exercise finishes — the one
// point the fullscreen overlay is guaranteed gone. Which metrics get asked for is a per-device
// localStorage toggle (_loadCardioCaptureToggles/_saveCardioCaptureToggles in app-runner.js), shared
// with the quick-prefs popover (_openQuickPrefsPopover in app-core.js) so either entry point sees the
// other's changes. See tests/runner-save-metrics.spec.js for the DB-persistence proof (pace/stroke
// rate columns) and tests/progress-hr.spec.js for the HR-specific collection test.

async function resetToggles(page) {
  await page.evaluate(() => localStorage.removeItem('_cardioCaptureToggles'))
}

test.describe('Cardio/interval exercise-finish capture card', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await resetToggles(page) })
  test.afterEach(async ({ page }) => { await resetToggles(page) })

  test('appears when an interval exercise finishes, not before', async ({ page }) => {
    const r = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Skierg', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ workSecs: 1, restSecs: 0, sets: 1, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      renderRunner()
      const beforeStart = document.getElementById('workout-runner')?.innerText || ''
      // Drive the phase walk to completion — one work phase, no rest, no cooldown.
      _startPhaseAt(0)
      _logIntervalPhase(_runner.exercises[0].phases[0])
      _finishIntervalExercise()
      const afterFinish = document.getElementById('workout-runner')?.innerText || ''
      return { beforeStart, afterFinish }
    })
    expect(r.beforeStart).not.toContain('Log what you saw on the machine')
    expect(r.afterFinish).toContain('Log what you saw on the machine')
    // Case-insensitive — the header's own CSS is text-transform:uppercase, and .innerText (unlike
    // .textContent) reflects the rendered/computed case, not the literal DOM string.
    expect(r.afterFinish.toLowerCase()).toContain('skierg')
  })

  test('toggling a chip mid-card preserves already-typed values in other active fields', async ({ page }) => {
    const vals = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Bike', type: 'cardio', metricType: 'cardio', loggedSets: [{ duration: '20:00' }]
      }], exIdx: 0, startTime: Date.now() }
      // HR on by default; Pace off by default (_loadCardioCaptureToggles' own defaults).
      renderCardioCaptureCard(_runner.exercises[0], () => {})
      document.getElementById('wr-capture-avg-hr').value = '142'
      // Toggling Pace on re-renders the card (a new field appears) — HR's typed value must survive it.
      _toggleCardioCaptureMetric('pace')
      return {
        avgHr: document.getElementById('wr-capture-avg-hr')?.value,
        paceFieldExists: !!document.getElementById('wr-capture-pace')
      }
    })
    expect(vals.avgHr).toBe('142')
    expect(vals.paceFieldExists).toBe(true)
  })

  test('Continue applies only toggled-on metrics to the last logged set; inactive fields are left untouched', async ({ page }) => {
    const set = await page.evaluate(() => {
      _saveCardioCaptureToggles({ hr: true, watts: false, pace: true, strokeRate: false })
      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'cardio', loggedSets: [{ duration: '20:00' }]
      }], exIdx: 0, startTime: Date.now() }
      renderCardioCaptureCard(_runner.exercises[0], () => {})
      document.getElementById('wr-capture-avg-hr').value = '150'
      document.getElementById('wr-capture-max-hr').value = '172'
      document.getElementById('wr-capture-pace').value = '2:10'
      _applyCardioCapture(_runner.exercises[0])
      return _runner.exercises[0].loggedSets[0]
    })
    expect(set.avgHr).toBe('150')
    expect(set.maxHr).toBe('172')
    expect(set.pace).toBe('2:10')
    expect(set.avgWatts).toBeUndefined()
    expect(set.strokeRate).toBeUndefined()
  })

  test('Skip applies nothing and still proceeds', async ({ page }) => {
    const r = await page.evaluate(() => {
      _saveCardioCaptureToggles({ hr: true, watts: true, pace: true, strokeRate: true })
      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'cardio', loggedSets: [{ duration: '20:00' }]
      }], exIdx: 0, startTime: Date.now() }
      let continued = false
      renderCardioCaptureCard(_runner.exercises[0], () => { continued = true })
      document.getElementById('wr-capture-avg-hr').value = '150'
      // Skip button — no _applyCardioCapture call, just onContinue directly.
      _runner._captureOnContinue()
      return { continued, set: _runner.exercises[0].loggedSets[0] }
    })
    expect(r.continued).toBe(true)
    expect(r.set.avgHr).toBeUndefined()
  })

  test('toggle state persists across a page reload (localStorage)', async ({ page }) => {
    await page.evaluate(() => _saveCardioCaptureToggles({ hr: false, watts: false, pace: true, strokeRate: true }))
    await page.reload()
    await page.waitForTimeout(1000)
    const t = await page.evaluate(() => _loadCardioCaptureToggles())
    expect(t).toEqual({ hr: false, watts: false, pace: true, strokeRate: true })
    await resetToggles(page)
  })

  test('quick-prefs popover reads and writes the SAME toggle state the capture card uses', async ({ page }) => {
    // Toggle Pace on from the popover, then confirm a freshly-rendered capture card reflects it —
    // proves one shared preference, not two divergent copies.
    const r = await page.evaluate(() => {
      _openQuickPrefsPopover()
      _toggleQuickPrefsCapture('pace')
      closeModal('quick-prefs-modal')
      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'cardio', loggedSets: [{ duration: '20:00' }]
      }], exIdx: 0, startTime: Date.now() }
      renderCardioCaptureCard(_runner.exercises[0], () => {})
      return { paceFieldExists: !!document.getElementById('wr-capture-pace') }
    })
    expect(r.paceFieldExists).toBe(true)
  })
})
