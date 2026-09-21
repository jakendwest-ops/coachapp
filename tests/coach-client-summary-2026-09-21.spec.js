const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsPT2, loginAsClient } = require('./helpers')

// ─── coach_client_summary against the LIVE API, with real accounts (R2b, 2026-09-21) ─────────────────────────
//
// The view was verified on real Postgres before Jake ran it (scripts/sql-verify — 47 checks and nine deliberate breakages),
// and the two screens that read it are tested against a capped stand-in (coach-summary-screens-2026-09-21.spec.js). This is
// the third leg: the view AS DEPLOYED, reached through the real API by the kinds of caller that matter.
//   - the owning coach reads the numbers the database computes, for the clients that are theirs and no others;
//   - another coach, a client account and an anonymous caller get NOTHING — the view is `security_invoker`, so the base
//     tables' RLS applies to the caller, and it carries its own `coach_id = auth.uid()` filter as a second wall;
//   - the coach's OWN solo record (coach_id NULL) is not in it;
//   - nobody can write through it.
// Each test owns every row it needs (tag [E2E-SUM]): plant as the coach, probe as each caller, remove in `finally` with the
// row counts checked. Coach, other coach and client each get their OWN browser context — loginAs* drives the login form, which
// only exists when signed out, so re-logging-in on one page cannot work and a failed login must not be able to skip cleanup.
//
// What this cannot see: a later `create or replace view` that drops `security_invoker`. The view's own filter and the revoke
// would still satisfy every leg above, so only the migration's own read-back (reloptions) and the local verifier watch that.
test.describe('coach_client_summary against the live API', () => {
  const TAG = '[E2E-SUM]'

  // Children first. Returns what it removed — and any error, rather than throwing, because it runs in `finally` and a throw
  // there would replace the failure that actually matters. Scoped to the signed-in coach's own tagged clients.
  const sweep = (page) => page.evaluate(async (TAG) => {
    const errors = []
    const { data: cs, error: e0 } = await db.from('clients').select('id').eq('coach_id', currentUser.id).like('full_name', TAG + '%')
    if (e0) return { logs: 0, weights: 0, clients: 0, errors: ['select: ' + e0.message] }
    const ids = (cs || []).map(c => c.id)
    if (!ids.length) return { logs: 0, weights: 0, clients: 0, errors }
    const del = async (table, col) => {
      const { data, error } = await db.from(table).delete().in(col, ids).select('id')
      if (error) errors.push(table + ': ' + error.message)
      return (data || []).length
    }
    const logs = await del('workout_logs', 'client_id')
    const weights = await del('weight_logs', 'client_id')
    const clients = await del('clients', 'id')
    return { logs, weights, clients, errors }
  }, TAG)

  // Plants ONE tagged client of the signed-in coach, with the given sessions (days ago) and weigh-in (days ago).
  const plant = (page, { name, status, sessionsDaysAgo, weighInDaysAgo }) => page.evaluate(async ({ TAG, name, status, sessionsDaysAgo, weighInDaysAgo }) => {
    const now = Date.now()   // read ONCE: every date below is computed from the same instant
    const day = (n) => new Date(now - n * 864e5).toISOString().slice(0, 10)
    const { data: c, error: ce } = await db.from('clients').insert({ coach_id: currentUser.id, full_name: TAG + ' ' + name, ...(status ? { status } : {}) }).select('id').single()
    if (ce) return { fatal: 'client insert: ' + ce.message }
    if (sessionsDaysAgo.length) {
      const { error } = await db.from('workout_logs').insert(sessionsDaysAgo.map((n, i) => ({ coach_id: currentUser.id, client_id: c.id, name: TAG + ' log ' + i, date: day(n) })))
      if (error) return { fatal: 'log insert: ' + error.message, id: c.id }
    }
    if (weighInDaysAgo != null) {
      const { error } = await db.from('weight_logs').insert({ client_id: c.id, date: day(weighInDaysAgo), weight_kg: 80 })
      if (error) return { fatal: 'weigh-in insert: ' + error.message, id: c.id }
    }
    return { id: c.id, day: { d1: day(1), d3: day(3) } }
  }, { TAG, name, status, sessionsDaysAgo, weighInDaysAgo })

  // A crashed earlier run must not leave rows that skew what follows; and a failure to clear them is itself a failure.
  const preClean = async (page) => expect((await sweep(page)).errors, 'clearing leftovers from an earlier run').toEqual([])

  test('the owning coach reads the numbers the database computes — for their own clients, inactive ones included, and no others', async ({ page }) => {
    await loginAsPT(page)
    await preClean(page)
    let cleaned
    try {
      const a = await plant(page, { name: 'Active', sessionsDaysAgo: [1, 10, 40], weighInDaysAgo: 3 })
      const b = await plant(page, { name: 'Inactive', status: 'inactive', sessionsDaysAgo: [2, 5] })
      expect(a.fatal, 'planting the active fixture').toBeUndefined()
      expect(b.fatal, 'planting the inactive fixture').toBeUndefined()

      const r = await page.evaluate(async ({ a, b }) => {
        const one = async (id) => { const { data, error } = await db.from('coach_client_summary').select('*').eq('client_id', id); return { rows: data, error: error?.message || null } }
        // Every row the view gives this coach, paged the way the screens read it, against every client they have (also paged).
        const all = await _fetchAllRows(() => db.from('coach_client_summary').select('client_id', { count: 'exact' }).order('full_name').order('client_id'))
        const mine = await _fetchAllRows(() => db.from('clients').select('id, status', { count: 'exact' }).eq('coach_id', currentUser.id).order('full_name').order('id'))
        return { a: await one(a.id), b: await one(b.id), viewIds: (all.data || []).map(x => x.client_id), viewErr: all.error?.message || null, mineIds: (mine.data || []).map(x => x.id), mineErr: mine.error?.message || null }
      }, { a, b })

      // The active client: sessions 1, 10 and 40 days ago; a weigh-in 3 days ago.
      expect(r.a.error).toBeNull()
      expect(r.a.rows, 'one row for the client').toHaveLength(1)
      const row = r.a.rows[0]
      expect(Object.keys(row), 'the columns the two screens read are all there').toEqual(expect.arrayContaining(['client_id', 'full_name', 'status', 'last_session_date', 'sessions_7d', 'sessions_28d', 'last_weigh_in_date']))
      expect.soft(row.full_name).toBe(TAG + ' Active')
      expect.soft(row.last_session_date, 'the newest log').toBe(a.day.d1)
      expect.soft(row.sessions_7d, 'only the log from yesterday is inside the last week').toBe(1)
      expect.soft(row.sessions_28d, 'yesterday and 10 days ago are inside 28 days; 40 days ago is not').toBe(2)
      expect.soft(row.last_weigh_in_date).toBe(a.day.d3)
      expect.soft(typeof row.sessions_7d, 'a count arrives as a number, which is what the dashboard adds up').toBe('number')

      // The inactive client is in the view, with its own count: the dashboard's "Sessions this week" tile has always
      // counted every client's sessions, active or not, so the view must not filter them out.
      expect(r.b.error).toBeNull()
      expect(r.b.rows, 'one row for the inactive client').toHaveLength(1)
      expect.soft(r.b.rows[0].status).toBe('inactive')
      expect.soft(r.b.rows[0].sessions_7d).toBe(2)
      expect.soft(r.b.rows[0].last_weigh_in_date, 'no weigh-in, no date').toBeNull()

      // The view gives this coach exactly their own clients: none of another coach's, none missing.
      expect(r.viewErr).toBeNull()
      expect(r.mineErr).toBeNull()
      expect.soft(new Set(r.viewIds).size, 'no client appears twice').toBe(r.viewIds.length)
      expect.soft([...r.viewIds].sort(), 'the same set of clients as the coach\'s own client list').toEqual([...r.mineIds].sort())
    } finally {
      cleaned = await sweep(page)
    }
    expect(cleaned, 'the cleanup removed exactly what this test planted: 5 logs, 1 weigh-in, 2 clients').toEqual({ logs: 5, weights: 1, clients: 2, errors: [] })
  })

  test('another coach, a client account and an anonymous caller see none of it', async ({ browser }) => {
    test.setTimeout(120000)
    const coachCtx = await browser.newContext()
    const otherCtx = await browser.newContext()
    const clientCtx = await browser.newContext()
    const coach = await coachCtx.newPage()
    const other = await otherCtx.newPage()
    const client = await clientCtx.newPage()
    let cleaned
    try {
      await loginAsPT(coach)
      await preClean(coach)
      const planted = await plant(coach, { name: 'Isolation', sessionsDaysAgo: [1] })
      expect(planted.fatal, 'planting the fixture, so the refusals below mean something').toBeUndefined()

      // CONTROL first: the owner can read it (the view exists and the fixture is visible to the one caller who should see it).
      const owner = await coach.evaluate(async (id) => (await db.from('coach_client_summary').select('client_id').eq('client_id', id)).data?.length, planted.id)
      expect(owner, 'control — the owning coach sees the fixture').toBe(1)

      // ── another coach ──
      await loginAsPT2(other)
      const o = await other.evaluate(async (id) => {
        const control = await db.from('clients').select('id', { count: 'exact', head: true })   // PT2 is signed in and can query at all
        const byId = await db.from('coach_client_summary').select('client_id').eq('client_id', id)
        const all = await _fetchAllRows(() => db.from('coach_client_summary').select('client_id', { count: 'exact' }).order('full_name').order('client_id'))
        const { count: theirs } = await db.from('clients').select('*', { count: 'exact', head: true }).eq('coach_id', currentUser.id)
        return { controlErr: control.error?.message || null, byIdErr: byId.error?.message || null, byId: byId.data, allErr: all.error?.message || null, allIds: (all.data || []).map(r => r.client_id), theirs }
      }, planted.id)
      expect.soft(o.controlErr, 'control — the other coach\'s session works').toBeNull()
      expect.soft([o.byIdErr, o.byId], 'asked for the fixture by id: an empty answer, not an error and not the row').toEqual([null, []])
      expect.soft(o.allErr).toBeNull()
      expect.soft(o.allIds, 'and the fixture is not in their whole view').not.toContain(planted.id)
      expect.soft(o.allIds.length, 'the other coach\'s view holds exactly their own clients').toBe(o.theirs)

      // ── a client account ──
      await loginAsClient(client)
      const k = await client.evaluate(async () => {
        const mine = await db.from('clients').select('id').eq('user_id', currentUser.id)    // control: a real client session with a record
        const all = await _fetchAllRows(() => db.from('coach_client_summary').select('client_id', { count: 'exact' }).order('client_id'))
        return { mineErr: mine.error?.message || null, mineRows: (mine.data || []).length, allErr: all.error?.message || null, all: all.data }
      })
      expect.soft(k.mineErr).toBeNull()
      expect.soft(k.mineRows, 'control — the client account is a real client with its own record').toBeGreaterThan(0)
      expect.soft([k.allErr, k.all], 'a client sees no rows of the coach view at all').toEqual([null, []])

      // ── an anonymous caller: a fresh client with no session ──
      const anon = await coach.evaluate(async () => {
        const c = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'anon-probe-summary' } })
        const { data: { session } } = await c.auth.getSession()
        const { data, error } = await c.from('coach_client_summary').select('client_id').limit(5)
        return { signedIn: !!session, data, code: error?.code || null, message: error?.message || null }
      })
      expect.soft(anon.signedIn, 'control — the probe really is anonymous (it did not pick up the coach session)').toBe(false)
      expect.soft(anon.data, 'anonymous gets no rows').toBeNull()
      expect.soft(anon.code, 'refused for lack of privilege (42501) — not "no such view", which would mean the probe proved nothing').toBe('42501')
    } finally {
      try { cleaned = await sweep(coach) } finally { await coachCtx.close(); await otherCtx.close(); await clientCtx.close() }
    }
    expect(cleaned, 'the cleanup removed exactly the 1 log and 1 client this test planted').toEqual({ logs: 1, weights: 0, clients: 1, errors: [] })
  })

  // The coach's own personal ("solo") record shares their user id but has NO coach: coach_id is NULL. `NULL = auth.uid()` is
  // not true, so the view must leave it out — the same shape as the four earlier bugs where a coach_id filter silently
  // dropped solo, here working in our favour. The account can READ the record (RLS shows it), so its absence is the view's doing.
  test('the coach\'s own solo record is not in the coach view', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const soloId = window._soloClientId
      if (!soloId) return { soloId: null }
      const own = await db.from('clients').select('id, coach_id').eq('id', soloId)
      const all = await _fetchAllRows(() => db.from('coach_client_summary').select('client_id', { count: 'exact' }).order('full_name').order('client_id'))
      return { soloId, ownErr: own.error?.message || null, own: own.data, allErr: all.error?.message || null, allIds: (all.data || []).map(x => x.client_id) }
    })
    test.skip(!r.soloId, 'this PT account has no solo client record — nothing to prove')
    expect(r.ownErr).toBeNull()
    expect(r.own, 'control — the account can read its own solo record').toHaveLength(1)
    expect(r.own[0].coach_id, 'and it has no coach').toBeNull()
    expect(r.allErr).toBeNull()
    expect(r.allIds, 'yet it is not in the coach view').not.toContain(r.soloId)
  })

  test('nobody can write through the view', async ({ page }) => {
    await loginAsPT(page)
    await preClean(page)
    let cleaned
    try {
      const p = await plant(page, { name: 'No writes', sessionsDaysAgo: [1] })
      expect(p.fatal, 'planting the fixture').toBeUndefined()
      const r = await page.evaluate(async ({ id, TAG }) => {
        const code = (res) => (res.error ? (res.error.code || res.error.message) : null)
        // CONTROL: the view exists and the fixture is in it — a missing view would also "refuse" every write below.
        const control = await db.from('coach_client_summary').select('client_id').eq('client_id', id)
        const ins = await db.from('coach_client_summary').insert({ client_id: id, full_name: TAG + ' written through the view' })
        const upd = await db.from('coach_client_summary').update({ full_name: TAG + ' renamed through the view' }).eq('client_id', id).select()
        const del = await db.from('coach_client_summary').delete().eq('client_id', id).select()
        const after = await db.from('clients').select('full_name').eq('id', id)
        return { control: control.data?.length ?? null, controlErr: control.error?.message || null, ins: code(ins), upd: code(upd), del: code(del), name: after.data?.[0]?.full_name ?? null }
      }, { id: p.id, TAG })
      expect(r.controlErr).toBeNull()
      expect(r.control, 'control — the view exists and holds the fixture').toBe(1)
      // MEASURED 2026-09-21: 55000 ("cannot insert into / update / delete from view"). The view joins and aggregates, so it is not
      // auto-updatable and PostgreSQL refuses BEFORE it consults privileges. That the role also holds no write grant is what the
      // local verifier and the migration's own read-back check; this proves the outcome a caller actually gets.
      expect.soft(r.ins, 'insert refused: the view is not updatable').toBe('55000')
      expect.soft(r.upd, 'update refused: the view is not updatable').toBe('55000')
      expect.soft(r.del, 'delete refused: the view is not updatable').toBe('55000')
      expect(r.name, 'and the client record underneath is untouched').toBe(TAG + ' No writes')
    } finally {
      cleaned = await sweep(page)
    }
    expect(cleaned, 'the cleanup removed exactly the 1 log and 1 client this test planted').toEqual({ logs: 1, weights: 0, clients: 1, errors: [] })
  })
})
