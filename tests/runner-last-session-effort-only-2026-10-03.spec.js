const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')

// fetchRunnerLastSession builds "last session" from the sets of a previous workout. A set that holds an effort rating and NOTHING
// else (no weight, reps, height or distance) comes from the old manual Log Session form (the runner stopped saving such rows on
// 2026-10-01: ticking a set needs reps, see _rowIncompleteReason, but older history may still hold some) and it is not a set that was
// done: counting it inflated the "Sets" stat and made the Last-time line read "1 × 0 reps". It WAS counted from 2026-09-30, when the
// filter was widened so the effort ghost could see a prior rating; but a set that has real work AND an effort already passes the work
// test, so the widening bought nothing.
//
// The three reads fetchRunnerLastSession makes are stubbed (nothing is written to the database), the way runner-layout-2026-09-28 does.
test.describe('runner last session ignores a set that is only an effort rating (2026-10-03)', () => {
  const fetchLast = (page, sets) => page.evaluate(async (sets) => {
    const q = (data) => { const o = { select: () => o, eq: () => o, in: () => o, order: () => o, limit: () => o, then: (res, rej) => Promise.resolve({ data, error: null }).then(res, rej) }; return o }
    const real = db.from.bind(db)
    db.from = (t) => t === 'workout_logs' ? q([{ id: 'L1', date: '2026-09-25' }])
      : t === 'workout_log_exercises' ? q([{ log_id: 'L1', workout_log_sets: sets }])
      : real(t)
    try {
      _runner = { clientId: 'x', startTime: Date.now(), exIdx: 0, lastSession: {}, exercises: [] }
      await fetchRunnerLastSession('Effort Probe', null)
      const ls = _runner.lastSession['Effort Probe']
      return ls ? { setNumbers: ls.sets.map(s => s.set_number), effort: ls.sets.map(s => s.effort_value ?? null), scale: ls.sets.map(s => s.effort_type ?? null) } : null
    } finally { db.from = real }
  }, sets)

  const none = { weight_kg: null, reps_achieved: null, height_cm: null, distance_m: null, effort_value: null, effort_type: null }

  test('a set that is only an effort rating does not count as a set from last time', async ({ page }) => {
    await loginAsClient(page)
    const r = await fetchLast(page, [
      { ...none, set_number: 1, weight_kg: 60, reps_achieved: 8, effort_value: 7, effort_type: 'rpe' },
      { ...none, set_number: 2, effort_value: 9, effort_type: 'rpe' },
    ])
    expect(r.setNumbers, 'only the set with real work is a previous set; the effort-only one would inflate Sets and the Last-time line').toEqual([1])
  })

  test('a session made only of effort ratings is no last session at all — the Last-time line cannot read "1 × 0 reps"', async ({ page }) => {
    await loginAsClient(page)
    expect(await fetchLast(page, [{ ...none, set_number: 1, effort_value: 8, effort_type: 'rpe' }])).toBeNull()
  })

  test('a set with real work keeps its effort rating (the ghost still has data), and jump and zero-load sets still count', async ({ page }) => {
    await loginAsClient(page)
    const r = await fetchLast(page, [
      { ...none, set_number: 1, weight_kg: 60, reps_achieved: 8, effort_value: 2, effort_type: 'rir' },
      { ...none, set_number: 2, height_cm: 40 },                       // a jump with no contacts logged: real data (2026-07-29)
      { ...none, set_number: 3, weight_kg: 0 },                         // a typed 0 kg is real, not "missing" (falsy-zero class)
    ])
    expect(r.setNumbers).toEqual([1, 2, 3])
    expect(r.effort[0], 'the rating on a worked set survives, for the effort ghost').toBe(2)
    expect(r.scale[0]).toBe('rir')
  })
})
