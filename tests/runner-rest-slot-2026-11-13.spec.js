const { test, expect } = require('./fixtures')
const { loginAsClient, logTableSet } = require('./helpers')

// ─── Runner: ticking a set must not move the set rows (solo audit Phase 4a, 2026-11-13) ─────────────
//
// The rest bar used to be inserted ABOVE the set table only while a rest ran (renderTable's restBar), so every tick
// pushed every row down by the bar's height plus its gap (65 px, measured here before the fix and by the 2026-11-08
// audit) and a quick second tap could land on the wrong row. Jake chose on 2026-11-13 to put the live timer IN the
// prescription strip: the REST cell becomes the countdown and a tap on it skips. Nothing is added above the rows, and
// the strip always has a REST cell (the planned rest when the prescription names none), so it never grows either.
const NO_REST = [{
  exercise_name: 'Own Row', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0,
  sets_json: [{ repsMin: '8', weight: '60' }, { repsMin: '8', weight: '60' }],
}]

test.describe('runner rest timer lives in the prescription strip', () => {
  const top = (page, sel) => page.locator(sel).first().evaluate(e => e.getBoundingClientRect().top + window.scrollY)
  const row = i => `#workout-runner input[oninput*="tableRows[${i}].reps"]`
  const stripHeight = page => page.locator('#wr-rx').evaluate(e => e.getBoundingClientRect().height)
  const start = async (page, wk) => {
    await wk.start()
    await expect(page.locator('button:text-is("End")')).toBeVisible({ timeout: 12000 })
    await page.evaluate(() => runnerJumpTo(_runner.exercises.findIndex(e => _isPlainStrengthExercise(e))))
  }

  test('ticking a set leaves every row where it was; the REST cell counts down and a tap skips', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    await start(page, await ownWorkout())
    const r0 = await top(page, row(0)), r1 = await top(page, row(1)), h = await stripHeight(page)
    await expect(page.locator('#wr-rx')).toContainText('1:30')
    expect(await logTableSet(page, { weight: '60', reps: '8' })).toBe(true)
    const cell = page.locator('#wr-rx #rest-timer-overlay')
    await expect(cell).toBeVisible()
    await expect(page.locator('#wr-rx #rt-countdown')).toHaveText(/^\d+:\d\d$/)
    await expect(cell).toContainText(/skip/i)
    expect(Math.abs(await top(page, row(0)) - r0), 'set 1 moved when the rest started').toBeLessThanOrEqual(1)
    expect(Math.abs(await top(page, row(1)) - r1), 'set 2 moved when the rest started').toBeLessThanOrEqual(1)
    expect(Math.abs(await stripHeight(page) - h), 'the strip changed height when the rest started').toBeLessThanOrEqual(1)
    await expect(page.locator('#workout-runner > * #rest-timer-overlay:not(#wr-rx *)')).toHaveCount(0)
    await cell.locator('button').click()
    await expect(page.locator('#rest-timer-overlay')).toHaveCount(0)
    await expect(page.locator('#wr-rx')).toContainText('1:30')
    expect(Math.abs(await top(page, row(1)) - r1), 'set 2 moved when the rest was skipped').toBeLessThanOrEqual(1)
  })

  test('with no rest in the prescription the strip still shows the planned rest, so it never grows', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    await start(page, await ownWorkout({ exercises: NO_REST }))
    await expect(page.locator('#wr-rx')).toContainText('REST')
    await expect(page.locator('#wr-rx')).toContainText('1:30')   // the runner's own default
    const r1 = await top(page, row(1)), h = await stripHeight(page)
    expect(await logTableSet(page, { weight: '60', reps: '8' })).toBe(true)
    await expect(page.locator('#wr-rx #rest-timer-overlay')).toBeVisible()
    expect(Math.abs(await top(page, row(1)) - r1), 'set 2 moved when the rest started').toBeLessThanOrEqual(1)
    expect(Math.abs(await stripHeight(page) - h), 'the strip changed height when the rest started').toBeLessThanOrEqual(1)
  })
})
