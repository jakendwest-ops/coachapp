const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsClient } = require('./helpers')

// B4 — resting-HR trend chart appears on the Body Weight tab once ≥2 resting-HR entries exist.
test('resting-HR trend chart shows on the Body tab with >=2 entries (B4)', async ({ page }) => {
  await loginAsPT(page)
  await page.click('text=Personal')
  await page.waitForTimeout(1000)
  await page.evaluate(async () => {
    const cid = await _getCurrentClientId()
    await db.from('weight_logs').insert([
      { client_id: cid, date: '2027-03-01', weight_kg: 82, resting_hr: 60 },
      { client_id: cid, date: '2027-03-08', weight_kg: 81.5, resting_hr: 57 }
    ])
  })
  await page.reload()
  await page.waitForTimeout(800)
  await page.evaluate(() => { window._progressTab = 'Body Weight'; renderProgress(document.getElementById('main-content')) })
  await page.waitForTimeout(1000)
  const count = await page.locator('#resting-hr-chart').count()
  await page.evaluate(async () => { // cleanup own fixture (future dates, no collision)
    const cid = await _getCurrentClientId()
    await db.from('weight_logs').delete().eq('client_id', cid).in('date', ['2027-03-01', '2027-03-08'])
  })
  expect(count).toBe(1)
})

// B5 — the standalone "Cardio bests" section is removed from Personal Bests (cardio now has its own
// metric_type trend card in Per-exercise). The 1RMs section stays.
test('Personal Bests no longer renders a Cardio-bests section (B5)', async ({ page }) => {
  await loginAsClient(page)
  await page.evaluate(() => { window._progressTab = 'Personal Bests'; renderProgress(document.getElementById('main-content')) })
  await page.waitForTimeout(1200)
  expect(await page.locator('#pb-1rms-section').count()).toBe(1)      // 1RMs stays
  expect(await page.locator('#pb-cardio-section').count()).toBe(0)    // cardio-bests gone
  expect(await page.getByText('Cardio bests', { exact: true }).count()).toBe(0)
})

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

  test('diary: set-details line + per-exercise metrics (B3)', async ({ page }) => {
    await loginAsPT(page)
    await page.waitForTimeout(500)
    const r = await page.evaluate(() => {
      const ex = { exercise_name: 'Squat', exercise_type: 'strength', metric_type: 'weight_reps',
        workout_log_sets: [{ weight_kg: 105, reps_achieved: 10 }, { weight_kg: 110, reps_achieved: 10 }, { weight_kg: 120, reps_achieved: 8 }] }
      const m = _diaryExMetrics(ex)
      const cardio = _diaryExMetrics({ exercise_name: 'Row', exercise_type: 'cardio', metric_type: 'cardio',
        workout_log_sets: [{ distance_m: 5000, duration_seconds: 1200 }] })
      return { setLine: m.setLine, volume: m.sec.raw, top: m.main.raw, reps: m.reps, sets: m.sets, cardioMain: cardio.main.fmt }
    })
    expect(r.setLine).toBe('105×10, 110×10, 120×8')
    expect(r.volume).toBe(105 * 10 + 110 * 10 + 120 * 8) // 3110
    expect(r.top).toBe(120)
    expect(r.reps).toBe(28)
    expect(r.sets).toBe(3)
    expect(r.cardioMain).toBe('5.0 km')
  })

  test('runner vs-last-session totals (Workstream C)', async ({ page }) => {
    await loginAsPT(page)
    await page.waitForTimeout(500)
    const r = await page.evaluate(() => {
      _runner = { exIdx: 0, lastSession: { Bench: { date: '2026-07-01', sets: [{ weight_kg: 100, reps_achieved: 5 }, { weight_kg: 100, reps_achieved: 5 }] } } }
      const ex = { name: 'Bench', metricType: 'weight_reps', loggedSets: [{ weight: '105', reps: '5' }, { weight: '105', reps: '5' }] }
      return _runnerVsLast(ex)
    })
    expect(r.cur.vol).toBe(1050)
    expect(r.prev.vol).toBe(1000)
    expect(r.cur.top).toBe(105)
    expect(r.prev.top).toBe(100)
    expect(r.cur.reps).toBe(10)
    expect(r.cur.sets).toBe(2)
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

  test('cardio: points (pace/avg-HR), chips, and records (B1)', async ({ page }) => {
    await loginAsPT(page)
    await page.waitForTimeout(500)
    const r = await page.evaluate(() => {
      const ex = { name: 'Row', metricType: 'cardio', sessions: [
        { date: '2026-07-01', sets: [{ distance_m: 5000, duration_seconds: 1200, avg_hr: 150 }] }, // pace 240 s/km
        { date: '2026-07-08', sets: [{ distance_m: 6000, duration_seconds: 1300, avg_hr: 140 }] }  // pace ~216.7
      ] }
      const pts = _metricPointsFor(ex).points
      return {
        pace0: Math.round(pts[0].pace), avgHr0: pts[0].avgHr,
        chips: _TREND_METRICS.cardio.map(m => m[1]),
        rec: Object.fromEntries(_exerciseRecords(ex))
      }
    })
    expect(r.pace0).toBe(240)
    expect(r.avgHr0).toBe(150)
    expect(r.chips).toEqual(['Distance', 'Duration', 'Pace', 'Avg HR'])
    expect(r.rec['Best distance']).toBe('6.0 km')
    expect(r.rec['Avg HR']).toContain('bpm')
    expect(r.rec['Best pace']).toContain('/km')
  })

  test('intensity (kg/rep) metric on weight_reps (B2)', async ({ page }) => {
    await loginAsPT(page)
    await page.waitForTimeout(500)
    const r = await page.evaluate(() => {
      const ex = { name: 'B', metricType: 'weight_reps', sessions: [
        { date: '2026-07-01', sets: [{ weight_kg: 100, reps_achieved: 5 }, { weight_kg: 90, reps_achieved: 10 }] } // vol 1400 / 15 reps = 93.33
      ] }
      const p = _metricPointsFor(ex).points[0]
      return { intensity: p.intensity, hasChip: _TREND_METRICS.weight_reps.some(m => m[0] === 'intensity') }
    })
    expect(r.intensity).toBeCloseTo(93.33, 1)
    expect(r.hasChip).toBe(true)
  })

  test('unilateral / timed / jump points + records (B1)', async ({ page }) => {
    await loginAsPT(page)
    await page.waitForTimeout(500)
    const r = await page.evaluate(() => {
      const uni = { name: 'Split', metricType: 'unilateral', sessions: [
        { date: '2026-07-01', sets: [{ side: 'left', weight_kg: 20, reps_achieved: 10 }, { side: 'right', weight_kg: 18, reps_achieved: 10 }] }
      ] }
      const timed = { name: 'Plank', metricType: 'timed_hold', sessions: [{ date: '2026-07-01', sets: [{ duration_seconds: 90 }, { duration_seconds: 120 }] }] }
      const jh = { name: 'Box', metricType: 'jump_height', sessions: [{ date: '2026-07-01', sets: [{ height_cm: 60 }, { height_cm: 65 }] }] }
      return {
        uniPt: _metricPointsFor(uni).points[0],
        uniRec: Object.fromEntries(_exerciseRecords(uni)),
        timedRec: Object.fromEntries(_exerciseRecords(timed)),
        jhRec: Object.fromEntries(_exerciseRecords(jh)),
        uniChips: _TREND_METRICS.unilateral.map(m => m[1]),
        timedChips: _TREND_METRICS.timed_hold.map(m => m[1]),
        jhChips: _TREND_METRICS.jump_height.map(m => m[1]),
      }
    })
    expect(r.uniPt.leftTop).toBe(20)
    expect(r.uniPt.rightTop).toBe(18)
    expect(r.uniRec['Best left']).toBe('20 kg')
    expect(r.uniRec['Best right']).toBe('18 kg')
    expect(r.uniRec['L/R balance']).toBe('90%')
    expect(r.timedRec['Best hold']).toContain(':')
    expect(r.jhRec['Best height']).toBe('65 cm')
    expect(r.uniChips).toEqual(['Top weight'])
    expect(r.timedChips).toEqual(['Hold time'])
    expect(r.jhChips).toEqual(['Height'])
  })

  test('personal records: heaviest, best 1RM, best set (weight×reps), best session volume', async ({ page }) => {
    await loginAsPT(page)
    await page.waitForTimeout(500)
    const map = await page.evaluate(() => {
      const ex = { name: 'Bench', metricType: 'weight_reps', sessions: [
        { date: '2026-06-01', sets: [{ weight_kg: 100, reps_achieved: 5 }, { weight_kg: 90, reps_achieved: 10 }] }, // vol 1400
        { date: '2026-07-01', sets: [{ weight_kg: 100, reps_achieved: 10 }, { weight_kg: 80, reps_achieved: 12 }] }  // vol 1960
      ] }
      return Object.fromEntries(_exerciseRecords(ex))
    })
    expect(map['Heaviest weight']).toBe('100 kg')
    expect(map['Best est. 1RM']).toBe('133 kg')      // 100×10 → 133.3
    expect(map['Best set']).toBe('100 kg × 10')       // max weight×reps set
    expect(map['Best session vol']).toBe('1,960 kg')  // heavier of the two sessions
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
