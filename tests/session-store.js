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

/**
 * Drive one real form login and copy the resulting localStorage to disk.
 * Returns true if a session was captured, false if it could not be (never throws to the caller —
 * a capture failure must degrade to per-spec form logins, not fail the whole run).
 */
async function captureSession (browser, base, role, email, password) {
  if (!email || !password) return false
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
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
    await context.close()
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
  let saved
  try {
    saved = JSON.parse(fs.readFileSync(fileFor(role), 'utf8'))
  } catch {
    return false                       // never captured, or deleted — fall back to the form
  }
  if (!saved || !saved.entries) return false

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
