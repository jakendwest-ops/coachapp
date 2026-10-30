// The coach Home's ranked "Needs attention" list (MVP item 3, approved by Jake 2026-10-30). The rules themselves are pinned by
// tests-node/attention.test.mjs; this spec checks the card and the real renderDashboard wiring over a stubbed database (capped-api: every
// table it is not given throws, nothing is written, nothing to strand): a client who missed planned sessions leads, a holiday mutes them,
// a client doing fine and an inactive one never appear, a plan ending offers "Assign next block", and a failed read says so.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')
const { installCappedApi, restoreCappedApi } = require('./capped-api')

// ONE fixed "now" - Friday 30 Oct 2026, midday in London - for the page (set after login) and every fixture date. On the real clock the plan
// fixtures below crossed the 7-day "plan ending" line every Sunday and the spec failed one day a week (review, 2026-10-30).
const NOW = new Date('2026-10-30T12:00:00Z')
// Calendar arithmetic on the PINNED midday NOW (never the wall clock), so the UTC parts and the London day always agree.
const ymd = (offset = 0) => { const d = new Date(NOW.getTime() + offset * 864e5); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` }
const mondayOf = (offset) => { const d = new Date(NOW.getTime() + offset * 864e5); return ymd(offset - ((d.getUTCDay() + 6) % 7)) }
test.use({ timezoneId: 'Europe/London' })

test.describe('Needs attention: the card', () => {
  test('ten rows then "+N more"; two chips then "+N"; names are text; the plan action only where a plan reason is', async ({ page }) => {
    await loginAsPT(page)
    await page.clock.setFixedTime(NOW)
    const r = await page.evaluate(() => {
      const R = (key, severity, action) => ({ key, severity, label: key.toUpperCase(), detail: 'detail ' + key, ...(action ? { action } : {}) })
      const items = Array.from({ length: 12 }, (_, i) => ({ id: 'c' + i, name: i === 0 ? '<img src=x onerror="window.__pwned=1">Eve' : 'Client ' + i, reasons: [R('quiet', 'medium')] }))
      items[1].reasons = [R('missed', 'high'), R('plan_ending', 'medium', 'next-block'), R('weighin', 'low')]
      const el = document.createElement('div'); el.innerHTML = _dashAttentionHtml(items)
      const rows = [...el.querySelectorAll('[data-attn-client]')]
      const out = {
        rows: rows.length, more: el.querySelector('[data-attn-more]')?.textContent || '',
        chips1: [...rows[1].querySelectorAll('.dash-attn-chip')].map(c => c.textContent), act1: !!rows[1].querySelector('[data-attn-action="next-block"]'),
        act2: !!rows[2].querySelector('[data-attn-action]'), injected: !!el.querySelector('img'), name0: rows[0].querySelector('b').textContent,
        empty: (() => { const e = document.createElement('div'); e.innerHTML = _dashAttentionHtml([]); return e.textContent })(),
        failed: (() => { const e = document.createElement('div'); e.innerHTML = _dashAttentionHtml([], { unavailable: true }); return e.textContent })(),
      }
      return out
    })
    expect(r.rows).toBe(10)
    expect(r.more).toContain('+2 more')
    expect(r.chips1, 'the two worst reasons, then how many more').toEqual(['MISSED', 'PLAN_ENDING', '+1'])
    expect(r.act1).toBe(true)
    expect(r.act2, 'no plan reason, no plan action').toBe(false)
    expect(r.injected, 'a client name is text, never markup').toBe(false)
    expect(r.name0).toContain('<img')
    expect(r.empty).toContain('Nobody needs attention')
    expect(r.failed, 'a failed read never claims nobody needs attention').toContain('Could not check')
    expect(r.failed).not.toContain('Nobody')
  })
})

test.describe('Needs attention: on the real coach Home (stubbed database)', () => {
  test('missed planned sessions lead; a holiday mutes them; fine and inactive clients never appear; an ending plan offers its action', async ({ page }) => {
    await loginAsPT(page)
    await page.clock.setFixedTime(NOW)
    const uid = await page.evaluate(() => currentUser.id)
    const PLAN = 'p-mwf', ENDING = 'p-end'
    const clients = [['a', 'Amy Missed'], ['b', 'Ben Quiet'], ['c', 'Cara Holiday'], ['d', 'Dan Fine'], ['e', 'Eve Ending'], ['f', 'Fay Inactive']]
    const row = (id, name, o = {}) => ({ client_id: id, full_name: name, status: 'active', created_at: '2026-01-05T09:00:00Z', sessions_7d: 0, last_session_date: ymd(-8),
      last_weigh_in_date: null, last_check_in_at: null, program_id: null, program_name: null, program_start: null, program_weeks: null, next_program_start: null, ...o })
    const tables = {
      clients: clients.map(([id, full_name]) => ({ id, full_name, status: id === 'f' ? 'inactive' : 'active', coach_id: uid })),
      coach_client_summary: [
        row('a', 'Amy Missed', { program_id: PLAN, program_name: 'MWF', program_start: mondayOf(-14), program_weeks: 4 }),
        row('b', 'Ben Quiet', { last_session_date: ymd(-12) }),
        row('c', 'Cara Holiday', { program_id: PLAN, program_name: 'MWF', program_start: mondayOf(-14), program_weeks: 4 }),
        row('d', 'Dan Fine', { sessions_7d: 2, last_session_date: ymd(-1) }),
        row('e', 'Eve Ending', { sessions_7d: 1, last_session_date: ymd(-1), program_id: ENDING, program_name: 'Peak', program_start: mondayOf(-21), program_weeks: 4 }),
        row('f', 'Fay Inactive', { status: 'inactive', last_session_date: ymd(-40) }),
      ],
      program_phases: [
        { id: 'ph1', program_id: PLAN, name: 'Base', duration_weeks: 4, order_index: 0, program_phase_workouts: [1, 3, 5].map(d => ({ id: 'pw' + d, day_of_week: d, session_order: 1, week_number: 1 })) },
        { id: 'ph2', program_id: ENDING, name: 'Peak', duration_weeks: 4, order_index: 0, program_phase_workouts: [] },
      ],
      workout_logs: [
        { id: 'l1', client_id: 'd', name: 'Lower', date: ymd(-1), created_at: ymd(-1) + 'T08:00:00Z', workout_log_exercises: [{ id: 'x' }] },
        { id: 'l2', client_id: 'e', name: 'Upper', date: ymd(-1), created_at: ymd(-1) + 'T09:00:00Z', workout_log_exercises: [{ id: 'x' }] },
      ],
      events: [{ client_id: 'c', date: ymd(-3), type: 'holiday', clients: { coach_id: uid } }],
      // When each plan was assigned: long ago, so "missed" counts over the whole window.
      client_programs: [['a', PLAN], ['c', PLAN], ['e', ENDING]].map(([c, p], i) => ({ id: 'cp' + i, client_id: c, program_id: p, created_at: '2026-09-01T09:00:00Z', clients: { coach_id: uid } })),
      weight_logs: [], goals: [], client_check_ins: [],
    }
    await installCappedApi(page, tables)
    let r
    try {
      r = await page.evaluate(async () => {
        const el = document.createElement('div'); document.body.appendChild(el)
        await renderDashboard(el)
        const card = el.querySelector('#dash-attn')
        const out = {
          order: [...card.querySelectorAll('[data-attn-client]')].map(n => n.getAttribute('data-attn-client')),
          reasons: Object.fromEntries([...card.querySelectorAll('[data-attn-client]')].map(n => [n.getAttribute('data-attn-client'), [...n.querySelectorAll('[data-reason]')].map(c => c.getAttribute('data-reason'))])),
          eveAction: !!card.querySelector('[data-attn-client="e"] [data-attn-action="next-block"]'),
          amyDetail: card.querySelector('[data-attn-client="a"] i')?.textContent || '',
          firstCard: el.querySelector('#dash-root > section')?.id, banner: el.textContent.includes("Couldn't load"),
          hero: el.querySelector('#dash-hero')?.textContent || '', trained: el.querySelector('#dash-trained .dash-big')?.textContent || '',
        }
        el.remove()
        return out
      })
    } finally { await restoreCappedApi(page) }
    expect(r.order, 'Amy (missed: high) leads; Ben and Eve (medium) follow by name; Cara (holiday), Dan (fine) and Fay (inactive) never appear').toEqual(['a', 'b', 'e'])
    expect(r.reasons.a).toEqual(['missed'])
    expect(r.amyDetail).toContain('Missed 3 of 3 planned')
    expect(r.reasons.b).toEqual(['quiet'])
    expect(r.reasons.e).toEqual(['plan_ending'])
    expect(r.eveAction).toBe(true)
    expect(r.firstCard, 'Needs attention leads the Home').toBe('dash-attn')
    expect(r.banner).toBe(false)
    expect(r.hero).toContain('3 clients need attention')
    expect(r.trained, '"Trained this week" keeps its own count: Dan and Eve trained, 3 of 5 active did not').toContain('2')
  })

  test('a plan ASSIGNED yesterday but dated from two weeks ago: no "Missed sessions" for the days before the client had it (Jake, 2026-10-30)', async ({ page }) => {
    await loginAsPT(page)
    await page.clock.setFixedTime(NOW)
    const uid = await page.evaluate(() => currentUser.id)
    const sum = (id, name, created) => ({ client_id: id, full_name: name, status: 'active', created_at: '2026-01-05T09:00:00Z', sessions_7d: 0, last_session_date: ymd(-8),
      last_weigh_in_date: null, last_check_in_at: null, program_id: 'p', program_name: 'MWF', program_start: mondayOf(-14), program_weeks: 8, next_program_start: null, created })
    await installCappedApi(page, {
      clients: [{ id: 'new', full_name: 'Nia New', status: 'active', coach_id: uid }, { id: 'old', full_name: 'Olly Old', status: 'active', coach_id: uid }],
      coach_client_summary: [sum('new', 'Nia New'), sum('old', 'Olly Old')],
      program_phases: [{ id: 'ph', program_id: 'p', name: 'Base', duration_weeks: 8, order_index: 0, program_phase_workouts: [1, 3, 5].map(d => ({ id: 'w' + d, day_of_week: d, session_order: 1, week_number: 1 })) }],
      client_programs: [
        { id: 'cp1', client_id: 'new', program_id: 'p', created_at: ymd(-1) + 'T10:00:00Z', clients: { coach_id: uid } },    // assigned yesterday (Thu): nothing before it counts
        { id: 'cp2', client_id: 'old', program_id: 'p', created_at: '2026-09-01T09:00:00Z', clients: { coach_id: uid } },    // assigned long ago: the whole window counts
      ],
      workout_logs: [], events: [], weight_logs: [], goals: [], client_check_ins: [],
    })
    let r
    try {
      r = await page.evaluate(async () => { const el = document.createElement('div'); document.body.appendChild(el); await renderDashboard(el); const c = el.querySelector('#dash-attn'); const o = Object.fromEntries([...c.querySelectorAll('[data-attn-client]')].map(n => [n.getAttribute('data-attn-client'), [...n.querySelectorAll('[data-reason]')].map(x => x.getAttribute('data-reason'))])); el.remove(); return o })
    } finally { await restoreCappedApi(page) }
    expect(r.old, 'assigned long ago and nothing logged: missed').toEqual(['missed'])
    expect(r.new, 'assigned yesterday (a Thursday, no session planned on it): nothing missed yet').toBeUndefined()
  })

  test('a failed SESSIONS read: no "Missed sessions" is claimed for sessions nobody could see, and the card says some reasons were not checked', async ({ page }) => {
    await loginAsPT(page)
    await page.clock.setFixedTime(NOW)
    const uid = await page.evaluate(() => currentUser.id)
    await installCappedApi(page, {
      clients: [{ id: 'a', full_name: 'Amy Missed', status: 'active', coach_id: uid }],
      coach_client_summary: [{ client_id: 'a', full_name: 'Amy Missed', status: 'active', created_at: '2026-01-05T09:00:00Z', sessions_7d: 3, last_session_date: ymd(-1),
        last_weigh_in_date: null, last_check_in_at: null, program_id: 'p', program_name: 'MWF', program_start: mondayOf(-14), program_weeks: 8, next_program_start: null }],
      program_phases: [{ id: 'ph', program_id: 'p', name: 'Base', duration_weeks: 8, order_index: 0, program_phase_workouts: [1, 3, 5].map(d => ({ id: 'w' + d, day_of_week: d, session_order: 1, week_number: 1 })) }],
      workout_logs: { error: { code: 'XX000', message: 'boom' } }, events: [], weight_logs: [], goals: [], client_check_ins: [],
      client_programs: [{ id: 'cp', client_id: 'a', program_id: 'p', created_at: '2026-09-01T09:00:00Z', clients: { coach_id: uid } }],
    })
    let r
    try {
      r = await page.evaluate(async () => { const el = document.createElement('div'); document.body.appendChild(el); await renderDashboard(el); const c = el.querySelector('#dash-attn'); const o = { text: c?.textContent || '', partial: !!c?.querySelector('[data-attn-partial]'), rows: c?.querySelectorAll('[data-attn-client]').length }; el.remove(); return o })
    } finally { await restoreCappedApi(page) }
    expect(r.rows, 'Amy trained yesterday and her sessions could not be read: she is not accused of missing them').toBe(0)
    expect(r.partial).toBe(true)
    expect(r.text, 'and it never says nobody needs attention when it could not check').not.toContain('Nobody')
  })

  test('a failed summary read: the card says it could not check, never "Nobody needs attention"', async ({ page }) => {
    await loginAsPT(page)
    await page.clock.setFixedTime(NOW)
    const uid = await page.evaluate(() => currentUser.id)
    await installCappedApi(page, { clients: [{ id: 'a', full_name: 'Amy', status: 'active', coach_id: uid }], coach_client_summary: { error: { code: 'XX000', message: 'boom' } },
      workout_logs: [], weight_logs: [], goals: [], client_check_ins: [], events: [] })
    let text
    try {
      text = await page.evaluate(async () => { const el = document.createElement('div'); document.body.appendChild(el); await renderDashboard(el); const t = el.querySelector('#dash-attn')?.textContent || ''; el.remove(); return t })
    } finally { await restoreCappedApi(page) }
    expect(text).toContain('Could not check')
    expect(text).not.toContain('Nobody')
  })
})
