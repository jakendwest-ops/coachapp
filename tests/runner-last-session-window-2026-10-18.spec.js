const { test, expect } = require('./fixtures')
const { soloReady } = require('./helpers')

// ─── The runner's "last time" numbers (the grey numbers in a set's boxes, the Last time panel) come from fetchRunnerLastSession. Jake's phone check, 2026-10-17 (item R2): "the ghost text in the runner
// is not always correct/showing last sessions numbers" (docs/bugs/2026-10-17-runner-ghost-text-is-not-always-showing-or-correct-last-sessions-numbers.md). Two things in the old lookup were wrong, both
// shown here against the real database with this file's own fixtures (every name carries TAG; each test removes what it made in a finally and asserts the removals AFTER it):
//   1. it read only the client's 20 NEWEST sessions and looked for the exercise inside them, so an exercise last done before that window had no last-session numbers at all;
//   2. it took the newest session that held the exercise even when that session had no sets (an abandoned start), so one empty occurrence hid the real history behind it.
// The review of the fix added: the client scope (a coach's OTHER client with a newer log of the same exercise must never show), the library-id match against a newer name-only row, and a year on an old date.
const TAG = '[E2E] LastWindow'

// Seeds logs and returns what the runner makes of `ex`.
//   logs:   [{ daysAgo, sets: null | [] | [{ w, r }], lib?: index of a library exercise to stamp as exercise_id, other?: true to put it on a SECOND client of the same coach }]
//   filler: that many newer logs for the solo record with no exercise at all
//   callLib: the library exercise index to pass to the runner as the exercise id (null: look up by name only)
const lastTime = (page, ex, logs, filler, callLib = null) => page.evaluate(async ({ TAG, ex, logs, filler, callLib }) => {
  const soloId = window._soloClientId
  const day = n => _ymdLocal(new Date(Date.now() - n * 864e5))
  const must = (step, { data, error }) => { if (error) throw new Error(`fixture "${step}" failed: ${error.code} ${error.message}`); return data }
  const lib = (await db.from('exercises').select('id').order('id').limit(2)).data || []
  const otherId = logs.some(l => l.other) ? must('other client', await db.from('clients').insert({ coach_id: currentUser.id, full_name: `${TAG} other client` }).select('id').single()).id : null
  for (const [i, l] of logs.entries()) {
    const log = must('log', await db.from('workout_logs').insert({ coach_id: currentUser.id, client_id: l.other ? otherId : soloId, name: `${TAG} ${i}`, date: day(l.daysAgo) }).select('id').single())
    const exr = must('exercise', await db.from('workout_log_exercises').insert({ log_id: log.id, exercise_name: ex, exercise_id: l.lib != null ? lib[l.lib].id : null, exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0 }).select('id').single())
    if (l.sets?.length) must('sets', await db.from('workout_log_sets').insert(l.sets.map((s, k) => ({ workout_log_exercise_id: exr.id, set_number: k + 1, weight_kg: s.w, reps_achieved: s.r }))).select('id'))
  }
  if (filler) must('filler', await db.from('workout_logs').insert(Array.from({ length: filler }, (_, i) => ({ coach_id: currentUser.id, client_id: soloId, name: `${TAG} filler ${i}`, date: day(1 + (i % 20)) }))).select('id'))
  _runner = { clientId: soloId, exercises: [], lastSession: {} }      // _runner is a lexical `let` in the app: window._runner would not set it
  try { await fetchRunnerLastSession(ex, callLib != null ? lib[callLib].id : null) } catch (e) { /* drawing the panel needs the runner's screen; the data is what is under test */ }
  const last = _runner.lastSession[ex]
  return { dates: logs.map(l => day(l.daysAgo)), libCount: lib.length, got: last ? { date: last.date, sets: last.sets.map(s => [Number(s.weight_kg), Number(s.reps_achieved)]) } : null }
}, { TAG, ex, logs, filler, callLib })

// Removes everything the tests made and reads back that the exercise rows went with their sessions (the cascade this relies on, proved here instead of assumed).
const cleanup = (page) => page.evaluate(async (TAG) => {
  const { data: logs } = await db.from('workout_logs').delete().like('name', `${TAG}%`).select('id')
  const { data: clients } = await db.from('clients').delete().eq('coach_id', currentUser.id).like('full_name', `${TAG}%`).select('id')
  const { count } = await db.from('workout_log_exercises').select('id', { count: 'exact', head: true }).like('exercise_name', `${TAG}%`)
  return { logs: logs?.length ?? -1, clients: clients?.length ?? -1, exercisesLeft: count ?? -1 }
}, TAG)

test.describe('the runner finds the last session of an exercise', () => {
  test.beforeEach(async ({ page }) => { await soloReady(page); expect((await cleanup(page)).logs, 'clearing leftovers from an earlier run').toBeGreaterThanOrEqual(0) })

  test('an exercise last done BEFORE the 20 newest sessions still has its last-session numbers', async ({ page }) => {
    test.setTimeout(150_000)
    const ex = `${TAG} Old Lift ${Date.now()}`
    let r, gone
    try { r = await lastTime(page, ex, [{ daysAgo: 60, sets: [{ w: 77.5, r: 6 }, { w: 75, r: 8 }] }], 22) } finally { gone = await cleanup(page) }
    expect(r.got, 'found, although 22 newer sessions do not contain it').not.toBeNull()
    expect(r.got.sets).toEqual([[77.5, 6], [75, 8]])
    expect(r.got.date, 'and it says WHEN').toBe(r.dates[0])
    expect(gone).toEqual({ logs: 23, clients: 0, exercisesLeft: 0 })
  })

  test('the NEWEST session that holds the exercise wins, even among more occurrences than one read returns', async ({ page }) => {
    test.setTimeout(150_000)
    const ex = `${TAG} Recent Lift ${Date.now()}`
    // Twelve sessions, inserted OLDEST first (so an unordered read returns the oldest): 120 days ago ... 10 days ago, the newest holding the heaviest set. The read returns at most ten, so the
    // database's own newest-first ordering is what keeps the two newest in.
    const logs = Array.from({ length: 12 }, (_, i) => ({ daysAgo: 120 - i * 10, sets: [{ w: i === 11 ? 80 : 60 + i, r: 5 }] }))
    let r, gone
    try { r = await lastTime(page, ex, logs, 0) } finally { gone = await cleanup(page) }
    expect(r.got?.sets).toEqual([[80, 5]])
    expect(r.got?.date).toBe(r.dates[11])
    expect(gone).toEqual({ logs: 12, clients: 0, exercisesLeft: 0 })
  })

  test('a newer session that holds the exercise with NO sets does not hide the real history behind it', async ({ page }) => {
    test.setTimeout(120_000)
    const ex = `${TAG} Empty Lift ${Date.now()}`
    let r, gone
    try { r = await lastTime(page, ex, [{ daysAgo: 5, sets: null }, { daysAgo: 20, sets: [{ w: 70, r: 5 }] }], 0) } finally { gone = await cleanup(page) }
    expect(r.got?.sets, 'the empty occurrence 5 days ago is skipped; 20 days ago is used').toEqual([[70, 5]])
    expect(r.got?.date).toBe(r.dates[1])
    expect(gone).toEqual({ logs: 2, clients: 0, exercisesLeft: 0 })
  })

  test("another client of the same coach with a NEWER log of the same exercise is never shown (the client filter is the wall for coach, solo and master accounts)", async ({ page }) => {
    test.setTimeout(120_000)
    const ex = `${TAG} Shared Name ${Date.now()}`
    let r, gone
    try { r = await lastTime(page, ex, [{ daysAgo: 20, sets: [{ w: 70, r: 5 }] }, { daysAgo: 2, sets: [{ w: 999, r: 9 }], other: true }], 0) } finally { gone = await cleanup(page) }
    expect(r.got?.sets, "the solo record's own history, not the other client's newer 999 x 9").toEqual([[70, 5]])
    expect(gone).toEqual({ logs: 2, clients: 1, exercisesLeft: 0 })
  })

  test('matching by library id: the newest of the id match and the name-only match wins, and a same-named row with a DIFFERENT library id is another exercise', async ({ page }) => {
    test.setTimeout(150_000)
    const ex = `${TAG} Library Lift ${Date.now()}`
    let r, gone
    try {
      r = await lastTime(page, ex, [
        { daysAgo: 60, sets: [{ w: 100, r: 1 }], lib: 0 },      // logged by library id 8 weeks ago
        { daysAgo: 10, sets: [{ w: 90, r: 2 }] },               // logged by name only since (an older row shape): this is the real last time
        { daysAgo: 3, sets: [{ w: 50, r: 5 }], lib: 1 }          // same NAME but another library exercise: not this one
      ], 0, 0)
    } finally { gone = await cleanup(page) }
    expect(r.libCount, 'the library has at least two exercises to stamp').toBeGreaterThanOrEqual(2)
    expect(r.got?.sets, 'last week\'s name-only session beats the older id match, and the other exercise is ignored').toEqual([[90, 2]])
    expect(r.got?.date).toBe(r.dates[1])
    expect(gone).toEqual({ logs: 3, clients: 0, exercisesLeft: 0 })
  })

  test('a session from a year ago says its year, a recent one does not', async ({ page }) => {
    await soloReady(page)
    const labels = await page.evaluate(() => ({ recent: _runnerShortDate(_ymdLocal(new Date(Date.now() - 10 * 864e5))), old: _runnerShortDate('2024-03-02'), lastYear: _runnerShortDate(_ymdLocal(new Date(Date.now() - 400 * 864e5))) }))
    expect(labels.recent).not.toMatch(/\d{4}/)
    expect(labels.old).toMatch(/2 Mar(ch)? 2024/)
    expect(labels.lastYear).toMatch(/\d{4}$/)
  })
})
