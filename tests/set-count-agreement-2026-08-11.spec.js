// 2026-08-11 — the coach and the athlete read different set counts off the same session.
//
// Warm-up and cool-down rounds are recorded but are not training volume (Jake, 2026-07-25). My
// Progress enforces that through _countableSets (`!phase || phase === 'work'`) — every aggregate
// filters through it, deliberately, so recording a warm-up can't inflate a session.
//
// The runner did not. Four separate places counted raw rows instead:
//   * the finish screen's session total          (doneExs.reduce(... e.loggedSets.length))
//   * the finish screen's per-exercise line      (e.loggedSets.length)
//   * the coach's session-detail header          (allSetsFlat.length)
//   * the coach's "Last time: N sets" comparison (prevSets.length)
//
// So a 4-round interval with a warm-up and a cool-down reported 6 sets on the finish screen and in
// the coach's view, and 4 sets in My Progress. Same session, same database rows, two numbers — and
// nothing on screen to explain the gap.
//
// The table made it worse: `set_number` counts every row, so it rendered "Set 1 … Set 6" immediately
// under a header claiming a different total. Rows are still all shown (a warm-up that happened is
// data, and hiding it just moves the confusion), but the non-work rounds are now NAMED and the work
// rounds numbered 1..N, so the table agrees with its own summary.
//
// All four sites now call _countableSets itself rather than re-implementing the predicate — a
// hand-copied filter in a second module is exactly how these drifted apart in the first place.
//
// This spec also pins something structural: _countableSets lives in app-progress.js, which loads
// AFTER app-runner.js. That is fine at runtime (calls happen long after both scripts parse), but if
// it ever stopped being reachable the finish screen would throw rather than miscount — so these
// tests failing loudly is the intended behaviour, not a flake.
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

const TAG = '[E2E] SetCount'

async function sweep (page) {
  await page.evaluate(async (TAG) => {
    const { data: logs } = await db.from('workout_logs').select('id').like('name', TAG + '%')
    const ids = (logs || []).map(l => l.id)
    if (!ids.length) return
    const { data: exs } = await db.from('workout_log_exercises').select('id').in('log_id', ids)
    const exIds = (exs || []).map(e => e.id)
    if (exIds.length) await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exIds)
    await db.from('workout_log_exercises').delete().in('log_id', ids)
    await db.from('workout_logs').delete().in('id', ids)
  }, TAG)
}

// A 4-round interval wrapped in a warm-up and a cool-down: 6 rows, 4 of them sets.
const PHASES = ['warmup', 'work', 'work', 'work', 'work', 'cooldown']

test.describe('set counts agree across surfaces (2026-08-11)', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await sweep(page) })
  test.afterEach(async ({ page }) => { await sweep(page) })

  test('the coach session-detail header counts work rounds only, and the table agrees with it', async ({ page }) => {
    const res = await page.evaluate(async ({ TAG, PHASES }) => {
      const { data: client } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
      const clientId = client?.[0]?.id
      if (!clientId) return { skip: 'no coached client' }

      const { data: logRow, error: e1 } = await db.from('workout_logs').insert({
        coach_id: currentUser.id, client_id: clientId,
        name: TAG + ' interval', date: new Date().toISOString().slice(0, 10)
      }).select().single()
      if (e1) return { err: 'log: ' + e1.message }

      const { data: exRow, error: e2 } = await db.from('workout_log_exercises').insert({
        log_id: logRow.id, exercise_name: TAG + ' Row',
        exercise_type: 'cardio', metric_type: 'interval', order_index: 0
      }).select().single()
      if (e2) return { err: 'exercise: ' + e2.message }

      const { error: e3 } = await db.from('workout_log_sets').insert(
        PHASES.map((phase, i) => ({
          workout_log_exercise_id: exRow.id, set_number: i + 1,
          phase, duration_seconds: 240, distance_m: 1000
        }))
      )
      if (e3) return { err: 'sets: ' + e3.message }

      await openWorkoutLog(logRow.id, clientId)
      const el = document.getElementById('tab-content') || document.getElementById('main-content')

      // The stat card: a leaf <div> reading "Sets", whose sibling carries the number.
      const label = [...el.querySelectorAll('div')]
        .find(d => d.children.length === 0 && d.textContent.trim() === 'Sets')
      const headerCount = label?.parentElement?.querySelector('div')?.textContent.trim() || null
      const rowLabels = [...el.querySelectorAll('tbody tr td:first-child')].map(td => td.textContent.trim())

      // What My Progress would say about the very same rows.
      const { data: check } = await db.from('workout_log_sets').select('*').eq('workout_log_exercise_id', exRow.id)
      return { headerCount, rowLabels, progressCount: _countableSets(check || []).length, rawRows: (check || []).length }
    }, { TAG, PHASES })

    test.skip(!!res.skip, res.skip)
    expect(res.err, 'fixture setup failed').toBeFalsy()
    console.log('header:', res.headerCount, '| progress:', res.progressCount, '| raw rows:', res.rawRows)
    console.log('row labels:', res.rowLabels.join(' | '))

    // The regression: this said "6" while My Progress said "4".
    expect(res.rawRows, 'fixture should have written all six rows').toBe(6)
    expect(res.headerCount).toBe('4')
    expect(res.progressCount, 'the two surfaces must agree').toBe(4)
    expect(Number(res.headerCount)).toBe(res.progressCount)

    // Every row still rendered — nothing hidden — but named, and the work rounds renumbered 1..N so
    // the table stops contradicting the header it sits under.
    expect(res.rowLabels).toEqual(['Warm-up', 'Set 1', 'Set 2', 'Set 3', 'Set 4', 'Cool-down'])
  })

  // Found by the pre-push multi-agent review, 2026-08-11. The fix above landed on openWorkoutLog (the
  // COACH's session detail) and its sibling 950 lines up in showRunnerFinish — the very first screen the
  // ATHLETE sees — kept numbering every row. So the finish card read "4 sets" in its header directly
  // above rows labelled "Set 1 … Set 6". Before the fix the two at least agreed (both said 6); the fix
  // introduced the contradiction on the athlete's screen while removing it from the coach's.
  //
  // Textbook fix-the-class-not-the-instance: same bug, same file, one function patched, one missed.
  test('the runner finish screen labels rounds the same way its own header counts them', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const ex = {
        name: '[E2E] Row', type: 'cardio', metricType: 'interval', exerciseId: null,
        targetSets: 4, sets_json: [{}], restSecs: 60,
        loggedSets: [
          { phase: 'warmup', duration: '5:00' },
          { phase: 'work', duration: '4:00' }, { phase: 'work', duration: '4:00' },
          { phase: 'work', duration: '4:00' }, { phase: 'work', duration: '4:00' },
          { phase: 'cooldown', duration: '5:00' },
        ],
      }
      let el = document.getElementById('workout-runner')
      if (!el) { el = document.createElement('div'); el.id = 'workout-runner'; document.body.appendChild(el) }
      _runner = { exercises: [ex], exIdx: 0, startTime: Date.now(), clientId: null, name: '[E2E] Finish' }
      await showRunnerFinish()
      const html = document.getElementById('workout-runner')?.innerHTML || ''
      const labels = [...document.querySelectorAll('#workout-runner span')]
        .map(s => s.textContent.trim())
        .filter(x => /^(Set \d+|Warm-up|Cool-down)$/.test(x))
      document.getElementById('workout-runner')?.remove()
      _runner = null
      return { labels, headerSaysFour: /4 sets/.test(html), headerSaysSix: /6 sets/.test(html) }
    })
    console.log('finish-screen labels:', r.labels.join(' | '))

    expect(r.headerSaysFour, 'the header counts work rounds only').toBe(true)
    expect(r.headerSaysSix).toBe(false)
    // The regression: this was ['Set 1','Set 2','Set 3','Set 4','Set 5','Set 6'] under a "4 sets" header.
    expect(r.labels).toEqual(['Warm-up', 'Set 1', 'Set 2', 'Set 3', 'Set 4', 'Cool-down'])
  })

  test('an ordinary session with no phases is unaffected — every row is still a set', async ({ page }) => {
    const res = await page.evaluate(async ({ TAG }) => {
      const { data: client } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
      const clientId = client?.[0]?.id
      if (!clientId) return { skip: 'no coached client' }

      const { data: logRow } = await db.from('workout_logs').insert({
        coach_id: currentUser.id, client_id: clientId,
        name: TAG + ' plain', date: new Date().toISOString().slice(0, 10)
      }).select().single()
      const { data: exRow } = await db.from('workout_log_exercises').insert({
        log_id: logRow.id, exercise_name: TAG + ' Squat', exercise_type: 'strength', order_index: 0
      }).select().single()
      await db.from('workout_log_sets').insert([1, 2, 3].map(n => ({
        workout_log_exercise_id: exRow.id, set_number: n, reps_achieved: 5, weight_kg: 100
      })))

      await openWorkoutLog(logRow.id, clientId)
      const el = document.getElementById('tab-content') || document.getElementById('main-content')
      const label = [...el.querySelectorAll('div')]
        .find(d => d.children.length === 0 && d.textContent.trim() === 'Sets')
      return {
        headerCount: label?.parentElement?.querySelector('div')?.textContent.trim() || null,
        rowLabels: [...el.querySelectorAll('tbody tr td:first-child')].map(td => td.textContent.trim()),
      }
    }, { TAG })

    test.skip(!!res.skip, res.skip)
    // A null phase is an ordinary set — all strength work, all steady-state cardio, and everything
    // logged before the phase column existed. The filter must never touch these.
    expect(res.headerCount).toBe('3')
    expect(res.rowLabels).toEqual(['Set 1', 'Set 2', 'Set 3'])
  })
})
