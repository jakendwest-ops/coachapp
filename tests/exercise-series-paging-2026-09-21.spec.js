const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')
const { installCappedApi, restoreCappedApi, cappedApiCalls } = require('./capped-api')

// ─── The per-exercise lists read a person's WHOLE logged history, past the API's 200-row cap (2026-09-21) ────
//
// _buildExerciseSeries (js/app-progress.js) feeds Performance ▸ Per exercise and Performance ▸ Per programme. It read every
// exercise a person had ever logged, ordered by NAME, in one request — and the API silently cuts every response at 200 rows.
// So past about 11 weeks of training the first 200 rows alphabetically survived and whole exercises vanished from the END of
// the alphabet ("Squat" before "Bench"), with no sign that anything was missing. It also threw its error away, so a FAILED
// read rendered the same "No sessions logged yet." as a brand-new account.
//
// These run the REAL functions against tests/capped-api.js (a read-only stand-in that caps at 200, reshuffles ties on every
// request, models PostgREST's `!inner` rule and fails closed on anything it does not implement): no rows are created anywhere.
test.describe('the exercise-progress lists read a whole logged history, past the API cap', () => {
  const ME = 'client-me', OTHER = 'client-other'
  const many = (n, f) => Array.from({ length: n }, (_, i) => f(i))
  const day = (i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
  // One logged exercise, exactly as the read returns it: the exercise row, its log (to-one embed) and its sets (to-many).
  const row = (id, name, date, clientId = ME) => ({
    id, exercise_name: name, metric_type: 'weight_reps',
    workout_logs: { date, client_id: clientId },
    workout_log_sets: [{ set_number: 1, weight_kg: 50, reps_achieved: 5 }],
  })
  const FAILING = { error: { code: 'XX000', message: 'boom' } }

  const withApi = async (page, tables, fn) => {
    await installCappedApi(page, tables)
    try { return await fn() } finally { await restoreCappedApi(page) }
  }
  const series = (page, tables) => withApi(page, tables, async () => {
    const r = await page.evaluate(async (me) => {
      const s = await _buildExerciseSeries(me)
      return s === null ? { isNull: true } : { names: s.map(x => x.name), sessions: Object.fromEntries(s.map(x => [x.name, x.sessions.map(z => z.date)])) }
    }, ME)
    r.calls = await cappedApiCalls(page)
    return r
  })
  // Renders Performance ▸ Per exercise for the given person and returns what the page says.
  const perExercise = (page, tables) => withApi(page, tables, () => page.evaluate(async (me) => {
    const orig = window._getCurrentClientId
    window._getCurrentClientId = async () => me
    try {
      const el = document.createElement('div'); document.body.appendChild(el)
      await renderProgressStrength(el)
      return el.textContent
    } finally { window._getCurrentClientId = orig }
  }, ME))

  test.beforeEach(async ({ page }) => { await loginAsPT(page) })

  test('every exercise is listed past 250 logged rows — not just the first 200 alphabetically — and another person\'s rows never appear', async ({ page }) => {
    // 25 exercises x 10 sessions = 250 rows; alphabetically the first 200 rows are E00..E19, so E20..E24 used to vanish whole.
    // Another person's 30 rows are named "Aardvark…", which sort FIRST: with the tenant filter dropped they would push out
    // real rows and appear in the list.
    const mine = many(250, (i) => row('m-' + String(i).padStart(3, '0'), 'E' + String(Math.floor(i / 10)).padStart(2, '0'), day(i % 10)))
    const theirs = many(30, (i) => row('o-' + String(i).padStart(3, '0'), 'Aardvark curl ' + i, day(i), OTHER))
    const r = await series(page, { workout_log_exercises: [...mine, ...theirs] })
    expect.soft(r.names?.length, 'all 25 exercises are listed').toBe(25)
    expect.soft(r.names?.at(-1), 'including the last alphabetically, which used to be cut').toBe('E24')
    expect.soft(Object.values(r.sessions || {}).map(d => d.length), 'each with all 10 of its sessions').toEqual(many(25, () => 10))
    expect.soft((r.names || []).filter(n => n.startsWith('Aardvark')), 'nobody else\'s exercises').toEqual([])
    expect(r.calls.filter(c => c.table === 'workout_log_exercises').length, 'read in pages, not one request').toBeGreaterThan(1)
  })

  test('rows that share a name page without dropping or repeating a session (the read orders by a unique key too)', async ({ page }) => {
    // ONE exercise, 250 sessions, every row tying on the sort key. A page boundary through a run of ties is where ORDER BY name
    // alone hands out one row twice and skips another — with the right row COUNT. The stand-in reshuffles ties every request.
    const rows = many(250, (i) => row('t-' + String(i).padStart(3, '0'), 'Deadlift', day(i)))
    const r = await series(page, { workout_log_exercises: rows })
    const dates = r.sessions?.Deadlift || []
    expect.soft(dates.length, 'all 250 sessions').toBe(250)
    expect(new Set(dates).size, 'each exactly once').toBe(250)
  })

  test('a failed read is null, never an empty list', async ({ page }) => {
    const r = await series(page, { workout_log_exercises: FAILING })
    expect(r.isNull, 'the callers must be able to tell "could not load" from "nothing logged"').toBe(true)
  })

  test('Performance ▸ Per exercise says it could not load — it does not claim nothing is logged', async ({ page }) => {
    const text = await perExercise(page, { workout_log_exercises: FAILING })
    expect.soft(text, 'an error the person can act on').toContain("Couldn't load")
    expect(text, '"No sessions logged yet." is what a new account sees').not.toContain('No sessions logged yet')
  })

  // The range dropdown only filters points the loaded history already holds. It used to call renderProgressStrength — a full
  // re-read — on every change: one request while the read was capped, up to one per 200 logged rows once it is paged.
  // renderProgressStrength is wrapped to COUNT calls: a re-read shows up as a call, a local re-render does not.
  const rangeChange = (page, tables) => withApi(page, tables, () => page.evaluate(async (me) => {
    const origId = window._getCurrentClientId
    window._getCurrentClientId = async () => me
    const origRender = window.renderProgressStrength
    let renders = 0, last = null
    window.renderProgressStrength = (...a) => { renders++; last = origRender(...a); return last }
    try {
      window._trendState = { range: 'All', metricByEx: {} }
      const el = document.createElement('div'); el.id = 'perf-sub-content'; document.body.appendChild(el)
      await window.renderProgressStrength(el)
      const rendersAfterLoad = renders
      _setTrendRange('3M')
      await last    // a render the change started is awaited, so nothing outlives the stand-in and reaches the real API
      return { rendersAfterLoad, rendersAfterChange: renders, range: window._trendState.range, listed: !!document.getElementById('perf-ex-list') }
    } finally { window._getCurrentClientId = origId; window.renderProgressStrength = origRender }
  }, ME))

  test('changing the range re-renders from the history already loaded — it does not read it all again', async ({ page }) => {
    const rows = many(30, (i) => row('r-' + String(i).padStart(3, '0'), 'Squat', day(i * 3)))
    const r = await rangeChange(page, { workout_log_exercises: rows })
    expect.soft(r.range, 'the range was applied').toBe('3M')
    expect.soft(r.listed, 'and the list is still on screen').toBe(true)
    expect(r.rendersAfterChange, 'no second full render (each one is a full re-read of the history)').toBe(r.rendersAfterLoad)
  })

  test('with nothing loaded (a failed load) a range change falls through to a full render — which is also the retry', async ({ page }) => {
    const r = await rangeChange(page, { workout_log_exercises: FAILING })
    expect(r.rendersAfterChange, 'the failed screen has no list to filter, so the change re-runs the render').toBe(r.rendersAfterLoad + 1)
  })

  test('PARITY: a genuinely empty history still says "No sessions logged yet."', async ({ page }) => {
    const text = await perExercise(page, { workout_log_exercises: [] })
    expect(text).toContain('No sessions logged yet')
  })

  test('Performance ▸ Per programme says it could not load when the exercise read fails', async ({ page }) => {
    // The block read succeeds (one live block); only the exercise history fails. It used to draw the comparison with no exercises.
    const tables = {
      client_programs: [{ id: 'cp1', client_id: ME, program_id: 'p1', start_date: '2026-01-05', created_at: '2026-01-05T00:00:00Z', programs: { name: 'Block A', program_phases: [{ duration_weeks: 4 }] } }],
      client_program_blocks: [],
      workout_log_exercises: FAILING,
    }
    const text = await withApi(page, tables, () => page.evaluate(async (me) => {
      const el = document.createElement('div'); document.body.appendChild(el)
      await renderProgressPerProgram(me, el)
      return el.textContent
    }, ME))
    expect(text, 'the same "could not load" state the block read already uses').toContain("Couldn't load")
  })
})
