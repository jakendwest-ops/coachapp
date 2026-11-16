// A workout made on its own could not be put on a day, and so never showed on Today or the calendar
// (docs/bugs/2026-11-16-new-workout-cannot-be-scheduled-or-seen-on-dashboard.md). Personal view now schedules one of your own workouts:
// "Add to calendar" on the Workouts list, "+ Add a workout" on a calendar day or a rest day. A scheduled workout is a calendar event with
// template_id (scripts/add-event-workout-link-2026-11-16.sql), and it counts as planned everywhere a plan session does.
//
// NEEDS THE SQL: until events.template_id exists on the live project this spec is red (the dashboard's reads name the column).
//
// Fixtures: this test's OWN library workout, tagged; afterEach deletes it (the scheduled days go with it, ON DELETE CASCADE) and asserts nothing
// tagged is left.
const { test, expect } = require('./fixtures')
const { loginAsPT, soloReady } = require('./helpers')

let TAG = null
test.beforeEach(() => { TAG = '[E2E] Sched ' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) })

test.afterEach(async ({ browser }) => {
  if (!TAG) return
  const tag = TAG; TAG = null
  const ctx = await browser.newContext()
  try {
    const pt = await ctx.newPage(); await loginAsPT(pt)
    const r = await pt.evaluate(async (tag) => {
      const uid = currentUser.id
      const ids = ((await db.from('workout_templates').select('id').eq('coach_id', uid).like('name', tag + '%')).data || []).map(t => t.id)
      if (ids.length) await db.from('events').delete().in('template_id', ids).select('id')
      if (ids.length) await db.from('workout_template_exercises').delete().in('template_id', ids).select('id')
      if (ids.length) await db.from('workout_templates').delete().in('id', ids).eq('coach_id', uid).select('id')
      const leftT = ((await db.from('workout_templates').select('id').eq('coach_id', uid).like('name', tag + '%')).data || []).length
      const leftE = ((await db.from('events').select('id').like('title', tag + '%')).data || []).length
      return { leftT, leftE }
    }, tag)
    expect(r, 'cleanup must leave no workout or scheduled day of this test behind').toEqual({ leftT: 0, leftE: 0 })
  } finally {
    try { await ctx.close() } catch (err) { console.warn('[sched] could not close the cleanup context:', err.message) }
  }
})

// One library workout of the signed-in person's own, with one exercise.
async function makeWorkout(page, name) {
  return page.evaluate(async (name) => {
    const uid = currentUser.id
    const t = await db.from('workout_templates').insert({ coach_id: uid, name, is_personal: true }).select('id').single()
    if (t.error) return { error: t.error.message }
    const ex = await db.from('workout_template_exercises').insert({ template_id: t.data.id, exercise_name: '[E2E] Sched Bench', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0, sets: 1, sets_json: [{ repsMin: 5, weight: 60, restMin: 90 }] }).select('id')
    if (ex.error) return { error: ex.error.message }
    return { id: t.data.id, today: _ymdLocal(new Date()), personal: window._soloClientId }
  }, name)
}
const scheduledRows = (page, tid) => page.evaluate(async (tid) => (await db.from('events').select('id, date, title, client_id, type, is_pt_assigned').eq('template_id', tid)).data || [], tid)

test.describe('Schedule a workout (Personal view, 2026-11-16)', () => {
  test('Add to calendar from Workouts puts it on today: Today shows it with Start, the calendar day lists it, Remove takes it off', async ({ page }) => {
    await soloReady(page)
    const W = await makeWorkout(page, TAG + ' Upper')
    expect(W.error, 'fixture').toBeUndefined()

    // Workouts list: open the row, Add to calendar, keep today, save.
    await page.evaluate(() => navigate('workouts'))
    await page.locator('#yw-search').fill(TAG)
    const row = page.locator('.wk-item', { hasText: TAG + ' Upper' })
    await row.locator('[data-yw-toggle]').click()
    await row.locator('[data-yw-schedule]').click()
    await expect(page.locator('#sw-date'), 'the day defaults to today').toHaveValue(W.today)
    await page.locator('#sw-save').click()
    await expect(page.locator('#schedule-workout-modal')).toHaveCount(0)
    await expect.poll(() => scheduledRows(page, W.id), { message: 'one calendar entry, on today, on the personal record' })
      .toMatchObject([{ date: W.today, title: TAG + ' Upper', client_id: W.personal, type: 'session', is_pt_assigned: false }])

    // Today: the workout is planned for today, with a Start that runs THIS workout.
    await page.evaluate(() => navigate('solo-dashboard'))
    const hero = page.locator('#dash-hero')
    await expect(hero).toContainText(TAG + ' Upper', { timeout: 20000 })
    await expect(hero.locator(`button[onclick*="'${W.id}'"]`), 'Start runs the scheduled workout').toHaveCount(1)
    await expect(page.locator(`#dash-week [data-day="${W.today}"] :is(.dash-dc-plan, .dash-dc-done)`), 'the week strip marks today planned (or done, if this account already trained today)').toHaveCount(1)

    // Calendar: the day shows it with the Added tag; Remove takes it off and the workout itself stays.
    await page.evaluate(() => navigate('calendar'))
    // The grid cell truncates the name visually, but its text is the whole name: match THIS run's tag, never an older run's debris.
    await expect(page.locator('[data-cal-scheduled]', { hasText: TAG + ' Upper' }), 'the month grid names it').toHaveCount(1, { timeout: 20000 })
    await page.evaluate((ds) => showClientDayDetail(ds), W.today)
    const sheet = page.locator('#client-day-modal')
    await expect(sheet).toContainText(TAG + ' Upper')
    await expect(sheet.locator('[data-day-added]').first(), 'marked as added, not part of the plan').toBeVisible()
    const evId = (await scheduledRows(page, W.id))[0].id
    await sheet.locator(`[data-day-remove][onclick*="${evId}"]`).click()
    await expect.poll(() => scheduledRows(page, W.id), { message: 'the calendar entry is gone' }).toEqual([])
    const still = await page.evaluate(async (id) => (await db.from('workout_templates').select('id').eq('id', id)).data.length, W.id)
    expect(still, 'the workout stays in your workouts').toBe(1)
  })

  test('+ Add a workout on a later calendar day schedules it there; a day that has gone shows it as missed', async ({ page }) => {
    await soloReady(page)
    const W = await makeWorkout(page, TAG + ' Zone')
    expect(W.error, 'fixture').toBeUndefined()
    const later = await page.evaluate(() => _dashAddDays(_ymdLocal(new Date()), 3))

    await page.evaluate(() => navigate('calendar'))
    await expect(page.locator('#cal-event-list')).toBeAttached({ timeout: 20000 })
    await page.evaluate((ds) => showClientDayDetail(ds), later)
    await page.locator('#client-day-modal [data-day-add-workout]').click()
    const pick = page.locator('#add-workout-modal')
    await pick.locator('[data-aw-template]', { hasText: TAG + ' Zone' }).click()
    await expect(pick).toHaveCount(0)
    await expect.poll(() => scheduledRows(page, W.id)).toMatchObject([{ date: later, client_id: W.personal }])

    // A day that has gone, with nothing logged on it: the dashboard's own read counts it as planned, and so as missed.
    const r = await page.evaluate(async ({ tid, name }) => {
      const today = _ymdLocal(new Date()), cid = window._soloClientId
      const { data: logs } = await db.from('workout_logs').select('date').eq('client_id', cid).gte('date', _dashAddDays(today, -20)).limit(500)
      const busy = new Set((logs || []).map(l => l.date))
      let past = null
      for (let i = 2; i < 20 && !past; i++) { const d = _dashAddDays(today, -i); if (!busy.has(d)) past = d }
      if (!past) return { skip: true }
      const ins = await db.from('events').insert({ client_id: cid, created_by: currentUser.id, title: name, type: 'session', date: past, is_pt_assigned: false, template_id: tid }).select('id')
      if (ins.error) return { error: ins.error.message }
      const d = await _dashLoadOwn(cid, today)
      const planned = (d.progByDate[past] || []).filter(p => p._clientTemplateId === tid)
      return { past, planned: planned.length, kind: _dashDayKind(past, today, d.progByDate[past] || [], d.logs.filter(l => l.date === past)), failed: Object.entries(d.failed).filter(([, e]) => e).map(([k]) => k) }
    }, { tid: W.id, name: TAG + ' Zone' })
    test.skip(!!r.skip, 'every one of the last 20 days has a logged session on this account')
    expect(r.error).toBeUndefined()
    expect(r.failed, 'no dashboard read failed').toEqual([])
    expect(r.planned, 'the past scheduled workout is a planned session on its day').toBe(1)
    expect(r.kind, 'nothing logged that day: missed').toBe('miss')
  })

  test('the database refuses a workout that is not your own library workout, and a client\'s record', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async (tag) => {
      const uid = currentUser.id
      const own = await db.from('clients').select('id').eq('user_id', uid).is('coach_id', null).maybeSingle()
      const client = await db.from('clients').select('id').eq('coach_id', uid).limit(1)
      const copy = await db.from('workout_templates').select('id').eq('coach_id', uid).not('client_id', 'is', null).limit(1)
      const lib = await db.from('workout_templates').insert({ coach_id: uid, name: tag + ' Lib', is_personal: true }).select('id').single()
      if (!own.data || !client.data?.[0] || !copy.data?.[0] || lib.error) return { skip: 'the E2E coach needs a personal record, a client and a client copy' }
      const ins = (client_id, template_id, title) => db.from('events').insert({ client_id, created_by: uid, title, type: 'session', date: _ymdLocal(new Date()), is_pt_assigned: false, template_id }).select('id')
      const a = await ins(own.data.id, copy.data[0].id, tag + ' copy')
      const b = await ins(client.data[0].id, lib.data.id, tag + ' onto client')
      const c = await ins(own.data.id, lib.data.id, tag + ' allowed')
      return { a: a.error?.message || 'ACCEPTED', b: b.error?.message || 'ACCEPTED', c: c.error?.message || 'ACCEPTED' }
    }, TAG)
    test.skip(!!r.skip, r.skip)
    expect(r.a, 'a client\'s copy is not yours to schedule').toMatch(/only schedule your own workouts/)
    expect(r.b, 'nor onto a client\'s record').toMatch(/only schedule your own workouts|row-level security/)
    expect(r.c, 'POSITIVE CONTROL: your own library workout on your own record is accepted').toBe('ACCEPTED')
  })
})
