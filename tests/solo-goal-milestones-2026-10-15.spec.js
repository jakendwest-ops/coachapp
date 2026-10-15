const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

// ─── A solo user can add a step to their own goal (docs/bugs/2026-10-01-solo-user-cannot-add-milestones-to-their-own-goals.md) ─────────────────────────────────────────────
// Against the LIVE database, through the real Goals screen: the master account's own SOLO record (clients.coach_id IS NULL, user_id = the account). Before
// scripts/add-solo-goal-milestones-policy-2026-10-15.sql the step insert is refused by row-level security; after it, "Add a step" works. The second test pins that the policy
// is NARROW: a COACHED client's direct insert is still refused at the database, and the coach's own is not (the existing policy is intact).
//
// Fixtures are tagged [E2E] and removed by afterEach, which ASSERTS the row counts (a goal's delete cascades to its steps).
let TAG = null
test.beforeEach(() => { TAG = '[E2E] SoloSteps ' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) })

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
      const g = ((await db.from('goals').delete().in('id', ids).select('id')).data || []).length
      return { found: ids.length, goals: g }
    }, tag)
    console.log(`[solo-steps] cleanup ${tag}: ${JSON.stringify(r)}`)
    expect(r.goals, 'cleanup must remove every goal this test made (a refused delete would leak rows into the shared test account)').toBe(r.found)
  } finally {
    try { await ctx.close() } catch (err) { console.warn('[solo-steps] could not close the cleanup context:', err.message) }
  }
})

test('a solo user adds a step to their own goal through "Add a step", and it is saved', async ({ page }) => {
  await loginAsPT(page)
  await page.evaluate(() => localStorage.setItem('_activeView', 'solo'))
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => !!window._soloClientId), { timeout: 15000 }).toBe(true)
  const soloId = await page.evaluate(() => window._soloClientId)
  const goalId = await page.evaluate(async ({ soloId, title }) => {
    const { data, error } = await db.from('goals').insert({ client_id: soloId, created_by: currentUser.id, title, goal_type: 'custom', priority: 1, status: 'active' }).select('id').single()
    if (error) throw new Error('goal: ' + error.message)
    return data.id
  }, { soloId, title: TAG + ' goal' })

  await page.evaluate(async ({ goalId, soloId }) => {
    document.getElementById('tab-content')?.remove()
    const el = document.createElement('div'); el.id = 'tab-content'; document.body.appendChild(el)
    await openGoal(goalId, soloId)
  }, { goalId, soloId })
  await page.addStyleTag({ content: '#mobile-view-switcher, #mobile-view-switcher.mvs-on, .bottom-nav { display: none !important }' })
  await expect(page.locator('#tab-content .gl-title')).toContainText(TAG)

  await page.locator('#step-title').fill('Squat 140 kg')
  await page.locator('#tab-content').getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('#milestone-list .gl-step', { hasText: 'Squat 140 kg' }), 'the step is on the page after it repaints from the database (a refusal would show under the box instead)').toBeVisible()
  const saved = await page.evaluate(async (goalId) => (await db.from('goal_milestones').select('title').eq('goal_id', goalId)).data, goalId)
  expect(saved.map(s => s.title), 'and it is really in the table').toEqual(['Squat 140 kg'])
  // ticking it works too (it always did, through the client policy): a solo user can add AND tick
  await page.locator('#milestone-list .gl-step', { hasText: 'Squat 140 kg' }).locator('.gl-tick').click()
  await expect(page.locator('#milestone-list .gl-step', { hasText: 'Squat 140 kg' })).toHaveClass(/is-done/)
})

test('the grant is narrow: a COACHED client still cannot add a step at the database, and their coach still can', async ({ browser }) => {
  const ptCtx = await browser.newContext(), clCtx = await browser.newContext()
  try {
    const cl = await clCtx.newPage(); await loginAsClient(cl)
    const clientId = await cl.evaluate(async () => await _getCurrentClientId())
    expect(clientId, 'the E2E client must have a clients row').not.toBeNull()
    const pt = await ptCtx.newPage(); await loginAsPT(pt)
    const goalId = await pt.evaluate(async ({ clientId, title }) => {
      const { data, error } = await db.from('goals').insert({ client_id: clientId, created_by: currentUser.id, title, goal_type: 'custom', priority: 1, status: 'active' }).select('id').single()
      if (error) throw new Error('goal: ' + error.message)
      return data.id
    }, { clientId, title: TAG + ' coached goal' })

    const seen = await cl.evaluate(async (goalId) => (await db.from('goals').select('id').eq('id', goalId)).data?.length, goalId)
    expect(seen, 'POSITIVE CONTROL: the coached client CAN see their goal, so the refusal below is the insert policy and not a hidden row').toBe(1)
    const asClient = await cl.evaluate(async (goalId) => { const r = await db.from('goal_milestones').insert({ goal_id: goalId, title: 'client tries' }); return { code: r.error?.code || null, message: r.error?.message || null } }, goalId)
    expect(asClient.message, 'the coached client\'s direct insert is refused by row-level security').toMatch(/row-level security/i)
    const asCoach = await pt.evaluate(async (goalId) => { const r = await db.from('goal_milestones').insert({ goal_id: goalId, title: 'coach adds' }); return { message: r.error?.message || null } }, goalId)
    expect(asCoach.message, 'POSITIVE CONTROL: the coach can add a step to their client\'s goal').toBeNull()
    const rows = await pt.evaluate(async (goalId) => (await db.from('goal_milestones').select('title').eq('goal_id', goalId)).data, goalId)
    expect(rows.map(r => r.title), 'only the coach\'s step exists').toEqual(['coach adds'])
  } finally {
    for (const c of [ptCtx, clCtx]) { try { await c.close() } catch (err) { console.warn('[solo-steps] could not close a context:', err.message) } }
  }
})
