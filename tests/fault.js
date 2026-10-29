// Fault injection for Supabase REST calls (2026-10-29, R4a). The first helper of its kind in this suite: until now no spec
// used route.abort / route.fetch, so nothing had ever shown what a save does on a bad gym connection.
//
// failNext(page, table, { method, mode, times }) makes the next `times` matching requests to /rest/v1/<table> fail:
//   - 'abort'          the connection dies before the server sees the request (nothing is written)
//   - 'lost-response'  the request REACHES the server and is committed, then the page sees a failure - the case that
//                      turns a retry into a duplicate
//   - 'http-500'       the server answers 500 with no PostgREST code
//   - 'fake-success'   the request never reaches the server, yet the page is told 201 Created - a write that "succeeded"
//                      while writing nothing
// Requests after the first `times` matches pass through untouched. Returns a counter object ({ hits }) so a spec can
// assert the fault actually fired: a fault that never matched would let a test pass on nothing.
//
// offline(page) / online(page): every /rest/v1/ request aborts until online() is called - "no signal at all".

function _matches (req, table, method) {
  const u = new URL(req.url())
  if (!u.pathname.endsWith('/rest/v1/' + table)) return false
  return !method || req.method() === method
}

async function failNext (page, table, { method = 'POST', mode = 'abort', times = 1 } = {}) {
  const state = { hits: 0 }
  const handler = async (route, req) => {
    if (!_matches(req, table, method) || state.hits >= times) return route.fallback()
    state.hits++
    if (mode === 'abort') return route.abort('internetdisconnected')
    if (mode === 'http-500') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"injected 500"}' })
    if (mode === 'fake-success') return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    if (mode === 'lost-response') {
      await route.fetch()                         // the server commits it
      return route.abort('connectionreset')       // ...and the page never hears back
    }
    throw new Error('failNext: unknown mode ' + mode)
  }
  await page.route('**/rest/v1/**', handler)
  return state
}

async function offline (page) {
  const state = { hits: 0 }
  state.handler = async (route) => { state.hits++; return route.abort('internetdisconnected') }
  await page.route('**/rest/v1/**', state.handler)
  return state
}

async function online (page, state) {
  await page.unroute('**/rest/v1/**', state.handler)
}

module.exports = { failNext, offline, online }
