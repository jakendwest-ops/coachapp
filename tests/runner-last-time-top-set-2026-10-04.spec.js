const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')
const { installCappedApi } = require('./capped-api')

// ─── The runner's "Last time" panel shows the TOP SET (Jake, 2026-10-04: "This panel needs to show top set") ────────────────────
//
// The panel read "2 sets, top 23 kg": the heaviest WEIGHT, not the set - the reps it was lifted for were missing, and so was the
// effort on an RPE top-set exercise (where last time's top set is exactly what the lifter needs in view, now that the grey hints
// are gone). It now reads "Top set 23 kg × 5" (with "@9" for a logged RPE, "@2 RIR" for RIR) under "Last time · 29 Sept · 2 sets".
// "Top set" is the Stats card's own definition (_xsSessionMetrics: the heaviest set, a tie going to more reps, warm-ups never
// counted), so the panel and the card behind it cannot disagree. The wording itself is pinned in tests-node/exercise-stats.test.mjs;
// these prove the wiring: the panel, its accessible name, the agreement with the card, and that the read asks for each set's phase.
//
// Everything is IN-MEMORY (a hand-built `_runner`, the capped API stand-in, stubbed reads): nothing is written to the database.

const ME = 'lt-me'

// Sets are [kg, reps] or [kg, reps, scale, value] or [kg, reps, null, null, phase].
const lastSets = sets => sets.map(([w, r, t, v, ph], k) => ({ set_number: k + 1, weight_kg: w, reps_achieved: r, effort_type: t ?? null, effort_value: v ?? null, ...(ph ? { phase: ph } : {}) }))

async function showRunner(page, { sets, name = 'Pull Up', date = '2026-09-29' }) {
  await page.evaluate(({ rows, name, date, ME }) => {
    const rx = { repsMin: '5', repsMax: '8', effortType: 'rpe', effortMin: '7', effortMax: '9', restMin: '2:00' }
    _runner = {
      clientId: ME, startTime: Date.now(), exIdx: 0,
      lastSession: { [name]: rows ? { date, sets: rows } : null },
      exercises: [{ name, type: 'strength', metricType: 'weight_reps', targetSets: 3, sets_json: [rx, rx, rx], loggedSets: [], exerciseId: null, order_index: 0, restSecs: 60 }],
    }
    renderRunner()
  }, { rows: sets ? lastSets(sets) : null, name, date, ME })
  await expect(page.locator('#workout-runner button:text-is("End")')).toBeVisible()
}

// What the panel says, as plain text: the small line above and the headline.
const panel = page => page.evaluate(() => {
  const el = document.getElementById('wr-lasttime')
  if (!el) return null
  const t = sel => el.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() ?? null
  return { label: t('[data-lt-label]'), top: t('[data-lt-top]'), aria: el.getAttribute('aria-label') }
})

test.describe('The Last time panel shows the top set (2026-10-04)', () => {
  test.beforeEach(async ({ page }) => { await loginAsClient(page) })

  test('Jake\'s screenshot: two sets, 23 kg for 5 is the top set - the panel says so, with the date and the set count above it', async ({ page }) => {
    await showRunner(page, { sets: [[20, 5], [23, 5]] })
    const p = await panel(page)
    expect(p.top).toBe('Top set 23 kg × 5')
    expect(p.label).toBe('Last time · 29 Sept · 2 sets')
    expect(p.aria, 'the accessible name carries the same facts').toContain('Last time 29 Sept, 2 sets, top set 23 kg × 5')
  })

  test('the old wording is gone: no "2 sets, top 23 kg" headline', async ({ page }) => {
    await showRunner(page, { sets: [[20, 5], [23, 5]] })
    const p = await panel(page)
    expect(p.top).not.toMatch(/, top /)
    expect(p.top).not.toMatch(/^\d+ sets/)
  })

  test('a logged RPE travels with the top set, so last time\'s top set reads the way it was lifted', async ({ page }) => {
    await showRunner(page, { sets: [[100, 3, 'rpe', 9], [85, 5], [85, 5], [85, 5]] })
    const p = await panel(page)
    expect(p.top).toBe('Top set 100 kg × 3 @9')
    expect(p.label).toBe('Last time · 29 Sept · 4 sets')
  })

  test('RIR keeps its scale (RIR and RPE run in opposite directions)', async ({ page }) => {
    await showRunner(page, { sets: [[100, 3, 'rir', 2]] })
    const p = await panel(page)
    expect(p.top).toBe('Top set 100 kg × 3 @2 RIR')
    expect(p.label, 'one set is "1 set"').toBe('Last time · 29 Sept · 1 set')
  })

  test('a bodyweight lift has no heaviest weight: its top set is the set with the most reps', async ({ page }) => {
    await showRunner(page, { sets: [[null, 10], [null, 12], [null, 9]], name: 'Chin Up' })
    expect((await panel(page)).top).toBe('Top set 12 reps')
  })

  test('shown in the unit the person chose', async ({ page }) => {
    await page.evaluate(() => { window._unitPrefs = { ...window._unitPrefs, weight: 'lb' } })
    await showRunner(page, { sets: [[100, 5]] })
    expect((await panel(page)).top).toBe('Top set 220.5 lb × 5')
  })

  test('a warm-up is neither the top set nor part of the count - exactly as the Stats card treats it', async ({ page }) => {
    await showRunner(page, { sets: [[140, 1, null, null, 'warmup'], [100, 5], [100, 5]] })
    const p = await panel(page)
    expect(p.top, 'the 140 kg warm-up is not the top set').toBe('Top set 100 kg × 5')
    expect(p.label, 'and it is not counted').toBe('Last time · 29 Sept · 2 sets')
  })

  test('still no panel when there is no previous session, and tapping it still opens the Stats sheet', async ({ page }) => {
    await showRunner(page, { sets: null })
    await expect(page.locator('#wr-lasttime')).toHaveCount(0)
    await showRunner(page, { sets: [[20, 5], [23, 5]] })
    await installCappedApi(page, { workout_log_exercises: [] })
    await page.locator('#wr-lasttime').click()
    await expect(page.locator('#runner-stats-modal')).toBeVisible()
  })

  test('the panel and the Stats card call the SAME set the top set', async ({ page }) => {
    const sets = [[20, 10, null, null, 'warmup'], [23, 5], [20, 5]]
    await installCappedApi(page, { workout_log_exercises: [{
      id: 'lt-row-000001', exercise_name: 'Pull Up', metric_type: 'weight_reps',
      workout_logs: { date: '2026-09-29', client_id: ME }, workout_log_sets: lastSets(sets),
    }] })
    await showRunner(page, { sets })
    const p = await panel(page)
    await page.locator('#wr-lasttime').click()
    await expect(page.locator('#rs-body [data-xs-tile="top"]')).toBeVisible()
    const tile = await page.locator('#rs-body [data-xs-tile="top"] .xs-tv').textContent()
    const cardSets = await page.locator('#rs-body [data-xs-tile="sets"] .xs-tv').textContent()
    expect(p.top, 'the panel').toBe('Top set 23 kg × 5')
    expect(tile.trim(), 'the card\'s Top set tile for the same session').toBe('23×5')
    expect(p.label, 'the panel counts the same working sets as the card\'s Sets tile').toContain(`${cardSets.trim()} sets`)
  })

  test('the read asks the database for each set\'s phase - without it a warm-up could not be told from a working set', async ({ page }) => {
    const selects = await page.evaluate(async () => {
      const seen = []
      const q = (data) => { const o = { select: (cols) => { seen.push(cols); return o }, eq: () => o, in: () => o, order: () => o, limit: () => o, then: (res, rej) => Promise.resolve({ data, error: null }).then(res, rej) }; return o }
      const real = db.from.bind(db)
      const set = { set_number: 1, weight_kg: 60, reps_achieved: 8 }
      db.from = (t) => t === 'workout_logs' ? q([{ id: 'L1', date: '2026-09-25' }])
        : t === 'workout_log_exercises' ? q([{ log_id: 'L1', workout_log_sets: [set] }])
        : real(t)
      try {
        _runner = { clientId: 'x', startTime: Date.now(), exIdx: 0, lastSession: {}, exercises: [] }
        await fetchRunnerLastSession('Phase Probe A', 'some-exercise-id')   // matched by the library id
        await fetchRunnerLastSession('Phase Probe B', null)                 // matched by name
      } finally { db.from = real }
      return seen.filter(s => /workout_log_sets/.test(s))
    })
    expect(selects.length, 'both ways of finding last time were exercised').toBe(2)
    for (const s of selects) expect(s, 'asks for phase').toMatch(/\bphase\b/)
  })
})
