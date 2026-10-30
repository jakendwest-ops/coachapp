// The client profile cockpit (MVP item 5, approved by Jake 2026-10-30): a strip under the client's name - plan + week, the last 7 days against
// the plan, last session, latest check-in, the Needs-attention reasons, Start session / Assign next block, Call / Text / Email (no WhatsApp).
// Renders the real openClient / renderClientCockpit over a stubbed database (capped-api: nothing is written, any table it is not given throws).
// Pinned to Friday 30 Oct 2026, midday in London. The pure helpers are pinned by tests-node/client-cockpit.test.mjs.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')
const { installCappedApi, restoreCappedApi } = require('./capped-api')

const NOW = new Date('2026-10-30T12:00:00Z')
const ymd = (offset = 0) => { const d = new Date(NOW.getTime() + offset * 864e5); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` }
test.use({ timezoneId: 'Europe/London' })

// Cara: on an 8-week Mon/Wed/Fri plan from 12 Oct, last trained 8 days ago - "missed". Ben: no plan, trained yesterday.
const tables = (uid, o = {}) => {
  const sum = (id, name, x = {}) => ({ client_id: id, full_name: name, status: 'active', created_at: '2026-01-05T09:00:00Z', sessions_7d: 0, last_session_date: ymd(-2),
    last_weigh_in_date: null, last_check_in_at: null, check_in_sleep: null, check_in_energy: null, check_in_stress: null, check_in_soreness: null,
    program_id: null, program_name: null, program_start: null, program_weeks: null, next_program_start: null, ...x })
  return {
    clients: [
      { id: 'c', full_name: 'Cara Missed', status: 'active', coach_id: uid, email: 'cara@example.com', phone: '07700 900123', invited_at: null, created_at: '2026-01-05T09:00:00Z' },
      { id: 'b', full_name: 'Ben Fine', status: 'active', coach_id: uid, email: null, phone: null, invited_at: null, created_at: '2026-01-05T09:00:00Z' },
    ],
    coach_client_summary: [
      sum('c', 'Cara Missed', { program_id: 'p', program_name: 'MWF', program_start: '2026-10-12', program_weeks: 8, last_session_date: ymd(-8), last_check_in_at: '2026-10-27T09:00:00Z', check_in_sleep: 4, check_in_energy: 4, check_in_stress: 5, check_in_soreness: 2 }),
      sum('b', 'Ben Fine', { sessions_7d: 1, last_session_date: ymd(-1) }),
    ],
    program_phases: [{ id: 'ph', program_id: 'p', name: 'Base', duration_weeks: 8, order_index: 0, program_phase_workouts: [1, 3, 5].map(d => ({ id: 'w' + d, day_of_week: d, session_order: 1, week_number: 1 })) }],
    client_programs: [{ id: 'cp', client_id: 'c', program_id: 'p', created_at: '2026-10-01T09:00:00Z', clients: { coach_id: uid } }],
    workout_logs: [{ id: 'l1', client_id: 'b', date: ymd(-1), workout_log_exercises: [{ id: 'x' }], clients: { coach_id: uid } }],
    events: [],
    client_check_ins: [],
    ...o,
  }
}
const read = (page) => page.evaluate(() => {
  const box = document.querySelector('#client-cockpit .cockpit')
  if (!box) return null
  return {
    client: box.getAttribute('data-cockpit-client'),
    facts: [...box.querySelectorAll('.cockpit-fact b')].map(b => b.textContent.trim()),
    reasons: [...box.querySelectorAll('[data-reason]')].map(e => e.getAttribute('data-reason')),
    actions: [...box.querySelectorAll('[data-cockpit-action]')].map(e => e.getAttribute('data-cockpit-action')),
    contact: [...box.querySelectorAll('[data-contact]')].map(a => a.getAttribute('href')),
    flagged: !!box.querySelector('[data-checkin-flagged]'),
    text: box.textContent.replace(/\s+/g, ' ').trim(),
    heights: [...box.querySelectorAll('[data-cockpit-action], [data-contact]')].map(e => e.getBoundingClientRect().height),
  }
})
// The cockpit alone, into a fresh container (what openClient does, without the tab underneath).
const renderFor = (page, id, client) => page.evaluate(async ([id, client]) => {
  document.getElementById('client-cockpit')?.remove()
  const box = document.createElement('div'); box.id = 'client-cockpit'; box.setAttribute('data-cockpit-client', id); document.body.prepend(box)
  await renderClientCockpit(id, client)
}, [id, client])

test.describe('the client profile cockpit', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await page.clock.setFixedTime(NOW) })

  test('openClient shows the strip above the tabs: plan + week, the week against the plan, last session, check-in, reasons and actions', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await installCappedApi(page, tables(uid))
    let r, order
    try {
      await page.evaluate(() => openClient('c'))
      await expect(page.locator('#client-cockpit .cockpit')).toBeVisible()
      r = await read(page)
      order = await page.evaluate(() => !!(document.getElementById('client-cockpit').compareDocumentPosition(document.querySelector('.tabs')) & Node.DOCUMENT_POSITION_FOLLOWING))
    } finally { await restoreCappedApi(page) }
    expect(order, 'the cockpit sits above the tabs').toBe(true)
    expect(r.client).toBe('c')
    expect(r.facts[0]).toBe('MWF · Wk 3/8')
    expect(r.facts[1], 'Mon 26, Wed 28 planned in the last 7 days (Fri 23 too); none logged').toMatch(/^0 of \d+ planned$/)
    expect(r.facts[2], 'the client list\'s own label (_lastSessionLabel)').toBe('8d ago')
    expect(r.facts[3], 'the label says Check-in; the value does not repeat it').toMatch(/^3d ago/)
    expect(r.flagged, 'stress 5 is a red score').toBe(true)
    expect(r.reasons).toContain('missed')
    expect(r.actions).toEqual(['start'])
    expect(r.contact).toEqual(['tel:07700900123', 'sms:07700900123', 'mailto:cara@example.com'])
    expect(r.text).not.toMatch(/whatsapp/i)
    for (const h of r.heights) expect(h, 'every cockpit control is a 44px target').toBeGreaterThanOrEqual(44)
  })

  test('no plan and no contact details: a plain session count, no reasons, Start session only', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = tables(uid)
    await installCappedApi(page, t)
    let r
    try { await renderFor(page, 'b', t.clients[1]); r = await read(page) } finally { await restoreCappedApi(page) }
    expect(r.facts[0]).toBe('No plan')
    expect(r.facts[1]).toBe('1 session')
    expect(r.facts[2]).toBe('Yesterday')
    expect(r.facts[3]).toBe('None yet')
    expect(r.reasons).toEqual([])
    expect(r.actions).toEqual(['start'])
    expect(r.contact).toEqual([])
  })

  test('a failed summary read: says so, accuses nobody, and Start session and contact still work', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = tables(uid, { coach_client_summary: { error: { code: 'XX000', message: 'boom' } } })
    await installCappedApi(page, t)
    let r
    try { await renderFor(page, 'c', t.clients[0]); r = await read(page) } finally { await restoreCappedApi(page) }
    expect(r.text).toContain('Could not load')
    expect(r.reasons).toEqual([])
    expect(r.actions).toEqual(['start'])
    expect(r.contact[0]).toBe('tel:07700900123')
  })

  test('a read that THROWS: the strip still says it could not load, never stays blank (review, 2026-10-30)', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = tables(uid)
    delete t.coach_client_summary   // capped-api throws on a table it was not given
    await installCappedApi(page, t)
    let r
    try { await renderFor(page, 'c', t.clients[0]); r = await read(page) } finally { await restoreCappedApi(page) }
    expect(r && r.text).toContain('Could not load')
    expect(r.actions).toEqual(['start'])
  })

  test('a failed sessions read: says some reasons could not be checked, and never claims "missed"', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = tables(uid, { workout_logs: { error: { code: 'XX000', message: 'boom' } } })
    await installCappedApi(page, t)
    let r, note
    try { await renderFor(page, 'c', t.clients[0]); r = await read(page); note = await page.evaluate(() => document.querySelector('#client-cockpit [data-attn-partial]')?.textContent || '') } finally { await restoreCappedApi(page) }
    expect(note).toContain('could not be checked')
    expect(r.reasons).not.toContain('missed')
  })

  test('opening a second client before the first strip lands: the second client\'s strip, never the first\'s', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = tables(uid)
    await installCappedApi(page, t)
    let r
    try {
      r = await page.evaluate(async ([a, b]) => {
        const make = (id) => { document.getElementById('client-cockpit')?.remove(); const box = document.createElement('div'); box.id = 'client-cockpit'; box.setAttribute('data-cockpit-client', id); document.body.prepend(box) }
        make('c'); const first = renderClientCockpit('c', a)   // not awaited: the coach taps another client
        make('b'); const second = renderClientCockpit('b', b)
        await Promise.all([first, second])
        return { boxes: document.querySelectorAll('#client-cockpit').length, client: document.querySelector('#client-cockpit .cockpit')?.getAttribute('data-cockpit-client') }
      }, [t.clients[0], t.clients[1]])
    } finally { await restoreCappedApi(page) }
    expect(r.boxes).toBe(1)
    expect(r.client).toBe('b')
  })

  test('a hostile plan name and phone are text, never markup', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = tables(uid)
    t.coach_client_summary[0].program_name = '<img src=x onerror="window.__pwned=1">MWF'
    t.clients[0].phone = '0770"><img src=x onerror="window.__pwned=1">'
    await installCappedApi(page, t)
    let r
    try {
      await renderFor(page, 'c', t.clients[0])
      r = await page.evaluate(() => ({ img: !!document.querySelector('#client-cockpit img'), pwned: !!window.__pwned, plan: document.querySelector('#client-cockpit .cockpit-fact b').textContent }))
    } finally { await restoreCappedApi(page) }
    expect(r.img).toBe(false)
    expect(r.pwned).toBe(false)
    expect(r.plan).toContain('<img')
  })
})
