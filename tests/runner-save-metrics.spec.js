const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Sub-project ②b: saveRunnerSession must persist unilateral (as two side-tagged rows), timed holds,
// distance-strength, and heart rate — data the wizard captures but the old save silently dropped.
test.describe('Runner save persists all metric shapes', () => {
  test('unilateral splits to L/R rows; timed, distance, and HR round-trip', async ({ page }) => {
    await loginAsPT(page)
    await page.click('text=Personal') // solo view — self-owned client, avoids cross-tenant setup
    await page.waitForTimeout(1500)

    const result = await page.evaluate(async () => {
      const clientId = await _getCurrentClientId()
      const tag = '[E2E] save-metrics ' + Date.now()
      // Construct runner state directly — one exercise per captured shape.
      // NOTE: `_runner` is a top-level `let` in app-workouts.js (classic script), so it lives in the
      // page's global lexical environment, not as a `window` property (same gotcha as currentUser/
      // currentProfile in helpers.js) — assign the bare identifier, not `window._runner`, or
      // saveRunnerSession() reads the real (still-null) `_runner` and silently no-ops.
      _runner = {
        clientId, name: tag, date: new Date().toISOString().split('T')[0], exercises: [
          { name: tag + ' Uni', type: 'strength', metricType: 'unilateral', exerciseId: null,
            loggedSets: [{ leftWeight: '20', leftReps: '10', rightWeight: '18', rightReps: '9' }] },
          { name: tag + ' Hold', type: 'strength', metricType: 'timed_hold', exerciseId: null,
            loggedSets: [{ duration: '1:30', weight: '5' }] },
          { name: tag + ' Jump', type: 'strength', metricType: 'jump_distance', exerciseId: null,
            loggedSets: [{ distance_m: '2.4' }] },
          { name: tag + ' Row', type: 'cardio', metricType: 'cardio', exerciseId: null,
            loggedSets: [{ duration: '20:00', distance: '5', avgHr: '150', maxHr: '175' }] }
        ]
      }
      await saveRunnerSession()

      // Read the log back through the app's authed db client.
      const { data: log } = await db.from('workout_logs').select('id').eq('client_id', clientId).eq('name', tag).single()
      const { data: exs } = await db.from('workout_log_exercises')
        .select('id, exercise_name, metric_type, workout_log_sets(set_number, side, reps_achieved, weight_kg, duration_seconds, distance_m, avg_hr, max_hr)')
        .eq('log_id', log.id)
      // cleanup
      const exIds = exs.map(e => e.id)
      await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exIds)
      await db.from('workout_log_exercises').delete().eq('log_id', log.id)
      await db.from('workout_logs').delete().eq('id', log.id)
      return { exs }
    })

    const byName = Object.fromEntries(result.exs.map(e => [e.exercise_name.split(' ').pop(), e]))

    // Unilateral → two rows, one per side, same set_number, metric_type persisted.
    const uni = byName['Uni']
    expect(uni.metric_type).toBe('unilateral')
    const sides = uni.workout_log_sets.map(s => s.side).sort()
    expect(sides).toEqual(['left', 'right'])
    const left = uni.workout_log_sets.find(s => s.side === 'left')
    expect(left.reps_achieved).toBe(10)
    expect(Number(left.weight_kg)).toBe(20)

    // Timed hold → duration_seconds (90) + load.
    const hold = byName['Hold']
    expect(hold.metric_type).toBe('timed_hold')
    expect(hold.workout_log_sets[0].duration_seconds).toBe(90)
    expect(Number(hold.workout_log_sets[0].weight_kg)).toBe(5)

    // Jump distance → distance_m in metres (2.4 → 2, rounded), NOT km-scaled.
    const jump = byName['Jump']
    expect(jump.metric_type).toBe('jump_distance')
    expect(jump.workout_log_sets[0].distance_m).toBe(2)

    // Cardio → duration + km-scaled distance + heart rate.
    const row = byName['Row']
    expect(row.workout_log_sets[0].duration_seconds).toBe(1200)
    expect(row.workout_log_sets[0].distance_m).toBe(5000)
    expect(row.workout_log_sets[0].avg_hr).toBe(150)
    expect(row.workout_log_sets[0].max_hr).toBe(175)
  })
})
