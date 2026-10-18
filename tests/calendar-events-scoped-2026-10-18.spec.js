// The Personal calendar shows the events of THIS person's own record and nothing else (data-leak audit, 2026-10-18).
//
// The client/solo branch of renderCalendar read `events` with no client filter and leaned on row-level security alone. For a master account (a coach who also
// trains: Jake, and the E2E coach) the "coach access" policy returns the events on every coaching client AND the events the coach created, so in the Personal
// view the calendar listed the coaching clients' sessions beside the owner's own. The read is now filtered to the record the page resolved (_getCurrentClientId).
//
// Fixtures: this test's OWN coached client with one event, and one event on the coach's personal record, made as the PT; afterEach removes both by tag and
// ASSERTS the row counts.
const { test, expect } = require('./fixtures')
const { loginAsPT, soloReady } = require('./helpers')

let TAG = null, made = false
test.beforeEach(() => { TAG = '[E2E] CalScope ' + Date.now() + '-' + Math.random().toString(36).slice(2, 6); made = false })

test.afterEach(async ({ browser }) => {
  if (!TAG) return
  const tag = TAG, wasMade = made; TAG = null
  const ctx = await browser.newContext()
  try {
    const pt = await ctx.newPage(); await loginAsPT(pt)
    const r = await pt.evaluate(async (tag) => {
      const events = ((await db.from('events').delete().ilike('title', tag + '%').select('id')).data || []).length
      const clients = ((await db.from('clients').delete().ilike('full_name', tag + '%').select('id')).data || []).length
      const left = (await db.from('events').select('id').ilike('title', tag + '%')).data?.length || 0
      return { events, clients, left }
    }, tag)
    console.log(`[cal-scope] cleanup ${tag}: ${JSON.stringify(r)}`)
    expect(r.left, 'cleanup must leave no event of this test behind').toBe(0)
    if (wasMade) {
      expect(r.events, 'both fixture events must have been removed').toBe(2)
      expect(r.clients, 'the fixture client must have been removed').toBe(1)
    }
  } finally {
    try { await ctx.close() } catch (err) { console.warn('[cal-scope] could not close the cleanup context:', err.message) }
  }
})

test('the Personal calendar lists the owner\'s own events, not the events of their coaching clients', async ({ page }) => {
  await soloReady(page)

  const setup = await page.evaluate(async (tag) => {
    const uid = currentUser.id, today = _ymdLocal(new Date())
    const personalId = window._soloClientId
    if (!personalId) return { error: 'no personal record' }
    const cl = await db.from('clients').insert({ coach_id: uid, full_name: tag + ' client', status: 'active' }).select('id').single()
    if (cl.error) return { error: 'client: ' + cl.error.message }
    const coached = await db.from('events').insert({ title: tag + ' coached', date: today, type: 'session', client_id: cl.data.id, is_pt_assigned: true, created_by: uid })
    const own = await db.from('events').insert({ title: tag + ' personal', date: today, type: 'session', client_id: personalId, is_pt_assigned: false, created_by: uid })
    if (coached.error || own.error) return { error: 'event: ' + (coached.error || own.error).message }
    return { ok: true, role: currentProfile?.role }
  }, TAG)
  made = !!setup.ok
  expect(setup.ok, setup.error).toBe(true)
  expect(setup.role, 'precondition: the calendar takes its client/solo branch in this view').toMatch(/^(solo|client)$/)

  // Render this month's calendar and wait for the render itself.
  await page.evaluate(() => renderCalendar(document.getElementById('main-content')))
  const list = page.locator('#cal-event-list')
  await expect(list, 'the month\'s event list is on the page').toBeVisible({ timeout: 20000 })
  await expect(list, 'POSITIVE CONTROL: the owner\'s own event is listed').toContainText(TAG + ' personal')
  await expect(list, 'the event of a COACHING client must not appear in the Personal calendar').not.toContainText(TAG + ' coached')
})
