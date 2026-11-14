const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')

// ─── Runner: "Fill from last time" and copy-down (solo audit's two top findings, Jake chose both 2026-11-14) ─────────
//
// Rows still start EMPTY (2026-07-11: a pre-filled value cannot be told apart from one you entered). Two explicit
// helpers sit on top of that rule:
//   - Fill from last time: one tap turns every grey NUMBER in an empty box into a real value. Never a typed box, never a
//     ticked set, never effort (a rating of the set you just did), never a top-set exercise (no grey there, 2026-10-03),
//     never a range. Nothing is logged: each set is still ticked by hand.
//   - Copy-down: ticking a set copies its numbers into the NEXT set when every box there is empty, it is not ticked, and
//     it prescribes the same thing. Effort is never copied.
// History is stubbed at the one read the runner makes for it (fetchRunnerLastSession's workout_log_exercises), the way
// runner-last-session-effort-only-2026-10-03 does, so nothing is written to the database for it.

const PLAIN = [{
  exercise_name: 'Fill Row', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0,
  sets_json: [{ restMin: '1:30' }, { restMin: '1:30' }, { restMin: '1:30' }],
}]
const COPY = [{
  exercise_name: 'Copy Row', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0,
  sets_json: [
    { repsMin: '5', effortMin: '8', effortType: 'rpe' }, { repsMin: '5', effortMin: '8', effortType: 'rpe' },
    { repsMin: '5', effortMin: '8', effortType: 'rpe' }, { repsMin: '8', effortMin: '8', effortType: 'rpe' },
  ],
}]
const TOP = [{
  exercise_name: 'Top Row', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0,
  sets_json: [
    { isTopSet: true, repsMin: '5', effortMin: '8', effortType: 'rpe' },
    { repsMin: '5', effortMin: '8', effortType: 'rpe' },   // the same as the top set in every field but isTopSet
    { repsMin: '5', effortMin: '8', effortType: 'rpe' },   // and two identical back-offs: still never carried
  ],
}]
const UNI = [{
  exercise_name: 'Uni Row', exercise_type: 'strength', metric_type: 'unilateral', order_index: 0,
  sets_json: [{}, {}],
}]
const JUMP = [{
  exercise_name: 'Jump Row', exercise_type: 'strength', metric_type: 'jump_height', order_index: 0,
  sets_json: [{}, {}, {}],
}]
const HISTORY = [
  { set_number: 1, weight_kg: 60, reps_achieved: 8, effort_value: 7, effort_type: 'rpe' },
  { set_number: 2, weight_kg: 62.5, reps_achieved: 8, effort_value: 8, effort_type: 'rpe' },
  { set_number: 3, weight_kg: 62.5, reps_achieved: 6, effort_value: 9, effort_type: 'rpe' },
]

const cell = (page, i, f) => page.locator(`#workout-runner #set-${i}-${f}`)
const tick = (page, i) => page.locator(`#workout-runner #set-${i}-done`).click()
const fillBtn = page => page.locator('#workout-runner #wr-fill-last')
const loggedCount = page => page.evaluate(() => _runner.exercises[_runner.exIdx].loggedSets.length)

// Installed BEFORE the runner starts, removed once the runner has the history, so no other read is touched.
const stubHistory = (page, sets) => page.evaluate(sets => {
  window.__realFrom = db.from.bind(db)
  db.from = t => {
    if (t !== 'workout_log_exercises') return window.__realFrom(t)
    let cid = null
    const o = {
      select: () => o, in: () => o, order: () => o, limit: () => o,
      eq: (c, v) => { if (c === 'workout_logs.client_id') cid = v; return o },
      then: (res, rej) => Promise.resolve({ data: [{ id: 'H1', log_id: 'L1', exercise_id: null,
        workout_logs: { date: '2026-11-07', created_at: '2026-11-07T10:00:00Z', client_id: cid }, workout_log_sets: sets }], error: null }).then(res, rej),
    }
    return o
  }
}, sets)

async function start(page, wk, { history = null } = {}) {
  if (history) await stubHistory(page, history)
  await wk.start()
  await expect(page.locator('button:text-is("End")')).toBeVisible({ timeout: 12000 })
  await page.evaluate(() => runnerJumpTo(0))
  if (history) {
    await expect.poll(() => page.evaluate(() => !!_runner.lastSession?.[_runner.exercises[0].name])).toBe(true)
    await page.evaluate(() => { db.from = window.__realFrom; renderRunner() })
  }
}

test.describe('runner: Fill from last time and copy-down', () => {
  test('Fill turns the grey numbers real, keeps a typed box, logs nothing, and stays put as spent', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    await start(page, await ownWorkout({ exercises: PLAIN }), { history: HISTORY })
    await expect(cell(page, 0, 'weight')).toHaveAttribute('placeholder', '60')
    await expect(cell(page, 2, 'reps')).toHaveAttribute('placeholder', '6')
    await cell(page, 1, 'weight').fill('65')
    await expect(fillBtn(page)).toBeVisible()
    const rowTop = () => cell(page, 2, 'reps').evaluate(e => e.getBoundingClientRect().top + window.scrollY)
    const before = await rowTop()
    await fillBtn(page).click()
    await expect(cell(page, 0, 'weight')).toHaveValue('60')
    await expect(cell(page, 0, 'reps')).toHaveValue('8')
    await expect(cell(page, 1, 'weight'), 'a typed box is never overwritten').toHaveValue('65')
    await expect(cell(page, 1, 'reps')).toHaveValue('8')
    await expect(cell(page, 2, 'weight')).toHaveValue('62.5')
    await expect(cell(page, 2, 'reps')).toHaveValue('6')
    expect(await loggedCount(page), 'Fill logs nothing: each set is still ticked by hand').toBe(0)
    await expect(fillBtn(page), 'spent, not removed: removing it would pull every row up').toBeDisabled()
    await expect(fillBtn(page)).toContainText('Filled from last time')
    expect(Math.abs(await rowTop() - before), 'the set rows did not move when Fill was used up').toBeLessThanOrEqual(1)
    await tick(page, 0)
    expect(await loggedCount(page)).toBe(1)
  })

  test('Fill never touches a ticked set, and copy-down already filled the next one', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    await start(page, await ownWorkout({ exercises: PLAIN }), { history: HISTORY })
    await cell(page, 0, 'weight').fill('70')
    await cell(page, 0, 'reps').fill('5')
    await tick(page, 0)
    await expect(cell(page, 1, 'weight')).toHaveValue('70')
    await expect(cell(page, 1, 'reps')).toHaveValue('5')
    await fillBtn(page).click()
    await expect(cell(page, 0, 'weight')).toHaveValue('70')
    await expect(cell(page, 0, 'reps')).toHaveValue('5')
    await expect(cell(page, 1, 'weight')).toHaveValue('70')
    await expect(cell(page, 2, 'weight')).toHaveValue('62.5')
    await expect(cell(page, 2, 'reps')).toHaveValue('6')
  })

  test('in lb, each filled weight reads exactly what its grey number read', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    await page.evaluate(() => { window._unitPrefs = { ...(window._unitPrefs || {}), weight: 'lb' } })
    await start(page, await ownWorkout({ exercises: PLAIN }), { history: HISTORY })
    const ph = []
    for (let i = 0; i < 3; i++) ph.push(await cell(page, i, 'weight').getAttribute('placeholder'))
    expect(ph[0]).not.toBe('60')   // really converted, or this test proves nothing
    await fillBtn(page).click()
    for (let i = 0; i < 3; i++) await expect(cell(page, i, 'weight')).toHaveValue(ph[i])
    expect(await page.evaluate(() => _runner.exercises[0].tableRows[0].weight), 'stored in kg').toBeCloseTo(60, 5)
  })

  test('a 0 kg set from last time fills as 0', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    await start(page, await ownWorkout({ exercises: PLAIN }), { history: [{ set_number: 1, weight_kg: 0, reps_achieved: 12 }] })
    await expect(fillBtn(page)).toBeVisible()
    await fillBtn(page).click()
    await expect(cell(page, 0, 'weight')).toHaveValue('0')
    await expect(cell(page, 0, 'reps')).toHaveValue('12')
  })

  test('first time: no Fill; a ticked set carries down until a box is typed or the target changes; effort never carries', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    await start(page, await ownWorkout({ exercises: COPY }))
    await expect(fillBtn(page)).toHaveCount(0)
    await cell(page, 0, 'weight').fill('60')
    await cell(page, 0, 'reps').fill('5')
    await cell(page, 0, 'effort').fill('8')
    await cell(page, 2, 'reps').fill('4')
    await tick(page, 0)
    await expect(cell(page, 1, 'weight')).toHaveValue('60')
    await expect(cell(page, 1, 'reps')).toHaveValue('5')
    await expect(cell(page, 1, 'effort'), 'effort is a rating of that set and is never carried').toHaveValue('')
    expect(await loggedCount(page), 'copy-down ticks nothing').toBe(1)
    await tick(page, 1)
    await expect(cell(page, 2, 'weight'), 'a set with a typed box is left alone').toHaveValue('')
    await expect(cell(page, 2, 'reps')).toHaveValue('4')
    await cell(page, 2, 'weight').fill('60')
    await tick(page, 2)
    await expect(cell(page, 3, 'weight'), 'set 4 prescribes 8 reps, not 5: nothing is carried').toHaveValue('')
    await expect(cell(page, 3, 'reps')).toHaveValue('')
  })

  test('a top-set exercise gets no Fill and no copy into its back-off sets', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    await start(page, await ownWorkout({ exercises: TOP }), { history: HISTORY })
    await expect(fillBtn(page)).toHaveCount(0)
    await cell(page, 0, 'weight').fill('100')
    await cell(page, 0, 'reps').fill('5')
    await cell(page, 0, 'effort').fill('8')
    await tick(page, 0)
    await expect(cell(page, 1, 'weight')).toHaveValue('')
    await expect(cell(page, 1, 'reps')).toHaveValue('')
    await cell(page, 1, 'weight').fill('90')
    await cell(page, 1, 'reps').fill('5')
    await tick(page, 1)
    await expect(cell(page, 2, 'weight'), 'one back-off is not carried into the next').toHaveValue('')
  })

  test('jumps: Fill takes last time, and never adds to a ticked set that was logged without contacts', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    await start(page, await ownWorkout({ exercises: JUMP }), { history: [{ set_number: 1, height_cm: 40, reps_achieved: 5 }, { set_number: 2, height_cm: 40, reps_achieved: 5 }, { set_number: 3, height_cm: 40, reps_achieved: 5 }] })
    await cell(page, 0, 'height_cm').fill('45')
    await tick(page, 0)
    await expect(cell(page, 1, 'height_cm'), 'copy-down carries the height').toHaveValue('45')
    await fillBtn(page).click()
    await expect(cell(page, 0, 'reps'), 'a ticked set is never changed by Fill').toHaveValue('')
    await expect(cell(page, 1, 'height_cm')).toHaveValue('45')
    await expect(cell(page, 1, 'reps')).toHaveValue('5')
    await expect(cell(page, 2, 'height_cm')).toHaveValue('40')
    await expect(cell(page, 2, 'reps')).toHaveValue('5')
  })

  test('copy-down carries both sides of a one-side-at-a-time set', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    await start(page, await ownWorkout({ exercises: UNI }))
    await cell(page, 0, 'leftWeight').fill('20')
    await cell(page, 0, 'leftReps').fill('10')
    await cell(page, 0, 'rightWeight').fill('20')
    await cell(page, 0, 'rightReps').fill('9')
    await tick(page, 0)
    await expect(cell(page, 1, 'leftWeight')).toHaveValue('20')
    await expect(cell(page, 1, 'leftReps')).toHaveValue('10')
    await expect(cell(page, 1, 'rightReps')).toHaveValue('9')
  })
})
