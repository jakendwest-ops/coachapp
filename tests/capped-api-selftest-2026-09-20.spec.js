const { test, expect } = require('./fixtures')
const { installCappedApi, restoreCappedApi, cappedApiCalls, fixtureRows, weightRows } = require('./capped-api')

// ─── The capped-API stand-in must itself be shown to bite (R2a, 2026-09-20) ─────────────────────────────
//
// tests/capped-api.js exists to reproduce, in a test, the one thing a plain stub never does: the live API
// returns at most 200 rows per response and says nothing when it truncates. A helper like that is only worth
// having if it can be seen to FAIL — a stand-in that quietly returned every row would let every test built on
// it pass on nothing, which is exactly the situation it was written to end. So each behaviour it claims to
// copy from the live API is pinned here, and each way it promises to refuse is pinned as a refusal.
//
// No login and no network: a blank page with a fake `db` object, which the helper wraps exactly as it wraps
// the app's real one. The numbers in the comments are the live measurements the helper's header records.
test.describe('the capped-API stand-in', () => {
  const TABLES = { things: fixtureRows(300, (i) => ({ n: i, group: i % 3, tier: i < 150 ? 0 : 1 })), empty: [], broken: { error: { code: 'XX000', message: 'boom' } } }

  test.beforeEach(async ({ page }) => {
    await page.goto('about:blank')
    await page.evaluate(() => { window.db = { from: () => { throw new Error('the REAL db.from was called') } } })
    await installCappedApi(page, TABLES)
  })

  // Runs a query built inside the page; returns { data.length, count, error code, first/last id }.
  const ask = (page, build) => page.evaluate(async (src) => {
    const r = await new Function('db', 'return (' + src + ')')(db)
    return { n: r.data ? r.data.length : null, count: r.count, err: r.error ? r.error.code : null, first: r.data?.[0]?.id ?? null, last: r.data?.at?.(-1)?.id ?? null, data: r.data }
  }, build)

  test('the cap bites: 300 rows in, 200 out — with the true total reported alongside', async ({ page }) => {
    const r = await ask(page, "db.from('things').select('id', { count: 'exact' })")
    expect(r.n, 'a response is capped at 200 rows').toBe(200)
    expect(r.count, 'the count is the total, not the page').toBe(300)
    expect(r.err).toBeNull()
  })

  test('the cap ignores what the caller asks for — range(0, 999) and limit(1000) both still return 200', async ({ page }) => {
    expect((await ask(page, "db.from('things').select('id').range(0, 999)")).n).toBe(200)
    expect((await ask(page, "db.from('things').select('id').limit(1000)")).n).toBe(200)
  })

  test('paging works: the second page starts where the first ended, and the tail is short', async ({ page }) => {
    const p1 = await ask(page, "db.from('things').select('id').order('id').range(0, 199)")
    const p2 = await ask(page, "db.from('things').select('id').order('id').range(200, 399)")
    expect([p1.first, p1.last]).toEqual(['row-000000', 'row-000199'])
    expect([p2.n, p2.first, p2.last], 'only 100 rows remain').toEqual([100, 'row-000200', 'row-000299'])
  })

  test('range edges match the live API: at the end is empty and fine, past the end is PGRST103 only when a count was asked for', async ({ page }) => {
    const atEnd = await ask(page, "db.from('things').select('id', { count: 'exact' }).range(300, 499)")
    expect([atEnd.n, atEnd.count, atEnd.err], 'exactly at the end: OK, zero rows, the count').toEqual([0, 300, null])
    const past = await ask(page, "db.from('things').select('id', { count: 'exact' }).range(800, 999)")
    expect(past.err, 'past the end WITH a count is an error').toBe('PGRST103')
    const pastNoCount = await ask(page, "db.from('things').select('id').range(800, 999)")
    expect([pastNoCount.n, pastNoCount.err], 'past the end WITHOUT a count is just empty').toEqual([0, null])
    const emptyFirst = await ask(page, "db.from('empty').select('id', { count: 'exact' }).range(0, 199)")
    expect([emptyFirst.n, emptyFirst.count, emptyFirst.err], 'an empty set, first page: fine').toEqual([0, 0, null])
    const emptyLater = await ask(page, "db.from('empty').select('id', { count: 'exact' }).range(200, 399)")
    expect(emptyLater.err, 'an empty set, a later page with a count: PGRST103').toBe('PGRST103')
  })

  test('filters and ordering: eq / in / gte / lte, a descending order with an id tie-break, and Postgres NULL placement', async ({ page }) => {
    expect((await ask(page, "db.from('things').select('id', { count: 'exact' }).eq('group', 1)")).count).toBe(100)
    expect((await ask(page, "db.from('things').select('id', { count: 'exact' }).in('group', [0, 2])")).count).toBe(200)
    expect((await ask(page, "db.from('things').select('id', { count: 'exact' }).gte('n', 250).lte('n', 259)")).count).toBe(10)
    const desc = await ask(page, "db.from('things').select('id').order('group', { ascending: false }).order('id', { ascending: false }).limit(2)")
    expect(desc.data.map(d => d.id), 'group 2 first, highest id first within it').toEqual(['row-000299', 'row-000296'])
    // NULLs: ASC last, DESC first
    await restoreCappedApi(page)
    await installCappedApi(page, { nulls: [{ id: 'a', v: 2 }, { id: 'b', v: null }, { id: 'c', v: 1 }] })
    expect((await ask(page, "db.from('nulls').select('id').order('v')")).data.map(d => d.id)).toEqual(['c', 'a', 'b'])
    expect((await ask(page, "db.from('nulls').select('id').order('v', { ascending: false })")).data.map(d => d.id)).toEqual(['b', 'a', 'c'])
  })

  test('rows that TIE on the sort key come back in a different order each request, so a paged read with no unique tie-break is caught', async ({ page }) => {
    // Rows 150-299 share tier 1, so the page boundary at row 200 falls INSIDE a run of ties: with an unstable order the
    // second page repeats rows the first already returned and skips others. Adding the unique `id` makes them exact.
    const pages = async (order) => {
      const a = await ask(page, `db.from('things').select('id')${order}.range(0, 199)`)
      const b = await ask(page, `db.from('things').select('id')${order}.range(200, 399)`)
      return [...a.data, ...b.data].map(d => d.id)
    }
    const ties = await pages(".order('tier')")
    expect(new Set(ties).size, 'a tying order pages into duplicates and gaps').toBeLessThan(300)
    const unique = await pages(".order('tier').order('id')")
    expect(new Set(unique).size, 'a unique tie-break pages exactly').toBe(300)
  })

  test('dotted filter paths resolve through to-one embeds; a row whose path does not resolve is excluded, like PostgREST !inner', async ({ page }) => {
    await restoreCappedApi(page)
    await installCappedApi(page, { sets: [
      { id: 's1', w: 100, ex: { name: 'A', log: { client_id: 'c1' } } },
      { id: 's2', w: 120, ex: { name: 'A', log: { client_id: 'c2' } } },
      { id: 's3', w: 90,  ex: { name: 'B', log: { client_id: 'c1' } } },
      { id: 's4', w: 80 },
    ] })
    const ids = async (q) => (await ask(page, q)).data.map(d => d.id)
    const INNER = "id, ex!inner(name, log!inner(client_id))"
    expect(await ids(`db.from('sets').select('${INNER}').eq('ex.log.client_id', 'c1').eq('ex.name', 'A')`), 'both levels must match').toEqual(['s1'])
    expect(await ids(`db.from('sets').select('${INNER}').eq('ex.log.client_id', 'c1').order('w', { ascending: false }).limit(1)`), 'the heaviest of that client\'s rows, not of the table').toEqual(['s1'])
    expect(await ids(`db.from('sets').select('${INNER}').eq('ex.log.client_id', 'nobody')`), 'no match').toEqual([])
    expect((await ask(page, `db.from('sets').select('${INNER}', { count: 'exact' }).eq('ex.name', 'A')`)).count, 's4 has no embed at all, so it never matches').toBe(2)
  })

  test('WITHOUT !inner a dotted filter excludes nothing — PostgREST filters only the embedded rows and the parent stays', async ({ page }) => {
    await restoreCappedApi(page)
    await installCappedApi(page, { sets: [
      { id: 's1', ex: { log: { client_id: 'c1' } } },
      { id: 's2', ex: { log: { client_id: 'c2' } } },
    ] })
    const ids = async (q) => (await ask(page, q)).data.map(d => d.id).sort()
    expect(await ids("db.from('sets').select('id, ex!inner(log!inner(client_id))').eq('ex.log.client_id', 'c1')"), 'inner at both levels: the other client is excluded').toEqual(['s1'])
    expect(await ids("db.from('sets').select('id, ex!inner(log(client_id))').eq('ex.log.client_id', 'c1')"), 'inner missing at the second level: the parent stays').toEqual(['s1', 's2'])
    expect(await ids("db.from('sets').select('id, ex(log!inner(client_id))').eq('ex.log.client_id', 'c1')"), 'inner missing at the first level: the parent stays').toEqual(['s1', 's2'])
    expect(await ids("db.from('sets').select('id, ex(log(client_id))').eq('ex.log.client_id', 'c1')"), 'no inner at all: the parent stays').toEqual(['s1', 's2'])
  })

  test('a filter path that crosses a to-many embed throws rather than guess', async ({ page }) => {
    await restoreCappedApi(page)
    await installCappedApi(page, { t: [{ id: 'x', kids: [{ a: 1 }] }] })
    const msg = await page.evaluate(async () => { try { await db.from('t').select('id, kids!inner(a)').eq('kids.a', 1); return null } catch (e) { return String(e.message) } })
    expect(msg).toMatch(/crosses a to-many embed/)
  })

  test('unordered: "insertion" hands an order-less read back oldest-first (so a cap drops the NEWEST rows); the default shuffles it', async ({ page }) => {
    const idsOf = async () => (await ask(page, "db.from('things').select('id')")).data.map(d => d.id)
    const shuffled = await idsOf()
    expect(shuffled.some(id => id > 'row-000199'), 'default: an unordered read is not fixture order, so rows past 199 can be returned').toBe(true)
    await restoreCappedApi(page)
    await installCappedApi(page, TABLES, { unordered: 'insertion' })
    const natural = await idsOf()
    expect([natural[0], natural.at(-1), natural.length], 'insertion: the first 200 rows in fixture order, the newest 100 dropped').toEqual(['row-000000', 'row-000199', 200])
  })

  test('head: true returns NO rows but the count of everything that matched, like a HEAD request', async ({ page }) => {
    const r = await ask(page, "db.from('things').select('*', { count: 'exact', head: true }).eq('group', 1)")
    expect([r.data, r.count, r.err], 'no body, the filtered count').toEqual([null, 100, null])
    const noCount = await ask(page, "db.from('things').select('*', { head: true })")
    expect([noCount.data, noCount.count], 'head without a count: no rows and no count').toEqual([null, null])
    // Past the cap, and unaffected by a limit — both MEASURED on the live API (see the header of capped-api.js). "The rows
    // that would have come back" is at most 200 (or the limit); "everything that matched" is all 300.
    const all = await ask(page, "db.from('things').select('*', { count: 'exact', head: true })")
    expect([all.data, all.count], 'unfiltered: the whole table, not the 200 a GET would return').toEqual([null, 300])
    const limited = await ask(page, "db.from('things').select('*', { count: 'exact', head: true }).limit(5)")
    expect([limited.data, limited.count], 'a limit does not shrink a HEAD count').toEqual([null, 300])
  })

  test('projection is faithful for plain lists: an unselected column is absent, an existing-but-unset one is null', async ({ page }) => {
    await restoreCappedApi(page)
    await installCappedApi(page, { t: [{ id: 'x', a: 1, b: 2 }] })
    const r = await ask(page, "db.from('t').select('id, a, zzz')")
    expect(r.data[0]).toEqual({ id: 'x', a: 1, zzz: null })
  })

  test('single() and maybeSingle() follow PostgREST: exactly one, or PGRST116', async ({ page }) => {
    expect((await ask(page, "db.from('things').select('id').eq('n', 5).single()")).err).toBeNull()
    expect((await ask(page, "db.from('things').select('id').eq('n', 99999).single()")).err, 'zero rows').toBe('PGRST116')
    expect((await ask(page, "db.from('things').select('id').eq('n', 99999).maybeSingle()")).err, 'zero rows is fine for maybeSingle').toBeNull()
    expect((await ask(page, "db.from('things').select('id').eq('group', 1).maybeSingle()")).err, 'many rows').toBe('PGRST116')
  })

  test('a table given as an error answers every read with that error', async ({ page }) => {
    const r = await ask(page, "db.from('broken').select('id')")
    expect([r.n, r.err]).toEqual([null, 'XX000'])
  })

  test('it FAILS CLOSED: an unknown table, an unknown method, a write, and limit() with range() all throw', async ({ page }) => {
    const throws = (src) => page.evaluate((s) => { try { new Function('db', s)(db); return null } catch (e) { return String(e.message) } }, src)
    expect(await throws("db.from('nope')"), 'unknown table').toMatch(/was not given table "nope"/)
    expect(await throws("db.from('things').select('id').textSearch('a', 'b')"), 'unknown method').toMatch(/textSearch\(\) is not implemented/)
    // By name, not as a literal call: this spec touches no rows, and the fixture-tagging rule reads a literal
    // insert call as "creates rows it never tags". It is also stronger — all four writes, not one.
    for (const write of ['insert', 'update', 'upsert', 'delete']) {
      expect(await throws(`db.from('things')['${write}']({ id: 'x' })`), `a write (${write})`).toMatch(new RegExp(`${write}\\(\\) is not implemented`))
    }
    expect(await throws("db.from('things').select('id').limit(5).range(0, 4)"), 'limit then range').toMatch(/limit\(\) combined with range\(\)/)
    expect(await throws("db.from('things').select('id').range(0, 4).limit(5)"), 'range then limit').toMatch(/limit\(\) combined with range\(\)/)
    expect(await throws("db.from('things').select('id', { count: 'estimated' })"), 'a count mode other than exact').toMatch(/select\(\) options other than/)
    expect(await throws("db.from('things').select('id').not('n', 'eq', 5)"), 'not() other than is-null').toMatch(/not\(\) only supports/)
  })

  test('it records what was asked, so a test can assert on requests as well as results', async ({ page }) => {
    await ask(page, "db.from('things').select('id', { count: 'exact' }).order('id').range(0, 199)")
    const calls = await cappedApiCalls(page)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'things', count: true, range: { from: 0, to: 199 }, returned: 200, total: 300 })
    expect(calls[0].desc).toEqual(['select(id, count)', 'order(id)', 'range(0,199)'])
  })

  test('restoreCappedApi puts the real db.from back', async ({ page }) => {
    await restoreCappedApi(page)
    const msg = await page.evaluate(() => { try { db.from('things'); return 'no throw' } catch (e) { return e.message } })
    expect(msg).toBe('the REAL db.from was called')
  })

  test('the weightRows fixture: one per day, distinct weights, the newest the lightest', async () => {
    const rows = weightRows(250, 'cid')
    expect(rows).toHaveLength(250)
    expect(new Set(rows.map(r => r.weight_kg)).size, 'every weight is distinct').toBe(250)
    expect(new Set(rows.map(r => r.date)).size, 'every date is distinct').toBe(250)
    expect(rows[0].date < rows[249].date).toBe(true)
    expect(rows[249].weight_kg).toBeLessThan(rows[0].weight_kg)
  })
})
