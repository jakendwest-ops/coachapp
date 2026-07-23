const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Sub-project ②c: the fast table handles 5 metric_types and emits the loggedSet shapes ②b persists.
test.describe('Runner fast table — metric_type aware', () => {
  test('routes 5 types to the table, cardio to wizard, and syncs correct loggedSet shapes', async ({ page }) => {
    await loginAsPT(page)
    await page.click('text=Personal')
    await page.waitForTimeout(1200)

    const res = await page.evaluate(() => {
      const clientId = 'x' // not persisted in this test — pure in-memory logic check
      const mk = (metricType, tableRows) => ({ name: metricType, type: metricType === 'cardio' ? 'cardio' : 'strength', metricType, sets_json: [{}], loggedSets: [], tableRows })
      const routing = {}
      for (const mt of ['weight_reps','unilateral','timed_hold','jump_height','jump_distance','cardio']) {
        routing[mt] = _isPlainStrengthExercise(mk(mt, []))
      }
      const sync = {}
      const cases = {
        weight_reps:   [{ weight: '100', reps: '5', done: true }],
        unilateral:    [{ leftWeight: '20', leftReps: '10', rightWeight: '18', rightReps: '9', done: true }],
        timed_hold:    [{ duration: '1:30', weight: '5', done: true }],
        jump_height:   [{ height_cm: '55', reps: '3', done: true }],
        jump_distance: [{ distance_m: '2.4', reps: '5', done: true }]
      }
      for (const [mt, rows] of Object.entries(cases)) {
        const ex = mk(mt, rows)
        _syncLoggedSetsFromTable(ex)
        sync[mt] = ex.loggedSets[0]
      }
      return { routing, sync }
    })

    // Routing: 5 fast-table types true, cardio false
    expect(res.routing.weight_reps).toBe(true)
    expect(res.routing.unilateral).toBe(true)
    expect(res.routing.timed_hold).toBe(true)
    expect(res.routing.jump_height).toBe(true)
    expect(res.routing.jump_distance).toBe(true)
    expect(res.routing.cardio).toBe(false)

    // Sync shapes match the ②b save contract
    expect(res.sync.weight_reps).toEqual({ weight: '100', reps: '5' })
    expect(res.sync.unilateral).toEqual({ leftWeight: '20', leftReps: '10', rightWeight: '18', rightReps: '9' })
    expect(res.sync.timed_hold).toEqual({ duration: '1:30', weight: '5' })
    // reps = contacts; added 2026-07-23 so a prescribed jump count can actually be logged.
    expect(res.sync.jump_height).toEqual({ height_cm: '55', reps: '3' })
    expect(res.sync.jump_distance).toEqual({ distance_m: '2.4', reps: '5' })
  })
})
