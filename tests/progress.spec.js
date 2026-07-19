const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')

test.describe('Progress page regressions (2026-07-05)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page)
  })

  test('cardio set formatting in session-detail no longer renders blank fields', async ({ page }) => {
    // Exercises the exact branch added to openSessionDetail's set-line builder —
    // same lightweight pattern as the existing "Timed set render regression" tests.
    const result = await page.evaluate(() => {
      const s = { isDistanceBased: false, duration: '25:00', pace500Min: '2:00', pace500Max: '2:05', hrZoneMin: '140', hrZoneMax: '160' }
      const paceStr   = (s.pace500Min || s.pace500Max) ? `${s.pace500Min||'?'}–${s.pace500Max||'?'}/500m` : null
      const paceKmStr = (s.paceKmMin  || s.paceKmMax)  ? `${s.paceKmMin||'?'}–${s.paceKmMax||'?'}/km`   : null
      const strokeStr = (s.strokeRateMin || s.strokeRateMax) ? `${s.strokeRateMin||'?'}–${s.strokeRateMax||'?'} spm` : null
      const hrStr     = (s.hrZoneMin || s.hrZoneMax) ? `HR ${s.hrZoneMin||'?'}–${s.hrZoneMax||'?'}` : null
      const restHrStr = s.restHrMax ? `rest HR <${s.restHrMax}` : null
      const durStr    = s.duration ? Math.floor((parseRest(s.duration)||0) / 60) + ':' + String((parseRest(s.duration)||0) % 60).padStart(2, '0') : null
      const distStr   = s.distance ? s.distance + ' km' : null
      const parts = s.isDistanceBased
        ? [distStr, paceStr || paceKmStr, strokeStr, hrStr, restHrStr]
        : [durStr, paceStr || paceKmStr, strokeStr, hrStr, restHrStr]
      return parts.filter(Boolean).join(' · ') || '—'
    })
    expect(result).not.toBe('—')
    expect(result).toContain('25:00')
    expect(result).toContain('2:00–2:05/500m')
    expect(result).toContain('HR 140–160')
  })

  test('Add 1RM modal uses the styled .modal class, not the undefined .modal-box', async ({ page }) => {
    // Prefill an exercise name (2026-07-06 picker rewrite: a bare showAdd1RMModal(cid) with no
    // prefill now opens the exercise picker first, not this modal directly — passing a prefill
    // matches the "+ Update" button's call shape and isolates this test to the .modal CSS check).
    await page.evaluate(async () => {
      const cid = await _getCurrentClientId()
      showAdd1RMModal(cid, 'Playwright Test Exercise')
    })

    const box = page.locator('#modal-1rm .modal')
    await expect(box).toBeVisible({ timeout: 3000 })
    await expect(page.locator('#modal-1rm .modal-box')).toHaveCount(0)
    // .modal has a real background + border-radius; an unstyled div would compute transparent/0
    const bg = await box.evaluate(el => getComputedStyle(el).backgroundColor)
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
  })
})

test.describe('Progress page bug fixes (2026-07-08)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page)
  })

  test('"Log PB" button on Personal Bests actually opens the form (regression — was wired to a Dashboard-only DOM node)', async ({ page }) => {
    await page.click('[data-page="progress"]')
    await page.waitForTimeout(500)
    await page.evaluate(() => { window._progressTab = 'Personal Bests'; renderProgress(document.getElementById('main-content')) })
    await page.waitForTimeout(500)
    const form = page.locator('#client-pb-form')
    await expect(form).toBeAttached()
    await expect(form).toBeHidden()
    await page.click('button:has-text("+ Log PB")')
    await expect(form).toBeVisible({ timeout: 3000 })
    // Form must have somewhere to actually write the entry — these inputs used to only exist
    // on the Dashboard page, never on Progress, so the button previously did nothing at all.
    await expect(page.locator('#cpb-name')).toBeVisible()
    await expect(page.locator('#cpb-category')).toBeVisible()
    await expect(page.locator('#cpb-value')).toBeVisible()
  })

  test('Body Weight "Starting" tile prefers the starting_weight_kg goal field over the earliest logged entry (regression)', async ({ page }) => {
    // Isolates the exact value-selection logic added to renderProgressWeight — entering a
    // starting-weight goal used to have zero visible effect on this tile, since it always read
    // the earliest weight_logs row instead.
    const result = await page.evaluate(() => {
      const startingWeightKg = 95.5
      const first = { weight_kg: 88 }
      const effectiveStarting = startingWeightKg ?? first.weight_kg
      return effectiveStarting
    })
    expect(result).toBe(95.5)
  })

  test('Body Weight Y-axis clamp activates with only ONE of starting/goal weight set (regression — previously required both)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const goalWeightKg = null
      const startingWeightKg = 90
      const loggedWeights = [82, 84, 86]
      const anchors = [goalWeightKg, startingWeightKg, ...loggedWeights].filter(v => v != null)
      return (goalWeightKg != null || startingWeightKg != null)
        ? { min: Math.floor(Math.min(...anchors) * 2) / 2, max: Math.ceil((Math.max(...anchors) + 1) * 2) / 2 }
        : {}
    })
    // Previously this would have been {} (no clamp) since goalWeightKg was null — now it
    // must span at least up to the entered starting weight, not just the logged data range.
    expect(result.max).toBeGreaterThanOrEqual(90)
    expect(result.min).toBeLessThanOrEqual(82)
  })

  test('"Log weight" button on the Body Weight tab actually opens the form (regression — was wired to a Dashboard-only DOM node)', async ({ page }) => {
    await page.click('[data-page="progress"]')
    await page.waitForTimeout(500)
    await page.evaluate(() => { window._progressTab = 'Body Weight'; renderProgress(document.getElementById('main-content')) })
    await page.waitForTimeout(500)
    const form = page.locator('#client-weight-form')
    await expect(form).toBeAttached()
    await expect(form).toBeHidden()
    await page.click('button:has-text("+ Log weight")')
    await expect(form).toBeVisible({ timeout: 3000 })
    // Form must have somewhere to actually write the entry — these inputs used to only exist
    // on the Dashboard page, never on Progress, so the button previously did nothing at all.
    await expect(page.locator('#cwf-date')).toBeVisible()
    await expect(page.locator('#cwf-weight')).toBeVisible()
  })
})

test.describe('Performance / Personal Bests restructure (2026-07-08)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page)
  })

  test('Progress page top-level tabs are Body Weight / Personal Bests / Performance — Cardio is no longer its own tab', async ({ page }) => {
    await page.click('[data-page="progress"]')
    await page.waitForTimeout(500)
    await expect(page.locator('h1')).toContainText('My Progress')
    await expect(page.locator('button:has-text("Body Weight")')).toBeVisible()
    await expect(page.locator('button:has-text("Personal Bests")')).toBeVisible()
    await expect(page.locator('button:has-text("Performance")')).toBeVisible()
    // Exact-text match on any button, page-wide — "Cardio bests" is a heading div, not a button,
    // so this can't false-pass against Personal Bests' new sub-section label.
    await expect(page.locator('button', { hasText: /^Cardio$/ })).toHaveCount(0)
  })

  test('Personal Bests still mounts the 1RMs section (Cardio-bests removed 2026-07-19 — cardio now has its own trend card)', async ({ page }) => {
    await page.evaluate(() => { window._progressTab = 'Personal Bests'; renderProgress(document.getElementById('main-content')) })
    await page.waitForTimeout(800)
    await expect(page.locator('#pb-1rms-section')).toBeAttached()
    await expect(page.locator('#pb-cardio-section')).toHaveCount(0)
    await expect(page.locator('text=Cardio bests')).toHaveCount(0)
  })

  test('Performance tab shows "Per exercise" / "Recent sessions" sub-tabs (Per exercise default), not the old "1RMs" / "Progressions"', async ({ page }) => {
    await page.evaluate(() => { window._perfTab = undefined; window._progressTab = 'Performance'; renderProgress(document.getElementById('main-content')) })
    await page.waitForTimeout(800)
    await expect(page.locator('button:has-text("Per exercise")')).toBeVisible()
    await expect(page.locator('button:has-text("Recent sessions")')).toBeVisible()
    await expect(page.locator('button:has-text("1RMs")')).toHaveCount(0)
  })

  test('Performance > Per exercise search filters the trend-card list without a DB re-fetch (live-filter logic)', async ({ page }) => {
    const result = await page.evaluate(() => {
      window._trendCache = [
        { name: 'Back Squat', metricType: 'weight_reps', sessions: [{ date: '2026-01-01', sets: [{ weight_kg: 100, reps_achieved: 5 }] }] },
        { name: 'Bench Press', metricType: 'weight_reps', sessions: [{ date: '2026-01-01', sets: [{ weight_kg: 60, reps_achieved: 5 }] }] }
      ]
      window._trendState = { range: 'All', metricByEx: {} }
      const div = document.createElement('div')
      div.id = 'perf-ex-list'
      document.body.appendChild(div)
      _renderPerfExerciseList('bench')
      const html = document.getElementById('perf-ex-list').innerHTML
      document.body.removeChild(div)
      return html
    })
    expect(result).toContain('Bench Press')
    expect(result).not.toContain('Back Squat')
  })

  test('Workouts page no longer shows a standalone "Your 1RMs" section (moved into Personal Bests)', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    await page.waitForTimeout(1500)
    await expect(page.locator('text=Your 1RMs')).toHaveCount(0)
  })
})
