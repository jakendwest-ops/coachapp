const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

// ─── Jake, 2026-10-12: "We need to scope how a user creates a workout on the fly, as not all users will want to create programs. Perhaps the 'workouts' page needs to be for
// workouts that have been created and used" (docs/bugs/2026-10-12-scope-creating-a-workout-on-the-fly-and-renaming-programs-to-training-plans.md; prototype
// https://claude.ai/artifact/2Qu78DKistXV61n1JhWStu).
//
// A solo account's Workouts page: two start buttons, "Up next" only while a plan is on (otherwise a one-line note), the plan folded away, "Your workouts" (workouts the
// account made and used; a plan session joins once it has been done), then Recent sessions. "Start an empty workout" opens the runner on a blank workout, "Start from a past
// session" opens a past session's exercises with blank sets, and the finish screen offers "Save as a workout" (only for the account's own session, only when tapped).
// A coached client's page is unchanged.
//
// NOTE: assigning a plan to the test account's solo record takes its other plans off ("one plan at a time"), so a run leaves that record on no plan. Specs that
// need one build their own, and the ones that skip when there is none already cope.
// The fixtures are this file's own: workouts, plans and logs tagged "[E2E] SoloWk", removed in a finally with the removals asserted AFTER it.

const TAG = '[E2E] SoloWk'

async function soloView(page) {
  await loginAsPT(page)
  await page.evaluate(() => localStorage.setItem('_activeView', 'solo'))
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => !!window._soloClientId), { timeout: 15000 }).toBe(true)
}

// Renders the Workouts page into a scratch host (the real renderer, the real reads). noPlan stubs only the "which plan am I on" read, so the no-plan layout can be seen
// whatever the shared test account happens to be on.
const renderInto = (page, { noPlan = false, assignment = null } = {}) => page.evaluate(async ({ noPlan, assignment }) => {
  window._navigateNow = async () => {}      // the app's own late start-up navigation closes every open modal (found 2026-10-13); nothing here navigates
  window.__realFrom = window.__realFrom || db.from.bind(db)
  const q = data => { const o = { select: () => o, eq: () => o, order: () => o, limit: () => o, then: (res, rej) => Promise.resolve({ data, error: null }).then(res, rej) }; return o }
  db.from = noPlan ? (t => t === 'client_programs' ? q(assignment ? [assignment] : []) : window.__realFrom(t)) : window.__realFrom
  document.getElementById('wk-host')?.remove()
  const el = document.createElement('div'); el.id = 'wk-host'; document.body.appendChild(el)
  await renderClientWorkoutsPage(el)
}, { noPlan, assignment })

// Where each label first appears in the page text, in the order asked for.
const positions = (page, labels) => page.evaluate(labels => { const t = document.getElementById('wk-host').textContent; return labels.map(l => t.indexOf(l)) }, labels)
const increasing = ps => ps.every((p, i) => p >= 0 && (i === 0 || p > ps[i - 1]))
const yourRow = (page, name) => page.locator('#wk-host .wk-row[data-your-workout]', { hasText: name })

const makeWorkout = (page, name, exercises = ['Bench Press', 'Row']) => page.evaluate(async ({ name, exercises }) => {
  const { data: t, error } = await db.from('workout_templates').insert({ coach_id: currentUser.id, is_personal: true, name }).select('id').single()
  if (error || !t) throw new Error('fixture workout failed: ' + error?.code)
  const { error: e2 } = await db.from('workout_template_exercises').insert(exercises.map((n, i) => ({ template_id: t.id, exercise_name: n, order_index: i, sets: 3, metric_type: 'weight_reps', exercise_type: 'strength' })))
  if (e2) throw new Error('fixture exercises failed: ' + e2.code)
  return { id: t.id, name, soloId: window._soloClientId }
}, { name, exercises })

const makeLog = (page, fx, { templateId = null, date, exercise = null } = {}) => page.evaluate(async ({ fx, templateId, date, exercise }) => {
  const { data: l, error } = await db.from('workout_logs').insert({ coach_id: currentUser.id, client_id: fx.soloId, name: fx.name, date: date || new Date().toLocaleDateString('en-CA'), template_id: templateId }).select('id').single()
  if (error || !l) throw new Error('fixture log failed: ' + error?.code)
  if (exercise) {
    const { error: e2 } = await db.from('workout_log_exercises').insert({ log_id: l.id, exercise_name: exercise, exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0 })
    if (e2) throw new Error('fixture log exercise failed: ' + e2.code)
  }
  return l.id
}, { fx, templateId, date, exercise })

// A plan with one session (the same shape tests/plan-on-my-plan-2026-10-12.spec.js builds), assigned to the solo record.
const makePlan = async (page, name) => {
  const fx = await page.evaluate(async ({ name }) => {
    const must = (step, { data, error }) => { if (error || !data) throw new Error(`fixture step "${step}" failed: ${error?.code || 'no row'}`); return data }
    const prog = must('program', await db.from('programs').insert({ coach_id: currentUser.id, is_personal: true, name }).select('id').single())
    const phase = must('phase', await db.from('program_phases').insert({ program_id: prog.id, name: 'P1', duration_weeks: 2, order_index: 0 }).select('id').single())
    const tmpl = must('template', await db.from('workout_templates').insert({ coach_id: currentUser.id, is_personal: true, name, program_id: prog.id }).select('id').single())
    must('exercise', await db.from('workout_template_exercises').insert({ template_id: tmpl.id, exercise_name: 'Bench', order_index: 0, sets: 3, metric_type: 'weight_reps' }).select('id'))
    must('slot', await db.from('program_phase_workouts').insert({ phase_id: phase.id, template_id: tmpl.id, day_label: 'Mon', day_of_week: 1, session_order: 1, week_number: 1 }).select('id'))
    return { programId: prog.id, templateId: tmpl.id, name, soloId: window._soloClientId }
  }, { name })
  await page.evaluate(async (fx) => {
    const realNavigate = window.navigate
    window.navigate = () => {}
    try { await showAssignProgramToClientModal(fx.programId); document.getElementById('apc-start').value = '2026-10-12'; await saveAssignProgramToClient(fx.programId, fx.soloId) } finally { window.navigate = realNavigate }
  }, fx)
  return fx
}

// Removes everything a test made by name; returns what it removed so the caller can assert it AFTER the finally.
const cleanup = (page, soloId, name) => page.evaluate(async ({ soloId, name }) => {
  if (window.__realFrom) db.from = window.__realFrom      // a test that stubbed the client puts the real one back before it cleans up
  const { data: logs } = await db.from('workout_logs').delete().eq('client_id', soloId).eq('name', name).select('id')
  const { data: ts } = await db.from('workout_templates').select('id').eq('coach_id', currentUser.id).like('name', `${name}%`)
  const ids = (ts || []).map(t => t.id)
  const { data: exs } = ids.length ? await db.from('workout_template_exercises').delete().in('template_id', ids).select('id') : { data: [] }
  const { data: gone } = await db.from('workout_templates').delete().eq('coach_id', currentUser.id).like('name', `${name}%`).select('id')
  const { data: progs } = await db.from('programs').delete().eq('coach_id', currentUser.id).eq('name', name).select('id')
  return { logs: logs?.length ?? 0, templates: gone?.length ?? 0, expected: ids.length, programs: progs?.length ?? 0, exercises: exs?.length ?? 0 }
}, { soloId, name })

test.describe('Solo: the Workouts page (2026-10-12)', () => {
  test('start buttons first, then the no-plan note, Your workouts, Recent sessions; nothing folded when there is no plan', async ({ page }) => {
    await soloView(page)
    await renderInto(page, { noPlan: true })
    await expect(page.locator('#wk-host [data-start-empty]')).toHaveText('Start an empty workout')
    await expect(page.locator('#wk-host [data-start-past]')).toHaveText('Start from a past session')
    await expect(page.locator('#wk-host [data-no-plan]')).toContainText('No training plan is running')
    await expect(page.locator('#wk-host #wk-hero'), 'no Up next while no plan is on').toHaveCount(0)
    await expect(page.locator('#wk-host [data-plan-fold]')).toHaveCount(0)
    const ps = await positions(page, ['Start an empty workout', 'Start from a past session', 'No training plan is running', 'Your workouts', 'Recent sessions'])
    expect(increasing(ps), `the order on the page: ${ps}`).toBe(true)
  })

  test('with a plan on: start buttons, Up next, the plan folded away (closed), Your workouts, Recent sessions', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} plan ${Date.now()}`
    let fx, gone
    try {
      fx = await makePlan(page, name)
      await renderInto(page)
      await expect(page.locator('#wk-host #wk-hero')).toBeVisible()
      const fold = page.locator('#wk-host details[data-plan-fold]')
      await expect(fold).toHaveCount(1)
      expect(await fold.evaluate(d => d.open), 'the plan list starts folded').toBe(false)
      await expect(fold.locator('summary')).toContainText(name)
      const ps = await positions(page, ['Start an empty workout', 'Up next', 'Your plan', 'Your workouts', 'Recent sessions'])
      expect(increasing(ps), `the order on the page: ${ps}`).toBe(true)
      await expect(page.locator('#wk-host [data-no-plan]')).toHaveCount(0)

      // A plan session joins Your workouts once it has been done, tagged "From a plan"; the plan's master copy never appears.
      await expect(yourRow(page, name), 'a plan session not yet done is not in Your workouts').toHaveCount(0)
      const clone = await page.evaluate(async (fx) => (await db.from('workout_templates').select('id').eq('client_id', fx.soloId).eq('name', fx.name).limit(1)).data?.[0]?.id, fx)
      expect(clone, 'the assignment made the account its own copy of the session').toBeTruthy()
      await makeLog(page, fx, { templateId: clone, exercise: 'Bench' })
      await renderInto(page)
      await expect(yourRow(page, name)).toHaveCount(1)
      await expect(yourRow(page, name).locator('[data-yw-src]')).toHaveText('From a plan')
      await expect(yourRow(page, name)).toContainText('done 1 time')
    } finally { gone = await cleanup(page, fx?.soloId || (await page.evaluate(() => window._soloClientId)), name) }
    expect(gone.logs, 'the logged session was removed').toBe(1)
    expect(gone.programs, 'the plan was removed').toBe(1)
    expect(gone.templates, 'every copy of its session was removed').toBe(gone.expected)
  })

  test('Your workouts lists a workout made by the account with what is in it and when it was last done, and Start launches it', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} mine ${Date.now()}`
    let fx, gone
    try {
      fx = await makeWorkout(page, name)
      await renderInto(page, { noPlan: true })
      const row = yourRow(page, name)
      await expect(row).toHaveCount(1)
      await expect(row.locator('[data-yw-src]')).toHaveText('Made by you')
      await expect(row).toContainText('2 exercises')
      await expect(row).toContainText('not done yet')

      await makeLog(page, fx, { templateId: fx.id, date: '2026-10-05', exercise: 'Bench Press' })
      await makeLog(page, fx, { templateId: fx.id, date: '2026-10-09', exercise: 'Bench Press' })
      await renderInto(page, { noPlan: true })
      await expect(row).toContainText('done 2 times')
      await expect(row).toContainText('last done')

      await page.evaluate(() => { window.startWorkoutRunner = (...a) => { window.__started = a } })
      await row.locator('.wk-go').click({ timeout: 10000 })
      expect(await page.evaluate(() => window.__started), 'Start launches this workout for this account').toEqual([fx.soloId, fx.id])
    } finally { gone = await cleanup(page, fx?.soloId || (await page.evaluate(() => window._soloClientId)), name) }
    expect(gone.logs).toBe(2)
    expect(gone.templates).toBe(1)
  })

  test('Start an empty workout opens the runner on a blank workout for this account', async ({ page }) => {
    await soloView(page)
    await renderInto(page, { noPlan: true })
    await page.locator('#wk-host [data-start-empty]').click()
    await expect(page.locator('#workout-runner button:text-is("End")')).toBeVisible({ timeout: 15000 })
    const s = await page.evaluate(() => ({ client: _runner.clientId, solo: window._soloClientId, exercises: _runner.exercises.length, firstName: _runner.exercises[0]?.name, template: _runner.templateId ?? null, name: _runner.name }))
    expect(s.client, 'it is this account\'s own session').toBe(s.solo)
    expect(s.exercises, 'one blank exercise to start adding to').toBe(1)
    expect(s.firstName).toBe('')
    expect(s.template, 'no template behind it').toBeNull()
    expect(s.name, 'named for the day').toMatch(/ workout$/)
  })

  test('Start from a past session opens its exercises with blank sets, and the session is not tied to a template', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} past ${Date.now()}`
    let gone
    const soloId = await page.evaluate(() => window._soloClientId)
    try {
      await makeLog(page, { soloId, name }, { exercise: 'Past Bench' })
      await renderInto(page, { noPlan: true })
      await page.locator('#wk-host [data-start-past]').click()
      await expect(page.locator('#sfp-modal')).toBeVisible()
      const row = page.locator('#sfp-modal [data-past-session]', { hasText: name })
      await expect(row).toContainText('1 exercise')
      await row.click()
      await expect(page.locator('#workout-runner button:text-is("End")')).toBeVisible({ timeout: 15000 })
      const s = await page.evaluate(() => ({ names: _runner.exercises.map(e => e.name), logged: _runner.exercises.map(e => e.loggedSets.length), template: _runner.templateId ?? null, client: _runner.clientId, standIn: String(window._runnerTemplates?.[0]?.id || '') }))
      expect(s.names, 'the past session\'s exercises').toEqual(['Past Bench'])
      expect(s.logged, 'with blank sets').toEqual([0])
      expect(s.template, 'workout_logs.template_id is a foreign key: the stand-in id must not reach it').toBeNull()
      expect(s.standIn).toMatch(/^past-/)
      expect(s.client).toBe(soloId)
      await expect(page.locator('#sfp-modal'), 'the picker closed').toHaveCount(0)
    } finally { gone = await cleanup(page, soloId, name) }
    expect(gone.logs).toBe(1)
  })

  test('the picker says so when there is nothing to start from', async ({ page }) => {
    await soloView(page)
    await page.evaluate(() => {
      window.__realFrom = window.__realFrom || db.from.bind(db)
      const o = { select: () => o, eq: () => o, order: () => o, limit: () => o, then: (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej) }
      db.from = t => t === 'workout_logs' ? o : window.__realFrom(t)
    })
    await page.evaluate(() => showStartFromPast(window._soloClientId))
    await expect(page.locator('#sfp-modal [data-no-past]')).toContainText('No sessions logged yet')
  })

  test('Start from a past session with an unsaved draft: the resume question comes first, and "Discard & start fresh" starts the session with no template behind it', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} draftpast ${Date.now()}`
    const soloId = await page.evaluate(() => window._soloClientId)
    let gone
    try {
      await makeLog(page, { soloId, name }, { exercise: 'Past Row' })
      await page.evaluate(({ soloId }) => localStorage.setItem(`_runnerDraft_${soloId}`, JSON.stringify({
        clientId: soloId, name: 'Earlier today', date: new Date().toLocaleDateString('en-CA'), startTime: Date.now() - 600000, exIdx: 0, templateId: null, savedAt: Date.now(),
        exercises: [{ name: 'Draft Squat', type: 'strength', metricType: 'weight_reps', targetSets: 1, loggedSets: [{ weight: 20, reps: '5', effort: null, effortType: 'rpe' }] }]
      })), { soloId })
      await renderInto(page, { noPlan: true })
      await page.locator('#wk-host [data-start-past]').click()
      await page.locator('#sfp-modal [data-past-session]', { hasText: name }).click()
      await expect(page.locator('#runner-resume-modal'), 'the unsaved workout is asked about first').toBeVisible()
      await page.locator('#runner-resume-modal button', { hasText: 'Discard' }).click()
      await expect(page.locator('#workout-runner button:text-is("End")')).toBeVisible({ timeout: 15000 })
      const s = await page.evaluate(() => ({ names: _runner.exercises.map(e => e.name), template: _runner.templateId ?? null }))
      expect(s.names, "the past session's exercises").toEqual(['Past Row'])
      expect(s.template, "the stand-in template id never becomes the session's template (workout_logs.template_id is a foreign key)").toBeNull()
    } finally {
      await page.evaluate(({ soloId }) => localStorage.removeItem(`_runnerDraft_${soloId}`), { soloId })
      gone = await cleanup(page, soloId, name)
    }
    expect(gone.logs).toBe(1)
  })

  test("a periodised plan's weekly copies are one row in Your workouts, under the plain name, with every time added up", async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} weeks ${Date.now()}`
    const soloId = await page.evaluate(() => window._soloClientId)
    let gone
    try {
      const ids = await page.evaluate(async ({ name, soloId }) => {
        const out = []
        for (const w of [1, 2]) {
          const { data, error } = await db.from('workout_templates').insert({ coach_id: currentUser.id, client_id: soloId, is_personal: true, name: `${name} — W${w}` }).select('id').single()
          if (error || !data) throw new Error('fixture copy failed: ' + error?.code)
          out.push(data.id)
        }
        return out
      }, { name, soloId })
      await makeLog(page, { soloId, name }, { templateId: ids[0], date: '2026-10-05', exercise: 'Bench' })
      await makeLog(page, { soloId, name }, { templateId: ids[1], date: '2026-10-12', exercise: 'Bench' })
      await renderInto(page, { noPlan: true })
      await expect(yourRow(page, name), 'one row for both weeks').toHaveCount(1)
      await expect(yourRow(page, name).locator('.wk-name')).toHaveText(name)
      await expect(yourRow(page, name)).toContainText('done 2 times')
    } finally { gone = await cleanup(page, soloId, name) }
    expect(gone.logs).toBe(2)
    expect(gone.templates).toBe(2)
  })

  test('a plan that is on but has no sessions yet is not described as "no plan"', async ({ page }) => {
    await soloView(page)
    await renderInto(page, { noPlan: true, assignment: { id: '00000000-0000-4000-8000-000000000001', start_date: '2026-10-12', programs: { id: '00000000-0000-4000-8000-000000000002', name: 'Empty plan', program_phases: [] } } })
    await expect(page.locator('#wk-host [data-no-plan]')).toContainText('has no sessions set up yet')
    await expect(page.locator('#wk-host [data-no-plan]')).not.toContainText('No training plan is running')
  })

  // Jake, 2026-10-13: "clicking a workout shouldnt open the slider, it should open the workout as collapsible" (docs/bugs/2026-10-13-your-workouts-row-opens-the-slide-in-drawer-instead-of-expanding-in-place.md)
  test('a Your workouts row expands in place to its exercises, opens no slide-in drawer, collapses again, and Start still launches it', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} expand ${Date.now()}`
    let fx, gone
    try {
      fx = await makeWorkout(page, name, ['Bench Press', 'Row'])
      await renderInto(page, { noPlan: true })
      const item = page.locator('#wk-host .wk-item', { hasText: name })
      const toggle = item.locator('[data-yw-toggle]')
      const detail = item.locator('[data-yw-detail]')
      await expect(detail, 'collapsed to start with').toBeHidden()
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await page.evaluate(() => { window.__drawerOpened = 0; window.openSessionDetail = () => { window.__drawerOpened++ } })      // the drawer opens after a database read, so count calls rather than look for its panel
      await toggle.click({ timeout: 10000 })
      await expect(detail).toBeVisible()
      await expect(detail).toContainText('Bench Press')
      await expect(detail).toContainText('Row')
      await expect(detail, 'the set count of a workout with no per-set prescription comes from its sets column').toContainText('3 sets')
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(page.locator('#session-detail-panel'), 'no slide-in drawer').toHaveCount(0)
      expect(await page.evaluate(() => window.__drawerOpened), 'and nothing asked for it').toBe(0)
      await toggle.click()
      await expect(detail).toBeHidden()
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await page.evaluate(() => { window.startWorkoutRunner = (...a) => { window.__started = a } })
      await item.locator('.wk-go').click({ timeout: 10000 })
      expect(await page.evaluate(() => window.__started), 'the row\'s Start is not swallowed by the toggle').toEqual([fx.soloId, fx.id])
      // the chevron is a second way to open the row
      await item.locator('.wk-chev').click({ timeout: 10000 })
      await expect(detail).toBeVisible()
    } finally { gone = await cleanup(page, fx?.soloId || (await page.evaluate(() => window._soloClientId)), name) }
    expect(gone.templates).toBe(1)
    expect(gone.exercises, 'and its exercise rows').toBe(2)
  })

  // Jake, 2026-10-13: "change this to a dumbbell icon not a cup of coffee" (docs/bugs/2026-10-13-workouts-nav-icon-is-a-cup-of-coffee.md)
  test('the Workouts nav item is a dumbbell, not the cup of coffee', async ({ page }) => {
    await soloView(page)
    await expect(page.locator('[data-page="workouts"] svg[data-icon="dumbbell"]').first()).toBeAttached()
    await expect(page.locator('[data-page="workouts"] svg path[d^="M18 8h1a4"]'), 'the cup path is gone from the Workouts item').toHaveCount(0)
  })

  test('a coached client\'s Workouts page is unchanged: no start buttons, no Your workouts', async ({ page }) => {
    await loginAsClient(page)
    await page.evaluate(async () => {
      document.getElementById('wk-host')?.remove()
      const el = document.createElement('div'); el.id = 'wk-host'; document.body.appendChild(el)
      await renderClientWorkoutsPage(el)
    })
    await expect(page.locator('#wk-host .page-title')).toHaveText('Workouts')
    await expect(page.locator('#wk-host [data-start-empty], #wk-host [data-start-past], #wk-host .wk-sec, #wk-host [data-plan-fold], #wk-host [data-no-plan]')).toHaveCount(0)
  })
})

// ─── "Save as a workout" on the finish screen ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

// A solo account's own runner with two logged exercises (hand-built, like tests/runner-exercise-nav-2026-09-28.spec.js), taken to the finish screen.
const finishScreen = (page, { clientId, name }) => page.evaluate(async ({ clientId, name }) => {
  _runner = {
    clientId, name, startTime: Date.now(), exIdx: 0, lastSession: {},
    exercises: ['Sv Squat', 'Sv Row'].map((n, i) => ({ name: n, type: 'strength', metricType: 'weight_reps', targetSets: 2, sets_json: [{}, {}], loggedSets: [], exerciseId: null, order_index: i, restSecs: 60 }))
  }
  _runner.exercises.forEach(e => { _runner.lastSession[e.name] = null })
  renderRunner()
  _runner.exercises.forEach(ex => { _ensureTableRows(ex); ex.tableRows.forEach(r => { r.weight = '20'; r.reps = '5'; r.done = true }); _syncLoggedSetsFromTable(ex) })
  await showRunnerFinish()
}, { clientId, name })

test.describe('Solo: Save as a workout (2026-10-12)', () => {
  test('the finish screen offers it, tapping it writes the account\'s own workout with the session\'s exercises, and it cannot be saved twice', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const soloId = await page.evaluate(() => window._soloClientId)
    const name = `${TAG} saved ${Date.now()}`
    let gone
    try {
      await finishScreen(page, { clientId: soloId, name })
      const btn = page.locator('#rf-save-template')
      await expect(btn).toHaveText('Save as a workout')
      expect(await page.evaluate(async (n) => (await db.from('workout_templates').select('id').eq('name', n)).data.length, name), 'nothing is saved until it is tapped').toBe(0)
      await btn.click()
      await expect(btn).toHaveText('Saved to your workouts')
      await expect(btn).toBeDisabled()
      const saved = await page.evaluate(async (n) => {
        const { data } = await db.from('workout_templates').select('id, is_personal, coach_id, client_id, program_id, workout_template_exercises(exercise_name, order_index, sets, metric_type, sets_json)').eq('name', n)
        return { uid: currentUser.id, rows: data }
      }, name)
      expect(saved.rows, 'exactly one workout').toHaveLength(1)
      const t = saved.rows[0]
      expect([t.is_personal, t.coach_id === saved.uid, t.client_id, t.program_id], 'the account\'s own personal workout, not part of any plan').toEqual([true, true, null, null])
      const exs = [...t.workout_template_exercises].sort((a, b) => a.order_index - b.order_index)
      expect(exs.map(e => e.exercise_name)).toEqual(['Sv Squat', 'Sv Row'])
      expect(exs.map(e => e.sets)).toEqual([2, 2])
      expect(exs[0].sets_json).toEqual([{ repsMin: '5' }, { repsMin: '5' }])

      expect(await page.evaluate(() => _runner.templateId), 'the session now reads as having been done from the saved workout').toBe(t.id)
      await page.evaluate(() => saveRunnerAsWorkout())
      expect(await page.evaluate(async (n) => (await db.from('workout_templates').select('id').eq('name', n)).data.length, name), 'a second call saves nothing more').toBe(1)

      // and it shows up in Your workouts
      await page.evaluate(() => { document.getElementById('workout-runner')?.remove(); _runner = null })
      await renderInto(page, { noPlan: true })
      await expect(yourRow(page, name).locator('[data-yw-src]')).toHaveText('Made by you')
    } finally { gone = await cleanup(page, soloId, name) }
    expect(gone.templates).toBe(1)
  })

  test('if the exercises fail and the empty workout cannot be removed either, trying again reuses it instead of making a second', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const soloId = await page.evaluate(() => window._soloClientId)
    const name = `${TAG} orphan ${Date.now()}`
    let gone
    try {
      await finishScreen(page, { clientId: soloId, name })
      await page.evaluate(() => {
        window.__realFrom = window.__realFrom || db.from.bind(db)
        window.__toasts = []
        const real = window.showToast
        window.showToast = (m, k) => { window.__toasts.push(m); return real(m, k) }
        let exCalls = 0
        db.from = t => t === 'workout_template_exercises'
          ? { insert: (...a) => (++exCalls === 1 ? Promise.resolve({ error: { code: 'E2E-REFUSED' } }) : window.__realFrom(t).insert(...a)) }
          : t === 'workout_templates'
            ? { insert: (...a) => window.__realFrom(t).insert(...a), delete: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) }
            : window.__realFrom(t)
      })
      await page.locator('#rf-save-template').click()
      await expect.poll(() => page.evaluate(() => window.__toasts.join('|'))).toContain('Could not save it as a workout')
      await expect(page.locator('#rf-save-template')).toBeEnabled()
      await page.locator('#rf-save-template').click()
      await expect(page.locator('#rf-save-template')).toHaveText('Saved to your workouts')
      const saved = await page.evaluate(async (n) => (await window.__realFrom('workout_templates').select('id, workout_template_exercises(id)').eq('name', n)).data, name)
      expect(saved, 'one workout, not two').toHaveLength(1)
      expect(saved[0].workout_template_exercises, 'with its exercises').toHaveLength(2)
    } finally { gone = await cleanup(page, soloId, name) }
    expect(gone.templates).toBe(1)
  })

  test('it is not offered, and does nothing, for a session that is not the account\'s own', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} notmine ${Date.now()}`
    const soloId = await page.evaluate(() => window._soloClientId)
    let gone
    try {
      await finishScreen(page, { clientId: soloId, name })
      await page.evaluate(() => { _runner.clientId = 'someone-elses-record' })
      await page.evaluate(() => showRunnerFinish())
      await expect(page.locator('#rf-save-template'), 'no button on another client\'s session').toHaveCount(0)
      await page.evaluate(() => saveRunnerAsWorkout())
      expect(await page.evaluate(async (n) => (await db.from('workout_templates').select('id').eq('name', n)).data.length, name), 'and calling the action directly writes nothing').toBe(0)
    } finally { gone = await cleanup(page, soloId, name) }
    expect(gone.templates).toBe(0)
  })

  test('if the exercises cannot be saved the empty workout is removed again and the button comes back', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const soloId = await page.evaluate(() => window._soloClientId)
    const name = `${TAG} rollback ${Date.now()}`
    let gone
    try {
      await finishScreen(page, { clientId: soloId, name })
      await page.evaluate(() => {
        window.__realFrom = window.__realFrom || db.from.bind(db)
        window.__toasts = []
        const real = window.showToast
        window.showToast = (m, k) => { window.__toasts.push(m); return real(m, k) }
        db.from = t => t === 'workout_template_exercises' ? { insert: async () => ({ error: { code: 'E2E-REFUSED' } }) } : window.__realFrom(t)
      })
      await page.locator('#rf-save-template').click()
      await expect.poll(() => page.evaluate(() => window.__toasts.join('|'))).toContain('Could not save it as a workout')
      await expect(page.locator('#rf-save-template'), 'tappable again').toBeEnabled()
      await expect(page.locator('#rf-save-template')).toHaveText('Save as a workout')
      expect(await page.evaluate(async (n) => (await window.__realFrom('workout_templates').select('id').eq('name', n)).data.length, name), 'no empty workout left in the library').toBe(0)
    } finally { gone = await cleanup(page, soloId, name) }
    expect(gone.templates).toBe(0)
  })
})
