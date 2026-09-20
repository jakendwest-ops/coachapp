// A stand-in for the Supabase client that behaves like the live API where the app's own READS are concerned —
// above all in the one way a plain stub never does: it CAPS every response.
//
// WHY THIS EXISTS. The API returns at most 200 rows per response (`max_rows = 200`, docs/roadmap.md), whatever
// `.limit()` or `.range()` asks for, and it does so SILENTLY: no error, just the first 200 rows of whichever
// order the caller chose. A stub that hands back every fixture row can never expose that, so five reads that
// were wrong past 200 rows passed every test they had. Any test of a read that can outgrow the cap should
// run against this instead.
//
// MEASURED on the live project, 2026-09-20 (a read-only probe as the E2E coach; `exercises` holds 5,564 rows) —
// this file copies these behaviours and nothing it has not seen:
//   .select('id', { count: 'exact' })                  -> 200 rows returned, count 5564
//   .range(0, 999) and .limit(1000)                    -> still 200 rows: the cap ignores what the caller asks for
//   .range(n - 3, n + 50)                              -> the 3 rows that exist
//   .range(n, n + 199)   [n = total, count requested]  -> OK, 0 rows, count n
//   .range(n + 500, ...) [count requested]             -> error PGRST103 "Requested range not satisfiable"
//   .range(beyond end)   [NO count requested]          -> OK, 0 rows
//   empty set, .range(0, 199) + count                  -> OK, 0 rows, count 0
//   empty set, .range(200, 399) + count                -> PGRST103
//
// FAILS CLOSED. It implements only the read methods the app's screens use (select with an optional exact count,
// eq / in / gte / lte / is / not-is-null, order, limit, range, single, maybeSingle) and THROWS on anything else —
// an unknown method, an unknown table, a write, limit() combined with range(). A stub that silently ignores a
// call lets a test pass on nothing. It is read-only on purpose: no fixture rows, no debris, nothing to reap.
//
// ROWS THAT TIE ON THE SORT KEY COME BACK IN A DIFFERENT ORDER ON EVERY REQUEST. Postgres does not promise an order for
// ties, and a real table happens to keep one until it does not (an update, a vacuum, a second replica). A stub that
// resolved ties in fixture order would let a paged read with no unique tie-break (`.order('id')` last) pass every test and
// then skip and repeat rows in production, because the boundary between two pages lands in a different place each time.
// This is deliberately STRICTER than the live API: "unspecified" is what a missing tie-break means. The shuffle is a fixed
// function of the request number, so a failure reproduces.
//
// Column projection is faithful for plain lists (a column you did not select comes back absent, a column that
// exists but the fixture left out comes back null); a select containing an embed `a(b, c)` returns the fixture
// row whole, because faking PostgREST's join is not what this is for.
//
// Usage (the page must already have the app loaded, so `db` exists):
//     await installCappedApi(page, { weight_logs: weightRows(250, 'cid'), clients: [{ id: 'cid', ... }] })
//     ...call the real app function...
//     const calls = await cappedApiCalls(page)     // what was asked of each table, and what came back
//     await restoreCappedApi(page)                 // in a finally

// Runs INSIDE the page (Playwright serialises the function), so it must not reference anything outside itself.
function _installInPage({ tables, cap }) {
  if (window.__cappedApi) throw new Error('capped-api: already installed — restoreCappedApi() first')
  const realFrom = db.from
  const calls = []
  const KNOWN = new Set(['select', 'eq', 'in', 'gte', 'lte', 'is', 'not', 'order', 'limit', 'range', 'single', 'maybeSingle', 'then'])
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

  db.from = function (table) {
    if (!Object.prototype.hasOwnProperty.call(tables, table)) {
      throw new Error('capped-api: the stub was not given table "' + table + '" — add it to the fixture, or the code under test reads something the test does not know about')
    }
    const spec = tables[table]
    const q = { cols: '*', count: false, filters: [], orders: [], limit: null, range: null, mode: 'many' }
    const desc = []   // human-readable record of the calls, for assertions

    const settle = () => {
      if (spec && !Array.isArray(spec) && spec.error) {
        calls.push({ table, desc, error: spec.error.code || 'error' })
        return { data: null, error: spec.error, count: null }
      }
      let rows = spec.slice()
      for (const f of q.filters) rows = rows.filter(f)
      const total = rows.length
      // Ties (or no order at all) resolve by a per-request pseudo-random key, not by fixture position — see the header.
      const reqNo = calls.length
      const tieKey = (i) => {
        let h = (Math.imul(i + 1, 0x9E3779B1) ^ Math.imul(reqNo + 1, 0x85EBCA6B)) >>> 0
        h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D) >>> 0
        h = Math.imul(h ^ (h >>> 12), 0x297A2D39) >>> 0
        return (h ^ (h >>> 15)) >>> 0
      }
      rows = rows.map((r, i) => [r, i]).sort(([a, ia], [b, ib]) => {
        for (const o of q.orders) {
          const av = a[o.col], bv = b[o.col]
          if (av == null && bv == null) continue
          // Postgres: ASC puts NULLs last, DESC puts them first.
          if (av == null) return o.asc ? 1 : -1
          if (bv == null) return o.asc ? -1 : 1
          const c = cmp(av, bv)
          if (c) return o.asc ? c : -c
        }
        return tieKey(ia) - tieKey(ib)
      }).map(([r]) => r)
      if (q.range && q.count && q.range.from > total) {
        calls.push({ table, desc, range: q.range, error: 'PGRST103' })
        return { data: null, error: { code: 'PGRST103', message: 'Requested range not satisfiable' }, count: null }
      }
      if (q.range) rows = rows.slice(q.range.from, q.range.to + 1)
      if (q.limit != null) rows = rows.slice(0, q.limit)
      rows = rows.slice(0, cap)                              // the API's own ceiling, applied last, whatever was asked
      const project = (r) => {
        if (q.cols === '*' || q.cols.includes('(')) return r
        const out = {}
        for (const c of q.cols.split(',').map(s => s.trim()).filter(Boolean)) out[c] = r[c] === undefined ? null : r[c]
        return out
      }
      rows = rows.map(project)
      const count = q.count ? total : null
      calls.push({ table, desc, range: q.range, count: q.count, returned: rows.length, total })
      if (q.mode === 'single') return rows.length === 1 ? { data: rows[0], error: null, count } : { data: null, error: { code: 'PGRST116', message: 'The result contains ' + rows.length + ' rows' }, count }
      if (q.mode === 'maybe') return rows.length <= 1 ? { data: rows[0] ?? null, error: null, count } : { data: null, error: { code: 'PGRST116', message: 'The result contains ' + rows.length + ' rows' }, count }
      return { data: rows, error: null, count }
    }

    const builder = {
      select(cols, opts) {
        if (opts && (opts.head || (opts.count && opts.count !== 'exact'))) throw new Error('capped-api: select() options other than { count: "exact" } are not implemented')
        q.cols = typeof cols === 'string' && cols.trim() ? cols : '*'
        q.count = !!(opts && opts.count === 'exact')
        desc.push('select(' + q.cols + (q.count ? ', count' : '') + ')')
        return proxy
      },
      eq(col, v) { desc.push('eq(' + col + ')'); q.filters.push(r => r[col] === v); return proxy },
      in(col, arr) { desc.push('in(' + col + ')'); q.filters.push(r => arr.includes(r[col])); return proxy },
      gte(col, v) { desc.push('gte(' + col + ')'); q.filters.push(r => r[col] != null && r[col] >= v); return proxy },
      lte(col, v) { desc.push('lte(' + col + ')'); q.filters.push(r => r[col] != null && r[col] <= v); return proxy },
      is(col, v) { if (v !== null) throw new Error('capped-api: is() only supports null'); desc.push('is(' + col + ',null)'); q.filters.push(r => r[col] == null); return proxy },
      not(col, op, v) { if (op !== 'is' || v !== null) throw new Error('capped-api: not() only supports (col, "is", null)'); desc.push('not(' + col + ',is,null)'); q.filters.push(r => r[col] != null); return proxy },
      order(col, opts) { desc.push('order(' + col + ((opts && opts.ascending === false) ? ' desc' : '') + ')'); q.orders.push({ col, asc: !(opts && opts.ascending === false) }); return proxy },
      limit(n) { if (q.range) throw new Error('capped-api: limit() combined with range() is not implemented'); desc.push('limit(' + n + ')'); q.limit = n; return proxy },
      range(from, to) { if (q.limit != null) throw new Error('capped-api: limit() combined with range() is not implemented'); desc.push('range(' + from + ',' + to + ')'); q.range = { from, to }; return proxy },
      single() { q.mode = 'single'; return proxy },
      maybeSingle() { q.mode = 'maybe'; return proxy },
      then(res, rej) { return Promise.resolve().then(settle).then(res, rej) },
    }
    const proxy = new Proxy(builder, {
      get(target, prop) {
        if (typeof prop === 'symbol') return undefined
        if (KNOWN.has(prop)) return target[prop]
        return () => { throw new Error('capped-api: .' + prop + '() is not implemented by the stub (table "' + table + '") — the stub is read-only and fails closed') }
      },
    })
    return proxy
  }
  window.__cappedApi = { realFrom, calls }
}

async function installCappedApi(page, tables, { cap = 200 } = {}) {
  await page.evaluate(_installInPage, { tables, cap })
}

async function restoreCappedApi(page) {
  await page.evaluate(() => {
    if (!window.__cappedApi) return
    db.from = window.__cappedApi.realFrom
    delete window.__cappedApi
  })
}

// Every request the stub answered, in order: { table, desc: ['select(...)', 'eq(client_id)', ...], range, count,
// returned, total } — or { table, desc, error } for one it refused.
async function cappedApiCalls(page) {
  return page.evaluate(() => (window.__cappedApi ? window.__cappedApi.calls.slice() : []))
}

// n rows for a table, oldest first, ids stable and unique, each built by make(i) and given an `id`.
function fixtureRows(n, make) {
  return Array.from({ length: n }, (_, i) => ({ id: 'row-' + String(i).padStart(6, '0'), ...make(i) }))
}

// n weigh-ins for one client, one per day from `start`, the weight falling 0.1 kg a day so every weight is
// distinct — the newest is the lightest, which lets a test tell "newest" from "200th" by the number alone. One
// decimal on purpose: the coach tab rounds to one decimal and the client tab does not, so a two-decimal fixture
// would make two correct screens read differently.
function weightRows(n, clientId, { start = '2025-01-01' } = {}) {
  const t0 = Date.parse(start + 'T00:00:00Z')
  return fixtureRows(n, (i) => ({
    client_id: clientId,
    date: new Date(t0 + i * 86400000).toISOString().slice(0, 10),
    weight_kg: Math.round((100 - i * 0.1) * 10) / 10,
    body_fat_pct: null, resting_hr: null, notes: null,
    created_at: new Date(t0 + i * 86400000).toISOString(),
  }))
}

module.exports = { installCappedApi, restoreCappedApi, cappedApiCalls, fixtureRows, weightRows }
