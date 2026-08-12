// 2026-08-11 — proves the `ownWorkout` fixture before any test is converted to rely on it.
//
// A fixture that silently fails to create, or silently fails to clean up, is worse than the
// `.first()` pattern it replaces: it would make the suite look deterministic while leaving the same
// shared state behind. 58 stray [E2E] workout_logs (48 with zero exercises) in the test account are
// what "cleanup nobody checked" looks like, so teardown is asserted here, not assumed.
const { test, expect } = require('./fixtures')
const { loginAsClient, loginAsPT } = require('./helpers')

test.describe('ownWorkout fixture (2026-08-11)', () => {
  test('creates a workout this test alone owns, and the runner starts THAT one', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    const wk = await ownWorkout()

    expect(wk.templateId).toBeTruthy()
    expect(wk.name).toMatch(/^\[E2E\] own /)

    await wk.start()

    // The runner must be showing OUR workout, not whatever happened to be first on the page.
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })
    const loaded = await page.evaluate(() => ({
      name: _runner?.name || null,
      exercises: (_runner?.exercises || []).map(e => e.name),
    }))
    console.log('runner loaded:', JSON.stringify(loaded))

    expect(loaded.name).toBe(wk.name)
    expect(loaded.exercises).toEqual(wk.exerciseNames)
  })

  test('two workouts created in the same run do not collide', async ({ page, ownWorkout }) => {
    // The whole point is that concurrent/consecutive tests stop sharing a workout. Names carry a
    // timestamp AND a random suffix because Date.now() alone collides when two run in the same ms.
    await loginAsClient(page)
    const a = await ownWorkout()
    const b = await ownWorkout()
    expect(a.templateId).not.toBe(b.templateId)
    expect(a.name).not.toBe(b.name)
    expect(a.exerciseNames[0]).not.toBe(b.exerciseNames[0])
  })

  test('a custom exercise shape is honoured, so tests can pin the metric_type they need', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    const wk = await ownWorkout({
      exercises: [{
        exercise_name: 'Own Hold', exercise_type: 'strength', metric_type: 'timed_hold',
        order_index: 0, sets_json: [{ repsMin: '30' }],
      }],
    })
    await wk.start()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })
    const mt = await page.evaluate(() => _runner.exercises[0].metricType)
    expect(mt).toBe('timed_hold')
  })
})

// Teardown is a separate describe so it runs AFTER the block above has fully torn down — asserting
// cleanup from inside the same test would check it before the fixture's own teardown had run.
test.describe('ownWorkout teardown (2026-08-11)', () => {
  test('leaves no [E2E] own templates or logs behind', async ({ page }) => {
    await loginAsPT(page)
    const left = await page.evaluate(async () => {
      const { data: tmpl } = await db.from('workout_templates').select('id, name').like('name', '[E2E] own %')
      const { data: logs } = await db.from('workout_logs').select('id, name').like('name', '[E2E] own %')
      return { templates: (tmpl || []).map(t => t.name), logs: (logs || []).map(l => l.name) }
    })
    console.log('survivors:', JSON.stringify(left))

    expect(left.templates, 'the fixture must delete every template it created').toEqual([])
    expect(left.logs, 'the fixture must delete every workout_log its workout produced').toEqual([])
  })
})
