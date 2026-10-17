const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── Jake, 2026-10-16: the Workouts page for a solo account, reworked (docs/bugs/2026-10-16-workouts-page-rework-plan-first-create-a-workout-search-and-edit-in-place.md;
// prototype https://claude.ai/artifact/PqNJdoUzPe1ubs6pbcGVz8). His four points: (1) the plan first, (2) "Start an empty workout" becomes Create a workout, (3) "Start from a
// past session" goes and a search by name arrives, Create a workout offers Choose a template / Create new, (4) a workout can be opened and Edited, except one in an ACTIVE plan,
// which "can only be amended within the Training Plan". Real database, this file's own fixtures: every name carries TAG, and each test removes what it made in a finally with
// the removals asserted AFTER it. (The pure rules are in tests-node/workouts-model.test.mjs.)

const TAG = '[E2E] WkRework'

async function soloView(page) {
  await loginAsPT(page)
  await page.evaluate(() => localStorage.setItem('_activeView', 'solo'))
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => !!window._soloClientId), { timeout: 15000 }).toBe(true)
  // The bottom bar and the floating PT / Personal switch sit over the foot of the page and can cover what a test clicks: this spec is about the page's content, not the chrome.
  await page.addStyleTag({ content: '#mobile-view-switcher, #mobile-view-switcher.mvs-on, .bottom-nav { display: none !important }' })
}

// The page in a scratch host (the real renderer, the real reads). noPlan stubs only the "which plan am I on" read.
const renderInto = (page, { noPlan = false } = {}) => page.evaluate(async ({ noPlan }) => {
  window._navigateNow = async () => {}      // the app's own late start-up navigation closes every open modal; nothing here navigates
  window.__realFrom = window.__realFrom || db.from.bind(db)
  const q = data => { const o = { select: () => o, eq: () => o, order: () => o, limit: () => o, then: (res, rej) => Promise.resolve({ data, error: null }).then(res, rej) }; return o }
  db.from = noPlan ? (t => t === 'client_programs' ? q([]) : window.__realFrom(t)) : window.__realFrom
  document.getElementById('wk-host')?.remove()
  const el = document.createElement('div'); el.id = 'wk-host'; document.body.appendChild(el)
  await renderClientWorkoutsPage(el)
}, { noPlan })

// The REAL page in the app (so the editor's Back has somewhere real to land).
const openWorkouts = async page => {
  await page.evaluate(() => navigate('workouts'))
  await expect(page.locator('#main-content [data-create-workout]')).toBeVisible({ timeout: 20000 })
}

const positions = (page, host, labels) => page.evaluate(({ host, labels }) => { const t = document.querySelector(host).textContent; return labels.map(l => t.indexOf(l)) }, { host, labels })
const increasing = ps => ps.every((p, i) => p >= 0 && (i === 0 || p > ps[i - 1]))
const yourRow = (page, scope, name) => page.locator(`${scope} .wk-item`, { hasText: name })

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

// A plan with one session (the shape tests/plan-on-my-plan-2026-10-12.spec.js builds), assigned to the solo record: its session becomes the account's own copy.
const makePlan = async (page, name, { start = null } = {}) => {      // null: the Monday of THIS week, so it is week 1 of 2 whatever day the suite runs
  const fx = await page.evaluate(async ({ name }) => {
    const must = (step, { data, error }) => { if (error || !data) throw new Error(`fixture step "${step}" failed: ${error?.code || 'no row'}`); return data }
    const prog = must('program', await db.from('programs').insert({ coach_id: currentUser.id, is_personal: true, name }).select('id').single())
    const phase = must('phase', await db.from('program_phases').insert({ program_id: prog.id, name: 'P1', duration_weeks: 2, order_index: 0 }).select('id').single())
    const tmpl = must('template', await db.from('workout_templates').insert({ coach_id: currentUser.id, is_personal: true, name, program_id: prog.id }).select('id').single())
    must('exercise', await db.from('workout_template_exercises').insert({ template_id: tmpl.id, exercise_name: 'Bench', order_index: 0, sets: 3, metric_type: 'weight_reps' }).select('id'))
    must('slot', await db.from('program_phase_workouts').insert({ phase_id: phase.id, template_id: tmpl.id, day_label: 'Mon', day_of_week: 1, session_order: 1, week_number: 1 }).select('id'))
    return { programId: prog.id, templateId: tmpl.id, name, soloId: window._soloClientId }
  }, { name })
  await page.evaluate(async ({ fx, start }) => {
    const realNavigate = window.navigate
    window.navigate = () => {}
    try { await showAssignProgramToClientModal(fx.programId); document.getElementById('apc-start').value = start || _ymdLocal(_mondayOfWeek(_ymdLocal(new Date()))); await saveAssignProgramToClient(fx.programId, fx.soloId) } finally { window.navigate = realNavigate }
  }, { fx, start })
  return fx
}

// Removes everything a test made (every fixture name carries TAG, copies included); returns the counts so the caller can assert them AFTER the finally.
const cleanup = (page, soloId) => page.evaluate(async ({ soloId, TAG }) => {
  if (window.__realFrom) db.from = window.__realFrom      // a test that stubbed the client puts the real one back before it cleans up
  const { data: logs } = await db.from('workout_logs').delete().eq('client_id', soloId).like('name', `%${TAG}%`).select('id')
  const { data: ts } = await db.from('workout_templates').select('id').eq('coach_id', currentUser.id).like('name', `%${TAG}%`)
  const ids = (ts || []).map(t => t.id)
  const { data: exs } = ids.length ? await db.from('workout_template_exercises').delete().in('template_id', ids).select('id') : { data: [] }
  const { data: gone } = await db.from('workout_templates').delete().eq('coach_id', currentUser.id).like('name', `%${TAG}%`).select('id')
  const { data: progs } = await db.from('programs').delete().eq('coach_id', currentUser.id).like('name', `%${TAG}%`).select('id')
  return { logs: logs?.length ?? 0, templates: gone?.length ?? 0, expected: ids.length, programs: progs?.length ?? 0, exercises: exs?.length ?? 0 }
}, { soloId, TAG })

const templatesNamed = (page, name) => page.evaluate(async (n) => (await db.from('workout_templates').select('id, name, is_personal, client_id, program_id, family_id, workout_template_exercises(exercise_name, order_index, sets)').eq('coach_id', currentUser.id).eq('name', n)).data, name)

test.describe('Solo: the reworked Workouts page (2026-10-16)', () => {
  test('with no plan: the note, then Create a workout, Your workouts, Recent sessions; "Start an empty workout" and "Start from a past session" are gone', async ({ page }) => {
    await soloView(page)
    await renderInto(page, { noPlan: true })
    await expect(page.locator('#wk-host [data-create-workout]')).toHaveText('Create a workout')
    await expect(page.locator('#wk-host [data-train-now]')).toContainText('Train now')
    await expect(page.locator('#wk-host').getByText(/Start an empty workout|Start from a past session/)).toHaveCount(0)
    const ps = await positions(page, '#wk-host', ['No training plan is running', 'Create a workout', 'Your workouts', 'Recent sessions'])
    expect(increasing(ps), `the order on the page: ${ps}`).toBe(true)
  })

  test('with a plan on, the plan comes FIRST: Up next, the folded plan, then Create a workout, Your workouts', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} planfirst ${Date.now()}`
    let fx, gone
    try {
      fx = await makePlan(page, name)
      await renderInto(page)
      await expect(page.locator('#wk-host #wk-hero')).toBeVisible()
      const ps = await positions(page, '#wk-host', ['Up next', 'Your plan', 'Create a workout', 'Your workouts'])
      expect(increasing(ps), `the order on the page: ${ps}`).toBe(true)
    } finally { gone = await cleanup(page, fx?.soloId || (await page.evaluate(() => window._soloClientId))) }
    expect(gone.programs, 'the plan was removed').toBe(1)
    expect(gone.templates, 'every copy of its session was removed').toBe(gone.expected)
  })

  test('Create a workout opens exactly two choices, and it closes again (Cancel is the ✕ and the backdrop)', async ({ page }) => {
    await soloView(page)
    await renderInto(page, { noPlan: true })
    await page.locator('#wk-host [data-create-workout]').click()
    const sheet = page.locator('#cw-modal')
    await expect(sheet.locator('.wk-choice')).toHaveCount(2)
    await expect(sheet.locator('[data-cw-template]')).toContainText('Choose a template')
    await expect(sheet.locator('[data-cw-new]')).toContainText('Create new')
    await sheet.locator('.modal-close').click()
    await expect(sheet).toHaveCount(0)
  })

  test('Create new: a name box that says workout, then the editor on that workout, a saved personal workout, and Back lands on the Workouts page with it in the list', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} created ${Date.now()}`
    const soloId = await page.evaluate(() => window._soloClientId)
    let gone
    try {
      await openWorkouts(page)
      await page.locator('#main-content [data-create-workout]').click()
      await page.locator('#cw-modal [data-cw-new]').click()
      await expect(page.locator('#create-template-modal .modal-title')).toHaveText('New workout')
      await expect(page.locator('#create-template-modal')).not.toContainText('Template name')
      await page.fill('#ct-name', name)
      await page.locator('#create-template-modal .btn-primary').click()
      await expect(page.locator('#main-content h1'), 'the editor opened on the new workout').toHaveText(name, { timeout: 15000 })
      await expect(page.getByText('Back to workouts')).toBeVisible()
      const saved = await templatesNamed(page, name)
      expect(saved, 'one workout').toHaveLength(1)
      expect([saved[0].is_personal, saved[0].client_id, saved[0].program_id], 'the account\'s own personal workout, in no plan').toEqual([true, null, null])
      await page.getByText('Back to workouts').click()
      await expect(page.locator('#main-content .page-title')).toHaveText('Workouts', { timeout: 15000 })
      await page.fill('#yw-search', name)
      await expect(yourRow(page, '#main-content', name), 'the new workout is in Your workouts').toHaveCount(1)
    } finally { gone = await cleanup(page, soloId) }
    expect(gone.templates).toBe(1)
  })

  test('Choose a template > My workouts: a saved COPY called "Copy of ..." with the same exercises, opened in the editor; the original is untouched', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} source ${Date.now()}`
    let fx, gone
    try {
      fx = await makeWorkout(page, name, ['Bench Press', 'Row'])
      await openWorkouts(page)
      await page.locator('#main-content [data-create-workout]').click()
      await page.locator('#cw-modal [data-cw-template]').click()
      await expect(page.locator('#cw-modal .modal-title')).toHaveText('Choose a template')
      await page.fill('#cw-q', name)
      await page.locator('#cw-modal [data-cw-mine]', { hasText: name }).click()
      await expect(page.locator('#main-content h1'), 'the copy is open in the editor').toHaveText(`Copy of ${name}`, { timeout: 15000 })
      const orig = await templatesNamed(page, name)
      const copy = await templatesNamed(page, `Copy of ${name}`)
      expect(orig, 'the original is still there, once').toHaveLength(1)
      expect(copy, 'and exactly one copy').toHaveLength(1)
      expect(copy[0].workout_template_exercises.map(e => e.exercise_name).sort(), 'with the same exercises').toEqual(['Bench Press', 'Row'])
      expect(orig[0].workout_template_exercises, 'the original has its exercises').toHaveLength(2)
      expect([copy[0].is_personal, copy[0].client_id, copy[0].program_id]).toEqual([true, null, null])
      expect(copy[0].family_id, 'a copy is its own family, not the original\'s').not.toBe(orig[0].family_id)
    } finally { gone = await cleanup(page, fx?.soloId || (await page.evaluate(() => window._soloClientId))) }
    expect(gone.templates, 'the original and its copy').toBe(2)
  })

  test('a double tap on a template makes ONE copy', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} dbltap ${Date.now()}`
    let fx, gone, copies
    try {
      fx = await makeWorkout(page, name)
      await openWorkouts(page)
      await page.locator('#main-content [data-create-workout]').click()
      await page.locator('#cw-modal [data-cw-template]').click()
      await page.fill('#cw-q', name)
      await page.locator('#cw-modal [data-cw-mine]', { hasText: name }).dblclick()
      await expect(page.locator('#main-content h1')).toHaveText(`Copy of ${name}`, { timeout: 15000 })
      copies = await templatesNamed(page, `Copy of ${name}`)
    } finally { gone = await cleanup(page, fx?.soloId || (await page.evaluate(() => window._soloClientId))) }
    expect(copies, 'one copy, not two').toHaveLength(1)
    expect(gone.templates).toBe(2)
  })

  test('Choose a template > Past sessions: the logged sessions are listed, picking one SAVES a workout of its exercises and opens it in the editor', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} past ${Date.now()}`
    const soloId = await page.evaluate(() => window._soloClientId)
    let gone
    try {
      await makeLog(page, { soloId, name }, { exercise: 'Past Bench' })
      await openWorkouts(page)
      await page.locator('#main-content [data-create-workout]').click()
      await page.locator('#cw-modal [data-cw-template]').click()
      await page.locator('#cw-modal [data-cw-tab="past"]').click()
      await page.fill('#cw-q', name)
      const row = page.locator('#cw-modal [data-cw-past]', { hasText: name })
      await expect(row).toContainText('1 exercise')
      await row.click()
      await expect(page.locator('#main-content h1'), 'opened in the editor').toHaveText(name, { timeout: 15000 })
      const made = await templatesNamed(page, name)
      expect(made, 'a saved workout').toHaveLength(1)
      expect(made[0].workout_template_exercises.map(e => e.exercise_name), 'with the session\'s exercise').toEqual(['Past Bench'])
      expect([made[0].is_personal, made[0].client_id, made[0].program_id]).toEqual([true, null, null])
    } finally { gone = await cleanup(page, soloId) }
    expect(gone.logs).toBe(1)
    expect(gone.templates).toBe(1)
  })

  test('a double tap on a past session makes ONE workout', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} pastdbl ${Date.now()}`
    const soloId = await page.evaluate(() => window._soloClientId)
    let gone, made
    try {
      await makeLog(page, { soloId, name }, { exercise: 'Past Row' })
      await openWorkouts(page)
      await page.locator('#main-content [data-create-workout]').click()
      await page.locator('#cw-modal [data-cw-template]').click()
      await page.locator('#cw-modal [data-cw-tab="past"]').click()
      await page.fill('#cw-q', name)
      await page.locator('#cw-modal [data-cw-past]', { hasText: name }).dblclick()
      await expect(page.locator('#main-content h1')).toHaveText(name, { timeout: 15000 })
      made = await templatesNamed(page, name)
    } finally { gone = await cleanup(page, soloId) }
    expect(made, 'one workout, not two').toHaveLength(1)
    expect(gone.logs).toBe(1)
  })

  test("the past-session read and the workout it makes refuse a client id that is not this account's own", async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} foreign ${Date.now()}`
    const soloId = await page.evaluate(() => window._soloClientId)
    let gone, reads, made
    try {
      const logId = await makeLog(page, { soloId, name }, { exercise: 'Past Row' })
      await openWorkouts(page)
      reads = await page.evaluate(async ({ logId }) => {
        window.__realFrom = window.__realFrom || db.from.bind(db)
        window.__logReads = 0
        db.from = t => { if (t === 'workout_logs') window.__logReads++; return window.__realFrom(t) }
        await createWorkoutFromPastSession('00000000-0000-4000-8000-000000000999', logId)
        await createWorkoutFromPastSession(null, logId)
        showCreateWorkoutSheet('x')
        await cwTab('00000000-0000-4000-8000-000000000999', 'past')
        db.from = window.__realFrom
        return window.__logReads
      }, { logId })
      made = await templatesNamed(page, name)
    } finally { gone = await cleanup(page, soloId) }
    expect(reads, "nothing was even read for a record that is not the account's own").toBe(0)
    expect(made, 'and nothing was made').toHaveLength(0)
    expect(gone.logs).toBe(1)
  })

  test('Past sessions lists the newest 10 and says so; a search looks through the last 30', async ({ page }) => {
    test.setTimeout(150_000)
    await soloView(page)
    const ts = Date.now()
    const soloId = await page.evaluate(() => window._soloClientId)
    let gone
    try {
      await page.evaluate(async ({ soloId, ts, TAG }) => {
        for (let i = 0; i < 12; i++) {
          const { data: l, error } = await db.from('workout_logs').insert({ coach_id: currentUser.id, client_id: soloId, name: `${TAG} many ${ts} ${String(i).padStart(2, '0')}`, date: new Date().toLocaleDateString('en-CA') }).select('id').single()
          if (error || !l) throw new Error('fixture log failed: ' + error?.code)
          const { error: e2 } = await db.from('workout_log_exercises').insert({ log_id: l.id, exercise_name: 'Many', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0 })
          if (e2) throw new Error('fixture log exercise failed: ' + e2.code)
        }
      }, { soloId, ts, TAG })
      await openWorkouts(page)
      await page.locator('#main-content [data-create-workout]').click()
      await page.locator('#cw-modal [data-cw-template]').click()
      await page.locator('#cw-modal [data-cw-tab="past"]').click()
      await expect(page.locator('#cw-modal [data-cw-past]').first()).toBeVisible()
      await expect(page.locator('#cw-modal [data-cw-past]'), 'the newest 10 and no more').toHaveCount(10)
      await expect(page.locator('#cw-modal [data-cw-more]')).toContainText('Showing the newest 10 of')
      await page.fill('#cw-q', `many ${ts}`)
      await expect(page.locator('#cw-modal [data-cw-past]'), 'a search looks through all the sessions that were read').toHaveCount(12)
    } finally { gone = await cleanup(page, soloId) }
    expect(gone.logs).toBe(12)
  })

  test('Past sessions says so when there is nothing to copy, and a failed read says that instead', async ({ page }) => {
    await soloView(page)
    await renderInto(page, { noPlan: true })
    await page.evaluate(() => {
      const empty = { select: () => empty, eq: () => empty, order: () => empty, limit: () => empty, then: (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej) }
      db.from = t => t === 'workout_logs' ? empty : window.__realFrom(t)
    })
    await page.locator('#wk-host [data-create-workout]').click()
    await page.locator('#cw-modal [data-cw-template]').click()
    await page.locator('#cw-modal [data-cw-tab="past"]').click()
    await expect(page.locator('#cw-modal [data-cw-none]')).toContainText('No sessions logged yet')
    await page.locator('#cw-modal .modal-close').click()
    await page.evaluate(() => {
      const bad = { select: () => bad, eq: () => bad, order: () => bad, limit: () => bad, then: (res, rej) => Promise.resolve({ data: null, error: { code: 'E2E-REFUSED' } }).then(res, rej) }
      db.from = t => t === 'workout_logs' ? bad : window.__realFrom(t)
    })
    await page.locator('#wk-host [data-create-workout]').click()
    await page.locator('#cw-modal [data-cw-template]').click()
    await page.locator('#cw-modal [data-cw-tab="past"]').click()
    await expect(page.locator('#cw-modal [data-cw-error]')).toContainText('Could not load your sessions')
    await page.evaluate(() => { db.from = window.__realFrom })
    await page.locator('#cw-modal [data-cw-tab="mine"]').click()
    await page.locator('#cw-modal [data-cw-tab="past"]').click()
    await expect(page.locator('#cw-modal [data-cw-error]'), 'opening the tab again tries again').toHaveCount(0)
  })

  test('the search narrows Your workouts by name, says so when nothing matches and clears, and the term is still in the box when the page is drawn again', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const ts = Date.now()
    const soloId = await page.evaluate(() => window._soloClientId)
    let gone
    try {
      for (const n of ['Alpha', 'Beta', 'Gamma']) await makeWorkout(page, `${TAG} ${n} ${ts}`)
      await renderInto(page, { noPlan: true })
      const box = page.locator('#wk-host #yw-search')
      await box.fill(`${ts}`)
      await expect(page.locator('#wk-host .wk-item')).toHaveCount(3)
      await box.fill(`beta ${ts}`)
      await expect(page.locator('#wk-host .wk-item'), 'whatever the case').toHaveCount(1)
      await expect(page.locator('#wk-host .wk-item')).toContainText('Beta')
      await box.fill('zzz-no-such-workout')
      await expect(page.locator('#wk-host [data-yw-nomatch]')).toContainText('No workouts match')
      await page.locator('#wk-host [data-yw-clear]').click()
      await expect(box, 'Clear empties the box too').toHaveValue('')
      await expect(box, 'and puts the cursor back in it (the button that was pressed is gone)').toBeFocused()
      await expect(page.locator('#wk-host .wk-item').first()).toBeVisible()
      // the term survives leaving and coming back
      await box.fill(`gamma ${ts}`)
      await renderInto(page, { noPlan: true })
      await expect(page.locator('#wk-host #yw-search')).toHaveValue(`gamma ${ts}`)
      await expect(page.locator('#wk-host .wk-item')).toHaveCount(1)
    } finally {
      await page.evaluate(() => filterYourWorkouts(''))
      gone = await cleanup(page, soloId)
    }
    expect(gone.templates).toBe(3)
  })

  test('the list shows 20 at a time: 25 matches give 20, then "Show 5 more", then all 25 and no button', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const ts = Date.now()
    const soloId = await page.evaluate(() => window._soloClientId)
    let gone
    try {
      await page.evaluate(async ({ ts, TAG }) => {
        const { error } = await db.from('workout_templates').insert(Array.from({ length: 25 }, (_, i) => ({ coach_id: currentUser.id, is_personal: true, name: `${TAG} paged ${ts} ${String(i).padStart(2, '0')}` })))
        if (error) throw new Error('fixture workouts failed: ' + error.code)
      }, { ts, TAG })
      await renderInto(page, { noPlan: true })
      await page.locator('#wk-host #yw-search').fill(`paged ${ts}`)
      await expect(page.locator('#wk-host .wk-item')).toHaveCount(20)
      await expect(page.locator('#wk-host [data-yw-more]')).toHaveText('Show 5 more')
      await expect(page.locator('#wk-host [data-yw-count]')).toHaveText('Showing 20 of 25')
      await page.locator('#wk-host [data-yw-more]').click()
      await expect(page.locator('#wk-host .wk-item')).toHaveCount(25)
      await expect(page.locator('#wk-host [data-yw-more]')).toHaveCount(0)
      await page.locator('#wk-host #yw-search').fill(`paged ${ts} 0`)
      await expect(page.locator('#wk-host .wk-item'), 'a new search starts again from the top').toHaveCount(10)
    } finally {
      await page.evaluate(() => filterYourWorkouts(''))
      gone = await cleanup(page, soloId)
    }
    expect(gone.templates).toBe(25)
  })

  test('Edit opens the editor on that workout; Back returns to the Workouts page', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} edit ${Date.now()}`
    let fx, gone
    try {
      fx = await makeWorkout(page, name)
      await openWorkouts(page)
      await page.fill('#yw-search', name)
      const item = yourRow(page, '#main-content', name)
      await item.locator('[data-yw-toggle]').click()
      await expect(item.locator('[data-yw-lock]'), 'a workout of your own is not locked').toHaveCount(0)
      await item.locator('[data-yw-edit]').click()
      await expect(page.locator('#main-content h1')).toHaveText(name, { timeout: 15000 })
      await page.getByText('Back to workouts').click()
      await expect(page.locator('#main-content .page-title')).toHaveText('Workouts', { timeout: 15000 })
      await expect(page.locator('#yw-search'), 'and the search is still there to pick up where you left off').toHaveValue(name)
    } finally {
      await page.evaluate(() => filterYourWorkouts(''))
      gone = await cleanup(page, fx?.soloId || (await page.evaluate(() => window._soloClientId)))
    }
    expect(gone.templates).toBe(1)
  })

  test('a workout in the plan you are on is locked (no Edit, the plan named, Open in Training plans, Make a copy still works); with the plan off the same workout can be edited', async ({ page }) => {
    test.setTimeout(180_000)
    await soloView(page)
    const name = `${TAG} locked ${Date.now()}`
    let fx, gone
    try {
      fx = await makePlan(page, name)
      const clone = await page.evaluate(async (fx) => (await db.from('workout_templates').select('id').eq('client_id', fx.soloId).eq('name', fx.name).limit(1)).data?.[0]?.id, fx)
      expect(clone, 'the assignment made the account its own copy of the session').toBeTruthy()
      await makeLog(page, fx, { templateId: clone, exercise: 'Bench' })
      await renderInto(page)
      const item = yourRow(page, '#wk-host', name)
      await expect(item).toHaveCount(1)
      await item.locator('[data-yw-toggle]').click()
      await expect(item.locator('[data-yw-lock]')).toContainText(`Part of your active plan, ${name}, so it can only be changed in Training plans.`)
      await expect(item.locator('[data-yw-edit]'), 'no Edit on a workout in the active plan').toHaveCount(0)
      await expect(item.locator('[data-yw-plan]')).toHaveText('Open in Training plans')
      await expect(item.locator('[data-yw-copy]')).toHaveText('Make a copy')

      // Open in Training plans lands on THAT plan
      await item.locator('[data-yw-plan]').click()
      await expect(page.locator('#main-content h1'), 'the plan\'s own page').toHaveText(name, { timeout: 15000 })

      // the plan is no longer on: the same workout is an ordinary one again
      await renderInto(page, { noPlan: true })
      const again = yourRow(page, '#wk-host', name)
      await again.locator('[data-yw-toggle]').click()
      await expect(again.locator('[data-yw-lock]')).toHaveCount(0)
      await expect(again.locator('[data-yw-edit]')).toHaveCount(1)
    } finally { gone = await cleanup(page, fx?.soloId || (await page.evaluate(() => window._soloClientId))) }
    expect(gone.programs, 'the plan was removed').toBe(1)
    expect(gone.templates, 'every copy of its session was removed').toBe(gone.expected)
  })

  test('a plan that has run its course is not active: the page says it is complete and its workouts can be edited again', async ({ page }) => {
    test.setTimeout(180_000)
    await soloView(page)
    const name = `${TAG} finished ${Date.now()}`
    let fx, gone
    try {
      fx = await makePlan(page, name, { start: '2026-01-05' })      // a two-week plan that started in January
      const clone = await page.evaluate(async (fx) => (await db.from('workout_templates').select('id').eq('client_id', fx.soloId).eq('name', fx.name).limit(1)).data?.[0]?.id, fx)
      expect(clone, 'the assignment made the account its own copy of the session').toBeTruthy()
      await makeLog(page, fx, { templateId: clone, exercise: 'Bench' })
      await renderInto(page)
      await expect(page.locator('#wk-host [data-hero-eyebrow]'), 'the page itself says the plan is done').toHaveText('Training plan complete')
      const item = yourRow(page, '#wk-host', name)
      await item.locator('[data-yw-toggle]').click()
      await expect(item.locator('[data-yw-lock]'), 'a finished plan locks nothing').toHaveCount(0)
      await expect(item.locator('[data-yw-edit]')).toHaveCount(1)
    } finally { gone = await cleanup(page, fx?.soloId || (await page.evaluate(() => window._soloClientId))) }
    expect(gone.programs).toBe(1)
  })

  test('Make a copy on a locked workout saves an editable copy and opens it', async ({ page }) => {
    test.setTimeout(180_000)
    await soloView(page)
    const name = `${TAG} lockcopy ${Date.now()}`
    let fx, gone
    try {
      fx = await makePlan(page, name)
      const clone = await page.evaluate(async (fx) => (await db.from('workout_templates').select('id').eq('client_id', fx.soloId).eq('name', fx.name).limit(1)).data?.[0]?.id, fx)
      await makeLog(page, fx, { templateId: clone, exercise: 'Bench' })
      await openWorkouts(page)
      await page.fill('#yw-search', name)
      const item = yourRow(page, '#main-content', name)
      await item.locator('[data-yw-toggle]').click()
      await expect(item.locator('[data-yw-lock]')).toBeVisible()
      await item.locator('[data-yw-copy]').click()
      await expect(page.locator('#main-content h1')).toHaveText(`Copy of ${name}`, { timeout: 15000 })
      const copy = await page.evaluate(async (n) => (await db.from('workout_templates').select('client_id, program_id, is_personal').eq('coach_id', currentUser.id).eq('name', n)).data, `Copy of ${name}`)
      expect(copy, 'one copy').toHaveLength(1)
      expect([copy[0].client_id, copy[0].program_id, copy[0].is_personal], 'an ordinary personal workout, in no plan: free to edit').toEqual([null, null, true])
    } finally {
      await page.evaluate(() => filterYourWorkouts(''))
      gone = await cleanup(page, fx?.soloId || (await page.evaluate(() => window._soloClientId)))
    }
    expect(gone.programs).toBe(1)
  })

  test('on a phone the Create button is thumb-sized, nothing scrolls sideways, and an open workout\'s buttons stay inside its card', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} phone ${Date.now()}`
    let fx, gone
    try {
      fx = await makeWorkout(page, name)
      await renderInto(page, { noPlan: true })
      const create = await page.locator('#wk-host [data-create-workout]').boundingBox()
      expect(create.height, 'a thumb-sized target').toBeGreaterThanOrEqual(44)
      const train = await page.locator('#wk-host [data-train-now]').boundingBox()
      expect(train.height, 'Train now is a thumb-sized target too').toBeGreaterThanOrEqual(44)
      await page.locator('#wk-host #yw-search').fill(name)
      const item = yourRow(page, '#wk-host', name)
      await item.locator('[data-yw-toggle]').click()
      const card = await item.boundingBox()
      const acts = await item.locator('.wk-acts button').all()
      expect(acts.length, 'Edit and Make a copy are both there').toBe(2)
      for (const b of acts) {
        const r = await b.boundingBox()
        expect(r.x, 'inside the card').toBeGreaterThanOrEqual(card.x)
        expect(r.x + r.width, 'inside the card').toBeLessThanOrEqual(card.x + card.width + 1)
      }
      expect(await page.evaluate(() => document.body.scrollWidth), 'no sideways scroll').toBeLessThanOrEqual(390)
    } finally {
      await page.evaluate(() => filterYourWorkouts(''))
      gone = await cleanup(page, fx?.soloId || (await page.evaluate(() => window._soloClientId)))
    }
    expect(gone.templates).toBe(1)
  })
})
