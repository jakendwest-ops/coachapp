// The coach's client list (MVP item 4, approved by Jake 2026-10-30): search, status chips with counts, sort - Needs attention by default,
// ranked by the SAME rules as the Home card (_attentionForRoster) - and each row's plan + week and top reason. Renders the real renderClients
// over a stubbed database (capped-api: nothing is written, any table it is not given throws). Pinned to Friday 30 Oct 2026, midday in London.
// The pure filter / sort / label helpers are pinned by tests-node/client-list.test.mjs.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')
const { installCappedApi, restoreCappedApi } = require('./capped-api')

const NOW = new Date('2026-10-30T12:00:00Z')
const ymd = (offset = 0) => { const d = new Date(NOW.getTime() + offset * 864e5); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` }
test.use({ timezoneId: 'Europe/London' })

const roster = (uid) => {
  const sum = (id, name, o = {}) => ({ client_id: id, full_name: name, status: 'active', created_at: '2026-01-05T09:00:00Z', sessions_7d: 0, last_session_date: ymd(-2),
    last_weigh_in_date: null, last_check_in_at: null, program_id: null, program_name: null, program_start: null, program_weeks: null, next_program_start: null, ...o })
  const people = [['a', 'Amy Quiet', 'active'], ['b', 'Ben Fine', 'active'], ['c', 'Cara Missed', 'active'], ['d', 'Dee Inactive', 'inactive']]
  return {
    clients: people.map(([id, full_name, status]) => ({ id, full_name, status, coach_id: uid, email: null, created_at: '2026-01-05T09:00:00Z' })),
    coach_client_summary: [
      sum('a', 'Amy Quiet', { last_session_date: ymd(-12) }),
      sum('b', 'Ben Fine', { sessions_7d: 2, last_session_date: ymd(-1) }),
      sum('c', 'Cara Missed', { program_id: 'p', program_name: 'MWF', program_start: '2026-10-12', program_weeks: 8, last_session_date: ymd(-8) }),
      sum('d', 'Dee Inactive', { status: 'inactive', last_session_date: ymd(-60) }),
    ],
    program_phases: [{ id: 'ph', program_id: 'p', name: 'Base', duration_weeks: 8, order_index: 0, program_phase_workouts: [1, 3, 5].map(d => ({ id: 'w' + d, day_of_week: d, session_order: 1, week_number: 1 })) }],
    client_programs: [{ id: 'cp', client_id: 'c', program_id: 'p', created_at: '2026-10-01T09:00:00Z', clients: { coach_id: uid } }],
    workout_logs: [{ id: 'l1', client_id: 'b', date: ymd(-1), workout_log_exercises: [{ id: 'x' }], clients: { coach_id: uid } }],
    events: [],
  }
}
const read = (page) => page.evaluate(() => ({
  ids: [...document.querySelectorAll('#client-list [data-client-row]')].map(r => r.getAttribute('data-client-row')),
  meta: Object.fromEntries([...document.querySelectorAll('#client-list [data-client-row]')].map(r => [r.getAttribute('data-client-row'), r.querySelector('.row-meta').textContent.trim()])),
  chip: Object.fromEntries([...document.querySelectorAll('#client-list [data-client-row]')].map(r => [r.getAttribute('data-client-row'), r.querySelector('[data-reason]')?.getAttribute('data-reason') || null])),
  counts: Object.fromEntries([...document.querySelectorAll('[data-status-chip]')].map(b => [b.getAttribute('data-status-chip'), b.querySelector('b').textContent])),
  pressed: document.querySelector('[data-status-chip][aria-pressed="true"]')?.getAttribute('data-status-chip'),
  search: document.getElementById('client-search')?.value, empty: document.querySelector('#client-list .client-none')?.textContent.trim() || null,
}))
const render = (page) => page.evaluate(async () => { document.getElementById('cl-host')?.remove(); const el = document.createElement('div'); el.id = 'cl-host'; document.body.prepend(el); await renderClients(el) })

test.describe('the client list', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await page.clock.setFixedTime(NOW) })

  test('the default: Active clients ranked by Needs attention, each row with its plan + week and top reason, chips counted over the whole roster', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await installCappedApi(page, roster(uid))
    let r
    try { await render(page); r = await read(page) } finally { await restoreCappedApi(page) }
    expect(r.ids, 'Cara (missed: high), Amy (quiet: medium), Ben (fine); Dee is inactive').toEqual(['c', 'a', 'b'])
    expect(r.chip).toEqual({ c: 'missed', a: 'quiet', b: null })
    expect(r.meta.c).toBe('MWF · Wk 3/8')
    expect(r.meta.a).toBe('No plan')
    expect(r.counts).toEqual({ active: '3', inactive: '1', archived: '0', all: '4' })
    expect(r.pressed).toBe('active')
  })

  test('search, chips and sort redraw from what is loaded, and survive coming back to the page', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await installCappedApi(page, roster(uid))
    try {
      await render(page)
      await page.locator('#client-search').fill('ee')
      expect((await read(page)).empty, 'no ACTIVE client has "ee" in their name').toContain('No active clients match')
      await page.locator('[data-status-chip="all"]').click()
      expect((await read(page)).ids, 'under All, the one name containing "ee": Dee Inactive').toEqual(['d'])
      await page.locator('#client-search').fill('')
      await page.locator('#client-sort').selectOption('name')
      expect((await read(page)).ids).toEqual(['a', 'b', 'c', 'd'])
      await render(page)   // leave and come back
      const back = await read(page)
      expect(back.pressed, 'the chip is remembered').toBe('all')
      expect(back.ids, 'and the sort').toEqual(['a', 'b', 'c', 'd'])
    } finally { await restoreCappedApi(page) }
  })

  test('a failed summaries read: every row says "—", nobody is given a reason, the roster is still listed, and it says why it is by name', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = roster(uid)
    await installCappedApi(page, { ...t, coach_client_summary: { error: { code: 'XX000', message: 'boom' } } })
    let r, note
    try { await render(page); r = await read(page); note = await page.evaluate(() => document.querySelector('[data-attn-partial]')?.textContent || '') } finally { await restoreCappedApi(page) }
    expect(r.ids.sort()).toEqual(['a', 'b', 'c'])
    expect(Object.values(r.meta)).toEqual(['—', '—', '—'])
    expect(Object.values(r.chip)).toEqual([null, null, null])
    expect(note).toContain('Could not check who needs attention')
  })

  test('a different account on the same tab starts fresh - never with the last coach\'s search text (review, 2026-10-30)', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await installCappedApi(page, roster(uid))
    let r
    try {
      // What another coach left behind before signing out in this tab.
      await page.evaluate(() => { _clientListState = { uid: 'another-coach', q: 'Smi', status: 'archived', sort: 'name' } })
      await render(page)
      r = await read(page)
    } finally { await restoreCappedApi(page) }
    expect(r.search).toBe('')
    expect(r.pressed).toBe('active')
    expect(r.ids).toEqual(['c', 'a', 'b'])
  })

  test('a hostile client name is text, never markup', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = roster(uid)
    t.clients[0].full_name = '<img src=x onerror="window.__pwned=1">Amy'
    t.coach_client_summary[0].full_name = t.clients[0].full_name
    await installCappedApi(page, t)
    let r
    try {
      await render(page)
      r = await page.evaluate(() => ({ img: !!document.querySelector('#client-list img'), text: document.querySelector('[data-client-row="a"] .row-name').textContent, pwned: !!window.__pwned }))
    } finally { await restoreCappedApi(page) }
    expect(r.img).toBe(false)
    expect(r.pwned).toBe(false)
    expect(r.text).toContain('<img')
  })
})
