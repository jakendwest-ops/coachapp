// Sign in once per role, in globalSetup, and reuse that session for every spec.
//
// WHY. Measured 2026-09-04 across five representative specs (105 tests): 155 logins costing 282.6s of
// 527s wall clock -- 53.6% of the run is spent typing the same credentials into the same form. The
// refactor plan estimated 60-75%; the real number is lower but still over half.
//
// HOW. globalSetup drives ONE real form login per role and copies that origin's localStorage to disk.
// loginAsX() then writes those entries into the page and reloads, so supabase-js finds an existing
// session when it constructs its client at js/app-core.js:165 (top level, so it runs on every load).
//
// THE FALLBACK IS NOT OPTIONAL. If capture never ran, or the file is missing, or the token has expired
// or been rotated out from under us, injection is abandoned and the ORIGINAL form login runs. A test
// helper that refuses to log in is worse than a slow one -- refusing the legitimate user is this
// project's most-shipped guard bug -- so every failure path here ends in "log in the old way", never
// in an error.

const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname, '.sessions')

// Written by capture, read by inject. Deliberately NOT in git: these are real access tokens for the
// test accounts. tests/.sessions/ is in .gitignore.
const fileFor = (role) => path.join(DIR, `${role}.json`)

// How old a saved session may get before the next test that wants it takes a fresh one. The access token inside lives exactly 60
// minutes (exp - iat, measured 2026-10-03) and the snapshot is taken once, in globalSetup, while the full suite now runs 47-59
// minutes: a slightly slower run would reach its last tests with an EXPIRED token whose refresh token the sign-out specs have
// already revoked (docs/bugs/2026-09-30-pb-consolidation-...), so every late login would wait out its 15 s readiness timeout and
// then fall back to a form login. SESSION_MAX_AGE_MS overrides the limit so a short run can exercise the refresh.
const MAX_SNAPSHOT_AGE_MS = Number(process.env.SESSION_MAX_AGE_MS) || 25 * 60 * 1000
const CREDENTIALS = { pt: ['PT_EMAIL', 'PT_PASSWORD'], client: ['CLIENT_EMAIL', 'CLIENT_PASSWORD'], pt2: ['PT2_EMAIL', 'PT2_PASSWORD'] }

// role -> when a re-capture was last ATTEMPTED. A capture that fails must not be retried by every later login (each attempt can burn
// ~25 s of a 60 s test): after an attempt, wait out another MAX_SNAPSHOT_AGE_MS whether or not it worked.
const refreshTriedAt = {}

/** Take a fresh session for `role` if the saved one is older than MAX_SNAPSHOT_AGE_MS. Never throws; on any problem the old one is kept. */
async function refreshIfOld (page, role, saved) {
  try {
    const now = Date.now()
    if (now - (saved.capturedAt || 0) <= MAX_SNAPSHOT_AGE_MS) return saved
    if (refreshTriedAt[role] && now - refreshTriedAt[role] <= MAX_SNAPSHOT_AGE_MS) return saved
    refreshTriedAt[role] = now
    const [emailVar, passwordVar] = CREDENTIALS[role] || []
    const browser = page.context().browser()
    if (!emailVar || !browser || !process.env[emailVar] || !process.env[passwordVar]) return saved
    const base = process.env.BASE_URL || 'http://localhost:3001' // same default as tests/global-setup.js
    if (!(await captureSession(browser, base, role, process.env[emailVar], process.env[passwordVar]))) return saved
    return JSON.parse(fs.readFileSync(fileFor(role), 'utf8'))
  } catch {
    return saved
  }
}

/**
 * Drive one real form login and copy the resulting localStorage to disk.
 * Returns true if a session was captured, false if it could not be (never throws to the caller —
 * a capture failure must degrade to per-spec form logins, not fail the whole run).
 */
async function captureSession (browser, base, role, email, password) {
  if (!email || !password) return false
  let context
  try {
    context = await browser.newContext()   // inside the try: a failure here must return false, not reject (the "never throws" contract above)
    const page = await context.newPage()
    await page.goto(base + '/')
    await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 10000 })
    await page.fill('#login-email', email)
    await page.fill('#login-password', password)
    await page.click('#login-submit')
    await page.waitForSelector('#app-shell', { state: 'visible', timeout: 15000 })

    // Read EVERYTHING in localStorage rather than guessing at a key name. supabase-js v2 stores the
    // session under `sb-<project-ref>-auth-token`, but the ref is a deployment detail and hardcoding
    // it here would be a second copy of a fact that lives in js/app-core.js.
    const entries = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))

    const authKeys = Object.keys(entries).filter(k => k.startsWith('sb-') && k.includes('auth'))
    if (!authKeys.length) {
      // A login that leaves no auth entry means the storage mechanism changed. Say so loudly — a
      // silent empty capture would make every inject fall back and quietly restore the old cost
      // while claiming the speed-up.
      console.log(`  [session-store] ${role}: logged in but found NO sb-*auth* key in localStorage.`)
      console.log(`  [session-store] keys present: ${Object.keys(entries).join(', ') || '(none)'}`)
      return false
    }
    if (process.env.SESSION_DEBUG) {
      console.log(`  [session-store] ${role} auth keys: ${authKeys.join(', ')}`)
      console.log(`  [session-store] ${role} all keys : ${Object.keys(entries).join(', ')}`)
    }

    // ONLY the auth entries. The probe run showed the PT login also leaves `_activePage` behind, and
    // injecting that would restore a previous session's page — so a spec expecting the dashboard
    // heading would land somewhere else and fail on a confusing assertion. Everything outside the
    // auth keys is per-test state that a fresh form login would not have carried over either.
    const authOnly = Object.fromEntries(authKeys.map(k => [k, entries[k]]))

    fs.mkdirSync(DIR, { recursive: true })
    fs.writeFileSync(fileFor(role), JSON.stringify({ capturedAt: Date.now(), entries: authOnly }, null, 2))
    return true
  } catch (err) {
    console.log(`  [session-store] ${role}: capture failed (${err.message}). Specs will form-login.`)
    return false
  } finally {
    if (context) await context.close()
  }
}

/**
 * Put a captured session into this page and reload so supabase-js picks it up.
 *
 * Returns true only if `ready(page)` then confirms the app really came up signed in. Returning true
 * on a mere "no exception" would be the reports-success-while-doing-nothing shape: the page would sit
 * on the auth screen and the caller's own assertion would fail somewhere confusing instead.
 */
async function injectSession (page, role, ready, extra = {}) {
  // The escape hatch has to be honoured HERE, not only in globalSetup. Its first version disabled
  // capture alone, so a run with NO_SESSION_REUSE=1 happily injected the PREVIOUS run's files and
  // reported the fast timings while claiming to be form-logging. Measured: 1.30s per login with the
  // stale files present versus 1.76s once they were removed -- the flag did nothing. Found by
  // insisting on proving the fallback actually runs rather than trusting the comment that said it did.
  if (process.env.NO_SESSION_REUSE) return false

  let saved
  try {
    saved = JSON.parse(fs.readFileSync(fileFor(role), 'utf8'))
  } catch {
    return false                       // never captured, or deleted — fall back to the form
  }
  if (!saved || !saved.entries) return false
  saved = await refreshIfOld(page, role, saved)

  try {
    // localStorage is per-origin, so the page must already BE on the origin before it can be written.
    // It does NOT have to be the app: hitting a path the preview server 404s still gives a document
    // on the right origin, and skips booting the whole app once just to reach a storage slot. That
    // matters because this runs 155 times in five specs alone.
    //
    // addInitScript would drop it to a single navigation, but it re-fires on EVERY navigation for the
    // life of the page — and auth.spec.js, units-2026-07-24.spec.js and solo-only-2026-07-24.spec.js
    // all sign out and then assert the signed-out state. Re-injecting behind them would turn three
    // correct specs red. Two navigations it is.
    await page.goto('/__session-bootstrap')
    await page.evaluate(({ entries, extra }) => {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v)
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v)
    }, { entries: saved.entries, extra })
    await page.goto('/')
    await ready(page)
    return true
  } catch {
    // Expired token, a refresh-token rotation that invalidated this copy, or a slow render. Whatever
    // the cause, the caller logs in the old way — correctness first, speed second.
    return false
  }
}

module.exports = { captureSession, injectSession, fileFor, DIR }
