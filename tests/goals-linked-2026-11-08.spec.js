const { test, expect } = require('./fixtures')
const { loginAsClient, soloReady, acceptConfirm, declineConfirm } = require('./helpers')
const { installCappedApi, restoreCappedApi } = require('./capped-api')

// Phase 2b of docs/superpowers/plans/2026-11-08-solo-audit-response.md, approved by Jake 2026-11-08.

test.describe('_goalsApplyLive', () => {
  const apply = async (page, goals, tables, prBaseline) => {
    await installCappedApi(page, tables)
    try {
      return await page.evaluate(async ({ goals, prBaseline }) => {
        const real = _prBaseline
        _prBaseline = async (c, q) => { window.__asked = q; if (prBaseline === 'throw') throw new Error('x'); return prBaseline }
        try { await _goalsApplyLive(goals, 'cid'); return { goals, asked: window.__asked } } finally { _prBaseline = real }
      }, { goals, prBaseline })
    } finally { await restoreCappedApi(page) }
  }
  const G = o => ({ id: 'g', current_value: 80, start_value: 80, target_value: 90, metric_unit: 'kg', ...o })
  const W = rows => ({ weight_logs: rows.map((r, i) => ({ id: 'w' + i, client_id: 'cid', created_at: '2026-01-01T00:00:00Z', ...r })) })
  test.beforeEach(async ({ page }) => { await loginAsClient(page) })

  test('body weight uses the newest weigh-in of this client only', async ({ page }) => {
    const r = await apply(page, [G({ linked_metric: 'bodyweight' })], W([{ date: '2026-01-01', weight_kg: 81 }, { date: '2026-02-01', weight_kg: 83.5 }, { date: '2026-03-01', weight_kg: 99, client_id: 'other' }]), 0)
    expect(r.goals[0].current_value).toBe(83.5)
  })
  test('a lift uses its heaviest set, by id and by the saved name', async ({ page }) => {
    const r = await apply(page, [G({ linked_metric: 'top_set', metric_label: 'Squat', linked_exercise_id: 'e1' })], W([]), 107.5)
    expect(r.goals[0].current_value).toBe(107.5)
    expect(r.asked).toEqual({ name: 'Squat', exerciseId: 'e1', since: null })
  })
  test('a goal in pounds is shown in pounds', async ({ page }) => {
    const r = await apply(page, [G({ linked_metric: 'top_set', metric_label: 'Squat', metric_unit: 'lb' })], W([]), 100)
    expect(r.goals[0].current_value).toBe(220.5)
  })
  test('no data yet leaves the starting number and no failure', async ({ page }) => {
    const r = await apply(page, [G({ linked_metric: 'top_set', metric_label: 'Squat' }), G({ id: 'h', linked_metric: 'bodyweight' })], W([]), 0)
    expect(r.goals.map(g => [g.current_value, !!g._liveFailed])).toEqual([[80, false], [80, false]])
  })
  test('a failed read keeps the stored number and says so, and other goals still update', async ({ page }) => {
    const r = await apply(page, [G({ linked_metric: 'top_set', metric_label: 'Squat' }), G({ id: 'h', linked_metric: 'bodyweight' })], W([{ date: '2026-02-01', weight_kg: 83 }]), 'throw')
    expect(r.goals.map(g => [g.current_value, !!g._liveFailed])).toEqual([[80, true], [83, false]])
  })
  test('a finished goal stays at its saved number and is not read', async ({ page }) => {
    for (const status of ['completed', 'abandoned']) {
      const r = await apply(page, [G({ status, linked_metric: 'top_set', metric_label: 'Squat' })], W([]), 'throw')
      expect([r.goals[0].current_value, !!r.goals[0]._liveFailed]).toEqual([80, false])
    }
  })
  test('a lift only counts sessions from the day the goal began', async ({ page }) => {
    const r = await apply(page, [G({ linked_metric: 'top_set', metric_label: 'Squat', created_at: '2026-02-03T12:00:00' })], W([]), 110)
    expect(r.asked.since).toBe('2026-02-03')
  })
  test('MIRROR: an unlinked goal is untouched and costs no read', async ({ page }) => {
    const r = await apply(page, [G({})], { weight_logs: { error: { code: 'XX', message: 'must not be read' } } }, 'throw')
    expect([r.goals[0].current_value, !!r.goals[0]._liveFailed]).toEqual([80, false])
  })
})

test('a client sees the live number with no Update progress and no way to stop tracking', async ({ page }) => {
  await loginAsClient(page)
  await installCappedApi(page, {
    goals: [{ id: 'g1', client_id: 'cid', title: 'Reach 85', status: 'active', start_value: 80, current_value: 80, target_value: 85, metric_unit: 'kg', linked_metric: 'bodyweight', goal_milestones: [], goal_check_ins: [] }],
    weight_logs: [{ id: 'w', client_id: 'cid', date: '2026-02-01', created_at: '2026-02-01T00:00:00Z', weight_kg: 82.5 }]
  })
  try {
    const t = await page.evaluate(async () => {
      let el = document.getElementById('tab-content'); if (!el) { el = document.createElement('div'); el.id = 'tab-content'; document.body.appendChild(el) }
      await openGoal('g1', 'cid')
      return el.textContent
    })
    expect(t).toContain('82.5')
    expect(t).toContain('Updates from your weigh-ins')
    expect(t).not.toContain('Update progress')
    expect(t).not.toContain('Stop auto-tracking')
  } finally { await restoreCappedApi(page) }
})

test('the heaviest-set lookup honours "since" on the real database', async ({ page, ownWorkout }) => {
  test.setTimeout(120_000)
  await loginAsClient(page)
  const wk = await ownWorkout({ exercises: [{ exercise_name: 'Own Squat', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0, sets_json: [{ repsMin: '5' }] }] })
  await wk.start()
  await page.fill('#set-0-weight', '40'); await page.fill('#set-0-reps', '5'); await page.click('#set-0-done')
  await page.evaluate(() => saveRunnerSession())
  await expect(page.locator('#confirm-dialog')).toBeVisible()
  await declineConfirm(page)
  const r = await page.evaluate(async ({ c, name }) => ({
    open: await _prBaseline(c, { name }), past: await _prBaseline(c, { name, since: '2000-01-01' }), future: await _prBaseline(c, { name, since: '2999-01-01' })
  }), { c: wk.clientId, name: wk.exerciseNames[0] })
  expect(r).toEqual({ open: 40, past: 40, future: 0 })
})

test.describe('Solo: the whole path', () => {
  test.setTimeout(120_000)
  const tag = '[E2E] linked ' + Date.now()
  const open = async (page) => {
    await page.evaluate(() => { window._goalsCid = window._soloClientId })
    await page.goto('/#progress'); await expect(page.locator('#main-content')).toBeVisible()
    await page.evaluate(() => {
      let el = document.getElementById('tab-content'); if (!el) { el = document.createElement('div'); el.id = 'tab-content'; document.getElementById('main-content').appendChild(el) }
      showAddGoalModal(window._soloClientId)
    })
  }
  const cleanup = (page, ex) => page.evaluate(async ({ tag, ex }) => {
    const cid = window._soloClientId
    await db.from('goals').delete().eq('client_id', cid).like('title', tag + '%').select('id')
    await db.from('weight_logs').delete().eq('client_id', cid).eq('date', '2026-01-03').select('id')
    if (ex) await db.from('exercises').delete().eq('coach_id', currentUser.id).eq('name', ex).select('id')
  }, { tag, ex })
  const row = (page, title) => page.evaluate(async (title) => (await db.from('goals').select('linked_metric, linked_exercise_id, metric_label, current_value').eq('title', title).single()).data, title)

  test.beforeEach(async ({ page }) => { await soloReady(page) })

  test('a body weight goal moves on the list, its page and Today; Stop keeps the number', async ({ page }) => {
    const title = tag + ' weight'
    try {
      await page.evaluate(async () => {
        const { error } = await db.from('weight_logs').insert({ client_id: window._soloClientId, date: '2026-01-03', weight_kg: 83.5 })
        if (error) throw new Error(error.message)
      })
      await open(page)
      await page.fill('#ag-title', title)
      await page.selectOption('#ag-track', 'bodyweight')
      await page.fill('#ag-start', '82'); await page.fill('#ag-target', '85')
      await page.click('#add-goal-modal .btn-primary')
      await expect(page.locator('#add-goal-modal')).toHaveCount(0)
      const saved = await row(page, title)
      expect([saved.linked_metric, saved.metric_label, Number(saved.current_value)]).toEqual(['bodyweight', 'Body weight', 82])
      await expect(page.locator('#tab-content')).toContainText('83.5')
      await expect(page.locator('#tab-content')).toContainText('Updates automatically')

      const id = await page.evaluate(async (t) => (await db.from('goals').select('id').eq('title', t).single()).data.id, title)
      await page.evaluate(({ id }) => openGoal(id, window._soloClientId), { id })
      await expect(page.locator('#gl-linked')).toContainText('weigh-ins')
      await expect(page.locator('.gl-update')).toHaveCount(0)
      expect(Number((await row(page, title)).current_value), 'drawing it never writes it').toBe(82)

      const pct = await page.evaluate(async () => (await _dashLoadOwn(window._soloClientId, _ymdLocal(new Date()))).goals.map(g => [g.title, _goalPct(g)]))
      expect(pct.find(p => p[0] === title)[1], 'Today uses the live number').toBe(50)

      await page.click('text=Stop auto-tracking')
      await acceptConfirm(page)
      await expect(page.locator('.gl-update')).toBeVisible()
      const after = await row(page, title)
      expect([after.linked_metric, Number(after.current_value)]).toEqual([null, 83.5])
    } finally { await cleanup(page) }
  })

  test('a lift goal needs a lift, saves its name, and the edit sheet offers no number to type', async ({ page }) => {
    const title = tag + ' lift', ex = '[E2E] linked lift ' + Date.now()
    try {
      await open(page)
      await page.fill('#ag-title', title)
      await page.fill('#ag-start', '100'); await page.fill('#ag-target', '120')
      await page.selectOption('#ag-track', 'top_set')
      await expect(page.locator('#exp-search')).toBeVisible()
      await page.locator('#exercise-picker-modal .modal-close, #exercise-picker-modal button:has-text("✕")').first().click()
      await page.click('#add-goal-modal .btn-primary')
      await expect(page.locator('#ag-error')).toContainText('Choose the lift')
      await page.click('#ag-lift')
      await expect.poll(() => page.evaluate(() => !!_exercisePickerState?.loaded), { timeout: 30000 }).toBe(true)   // Enter is ignored until the library has been read
      await page.fill('#exp-search', ex)
      await page.locator('#exp-search').press('Enter')
      await expect(page.locator('#ag-lift')).toContainText(ex)
      await page.click('#add-goal-modal .btn-primary')
      await expect(page.locator('#add-goal-modal')).toHaveCount(0)
      const saved = await row(page, title)
      expect([saved.linked_metric, saved.metric_label, !!saved.linked_exercise_id]).toEqual(['top_set', ex, true])
      const id = await page.evaluate(async (t) => (await db.from('goals').select('id').eq('title', t).single()).data.id, title)
      await page.evaluate((id) => showEditGoalModal(id, window._soloClientId), id)
      await expect(page.locator('#eg-title')).toBeVisible()
      await expect(page.locator('#eg-current')).toHaveCount(0)
      await page.click('#edit-goal-modal .btn-primary')
      await expect(page.locator('#edit-goal-modal')).toHaveCount(0)
      expect(Number((await row(page, title)).current_value), 'an edit does not touch the number').toBe(100)
    } finally { await cleanup(page, ex) }
  })

  test('finishing a tracked goal saves the number reached and ends the tracking UI', async ({ page }) => {
    const title = tag + ' finish'
    try {
      const id = await page.evaluate(async (title) => {
        const cid = window._soloClientId
        const w = await db.from('weight_logs').insert({ client_id: cid, date: '2026-01-03', weight_kg: 83.5 }); if (w.error) throw new Error(w.error.message)
        const g = await db.from('goals').insert({ client_id: cid, created_by: currentUser.id, title, status: 'active', start_value: 82, current_value: 82, target_value: 85, metric_unit: 'kg', linked_metric: 'bodyweight', priority: 1 }).select('id').single()
        if (g.error) throw new Error(g.error.message)
        let el = document.getElementById('tab-content'); if (!el) { el = document.createElement('div'); el.id = 'tab-content'; document.getElementById('main-content').appendChild(el) }
        await openGoal(g.data.id, cid); await showEditGoalModal(g.data.id, cid)
        return g.data.id
      }, title)
      await page.click('.gl-finish')
      await expect(page.locator('#edit-goal-modal')).toHaveCount(0)
      expect(Number((await row(page, title)).current_value)).toBe(83.5)
      await expect(page.getByText('Stop auto-tracking')).toHaveCount(0)
      expect(id).toBeTruthy()
    } finally { await cleanup(page) }
  })

  test('a tracked goal cannot lose its numbers, and a cardio exercise cannot be linked', async ({ page }) => {
    const title = tag + ' keep'
    try {
      const refused = await page.evaluate(async (title) => {
        const cid = window._soloClientId
        const g = await db.from('goals').insert({ client_id: cid, created_by: currentUser.id, title, status: 'active', start_value: 82, current_value: 82, target_value: 85, metric_unit: 'kg', linked_metric: 'bodyweight', priority: 1 }).select('id').single()
        if (g.error) throw new Error(g.error.message)
        await showEditGoalModal(g.data.id, cid)
        document.getElementById('eg-target').value = ''; document.getElementById('eg-start').value = ''
        await saveEditGoal(g.data.id, cid)
        const msg = document.getElementById('eg-error').textContent
        closeModal('edit-goal-modal')
        const realPick = _openExercisePicker
        _openExercisePicker = (c, cb) => cb({ id: 'x', name: 'SkiErg', metric_type: 'interval' })
        showAddGoalModal(cid); _goalChooseLift(cid)
        await new Promise(r => setTimeout(r, 900))
        const lift = _goalLinkLift
        _openExercisePicker = realPick
        closeModal('add-goal-modal')
        return { msg, lift }
      }, title)
      expect(refused).toEqual({ msg: 'A goal that tracks itself needs From and To.', lift: null })
    } finally { await cleanup(page) }
  })

  test('tracking needs From and To; only a weight goal can track; a time goal saves no link', async ({ page }) => {
    const title = tag + ' time'
    try {
      await open(page)
      await page.fill('#ag-title', title)
      await page.selectOption('#ag-track', 'bodyweight')
      await page.click('#add-goal-modal .btn-primary')
      await expect(page.locator('#ag-error')).toContainText('From and To')
      await page.click('#ag-kind button:has-text("Time")')
      await expect(page.locator('#ag-track-wrap')).toBeHidden()
      await page.fill('#ag-start', '30'); await page.fill('#ag-target', '25')
      await page.click('#add-goal-modal .btn-primary')
      await expect(page.locator('#add-goal-modal')).toHaveCount(0)
      expect((await row(page, title)).linked_metric, 'the choice made before switching does not stick').toBeNull()
    } finally { await cleanup(page) }
  })
})
