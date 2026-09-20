const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')
const { installCappedApi, restoreCappedApi, cappedApiCalls, fixtureRows, weightRows } = require('./capped-api')

// ─── Reads that outgrow the API's 200-row cap (R2a, 2026-09-20) ────────────────────────────────────────
//
// The live API returns at most 200 rows per response, silently (measured 2026-09-20: `exercises`, 5,564 rows,
// returns 200 for .range(0, 999) and for .limit(1000)). Sixteen queries in six functions asked for "everything"
// and got the first 200 of their chosen order:
//
//   - the CLIENT weight tab loads oldest-first, so past 200 weigh-ins its "Current" freezes at the 200th-OLDEST
//     one and every new weigh-in the person logs is invisible to it (a daily weigher reaches this in ~7 months);
//   - the COACH weight tab loads newest-first, so its Current is right but ENTRIES is stuck at 200, its "since"
//     date is the 200th-newest, and the table and chart stop there;
//   - the data export (`_buildMyDataBundle`) silently omitted every row past 200 in TEN tables — a subject-access
//     export that reports success while incomplete — and discarded the error of a read that failed;
//   - the personal-best reads — the coach's Performance tab and BOTH dashboards' "Personal bests" tile — took the
//     NEWEST 200 rows and picked the best of those, so a record older than the newest 200 entries (or a whole
//     exercise not logged recently enough) vanished from the tile: a silently wrong "best".
//
// These run the REAL functions against tests/capped-api.js (a read-only stand-in that caps at 200 like the live
// API, shuffles rows that tie on the sort key on every request, and fails closed): no rows are created anywhere,
// so there is nothing to clean up. Every assertion is about something a person reads, not about how the code got it.
//
// Two properties every scenario also pins, because the review of the first version showed nothing else did:
//   TENANCY  — each table also holds rows belonging to ANOTHER client / coach / user, marked FOREIGN, dated to look
//              newest. The coach tabs read through RLS that shows a coach every one of their clients, so the
//              `client_id` filter is the only thing keeping them out; delete it from any read and a test fails.
//   TIE-BREAK — rows that tie on the sort key are reordered per request, so a paged read that does not end its
//              order in a unique column (`.order('id')`) skips and repeats rows at a page boundary and fails.
test.describe('weight history, personal bests and the data export past the 200-row API cap', () => {
  const N = 250
  // newest = index 249 -> 75.1 kg; the 200th-oldest = index 199 -> 80.1 kg (fixture: 100 kg, falling 0.1 a day)
  const NEWEST_KG = 75.1
  const STALE_KG = 80.1
  const START = new Date(Date.now() - (N + 1) * 86400000).toISOString().slice(0, 10)
  const mine = () => weightRows(N, 'cid', { start: START })
  // Another client's weigh-ins, dated in the future: were the client filter lost, one of these would be "Current".
  const foreign = () => weightRows(3, 'other-client', { start: '2030-01-01' }).map(r => ({ ...r, id: 'foreign-' + r.id, notes: 'FOREIGN' }))
  const rows = () => [...mine(), ...foreign()]

  const withApi = async (page, tables, fn) => {
    await installCappedApi(page, tables)
    try { return await fn() } finally { await restoreCappedApi(page) }
  }

  // Renders My Progress > Weight. `solo` runs it as a solo account (id from window._soloClientId, no lookup query).
  const clientTab = async (page, weightTable, { solo = false, clients } = {}) => {
    const me = await page.evaluate(() => currentUser.id)
    const clientsTable = clients ?? [{ id: 'cid', user_id: me, coach_id: solo ? null : 'some-coach', starting_weight_kg: null, goal_weight_kg: null }]
    return withApi(page, { clients: clientsTable, weight_logs: weightTable }, () =>
      page.evaluate(async ({ NEWEST_KG, STALE_KG, solo }) => {
        const prevRole = currentProfile?.role, prevSolo = window._soloClientId
        if (solo) { currentProfile.role = 'solo'; window._soloClientId = 'cid' }
        try {
          const el = document.createElement('div'); document.body.appendChild(el)
          await renderProgressWeight(el)
          const leaf = (label) => [...el.querySelectorAll('div')].find(d => d.children.length === 0 && d.textContent.trim() === label)
          const chart = Chart.getChart('pw-chart')
          const ds = chart?.data.datasets[0].data
          return {
            text: el.textContent,
            current: leaf('Current')?.previousElementSibling?.textContent.trim() ?? null,
            wantNewest: fmtWeight(NEWEST_KG, { spaced: true }),
            wantStale: fmtWeight(STALE_KG, { spaced: true }),
            wantTie: fmtWeight(71, { spaced: true }),
            chartPoints: ds ? ds.length : null,
            chartLast: ds ? ds[ds.length - 1] : null,
            wantChartLast: weightToPref(NEWEST_KG),
            hasLogButton: [...el.querySelectorAll('button')].some(b => b.textContent.includes('+ Log weight')),
            hasRetry: [...el.querySelectorAll('button')].some(b => /try again/i.test(b.textContent)),
          }
        } finally { if (solo) { currentProfile.role = prevRole; window._soloClientId = prevSolo } }
      }, { NEWEST_KG, STALE_KG, solo }))
  }

  // Renders the coach's view of one client's weight.
  const coachTab = (page, weightTable, { clients } = {}) =>
    withApi(page, { clients: clients ?? [{ id: 'cid', starting_weight_kg: null, goal_weight_kg: null }], weight_logs: weightTable }, () =>
      page.evaluate(async ({ NEWEST_KG }) => {
        const el = document.createElement('div'); document.body.appendChild(el)
        await renderClientWeight('cid', el)
        const card = (label) => {
          const l = [...el.querySelectorAll('div')].find(d => d.children.length === 0 && d.textContent.trim() === label)
          const v = l?.nextElementSibling
          return l ? { value: v?.textContent.trim(), sub: v?.nextElementSibling?.textContent.trim() } : null
        }
        return {
          text: el.textContent,
          current: card('CURRENT'), change: card('CHANGE'), entries: card('ENTRIES'),
          tableRows: el.querySelectorAll('tbody tr').length,
          chartSource: window._weightAllLogs ? window._weightAllLogs.length : null,
          wantNewest: fmtWeight(NEWEST_KG, { spaced: true }),
          wantTie: fmtWeight(71, { spaced: true }),
        }
      }, { NEWEST_KG }))

  test('CLIENT weight tab: with 250 weigh-ins "Current" is the newest one and the chart reaches it — and another client\'s rows stay out', async ({ page }) => {
    await loginAsClient(page)
    const r = await clientTab(page, rows())
    expect.soft(r.current, `Current must be the newest weigh-in (${r.wantNewest}), not the 200th-oldest (${r.wantStale})`).toBe(r.wantNewest)
    expect.soft(r.chartPoints, 'the chart plots every one of THIS client\'s weigh-ins and nobody else\'s').toBe(N)
    expect(r.chartLast, 'and the last point on it is the newest').toBe(r.wantChartLast)
  })

  test('SOLO weight tab: the same, run as a solo account (its only weight-entry surface)', async ({ page }) => {
    await loginAsPT(page)
    const r = await clientTab(page, rows(), { solo: true })
    expect.soft(r.current).toBe(r.wantNewest)
    expect(r.chartPoints).toBe(N)
  })

  test('COACH weight tab: ENTRIES says 250, "since" is the first ever entry, every row is listed, nobody else\'s rows are', async ({ page }) => {
    await loginAsPT(page)
    const all = rows()
    const r = await coachTab(page, all)
    expect.soft(r.entries.value, 'ENTRIES is the true count').toBe(String(N))
    expect.soft(r.change.sub, 'the change is measured from the first ever entry').toBe(`${mine()[0].date} → now`)
    expect.soft(r.tableRows, 'every entry is in the table').toBe(N)
    expect.soft(r.chartSource, 'and in the data the chart is built from').toBe(N)
    expect(r.current.value, 'CURRENT is the newest weigh-in (this half was already right)').toBe(r.wantNewest)
  })

  test('the two tabs agree, and both show the newest weigh-in', async ({ page }) => {
    await loginAsPT(page)
    const me = await page.evaluate(() => currentUser.id)
    const both = await withApi(page, { clients: [{ id: 'cid', user_id: me, coach_id: 'c', starting_weight_kg: null, goal_weight_kg: null }], weight_logs: rows() }, () =>
      page.evaluate(async ({ NEWEST_KG }) => {
        const a = document.createElement('div'); document.body.appendChild(a)
        const b = document.createElement('div'); document.body.appendChild(b)
        await renderProgressWeight(a)
        await renderClientWeight('cid', b)
        const leaf = (el, label) => [...el.querySelectorAll('div')].find(d => d.children.length === 0 && d.textContent.trim() === label)
        return { client: leaf(a, 'Current')?.previousElementSibling?.textContent.trim(), coach: leaf(b, 'CURRENT')?.nextElementSibling?.textContent.trim(), want: fmtWeight(NEWEST_KG, { spaced: true }) }
      }, { NEWEST_KG }))
    expect(both.client, 'the client tab shows the newest').toBe(both.want)
    expect(both.coach, 'and so does the coach tab').toBe(both.want)
  })

  // Two weigh-ins on the SAME date: which one is "Current" must be the one logged later, not the one whose random
  // uuid sorts last. `weight_logs` has no unique (client, date) constraint, so this is reachable (a morning and an
  // evening weigh-in). Found by the review of the first version, which broke this tie by id alone.
  test('two weigh-ins on the same day: "Current" is the one logged LATER, on both tabs', async ({ page }) => {
    await loginAsPT(page)
    const me = await page.evaluate(() => currentUser.id)
    const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const mk = (id, created, kg) => ({ id, client_id: 'cid', date: day, weight_kg: kg, body_fat_pct: null, resting_hr: null, notes: null, created_at: `${day}T${created}:00:00Z` })
    // ids chosen so that sorting by id alone gives the WRONG answer on both tabs: the later-logged row has the smaller id.
    const table = [...weightRows(30, 'cid', { start: START }), mk('zz-logged-first', '08', 70), mk('aa-logged-second', '20', 71)]
    const c = await withApi(page, { clients: [{ id: 'cid', user_id: me, coach_id: 'c', starting_weight_kg: null, goal_weight_kg: null }], weight_logs: table }, () =>
      page.evaluate(async () => {
        const a = document.createElement('div'); document.body.appendChild(a)
        const b = document.createElement('div'); document.body.appendChild(b)
        await renderProgressWeight(a)
        await renderClientWeight('cid', b)
        const leaf = (el, label) => [...el.querySelectorAll('div')].find(d => d.children.length === 0 && d.textContent.trim() === label)
        // The coach tab always formats to one decimal ("71.0 kg"); the client tab does not ("71 kg").
        return { client: leaf(a, 'Current')?.previousElementSibling?.textContent.trim(), coach: leaf(b, 'CURRENT')?.nextElementSibling?.textContent.trim(),
                 wantClient: fmtWeight(71, { spaced: true }), wantCoach: fmtWeight(71, { spaced: true, decimals: 1 }) }
      }))
    expect.soft(c.client, 'client tab').toBe(c.wantClient)
    expect(c.coach, 'coach tab').toBe(c.wantCoach)
  })

  test('MIRROR: a small history (30 entries) is still ONE request per tab, not a page-by-page crawl', async ({ page }) => {
    await loginAsPT(page)
    const me = await page.evaluate(() => currentUser.id)
    const small = weightRows(30, 'cid', { start: START })
    await withApi(page, { clients: [{ id: 'cid', user_id: me, coach_id: 'c', starting_weight_kg: null, goal_weight_kg: null }], weight_logs: small }, async () => {
      await page.evaluate(async () => { const a = document.createElement('div'); document.body.appendChild(a); await renderProgressWeight(a) })
      await page.evaluate(async () => { const b = document.createElement('div'); document.body.appendChild(b); await renderClientWeight('cid', b) })
      const w = (await cappedApiCalls(page)).filter(c => c.table === 'weight_logs')
      expect(w.map(c => c.returned), 'one request each, both returning all 30').toEqual([30, 30])
    })
  })

  test('MIRROR: an empty history still shows the empty state; a failed load says so, and the person can still log a weight or retry', async ({ page }) => {
    await loginAsClient(page)
    const empty = await clientTab(page, [])
    expect(empty.text).toContain('No weight logs yet')
    const failed = await clientTab(page, { error: { code: 'XX000', message: 'boom' } })
    expect.soft(failed.text, 'a failed load must not read as "you have no data" — that invites re-entering it').not.toContain('No weight logs yet')
    expect.soft(failed.text).toContain('Error loading weight data')
    // For a solo account this is the ONLY place to log a weight, so a transient failure must not remove it.
    expect.soft(failed.hasLogButton, 'the + Log weight button survives a failed load').toBe(true)
    expect(failed.hasRetry, 'and there is a way to try again').toBe(true)
  })

  test('a failed read of the client record (the goals editor\'s source) is an error, not a blank editor that "Save goals" would overwrite', async ({ page }) => {
    await loginAsPT(page)
    const failing = { error: { code: 'XX000', message: 'boom' } }
    const soloTab = await clientTab(page, mine(), { solo: true, clients: failing })
    expect.soft(soloTab.text, 'client/solo tab').toContain('Error loading weight data')
    const coach = await coachTab(page, mine(), { clients: failing })
    expect(coach.text, 'coach tab').toContain('Error loading weight data')
  })

  // ── the data export ────────────────────────────────────────────────────────────────────────────────────
  // Health tables are read by client id; the coach block by coach id. Every row carries text in whichever column the
  // export selects, unique per row, and every row TIES on the date/created_at columns — so a page boundary that lands
  // among ties is only exact when the read ends its order in the unique `id`.
  const HEALTH = {
    weight_logs: 'weightLogs', workout_logs: 'workoutLogs', performance_logs: 'performanceLogs', goals: 'goals',
    events: 'events', client_1rms: 'oneRepMaxes', client_check_ins: 'checkIns',
  }
  const COACH = { clients: 'clients', workout_templates: 'workoutTemplates', programs: 'programs' }
  const TEXT = (i, tag) => ({ notes: tag + i, name: tag + i, title: tag + i, exercise_name: tag + i, full_name: tag + i, email: null })
  const TIES = { date: '2025-01-01', created_at: '2025-01-01', recorded_at: '2025-01-01', target_date: '2025-01-01' }
  const foreignOf = (extra) => fixtureRows(3, (i) => ({ ...TEXT(i, 'FOREIGN'), ...TIES, ...extra })).map(r => ({ ...r, id: 'foreign-' + r.id }))
  const exportTables = (me, n, over = {}) => ({
    profiles: [{ id: me, full_name: 'x', role: 'coach', created_at: '2026-01-01', consented_at: null, consent_policy_version: null }],
    app_errors: [],
    // coach block: `n` clients owned by this coach (one of them is also this user's own record, which is where the health
    // tables' client ids come from), plus another coach's
    clients: [
      { id: 'cid', user_id: me, coach_id: me, ...TEXT(0, 'u'), ...TIES },
      ...fixtureRows(n - 1, (i) => ({ user_id: null, coach_id: me, ...TEXT(i + 1, 'u'), ...TIES })).map(r => ({ ...r, id: 'c-' + r.id })),
      ...foreignOf({ user_id: null, coach_id: 'other-coach' }),
    ],
    workout_templates: [...fixtureRows(n, (i) => ({ coach_id: me, ...TEXT(i, 'u'), ...TIES })), ...foreignOf({ coach_id: 'other-coach' })],
    programs: [...fixtureRows(n, (i) => ({ coach_id: me, ...TEXT(i, 'u'), ...TIES })), ...foreignOf({ coach_id: 'other-coach' })],
    ...Object.fromEntries(Object.keys(HEALTH).map(t => [t, [...fixtureRows(n, (i) => ({ client_id: 'cid', ...TEXT(i, 'u'), ...TIES })), ...foreignOf({ client_id: 'other-client' })]])),
    ...over,
  })
  const buildBundle = (page) => page.evaluate(async () => {
    const b = await _buildMyDataBundle()
    const keys = ['weightLogs', 'workoutLogs', 'performanceLogs', 'goals', 'events', 'oneRepMaxes', 'checkIns', 'clients', 'workoutTemplates', 'programs']
    return {
      foreign: JSON.stringify(b).includes('FOREIGN'),
      byKey: Object.fromEntries(keys.map(k => [k, { n: b[k] ? b[k].length : null, distinct: b[k] ? new Set(b[k].map(r => JSON.stringify(r))).size : null }])),
    }
  })

  test('the export carries EVERY row of each of its ten tables — exactly once, and none of another tenant\'s', async ({ page }) => {
    await loginAsPT(page)
    const me = await page.evaluate(() => currentUser.id)
    const b = await withApi(page, exportTables(me, 230), () => buildBundle(page))
    for (const key of [...Object.values(HEALTH), ...Object.values(COACH)]) {
      expect.soft(b.byKey[key].n, `${key}: 230 rows in the database, so 230 in the export`).toBe(230)
      expect.soft(b.byKey[key].distinct, `${key}: each of them exactly once (a page boundary among ties must not repeat or skip)`).toBe(230)
    }
    expect(b.foreign, 'no row belonging to another client, coach or user is in the export').toBe(false)
  })

  test('the export refuses to report success when ANY read fails — every table and the profile — and says which failure it was', async ({ page }) => {
    await loginAsPT(page)
    const me = await page.evaluate(() => currentUser.id)
    for (const table of [...Object.keys(HEALTH), ...Object.keys(COACH), 'profiles']) {
      const r = await withApi(page, exportTables(me, 5, { [table]: { error: { code: 'XX000', message: 'boom' } } }), () =>
        page.evaluate(async () => { try { await _buildMyDataBundle(); return 'resolved' } catch (e) { return 'rejected:' + (e && e.code) } }))
      expect.soft(r, `${table} failing must fail the export (downloadMyData then shows "Export failed"), not produce a bundle with a hole in it`).toBe('rejected:XX000')
    }
  })

  test('the user\'s own error reports (app_errors) page the same way, exclude other users\', and a missing table still just yields an empty list', async ({ page }) => {
    await loginAsPT(page)
    const me = await page.evaluate(() => currentUser.id)
    const reports = [
      ...fixtureRows(237, (i) => ({ user_id: me, created_at: '2026-01-01T00:00:00Z', kind: 'log', tag: 'row-' + i })),
      ...fixtureRows(3, (i) => ({ user_id: 'someone-else', created_at: '2026-01-01T00:00:00Z', kind: 'log', tag: 'FOREIGN' + i })).map(r => ({ ...r, id: 'foreign-' + r.id })),
    ]
    const many = await withApi(page, exportTables(me, 1, { app_errors: reports }), () =>
      page.evaluate(async () => { const b = await _buildMyDataBundle(); return { n: b.appErrors.length, distinct: new Set(b.appErrors.map(r => r.tag)).size, last: b.appErrors.at(-1)?.tag, foreign: JSON.stringify(b.appErrors).includes('FOREIGN') } }))
    expect([many.n, many.distinct, many.foreign], '237 of the user\'s own, each once, none of anyone else\'s').toEqual([237, 237, false])
    const missing = await withApi(page, exportTables(me, 1, { app_errors: { error: { code: 'PGRST205', message: 'no table' } } }), () =>
      page.evaluate(async () => (await _buildMyDataBundle()).appErrors))
    expect(missing, 'the table not existing yet must not break the export for anyone').toEqual([])
    const broken = await withApi(page, exportTables(me, 1, { app_errors: { error: { code: 'XX000', message: 'boom' } } }), () =>
      page.evaluate(async () => { try { await _buildMyDataBundle(); return 'resolved' } catch (e) { return 'rejected:' + (e && e.code) } }))
    expect(broken, 'any other failure still throws').toBe('rejected:XX000')
  })

  // ── personal bests ─────────────────────────────────────────────────────────────────────────────────────
  // 50 OLD deadlifts at 200 kg, then 200 NEWER squats at 100 kg: the newest 200 rows are all squats, so a capped
  // read never sees the deadlift at all — the tile would say "Squat" and nothing else, and the record vanishes.
  // Another client's rows (a bigger lift, dated newest) must never appear on any of these screens.
  const perfRows = () => [
    ...fixtureRows(50, (i) => ({ client_id: 'cid', name: 'Cap Deadlift', category: 'strength', value: 200, unit: 'kg', date: `2024-01-${String(1 + (i % 28)).padStart(2, '0')}` })),
    ...fixtureRows(200, (i) => ({ client_id: 'cid', name: 'Cap Squat', category: 'strength', value: 100, unit: 'kg', date: `2025-03-${String(1 + (i % 28)).padStart(2, '0')}` })),
  ].map((r, i) => ({ ...r, id: 'p-' + String(i).padStart(4, '0') }))
  const foreignPerf = () => fixtureRows(3, (i) => ({ client_id: 'other-client', name: 'FOREIGN Lift', category: 'strength', value: 999, unit: 'kg', date: '2030-01-01' })).map(r => ({ ...r, id: 'foreign-' + r.id }))

  const dashTables = (me, over = {}) => ({
    clients: [{ id: 'cid', user_id: me, coach_id: 'some-coach', full_name: '[E2E-CAP] Client' }],
    goals: [], events: [], weight_logs: [], client_programs: [], workout_logs: [], client_check_ins: [], client_program_workouts: [],
    performance_logs: [...perfRows(), ...foreignPerf()],
    ...over,
  })

  test('CLIENT dashboard "Personal bests": a record older than the newest 200 entries is still shown, another client\'s never is', async ({ page }) => {
    await loginAsClient(page)
    const me = await page.evaluate(() => currentUser.id)
    const text = await withApi(page, dashTables(me), () => page.evaluate(async () => {
      const el = document.createElement('div'); document.body.appendChild(el)
      await renderClientDashboard(el)
      return el.textContent
    }))
    expect.soft(text, 'the recent exercise is there either way').toContain('Cap Squat')
    expect.soft(text, 'nobody else\'s record').not.toContain('FOREIGN')
    expect(text, 'the OLD record must not vanish because 200 newer rows pushed it out of the window').toContain('Cap Deadlift')
  })

  test('SOLO dashboard "Personal bests": the same', async ({ page }) => {
    await loginAsPT(page)
    const me = await page.evaluate(() => currentUser.id)
    const text = await withApi(page, dashTables(me), () => page.evaluate(async () => {
      const prev = window._soloClientId
      window._soloClientId = 'cid'
      try {
        const el = document.createElement('div'); document.body.appendChild(el)
        await renderSoloDashboard(el)
        return el.textContent
      } finally { window._soloClientId = prev }
    }))
    expect.soft(text).toContain('Cap Squat')
    expect.soft(text).not.toContain('FOREIGN')
    expect(text).toContain('Cap Deadlift')
  })

  test('COACH Performance tab: every record is listed, the category count is the true count, another client\'s never is', async ({ page }) => {
    await loginAsPT(page)
    const r = await withApi(page, { performance_logs: [...perfRows(), ...foreignPerf()] }, () => page.evaluate(async () => {
      const el = document.createElement('div'); document.body.appendChild(el)
      await renderClientPerformance('cid', el)
      return { text: el.textContent }
    }))
    expect.soft(r.text, 'the old deadlift record must be on the tab').toContain('Cap Deadlift')
    expect.soft(r.text, 'the category count is the true count (50 + 200)').toContain('250 records')
    expect.soft(r.text, 'nobody else\'s record').not.toContain('FOREIGN')
    expect(r.text, 'and the deadlift group has all 50 of its entries').toContain('50 entries')
  })

  test('MIRROR: a small performance history still costs one request per screen', async ({ page }) => {
    await loginAsPT(page)
    const small = perfRows().slice(0, 20)
    await withApi(page, { performance_logs: small }, async () => {
      await page.evaluate(async () => { const el = document.createElement('div'); document.body.appendChild(el); await renderClientPerformance('cid', el) })
      const calls = (await cappedApiCalls(page)).filter(c => c.table === 'performance_logs')
      expect(calls.map(c => c.returned)).toEqual([20])
    })
  })

  // ── the paging helper itself ───────────────────────────────────────────────────────────────────────────
  test('_fetchAllRows returns exactly the rows there are, in order, without duplicates, in the fewest requests — at every boundary', async ({ page }) => {
    await loginAsPT(page)
    const results = {}
    for (const n of [0, 1, 199, 200, 201, 400, 401]) {
      results[n] = await withApi(page, { things: fixtureRows(n, () => ({})) }, async () => {
        const r = await page.evaluate(async () => {
          const { data, error } = await _fetchAllRows(() => db.from('things').select('id', { count: 'exact' }).order('id'))
          return { error, ids: data ? data.map(d => d.id) : null }
        })
        const calls = (await cappedApiCalls(page)).length
        return { ...r, calls }
      })
    }
    for (const n of [0, 1, 199, 200, 201, 400, 401]) {
      const r = results[n]
      expect.soft(r.error, `${n} rows: no error`).toBeNull()
      expect.soft(r.ids, `${n} rows: all of them, in order, once each`).toEqual(Array.from({ length: n }, (_, i) => 'row-' + String(i).padStart(6, '0')))
      expect.soft(r.calls, `${n} rows: the count lets it stop without a wasted empty request`).toBe(Math.max(1, Math.ceil(n / 200)))
    }
  })

  test('_fetchAllRows still terminates and is complete when the caller forgot the count, and when the API cap is SMALLER than the page', async ({ page }) => {
    await loginAsPT(page)
    const noCount = await withApi(page, { things: fixtureRows(400, () => ({})) }, async () => {
      const r = await page.evaluate(async () => { const { data, error } = await _fetchAllRows(() => db.from('things').select('id').order('id')); return { n: data?.length, error } })
      return { ...r, calls: (await cappedApiCalls(page)).length }
    })
    expect([noCount.n, noCount.error], 'no count requested: still all 400').toEqual([400, null])
    expect(noCount.calls, 'two full pages, then the empty one that ends it').toBe(3)

    await installCappedApi(page, { things: fixtureRows(250, () => ({})) }, { cap: 100 })
    try {
      const small = await page.evaluate(async () => { const { data, error } = await _fetchAllRows(() => db.from('things').select('id', { count: 'exact' }).order('id')); return { ids: data?.map(d => d.id), error } })
      expect(small.error).toBeNull()
      expect(small.ids, 'a cap of 100 under a page size of 200 must not skip rows 100-199').toEqual(Array.from({ length: 250 }, (_, i) => 'row-' + String(i).padStart(6, '0')))
    } finally { await restoreCappedApi(page) }
  })

  test('_fetchAllRows returns the error — not the rows read so far — when a later page fails, and gives up rather than truncate silently', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      let calls = 0
      const failing = await _fetchAllRows(() => ({ range: async (a) => { calls++; return calls === 2 ? { data: null, error: { code: 'XX000' }, count: null } : { data: Array.from({ length: 200 }, (_, i) => ({ id: a + i })), error: null, count: 450 } } }))
      const endless = await _fetchAllRows(() => ({ range: async (a) => ({ data: [{ id: a }], error: null, count: null }) }), { maxPages: 3 })
      return { failing, endless }
    })
    expect(r.failing.data, 'a partial result must never look like a whole one').toBeNull()
    expect(r.failing.error.code).toBe('XX000')
    expect(r.endless.data, 'hitting the page limit is an error, not a quiet truncation').toBeNull()
    expect(r.endless.error).toBeTruthy()
  })
})
