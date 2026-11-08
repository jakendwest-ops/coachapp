const { test, expect } = require('./fixtures')
const { loginAsClient, loginAsPT, soloReady, declineConfirm } = require('./helpers')
const { installCappedApi, restoreCappedApi } = require('./capped-api')

// Phase 1 of docs/superpowers/plans/2026-11-08-solo-audit-response.md, approved by Jake 2026-11-08.

const lift = (rest) => [{ exercise_name: 'Own Squat', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0, sets_json: [{ repsMin: '5', ...rest }, { repsMin: '5', ...rest }] }]
async function logSet (page, i, weight, reps) {
  await page.fill(`#set-${i}-weight`, String(weight))
  await page.fill(`#set-${i}-reps`, String(reps))
  await page.click(`#set-${i}-done`)
}
const saveFinished = (page) => expect.poll(() => page.evaluate(() => typeof _runner === 'undefined' || _runner === null), { message: 'the save finished' }).toBe(true)

test.describe('Rest target in the logger', () => {
  test('an unfilled maximum shows one value, not "3:00–0:00"', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: lift({ restMin: '3:00', restMax: '0:00' }) })
    await wk.start()
    await expect(page.locator('#workout-runner')).toContainText('3:00')
    await expect(page.locator('#workout-runner')).not.toContainText('3:00–0:00')
  })
  test('MIRROR: a real range still shows both ends', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: lift({ restMin: '2:00', restMax: '3:00' }) })
    await wk.start()
    await expect(page.locator('#workout-runner')).toContainText('2:00–3:00')
  })
})

test.describe('Keyboard Enter in the exercise picker', () => {
  const press = (page, value, state) => page.evaluate(({ value, state }) => {
    const picked = []; const created = []
    const realCreate = _createExerciseFromPicker
    _createExerciseFromPicker = (n) => { created.push(n) }
    _exercisePickerState = { coachId: 'c', onPick: x => picked.push(x.name), allExercises: [
      { id: '1', name: 'Back Squat Pause' }, { id: '2', name: 'Back Squat' }, { id: '3', name: 'Old Lift', is_archived: true }], ...state }
    let prevented = false
    _exercisePickerEnter({ key: 'Enter', isComposing: false, target: { value }, preventDefault () { prevented = true } })
    _exercisePickerState = null
    _createExerciseFromPicker = realCreate
    return { picked, created, prevented }
  }, { value, state })

  test.beforeEach(async ({ page }) => { await loginAsPT(page) })
  test('an exact match beats an earlier partial one', async ({ page }) => {
    expect((await press(page, 'back squat', { loaded: true })).picked).toEqual(['Back Squat'])
  })
  test('an archived exact match beats an active partial one', async ({ page }) => {
    const r = await press(page, 'old lift', { loaded: true, allExercises: [{ id: '4', name: 'Old Lift Pause' }, { id: '3', name: 'Old Lift', is_archived: true }] })
    expect(r.picked).toEqual(['Old Lift'])
  })
  test('a partial match picks the top of the list', async ({ page }) => {
    expect((await press(page, 'squat', { loaded: true })).picked).toEqual(['Back Squat Pause'])
  })
  test('no match creates what was typed', async ({ page }) => {
    const r = await press(page, ' Zercher Hold ', { loaded: true })
    expect([r.picked, r.created]).toEqual([[], ['Zercher Hold']])
  })
  test('nothing happens before the library loads, or after it failed', async ({ page }) => {
    for (const state of [{ loaded: false }, { loaded: true, loadFailed: true }]) {
      const r = await press(page, 'Zercher Hold', state)
      expect([r.picked, r.created, r.prevented]).toEqual([[], [], true])
    }
  })
})

test.describe('Saved sessions', () => {
  test('a client: Recent sessions names the workout, opening the first session raises no 406, and the box still says Coach notes', async ({ page, ownWorkout }) => {
    test.setTimeout(120_000)
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: lift({}) })
    await wk.start()
    await logSet(page, 0, 40, 5)
    await page.evaluate(() => saveRunnerSession())
    await expect(page.locator('#confirm-dialog')).toBeVisible()
    await declineConfirm(page)
    await saveFinished(page)
    await expect(page.locator('#client-session-list')).toContainText(wk.name, { timeout: 12000 })

    const statuses = []
    page.on('response', r => { if (r.url().includes('/rest/v1/workout_logs')) statuses.push(r.status()) })
    const id = await page.evaluate(async (name) => (await db.from('workout_logs').select('id').eq('name', name).maybeSingle()).data.id, wk.name)
    await page.evaluate(({ id, c }) => openWorkoutLog(id, c), { id, c: wk.clientId })
    await expect(page.getByText('Coach notes', { exact: true })).toBeVisible()
    expect(statuses.filter(s => s === 406), 'no earlier session is normal, not an error').toEqual([])
  })

  test('solo: the box says Notes, with no coaching prompt', async ({ page }) => {
    test.setTimeout(90_000)
    await soloReady(page)
    const name = '[E2E] solo notes ' + Date.now()
    const ids = await page.evaluate(async (name) => {
      const { data, error } = await db.from('workout_logs').insert({ coach_id: currentUser.id, client_id: window._soloClientId, name, date: '2026-01-05' }).select('id').single()
      if (error) throw new Error(error.message)
      return { id: data.id, c: window._soloClientId }
    }, name)
    try {
      await page.evaluate(({ id, c }) => openWorkoutLog(id, c), ids)
      await expect(page.locator('#wl-coach-notes')).toBeVisible()
      await expect(page.getByText('Coach notes', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Notes', { exact: true })).toBeVisible()
      expect(await page.getAttribute('#wl-coach-notes', 'placeholder')).not.toContain('coaching')
    } finally {
      const left = await page.evaluate(async (id) => (await db.from('workout_logs').delete().eq('id', id).select('id')).data?.length, ids.id)
      expect(left, 'the fixture row was removed').toBe(1)
    }
  })
})

test('Saving a workout says so', async ({ page }) => {
  test.setTimeout(90_000)
  await loginAsPT(page)
  const id = await page.evaluate(async () => {
    const { data, error } = await db.from('workout_templates').insert({ coach_id: currentUser.id, name: '[E2E] save toast ' + Date.now(), is_personal: false }).select('id').single()
    if (error) throw new Error(error.message)
    return data.id
  })
  try {
    await page.evaluate(async (id) => {
      await openTemplate(id)
      window._templateDraft.meta.name += ' renamed'
      await saveTemplateDraft()
    }, id)
    await expect(page.locator('#app-toast')).toContainText('Workout saved')
  } finally {
    await page.evaluate(async (id) => { await db.from('workout_templates').delete().eq('id', id) }, id)
  }
})

test('The 1RM question: asks on a first log, then only on a new heaviest set when no 1RM is saved', async ({ page, ownWorkout }) => {
  test.setTimeout(180_000)
  await loginAsClient(page)
  const wk = await ownWorkout({ exercises: lift({}) })
  const session = async (kg) => {
    await wk.start()
    await logSet(page, 0, kg, 5)
    await page.evaluate(async () => { await showRunnerFinish(); await saveRunnerSession() })
  }
  await session(100)
  await expect(page.locator('#confirm-dialog'), 'the first log asks').toBeVisible()
  await declineConfirm(page)
  await saveFinished(page)

  await session(100)
  await saveFinished(page)
  await expect(page.locator('h1'), 'it went straight on').toContainText('Workouts', { timeout: 12000 })
  expect(await page.locator('#confirm-dialog').count(), 'the same weight, nothing saved: no question').toBe(0)

  await session(110)
  await expect(page.locator('#confirm-dialog'), 'a new heaviest set asks').toBeVisible()
  await declineConfirm(page)
  await saveFinished(page)
})

test.describe('Month calendar', () => {
  const draw = (page, noPlan = false) => page.evaluate(async (noPlan) => {
    window._realAll = _programWorkoutsByDateAll
    const w = { workout_templates: { name: 'Day A' } }
    _programWorkoutsByDateAll = (a, m, o = {}) => noPlan ? {} : ({ ...(o.fromStart ? {} : { '2026-10-01': [w] }), '2026-10-05': [w], '2026-10-07': [w], '2026-10-26': [w] })
    window._realCid = _getCurrentClientId
    _getCurrentClientId = async () => 'cid'
    calendarYear = 2026; calendarMonth = 9
    const el = document.createElement('div'); el.id = 'cal-probe'; document.body.appendChild(el)
    await renderCalendar(el)
    const cell = d => el.querySelector(`[onclick="showDayEvents('2026-10-${d}')"] [data-cal-status]`)?.dataset.calStatus || null
    const out = { d01: cell('01'), d05: cell('05'), d07: cell('07'), d09: cell('09'), d10: cell('10'), d26: cell('26'), empty: el.textContent.includes('No events this month') }
    el.remove()
    _programWorkoutsByDateAll = window._realAll; _getCurrentClientId = window._realCid; calendarYear = null; calendarMonth = null
    return out
  }, noPlan)
  const tables = (workout_logs) => ({ events: [], client_programs: [{ id: 'cp', client_id: 'cid', start_date: '2026-10-05', created_at: '2026-10-01T00:00:00Z' }], client_program_workouts: [], workout_logs })
  const logs = [
    { id: 'a', client_id: 'cid', date: '2026-10-05', workout_log_exercises: [{ id: 'x' }] },
    { id: 'b', client_id: 'cid', date: '2026-10-09', workout_log_exercises: [] },
    { id: 'c', client_id: 'cid', date: '2026-10-10', workout_log_exercises: [{ id: 'y' }] }]

  test.beforeEach(async ({ page }) => { await loginAsClient(page); await page.clock.setFixedTime(new Date('2026-10-22T12:00:00')) })

  test('done, missed, and nothing else: the same rule as the week strip', async ({ page }) => {
    await installCappedApi(page, tables(logs))
    try {
      const r = await draw(page)
      expect(r).toEqual({ d01: null, d05: 'done', d07: 'miss', d09: null, d10: 'done', d26: null, empty: false })
    } finally { await restoreCappedApi(page) }
  })

  test('a logged session on a month with no plan is marked, and the month does not claim to be empty', async ({ page }) => {
    await installCappedApi(page, tables(logs))
    try {
      const r = await draw(page, true)
      expect([r.d05, r.d07, r.empty]).toEqual(['done', null, false])
    } finally { await restoreCappedApi(page) }
  })

  test('sessions that cannot be read mark nothing, so a day is never called missed without the data', async ({ page }) => {
    await installCappedApi(page, tables({ error: { code: 'XX000', message: 'boom' } }))
    try {
      const r = await draw(page)
      expect([r.d05, r.d07]).toEqual([null, null])
    } finally { await restoreCappedApi(page) }
  })

  test('the empty-month message stays for a month with no workouts', async ({ page }) => {
    const r = await page.evaluate(() => [renderEventList([], {}, false).includes('No events this month'), renderEventList([], {}, true)])
    expect(r).toEqual([true, ''])
  })
})
