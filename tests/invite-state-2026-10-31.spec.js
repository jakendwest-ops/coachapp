// Invite state (MVP item 7, approved by Jake 2026-10-31, with SQL): the coach sees where each client stands with the app - not invited, invited and
// not signed in yet, signed in - on Home's Needs attention ("Invite not accepted" after 3 days), the client list, and the profile (the cockpit's
// App line and Send invite). "Resend invite" is gone: invite-client refuses a linked client, so it could never work
// (docs/bugs/2026-10-31-resend-invite-is-always-refused.md). Real renderDashboard / renderClients / openClient over a stubbed database (capped-api:
// nothing is written, any table it is not given throws). The rules are pinned by tests-node/invite-state.test.mjs; the SQL by
// scripts/sql-verify/client-signed-in.verify.mjs.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')
const { installCappedApi, restoreCappedApi } = require('./capped-api')

const NOW = new Date('2026-10-31T12:00:00Z')
test.use({ timezoneId: 'Europe/London' })

// P pending 6 days, J just invited (yesterday), S signed in, N never invited (has an email), E no email. Everyone on the roster since January,
// nobody has trained: so S, N and E are "No sessions yet", P is "Invite not accepted" instead, and J is neither.
const tables = (uid, o = {}) => {
  const people = [
    ['p', 'Pat Pending', { user_id: 'up', invited_at: '2026-10-25T09:00:00Z', signed_in: false }, 'pat@example.com'],
    ['j', 'Jo Just', { user_id: 'uj', invited_at: '2026-10-30T09:00:00Z', signed_in: false }, 'jo@example.com'],
    ['s', 'Sam Signed', { user_id: 'us', invited_at: '2026-10-01T09:00:00Z', signed_in: true }, 'sam@example.com'],
    ['n', 'Nia Never', { user_id: null, invited_at: null, signed_in: null }, 'nia@example.com'],
    ['e', 'Eli Noemail', { user_id: null, invited_at: null, signed_in: null }, null],
  ]
  return {
    clients: people.map(([id, full_name, x, email]) => ({ id, full_name, status: 'active', coach_id: uid, email, phone: null, user_id: x.user_id, invited_at: x.invited_at, created_at: '2026-01-05T09:00:00Z' })),
    coach_client_summary: people.map(([id, full_name, x]) => ({ client_id: id, full_name, status: 'active', created_at: '2026-01-05T09:00:00Z', sessions_7d: 0, last_session_date: null,
      last_weigh_in_date: null, last_check_in_at: null, check_in_sleep: null, check_in_energy: null, check_in_stress: null, check_in_soreness: null,
      program_id: null, program_name: null, program_start: null, program_weeks: null, next_program_start: null, ...x })),
    program_phases: [], client_programs: [], workout_logs: [], events: [], client_check_ins: [], weight_logs: [], goals: [],
    ...o,
  }
}

test.describe('invite state', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await page.clock.setFixedTime(NOW) })

  test('Home: "Invite not accepted" for the client invited 6 days ago - instead of "No sessions yet"; nothing for the one invited yesterday', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await installCappedApi(page, tables(uid))
    let r
    try {
      r = await page.evaluate(async () => {
        const el = document.createElement('div'); document.body.appendChild(el)
        await renderDashboard(el)
        const card = el.querySelector('#dash-attn')
        const out = {
          reasons: Object.fromEntries([...card.querySelectorAll('[data-attn-client]')].map(n => [n.getAttribute('data-attn-client'), [...n.querySelectorAll('[data-reason]')].map(c => c.getAttribute('data-reason'))])),
          pDetail: card.querySelector('[data-attn-client="p"] i')?.textContent || '',
        }
        el.remove()
        return out
      })
    } finally { await restoreCappedApi(page) }
    expect(r.reasons.p).toEqual(['invite'])
    expect(r.pDetail).toContain('Invited 6 days ago, not signed in yet')
    expect(r.reasons.j, 'invited yesterday: too soon, and not chased for sessions they cannot log yet').toBeUndefined()
    expect(r.reasons.s).toEqual(['quiet'])
    expect(r.reasons.n).toEqual(['quiet'])
  })

  test('the client list: the invite reason as the row\'s chip, "Invited" before 3 days, "Not invited" for both unlinked clients, nothing once signed in', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await installCappedApi(page, tables(uid))
    let r
    try {
      r = await page.evaluate(async () => {
        const el = document.createElement('div'); document.body.appendChild(el)
        await renderClients(el)
        const row = (id) => el.querySelector(`[data-client-row="${id}"]`)
        const out = Object.fromEntries(['p', 'j', 's', 'n', 'e'].map(id => [id, {
          chip: row(id)?.querySelector('[data-reason]')?.getAttribute('data-reason') || null,
          note: row(id)?.querySelector('[data-invite-note]')?.textContent.trim() || null,
        }]))
        el.remove()
        return out
      })
    } finally { await restoreCappedApi(page) }
    expect(r.p).toEqual({ chip: 'invite', note: null })
    expect(r.j).toEqual({ chip: null, note: 'Invited' })
    expect(r.s).toEqual({ chip: 'quiet', note: null })
    expect(r.n).toEqual({ chip: 'quiet', note: 'Not invited' })
    expect(r.e).toEqual({ chip: 'quiet', note: 'Not invited' })
  })

  test('the client list: an inactive client gets no invite note (review, 2026-10-31)', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = tables(uid)
    t.clients[3].status = 'inactive'; t.coach_client_summary[3].status = 'inactive'
    await installCappedApi(page, t)
    let note
    try {
      note = await page.evaluate(async () => {
        const el = document.createElement('div'); document.body.appendChild(el)
        await renderClients(el)
        _clientListSet('status', 'all')      // after the render: renderClients starts a newly signed-in coach on the defaults
        const n = el.querySelector('[data-client-row="n"] [data-invite-note]')?.textContent || null
        const shown = !!el.querySelector('[data-client-row="n"]')
        _clientListSet('status', 'active')
        el.remove()
        return { n, shown }
      })
    } finally { await restoreCappedApi(page) }
    expect(note.shown, 'listed under All').toBe(true)
    expect(note.n).toBe(null)
  })

  test('the client list with a failed summary read: no invite notes - nothing is claimed', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await installCappedApi(page, tables(uid, { coach_client_summary: { error: { code: 'XX000', message: 'boom' } } }))
    let notes
    try {
      notes = await page.evaluate(async () => {
        const el = document.createElement('div'); document.body.appendChild(el)
        await renderClients(el)
        const n = el.querySelectorAll('[data-invite-note]').length
        el.remove()
        return n
      })
    } finally { await restoreCappedApi(page) }
    expect(notes).toBe(0)
  })

  test('the profile of a pending client: the App line says so, and there is no "Resend invite" and no Send invite', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await installCappedApi(page, tables(uid))
    let r
    try {
      await page.evaluate(() => openClient('p'))
      await expect(page.locator('#client-cockpit .cockpit')).toBeVisible()
      r = await page.evaluate(() => ({
        app: document.querySelector('#client-cockpit [data-invite-state]')?.textContent.trim(),
        state: document.querySelector('#client-cockpit [data-invite-state]')?.getAttribute('data-invite-state'),
        resend: document.getElementById('main-content').textContent.includes('Resend'),
        headerInvite: !!document.querySelector('[data-profile-invite]'),
        cockpitInvite: !!document.querySelector('[data-cockpit-action="invite"]'),
      }))
    } finally { await restoreCappedApi(page) }
    expect(r.state).toBe('pending')
    expect(r.app).toMatch(/^Invited .*25 Oct · not signed in yet$/)
    expect(r.resend).toBe(false)
    expect(r.headerInvite).toBe(false)
    expect(r.cockpitInvite).toBe(false)
  })

  test('the profile of a client never invited: "Not invited", and ONE Send invite, in the cockpit (not the header too); with no email, none', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await installCappedApi(page, tables(uid))
    let n, e
    try {
      const look = () => page.evaluate(() => ({
        state: document.querySelector('#client-cockpit [data-invite-state]')?.getAttribute('data-invite-state'),
        app: document.querySelector('#client-cockpit [data-invite-state]')?.textContent.trim(),
        headerInvite: !!document.querySelector('[data-profile-invite]'),
        cockpitInvite: !!document.querySelector('[data-cockpit-action="invite"]'),
      }))
      await page.evaluate(() => openClient('n'))
      await expect(page.locator('#client-cockpit .cockpit')).toBeVisible()
      n = await look()
      await page.evaluate(() => openClient('e'))
      await expect(page.locator('#client-cockpit[data-cockpit-client="e"] .cockpit')).toBeVisible()
      e = await look()
    } finally { await restoreCappedApi(page) }
    expect(n).toEqual({ state: 'not-invited', app: 'Not invited', headerInvite: false, cockpitInvite: true })
    expect(e).toEqual({ state: 'no-email', app: 'Add an email to invite', headerInvite: false, cockpitInvite: false })
  })

  test('the SQL not run yet (no signed_in column): every pending-looking client reads unknown - no invite reason, the App line "—"', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = tables(uid)
    t.coach_client_summary.forEach(r => { delete r.signed_in })
    await installCappedApi(page, t)
    let r
    try {
      await page.evaluate(() => openClient('p'))
      await expect(page.locator('#client-cockpit .cockpit')).toBeVisible()
      r = await page.evaluate(() => ({
        state: document.querySelector('#client-cockpit [data-invite-state]')?.getAttribute('data-invite-state'),
        reasons: [...document.querySelectorAll('#client-cockpit [data-reason]')].map(c => c.getAttribute('data-reason')),
      }))
    } finally { await restoreCappedApi(page) }
    expect(r.state).toBe('unknown')
    expect(r.reasons).toEqual(['quiet'])
  })

  test('a hostile email is text in the invite handler, never code', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = tables(uid)
    t.clients[3].email = "x');window.__pwned=1;('@b.co"
    await installCappedApi(page, t)
    let r
    try {
      await page.evaluate(() => openClient('n'))
      await expect(page.locator('#client-cockpit .cockpit')).toBeVisible()
      r = await page.evaluate(() => {
        const btn = document.querySelector('[data-cockpit-action="invite"]')
        const src = btn?.getAttribute('onclick') || ''
        try { new Function(src.replace('sendClientInvite', 'void')) } catch (e) { return { parse: false } }   // the handler must parse as ONE call
        return { parse: true, pwned: !!window.__pwned, oneCall: /^sendClientInvite\('[^']*','.*'\)$/.test(src) }
      })
    } finally { await restoreCappedApi(page) }
    expect(r.parse).toBe(true)
    expect(r.pwned).toBe(false)
  })
})
