// The coach dashboard's "Goals due soon" lists the goals of the coach's CLIENTS and nothing else (data-leak audit, 2026-10-18).
//
// The card's query had no client filter -- it leaned on row-level security alone, unlike the weight and session queries beside it, which filter by
// the coach's client ids. For a master account (a coach who also trains: Jake, and the E2E coach) RLS lets the coach read BOTH their coaching clients' goals and the goals on
// their own personal client row, so a personal goal showed up in the COACH dashboard's list. Not a cross-tenant read -- the same person's data in
// the wrong screen -- but the project's rule is that the client filter, not RLS, is what separates one set of data from another under one login.
// The fix joins the goals to the coach's own clients (clients!inner + coach_id), not to a list of client ids: that list is capped at the API's 200 rows.
//
// Fixtures: this test's OWN client and two goals due today (one on that client, one on the coach's personal record), made as the PT; the personal record is
// planted too when the account has none, and removed again. afterEach removes everything by tag and ASSERTS the row counts.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

let TAG = null, made = false, planted = false
test.beforeEach(() => { TAG = '[E2E] DashGoals ' + Date.now() + '-' + Math.random().toString(36).slice(2, 6); made = false; planted = false })

test.afterEach(async ({ browser }) => {
  if (!TAG) return
  const tag = TAG, wasMade = made, wasPlanted = planted; TAG = null
  const ctx = await browser.newContext()
  try {
    const pt = await ctx.newPage(); await loginAsPT(pt)
    const r = await pt.evaluate(async (tag) => {
      const goals = ((await db.from('goals').delete().ilike('title', tag + '%').select('id')).data || []).length
      const clients = ((await db.from('clients').delete().ilike('full_name', tag + '%').select('id')).data || []).length
      const left = (await db.from('goals').select('id').ilike('title', tag + '%')).data?.length || 0
      return { goals, clients, left }
    }, tag)
    console.log(`[dash-goals] cleanup ${tag}: ${JSON.stringify(r)}`)
    expect(r.left, 'cleanup must leave no goal of this test behind (a refused delete would leak rows into the shared test account)').toBe(0)
    // The counts are only meaningful if the fixtures were made: a test that died earlier must not add a second, misleading failure.
    if (wasMade) {
      expect(r.goals, 'both fixture goals must have been removed').toBe(2)
      expect(r.clients, 'the fixture client (and the personal record, if this test planted it) must have been removed').toBe(wasPlanted ? 2 : 1)
    }
  } finally {
    try { await ctx.close() } catch (err) { console.warn('[dash-goals] could not close the cleanup context:', err.message) }
  }
})

test('the coach dashboard lists the goals of the coach\'s clients, not the goals on the coach\'s own personal record', async ({ page }) => {
  await loginAsPT(page)

  const setup = await page.evaluate(async (tag) => {
    const uid = currentUser.id
    const today = _ymdLocal(new Date())
    // The master account's personal record: user_id = the login, coach_id NULL. The E2E coach normally has one; plant one (tagged, removed in afterEach) if not.
    let { data: personal } = await db.from('clients').select('id').eq('user_id', uid).is('coach_id', null).maybeSingle()
    let planted = false
    if (!personal) {
      const ins = await db.from('clients').insert({ user_id: uid, coach_id: null, full_name: tag + ' personal row', status: 'active' }).select('id').single()
      if (ins.error) return { error: 'personal record: ' + ins.error.message }
      personal = ins.data; planted = true
    }
    const { data: cl, error: cErr } = await db.from('clients').insert({ coach_id: uid, full_name: tag + ' client', status: 'active' }).select('id').single()
    if (cErr) return { error: 'client: ' + cErr.message, planted }
    const goal = (clientId, title) => db.from('goals').insert({ client_id: clientId, created_by: uid, title, goal_type: 'custom', priority: 1, status: 'active', target_date: today }).select('id').single()
    const a = await goal(cl.id, tag + ' coached'), b = await goal(personal.id, tag + ' personal')
    if (a.error || b.error) return { error: 'goal: ' + (a.error || b.error).message, planted }
    return { ok: true, planted }
  }, TAG)
  planted = !!setup.planted
  made = !!setup.ok
  expect(setup.ok, setup.error).toBe(true)

  // Render the COACH dashboard (the account's default view) and wait for the render itself, not a sleep.
  await page.evaluate(() => renderDashboard(document.getElementById('main-content')))
  const card = page.locator('#dash-goals')
  await expect(card, 'the Goals due soon card is on the coach dashboard').toBeVisible({ timeout: 20000 })

  await expect(card, 'POSITIVE CONTROL: the goal on the coach\'s CLIENT is listed').toContainText(TAG + ' coached')
  await expect(card, 'the goal on the coach\'s own PERSONAL record must not appear in the coach dashboard\'s list').not.toContainText(TAG + ' personal')
})
