const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')
const { installCappedApi, restoreCappedApi, cappedApiCalls } = require('./capped-api')

// ─── The coach dashboard and the client list read the per-client summary (R2b, 2026-09-21) ────────────────
//
// REWORKED 2026-10-03: the coach dashboard is now the shared landing-page skeleton (Today card, the week as bars, a "Trained this
// week" tile, a "Needs attention" list). The invariants this file pinned all still hold and are re-expressed on the new page: the
// numbers come from the PAGED per-client summary (never a slice of the logs), only ACTIVE clients are counted or chased, a failed
// read shows "—" and never zero, and a list past 200 rows pages without dropping or repeating anyone. What is retired: the
// "Total clients / Sessions this week / Active goals" strip, the per-client adherence list with its At risk filter, and the recent
// activity feed - all replaced by the cards above.
//
// Both screens used to work out "who trained" from a SLICE of workout_logs, and the API silently cuts every response at
// 200 rows:
//   - the dashboard read this MONTH's logs, newest 100 — so past ~33 clients at three sessions a week the oldest days
//     dropped out and active clients read "At risk", and on UTC days 1-7 of every month last month's sessions were
//     invisible altogether;
//   - the client list took each client's "last session" from the newest 200 logs across ALL clients, so a client outside
//     that window read "No sessions" (grey) instead of "35d ago" (red) — exactly the clients a coach needs to chase.
// Neither said anything when it was wrong, and the list also ignored a failed read (which reads the same way).
//
// They now read `coach_client_summary` (one row per client of the calling coach, computed in the database — scripts/
// add-coach-client-summary-2026-09-20.sql, verified against real Postgres by scripts/sql-verify), paged through
// _fetchAllRows because the API cap applies to a view too. These run the REAL renderDashboard and renderClients against
// tests/capped-api.js (a read-only stand-in that caps at 200, reorders ties, models !inner, and fails closed): no rows are
// created anywhere. The view's own tenant isolation and arithmetic are proven elsewhere — on real Postgres by the SQL
// verifier and against the live API with real accounts by tests/coach-client-summary-2026-09-21.spec.js — so nothing here
// re-tests them; what is tested is what the SCREENS do with what the view returns, including when it is unavailable.
test.describe('the coach dashboard and the client list read the per-client summary', () => {
  // The list's "Today / Yesterday / Nd ago" labels read a YYYY-MM-DD as LOCAL midnight against the fixed "now" below, so the
  // host's timezone would otherwise decide whether the fixtures line up (it breaks from UTC+12 eastward).
  test.use({ timezoneId: 'Europe/London' })
  const pid = (i) => 'p-' + String(i).padStart(3, '0')
  const nm = (i) => 'Client ' + String(i).padStart(3, '0')
  const roster = (me, i, over = {}) => ({ id: pid(i), coach_id: me, full_name: nm(i), status: 'active', email: null, created_at: '2026-01-01T00:00:00Z', ...over })
  // A row exactly as the view returns it.
  const summary = (i, over = {}) => ({
    client_id: pid(i), full_name: nm(i), status: 'active', user_id: null, invited_at: null, created_at: '2026-01-01T00:00:00Z',
    last_session_date: null, sessions_7d: 0, sessions_28d: 0, last_weigh_in_date: null, last_check_in_at: null,
    check_in_sleep: null, check_in_energy: null, check_in_stress: null, check_in_soreness: null,
    program_id: null, program_name: null, program_start: null, program_weeks: null, ...over,
  })
  // ONE fixed "now" for the page (set after login) and for every fixture date: "Yesterday" and "35d ago" are computed from
  // the wall clock, so without this the same test would pass or fail depending on the hour it was run.
  const NOW = new Date('2026-09-15T12:00:00Z')
  const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10)
  const many = (n, f) => Array.from({ length: n }, (_, i) => f(i))
  const FAILING = { error: { code: 'XX000', message: 'boom' } }

  const withApi = async (page, tables, fn) => {
    await installCappedApi(page, tables)
    try { return await fn() } finally { await restoreCappedApi(page) }
  }
  const myId = (page) => page.evaluate(() => currentUser.id)

  // Renders the coach dashboard and reads what a coach reads off it.
  const dashboard = (page, tables) => withApi(page, tables, async () => {
    const r = await page.evaluate(async () => {
      const el = document.createElement('div'); document.body.appendChild(el)
      await renderDashboard(el)
      const t = (sel) => { const e = el.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null }
      return {
        text: el.textContent,
        trained: t('#dash-trained'), ending: t('#dash-ending'), weekSub: t('#dash-week .dash-card-sub'), attention: t('#dash-attn'),
        attentionNames: [...el.querySelectorAll('#dash-attn .dash-row-main b')].map(b => b.textContent),
        attentionButton: [...el.querySelectorAll('#dash-hero .dash-btn')].map(b => b.textContent.trim()).find(x => /need attention/.test(x)) || null,
      }
    })
    r.calls = await cappedApiCalls(page)
    return r
  })

  // Renders the client list and reads each row's name and last-session label (text and painted colour).
  const clientList = (page, tables) => withApi(page, tables, async () => {
    const r = await page.evaluate(async () => {
      const el = document.createElement('div'); document.body.appendChild(el)
      await renderClients(el)
      const rows = Object.fromEntries([...el.querySelectorAll('.list-row')].map(row => {
        const label = [...row.querySelectorAll('.row-right span')].find(s => !s.classList.contains('badge'))
        return [row.querySelector('.row-name').textContent.trim(), { text: label?.textContent.trim(), colour: label ? getComputedStyle(label).color : null }]
      }))
      return { text: el.textContent, rows, imgs: el.querySelectorAll('img').length }
    })
    r.calls = await cappedApiCalls(page)
    return r
  })

  const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number)
  // The list's red is #ef4444 (239, 68, 68). Amber (#f59e0b = 245, 158, 11) also has r above g and b, so compare the shape.
  const isRed = (s) => { const [r, g, b] = rgb(s); return r > 200 && g < 100 && b < 100 }

  test.beforeEach(async ({ page }) => { await loginAsPT(page); await page.clock.setFixedTime(NOW) })

  // ── the dashboard ──────────────────────────────────────────────────────────────────────────────────�
  test('DASHBOARD: "Trained this week" is what the summaries say, not what fits in a slice of the logs', async ({ page }) => {
    const me = await myId(page)
    const N = 40
    // Client i trained (i % 4) times this week (0..3): 30 of the 40 trained at least once, 10 did not. The logs table holds 300 rows,
    // all client 0's and none with an exercise in it, so a count built from "the newest logs" would see ONE client (or none).
    const r = await dashboard(page, {
      clients: many(N, (i) => roster(me, i)),
      coach_client_summary: many(N, (i) => summary(i, { sessions_7d: i % 4 })),
      workout_logs: many(300, () => ({ client_id: pid(0), date: daysAgo(0), created_at: NOW.toISOString() })),
      weight_logs: [], goals: [],
    })
    expect.soft(r.trained, 'the tile is the summaries\' count: 30 of 40 clients trained').toContain('30 of 40')
    expect.soft(r.attentionButton, 'the 10 who did not are the ones to chase').toBe('10 need attention')
    expect.soft(r.attentionNames.length, 'the list shows the first five...').toBe(5)
    expect.soft(r.attention, '...and says how many more').toContain('+5 more')
    expect(r.weekSub, 'and the week\'s bars come from real sessions only (the 300 empty starts are not sessions)').toBe('0 sessions logged')
  })

  test('PARITY: only ACTIVE clients are counted or chased; an inactive client is neither', async ({ page }) => {
    const me = await myId(page)
    const r = await dashboard(page, {
      clients: [roster(me, 0), roster(me, 1), roster(me, 2, { status: 'inactive' })],
      coach_client_summary: [summary(0, { sessions_7d: 0 }), summary(1, { sessions_7d: 2 }), summary(2, { sessions_7d: 3, status: 'inactive' })],
      workout_logs: [], weight_logs: [], goals: [],
    })
    expect.soft(r.trained, 'two active clients, one of them trained - the inactive client is neither counted nor in the total').toContain('1 of 2')
    expect.soft(r.attentionNames, 'only the active client with no session is chased').toEqual([nm(0)])
    expect(r.attentionButton).toBe('1 need attention')
  })

  test('DASHBOARD: a failed summary read says so - the numbers are unavailable, never zero', async ({ page }) => {
    const me = await myId(page)
    const r = await dashboard(page, {
      clients: [roster(me, 0), roster(me, 1)], coach_client_summary: FAILING,
      workout_logs: [], weight_logs: [], goals: [],
    })
    expect.soft(r.text, 'the failure banner names it').toContain('session summaries')
    expect.soft(r.trained, 'the tile does not claim zero trained').toContain('—')
    expect.soft(r.ending, 'nor that no program is ending').toContain('—')
    expect.soft(r.attention, 'and nobody is accused of not training').toBeNull()
    expect(r.text, 'nor is the roster called empty').not.toContain('No clients yet')
  })

  test('DASHBOARD: past 200 clients the count still adds up every row (the API cap applies to a view too)', async ({ page }) => {
    const me = await myId(page)
    const r = await dashboard(page, {
      clients: many(3, (i) => roster(me, i)),
      coach_client_summary: many(250, (i) => summary(i, { sessions_7d: 1 })),
      workout_logs: [], weight_logs: [], goals: [],
    })
    expect(r.trained, '250 clients who each trained, not the 200 that fit in one response').toContain('250 of 250')
  })

  test('DASHBOARD: clients who share a name still page without dropping or repeating any (the read orders by a unique key too)', async ({ page }) => {
    const me = await myId(page)
    // 250 summary rows with ONE name between them. A page boundary through a run of ties is exactly where ORDER BY name alone
    // lets the server hand one row out twice and skip another - silently, with the right row COUNT. (The stand-in re-shuffles
    // ties on every request, as an unordered Postgres is free to.)
    const r = await dashboard(page, {
      clients: [roster(me, 0)],
      coach_client_summary: many(250, (i) => summary(i, { full_name: 'Same Name', sessions_7d: 1 })),
      workout_logs: [], weight_logs: [], goals: [],
    })
    expect(r.trained, 'every one of the 250 rows counted exactly once').toContain('250 of 250')
  })

  test('DASHBOARD: the week\'s bars count only this week - a session from 9 days ago is in none of them', async ({ page }) => {
    // (The page's "now" is fixed in beforeEach: Tuesday 15 Sep, so this week began on Monday the 14th.) The old "Recent activity -
    // Last 7 days" list had the same promise: a session from 9 days ago must not appear under it.
    const me = await myId(page)
    const exercised = [{ id: 'x1' }]
    const r = await dashboard(page, {
      clients: [roster(me, 0)], coach_client_summary: [summary(0, { sessions_7d: 1 })],
      workout_logs: [
        { id: 'w1', client_id: pid(0), name: 'Yesterday', date: '2026-09-14', created_at: '2026-09-14T09:00:00Z', workout_log_exercises: exercised },
        { id: 'w2', client_id: pid(0), name: 'Nine days ago', date: '2026-09-06', created_at: '2026-09-06T09:00:00Z', workout_log_exercises: exercised },
      ],
      weight_logs: [], goals: [],
    })
    expect(r.weekSub, 'the session from yesterday, not the one from 9 days ago').toBe('1 session logged')
  })

  test('DASHBOARD: a session logged just now for an EARLIER day still lands in its own day, past 25 newer-dated ones', async ({ page }) => {
    const me = await myId(page)
    // 25 sessions dated today (logged 6 hours ago) and one BACKFILLED for yesterday but logged just now. Taken as "the newest 20
    // rows" the backfill is the 26th of 26 and falls outside; the bars read every session in the week, so it belongs to Monday.
    const ex = [{ id: 'x1' }]
    const r = await dashboard(page, {
      clients: [roster(me, 0)], coach_client_summary: [summary(0, { sessions_7d: 26 })],
      workout_logs: [
        ...many(25, (k) => ({ id: 'today-' + k, client_id: pid(0), name: 'Today', date: daysAgo(0), created_at: new Date(NOW.getTime() - 6 * 3600000).toISOString(), workout_log_exercises: ex })),
        { id: 'backfill', client_id: pid(0), name: 'Backfill', date: daysAgo(1), created_at: NOW.toISOString(), workout_log_exercises: ex },
      ],
      weight_logs: [], goals: [],
    })
    expect(r.weekSub, 'all 26 are counted, the backfill included').toBe('26 sessions logged')
  })

  // ── the client list ─────────────────────────────────────────────────────────────────────────────────────
  test('LIST: a client outside the newest 200 logs shows its TRUE last session — "35d ago" in red, not "No sessions"', async ({ page }) => {
    const me = await myId(page)
    const N = 30
    // Client 0's only log is 35 days old and is the OLDEST row; the newest 200 logs belong to the other 29 clients, so a
    // read of "the newest 200" never sees client 0 at all.
    const logs = [
      ...many(300, (k) => ({ coach_id: me, client_id: pid(1 + (k % (N - 1))), date: daysAgo(1 + Math.floor(k / 20)) })),
      { coach_id: me, client_id: pid(0), date: daysAgo(35) },
    ]
    const r = await clientList(page, {
      clients: many(N, (i) => roster(me, i)),
      coach_client_summary: [summary(0, { last_session_date: daysAgo(35) }), ...many(N - 1, (k) => summary(k + 1, { last_session_date: daysAgo(1) }))],
      workout_logs: logs,
    })
    expect.soft(r.rows[nm(0)]?.text, 'the client last seen 35 days ago').toBe('35d ago')
    expect.soft(isRed(r.rows[nm(0)]?.colour || ''), 'in red — a client to chase').toBe(true)
    expect.soft(r.rows[nm(1)]?.text, 'and a client seen yesterday still reads Yesterday').toBe('Yesterday')
    expect(r.calls.filter(c => c.table === 'workout_logs'), 'the list no longer reads a slice of the session logs at all').toEqual([])
  })

  test('LIST: a client whose summary row sits past the first 200 still shows its true last session', async ({ page }) => {
    const me = await myId(page)
    // The roster's three clients (ids p-900…) sort LAST in the view under BOTH orders the read could use — by name ("ZZ …" after
    // "Aaa …") and by id ("p-900" after "p-000 … p-246") — behind 247 other rows, so their rows are on the SECOND page. An
    // unpaged read never sees them, whichever way it orders; a fixture whose roster happened to sort first would not notice.
    const r = await clientList(page, {
      clients: many(3, (i) => roster(me, 900 + i)),
      coach_client_summary: [
        ...many(247, (i) => summary(i, { full_name: 'Aaa ' + String(i).padStart(3, '0') })),
        summary(900, { full_name: 'ZZ 0', last_session_date: daysAgo(35) }),
        summary(901, { full_name: 'ZZ 1', last_session_date: daysAgo(1) }),
        summary(902, { full_name: 'ZZ 2' }),
      ],
      workout_logs: [],
    })
    expect.soft(r.rows[nm(900)]?.text, 'on page two, last seen 35 days ago').toBe('35d ago')
    expect(r.rows[nm(901)]?.text, 'on page two, seen yesterday').toBe('Yesterday')
  })

  test('LIST: clients who share a name still page without dropping or repeating any (the read orders by a unique key too)', async ({ page }) => {
    const me = await myId(page)
    // 250 summary rows, one name, every one last seen yesterday. The roster is 200 clients — the LAST 200 of the 250 by id
    // (p-050 … p-249) — so an UNPAGED read (which hands back only the first 200, p-000 … p-199) leaves 50 of them without a row,
    // and a paged read with no unique tie-break drops and repeats rows at the page boundary (the stand-in reshuffles ties on
    // every request). Either way a client who trained yesterday would read "No sessions".
    const r = await clientList(page, {
      clients: many(200, (i) => roster(me, 50 + i)),
      coach_client_summary: many(250, (i) => summary(i, { full_name: 'Same Name', last_session_date: daysAgo(1) })),
      workout_logs: [],
    })
    const notYesterday = Object.entries(r.rows).filter(([, v]) => v.text !== 'Yesterday').map(([n]) => n)
    expect(Object.keys(r.rows).length, 'the whole roster is listed').toBe(200)
    expect(notYesterday, 'and every client reads Yesterday').toEqual([])
  })

  test('PARITY: a client with genuinely NO sessions still reads "No sessions"', async ({ page }) => {
    const me = await myId(page)
    const r = await clientList(page, { clients: [roster(me, 0), roster(me, 1)], coach_client_summary: [summary(0), summary(1, { last_session_date: daysAgo(0) })], workout_logs: [] })
    expect.soft(r.rows[nm(0)]?.text).toBe('No sessions')
    expect(r.rows[nm(1)]?.text).toBe('Today')
  })

  test('LIST: a failed summary read shows "—" (unavailable), not "No sessions" for everyone', async ({ page }) => {
    const me = await myId(page)
    const r = await clientList(page, { clients: [roster(me, 0), roster(me, 1)], coach_client_summary: FAILING, workout_logs: [] })
    expect.soft(r.rows[nm(0)]?.text, 'a client whose last session is unknown').toBe('—')
    expect(r.text, '"No sessions" would tell the coach a client has not trained').not.toContain('No sessions')
  })

  test('PARITY: a hostile client name is text on both screens, never markup', async ({ page }) => {
    const me = await myId(page)
    const bad = '<img src=x onerror="window.__xss=1">'
    const tables = { clients: [roster(me, 0, { full_name: bad })], coach_client_summary: [summary(0, { full_name: bad, sessions_7d: 1, last_session_date: daysAgo(1) })], workout_logs: [], weight_logs: [], goals: [] }
    const l = await clientList(page, tables)
    // On the dashboard a client with no session this week is listed under "Needs attention" - that is where the name is printed.
    const d = await dashboard(page, { ...tables, coach_client_summary: [summary(0, { full_name: bad, sessions_7d: 0, last_session_date: daysAgo(10) })] })
    expect.soft(l.imgs, 'list: no element was made from it').toBe(0)
    expect.soft(l.text, 'list: it is shown as text').toContain(bad)
    expect.soft(d.text).toContain(bad)   // shown as text
    expect(await page.evaluate(() => window.__xss === 1)).toBe(false)
  })
})
