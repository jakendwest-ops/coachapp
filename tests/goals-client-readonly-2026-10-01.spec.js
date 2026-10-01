// A CLIENT does not add, edit or delete goals; a COACH and a SOLO user do (Jake, 2026-10-01).
//
// "The coach sets goals, the client tracks progress." Before this the client's Goals tab offered controls (Add goal, Edit, a milestone Add) that were not
// theirs to use. This pins the SCREEN and the functions behind it: a client sees the goals and keeps the TRACKING controls (a check-in, ticking a milestone);
// a coach and a solo user keep every control. Also here: the goal fields a coach types (metric label and unit) render as TEXT for the client who reads them.
//
// Fixtures: the COACH creates goals (with milestones) as the PT in this test's own context; afterEach removes everything by tag and ASSERTS the row counts.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

let TAG = null
test.beforeEach(() => { TAG = '[E2E] GoalsRO ' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) })

test.afterEach(async ({ browser }) => {
  if (!TAG) return
  const tag = TAG; TAG = null
  const ctx = await browser.newContext()
  try {
    const pt = await ctx.newPage(); await loginAsPT(pt)
    const r = await pt.evaluate(async (tag) => {
      const { data: gs } = await db.from('goals').select('id').ilike('title', tag + '%')
      const ids = (gs || []).map(g => g.id)
      if (!ids.length) return { found: 0, goals: 0 }
      const ms = ((await db.from('goal_milestones').delete().in('goal_id', ids).select('id')).data || []).length
      const ci = ((await db.from('goal_check_ins').delete().in('goal_id', ids).select('id')).data || []).length
      const g = ((await db.from('goals').delete().in('id', ids).select('id')).data || []).length
      return { found: ids.length, goals: g, milestones: ms, checkIns: ci }
    }, tag)
    console.log(`[goals-readonly] cleanup ${tag}: ${JSON.stringify(r)}`)
    expect(r.goals, 'cleanup must remove every goal this test made (a refused delete would leak rows into the shared test account)').toBe(r.found)
  } finally {
    try { await ctx.close() } catch (err) { console.warn('[goals-readonly] could not close the cleanup context:', err.message) }
  }
})

// A goal for `clientId`, made by whoever `page` is logged in as (the coach, or the solo user themselves), with one milestone unless told not to.
// (A SOLO user's own milestone insert is refused by the database today — ledger row 2026-10-01-solo-user-cannot-add-milestones-to-their-own-goals —
// so the solo fixture is made without one; this spec checks what is SHOWN, not what the database allows.)
const makeGoal = (page, clientId, title, extra = {}, withMilestone = true) => page.evaluate(async ({ clientId, title, extra, withMilestone }) => {
  const { data, error } = await db.from('goals').insert({ client_id: clientId, created_by: currentUser.id, title, goal_type: 'custom', priority: 1, status: 'active', ...extra }).select('id').single()
  if (error) throw new Error('goal: ' + error.message)
  if (withMilestone) {
    const m = await db.from('goal_milestones').insert({ goal_id: data.id, title: title + ' milestone' })
    if (m.error) throw new Error('milestone: ' + m.error.message)
  }
  return data.id
}, { clientId, title, extra, withMilestone })

test('a CLIENT sees their goals but no Add goal, Edit, Delete or milestone Add; every function behind them refuses; they keep check-ins', async ({ browser }) => {
  const ptCtx = await browser.newContext(), clCtx = await browser.newContext()
  try {
    const cl = await clCtx.newPage(); await loginAsClient(cl)
    const clientId = await cl.evaluate(async () => await _getCurrentClientId())
    expect(clientId, 'the E2E client must have a clients row').not.toBeNull()
    const pt = await ptCtx.newPage(); await loginAsPT(pt)
    const goalId = await makeGoal(pt, clientId, TAG + ' goal')

    // the list
    await cl.evaluate(() => { window._progressTab = 'Goals'; renderProgress(document.getElementById('main-content')) })
    await expect(cl.locator('#goals-view .card', { hasText: TAG })).toBeVisible({ timeout: 8000 })
    await expect(cl.locator('#progress-tab-content button:has-text("+ Add goal")'), 'a client must not be offered "+ Add goal"').toHaveCount(0)

    // the empty state (a client with no goals): honest copy, and no "+ Add first goal". An id with no rows renders it.
    const empty = await cl.evaluate(async () => {
      const el = document.createElement('div'); document.body.appendChild(el)
      await renderClientGoals('00000000-0000-4000-8000-000000000999', el)
      const out = { copy: el.textContent.includes('Your coach sets your goals'), addFirst: !!el.querySelector('button[onclick^="showAddGoalModal"]'), addGoal: el.textContent.includes('+ Add goal') }
      el.remove()
      return out
    })
    expect(empty, 'the empty state tells a client who sets their goals, and offers no way to add one').toEqual({ copy: true, addFirst: false, addGoal: false })

    // the goal itself
    await cl.locator('#goals-view .card', { hasText: TAG }).click()
    await expect(cl.locator('.back-btn', { hasText: 'All goals' })).toBeVisible({ timeout: 8000 })
    await expect(cl.locator('#tab-content button:has-text("Edit")'), 'a client must not be offered Edit').toHaveCount(0)
    await expect(cl.locator('#tab-content button[onclick^="showAddMilestoneModal"]'), 'a client must not be offered "+ Add" milestone').toHaveCount(0)
    await expect(cl.locator('#tab-content button[onclick^="showAddCheckInModal"]'), 'POSITIVE CONTROL: a client keeps the check-in control').toHaveCount(1)
    await expect(cl.locator('#milestone-list', { hasText: TAG + ' goal milestone' }), "POSITIVE CONTROL: the coach's milestone is visible to the client").toBeVisible()

    // ALL SEVEN functions refuse, each with the toast — proven by a spy on showToast, not by what the database would have refused anyway
    const r = await cl.evaluate(async ({ goalId, cid }) => {
      const real = window.showToast
      const msgs = []
      window.showToast = (m) => { msgs.push(m) }
      try {
        const calls = {
          showAddGoalModal: () => showAddGoalModal(cid), saveNewGoal: () => saveNewGoal(cid),
          showAddMilestoneModal: () => showAddMilestoneModal(goalId, cid), saveNewMilestone: () => saveNewMilestone(goalId, cid),
          showEditGoalModal: () => showEditGoalModal(goalId, cid), saveEditGoal: () => saveEditGoal(goalId, cid), deleteGoal: () => deleteGoal(goalId, cid),
        }
        const out = { toasts: {} }
        for (const [name, fn] of Object.entries(calls)) { const before = msgs.length; await fn(); out.toasts[name] = msgs.slice(before) }
        out.modalsOpened = ['add-goal-modal', 'edit-goal-modal', 'add-milestone-modal'].filter(id => document.getElementById(id))
        return out
      } finally { window.showToast = real }
    }, { goalId, cid: clientId })
    const refusal = ['Only your coach can change your goals']
    expect(r.toasts, 'each of the seven goal-changing functions refuses a client with the toast').toEqual({
      showAddGoalModal: refusal, saveNewGoal: refusal, showAddMilestoneModal: refusal, saveNewMilestone: refusal,
      showEditGoalModal: refusal, saveEditGoal: refusal, deleteGoal: refusal })
    expect(r.modalsOpened, 'and none of them opens a modal').toEqual([])
  } finally {
    for (const c of [ptCtx, clCtx]) { try { await c.close() } catch (err) { console.warn('[goals-readonly] could not close a context:', err.message) } }
  }
})

test('a CLIENT keeps the tracking controls and they WORK: a check-in saves, a milestone ticks', async ({ browser }) => {
  const ptCtx = await browser.newContext(), clCtx = await browser.newContext()
  try {
    const cl = await clCtx.newPage(); await loginAsClient(cl)
    const clientId = await cl.evaluate(async () => await _getCurrentClientId())
    const pt = await ptCtx.newPage(); await loginAsPT(pt)
    const goalId = await makeGoal(pt, clientId, TAG + ' goal')

    await cl.evaluate(() => { window._progressTab = 'Goals'; renderProgress(document.getElementById('main-content')) })
    await cl.locator('#goals-view .card', { hasText: TAG }).click()
    await expect(cl.locator('.back-btn', { hasText: 'All goals' })).toBeVisible({ timeout: 8000 })

    // a check-in, by real clicks
    await cl.locator('#tab-content button[onclick^="showAddCheckInModal"]').click()
    await expect(cl.locator('#add-checkin-modal')).toBeVisible()
    await cl.locator('#ci-value').fill('7')
    await cl.locator('#ci-notes').fill(TAG + ' client check-in')
    await cl.locator('#add-checkin-modal button:has-text("Save check-in")').click()
    await expect(cl.locator('#add-checkin-modal'), 'the modal closes only when the save worked').toHaveCount(0, { timeout: 8000 })
    const ci = await pt.evaluate(async ({ goalId }) => {
      const { data } = await db.from('goal_check_ins').select('notes, current_value').eq('goal_id', goalId)
      const { data: g } = await db.from('goals').select('current_value').eq('id', goalId).single()
      return { rows: data || [], goalCurrent: g?.current_value }
    }, { goalId })
    expect(ci.rows.length, "the client's check-in must be saved").toBe(1)
    expect(ci.rows[0].notes).toBe(TAG + ' client check-in')
    expect(Number(ci.goalCurrent), "…and it moves the goal's current value").toBe(7)

    // a milestone tick, by a real click
    await cl.locator('#tab-content button[onclick^="toggleMilestone"]').first().click()
    await expect.poll(async () => pt.evaluate(async (goalId) => (await db.from('goal_milestones').select('completed_at').eq('goal_id', goalId)).data?.[0]?.completed_at || null, goalId),
      { message: 'ticking a milestone must save for a client' }).not.toBeNull()
  } finally {
    for (const c of [ptCtx, clCtx]) { try { await c.close() } catch (err) { console.warn('[goals-readonly] could not close a context:', err.message) } }
  }
})

test('a COACH and a SOLO user keep every goal control — the list AND the goal detail', async ({ page }) => {
  await loginAsPT(page)
  const soloId = await page.evaluate(() => window._soloClientId || null)
  const coachedId = await page.evaluate(async () => (await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)).data?.[0]?.id || null)
  // Both roles are required: a green run must never mean the solo path was skipped.
  test.skip(!soloId, 'this account has no solo record, so the solo controls cannot be checked')
  test.skip(!coachedId, 'this account has no coached client, so the coach controls cannot be checked')
  const coachGoal = await makeGoal(page, coachedId, TAG + ' coach goal')
  const soloGoal = await makeGoal(page, soloId, TAG + ' solo goal', {}, false)

  const controlsAs = (role, goalId, clientId) => page.evaluate(async ({ role, goalId, clientId }) => {
    const saved = currentProfile
    const hadTab = document.getElementById('tab-content')
    const tab = hadTab || Object.assign(document.createElement('div'), { id: 'tab-content' })
    if (!hadTab) document.body.appendChild(tab)
    currentProfile = { ...currentProfile, role }
    try {
      const list = document.createElement('div'); document.body.appendChild(list)
      await renderClientGoals(clientId, list)
      const out = { listAdd: !!list.querySelector('button[onclick^="showAddGoalModal"]') }
      list.remove()
      await openGoal(goalId, clientId)
      out.edit = !!tab.querySelector('button[onclick^="showEditGoalModal"]')
      out.milestoneAdd = !!tab.querySelector('button[onclick^="showAddMilestoneModal"]')
      out.checkIn = !!tab.querySelector('button[onclick^="showAddCheckInModal"]')
      return out
    } finally { currentProfile = saved; if (!hadTab) tab.remove() }
  }, { role, goalId, clientId })

  const all = { listAdd: true, edit: true, milestoneAdd: true, checkIn: true }
  expect(await controlsAs('coach', coachGoal, coachedId), "a coach has every control on their client's goals").toEqual(all)
  expect(await controlsAs('solo', soloGoal, soloId), 'a solo user has every control on their own goals').toEqual(all)
  expect(await controlsAs('client', coachGoal, coachedId), 'CONTROL: the same goal as a client loses exactly the management controls, so the two results above are the role and not the data')
    .toEqual({ listAdd: false, edit: false, milestoneAdd: false, checkIn: true })
})

test('goal fields a coach types (metric label and unit) are shown to the client as text, never as markup', async ({ browser }) => {
  const ptCtx = await browser.newContext(), clCtx = await browser.newContext()
  try {
    const cl = await clCtx.newPage(); await loginAsClient(cl)
    const clientId = await cl.evaluate(async () => await _getCurrentClientId())
    const pt = await ptCtx.newPage(); await loginAsPT(pt)
    await makeGoal(pt, clientId, TAG + ' hostile', {
      metric_label: '<img src=x onerror="window.__xss=1"> label', metric_unit: '<svg onload="window.__xss=2"></svg>kg',
      start_value: 0, target_value: 100, current_value: 5 })

    const inert = async (where) => {
      await cl.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 300))))
      const s = await cl.evaluate(() => ({ ran: window.__xss ?? null, injected: document.querySelectorAll('img[src="x"], svg[onload]').length, text: document.body.textContent.includes('<img src=x') }))
      expect(s.ran, `${where}: the payload EXECUTED`).toBeNull()
      expect(s.injected, `${where}: the payload created a live element`).toBe(0)
      return s
    }
    await cl.evaluate(() => { window._progressTab = 'Goals'; renderProgress(document.getElementById('main-content')) })
    await expect(cl.locator('#goals-view .card', { hasText: TAG })).toBeVisible({ timeout: 8000 })
    await inert('the goals list')
    await cl.locator('#goals-view .card', { hasText: TAG }).click()
    await expect(cl.locator('.back-btn', { hasText: 'All goals' })).toBeVisible({ timeout: 8000 })
    const s = await inert('the goal detail')
    expect(s.text, 'the hostile text must be SHOWN, as text — otherwise "inert" could just mean "not rendered"').toBe(true)
  } finally {
    for (const c of [ptCtx, clCtx]) { try { await c.close() } catch (err) { console.warn('[goals-readonly] could not close a context:', err.message) } }
  }
})
