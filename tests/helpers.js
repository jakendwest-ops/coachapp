require('dotenv').config()

const PT_EMAIL     = process.env.PT_EMAIL
const PT_PASSWORD  = process.env.PT_PASSWORD
const CLIENT_EMAIL = process.env.CLIENT_EMAIL
const CLIENT_PASSWORD = process.env.CLIENT_PASSWORD
// A second, entirely unrelated coach — the other tenant. Added 2026-07-12 for the RLS audit.
const PT2_EMAIL    = process.env.PT2_EMAIL
const PT2_PASSWORD = process.env.PT2_PASSWORD

async function loginAs(page, email, password) {
  await page.goto('/')
  // Wait for auth screen to appear
  await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 10000 })
  // Fill login form (it's shown by default)
  await page.fill('#login-email', email)
  await page.fill('#login-password', password)
  await page.click('#login-submit')
  // Wait for app shell to appear (auth successful)
  await page.waitForSelector('#app-shell', { state: 'visible', timeout: 15000 })
}

async function loginAsPT(page) {
  // Set _activeView before app loads so it always starts in coach mode
  // (a previous test may have left _activeView=solo in localStorage)
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('_activeView', 'coach'))
  await loginAs(page, PT_EMAIL, PT_PASSWORD)
  // #app-shell is visible before loadUserInfo finishes rendering the dashboard.
  // Wait for the PT dashboard h1 — only renders after loadUserInfo completes.
  await page.waitForSelector('h1:has-text("Welcome back")', { timeout: 15000 })
}

async function loginAsClient(page) {
  await loginAs(page, CLIENT_EMAIL, CLIENT_PASSWORD)
  // #app-shell is visible before renderClientDashboard finishes (it shows a "Loading…"
  // placeholder first, then swaps in the real dashboard once several parallel Supabase
  // fetches resolve) — same race loginAsPT already guards against below. Without this,
  // a test's first click (e.g. on [data-page="workouts"]) can land before the client
  // dashboard/nav has finished rendering and get silently overwritten.
  await page.waitForSelector('h1:has-text("Hi,")', { timeout: 15000 })
}

// Logs in as the SECOND coach — a different auth.uid(), a different tenant entirely. Used by the RLS
// audit to prove coach B cannot read/write coach A's rows. Deliberately does NOT wait for a specific
// dashboard heading: this account owns no data, so it lands on an empty coach dashboard, and the RLS
// probes talk to `db` directly rather than through the UI anyway.
async function loginAsPT2(page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('_activeView', 'coach'))
  await loginAs(page, PT2_EMAIL, PT2_PASSWORD)
  // Wait for the session + profile to be loaded, not for any particular render.
  // NOTE the bare identifiers: `currentUser`/`currentProfile` are top-level `let` declarations in a
  // classic script, so they live in the global DECLARATIVE record and are NOT mirrored onto
  // `window` (les-024). `window.currentUser` is permanently undefined; the bare name resolves.
  await page.waitForFunction(
    () => typeof currentUser !== 'undefined' && !!currentUser?.id && typeof currentProfile !== 'undefined' && !!currentProfile,
    { timeout: 15000 }
  )
}

// Clicks whichever match of `selectors` is actually visible right now.
//
// Why this exists: renderNav() (js/app-core.js) unconditionally writes an IDENTICAL data-page="x"
// link into both the sidebar nav (.nav-item) and the bottom nav (.bottom-nav-item) for every page —
// both are always in the DOM; only CSS (css/main.css's @media (max-width:900px) block) decides
// which one is shown. The same duplication exists for the Personal view-switcher
// (#vs-personal / #mvs-personal) and the Settings sign-out control.
//
// page.click(selector) is NOT strict-mode-checked — when a selector matches more than one element
// it silently "proceeds with the first DOM-order match" and waits for THAT element to become
// actionable. Sidebar markup is written before bottom-nav markup, so the sidebar copy is always
// DOM-order-first — if it's the one CSS has hidden (real mobile viewport), the click waits out the
// full timeout instead of ever trying the visible copy. Appending Playwright's native :visible
// pseudo-class narrows resolution to only currently-visible elements before that first-match logic
// runs — no custom polling needed. (Same trick already used ad hoc in client-workout.spec.js and
// runner.spec.js's `button:has-text("Start"):visible, button:has-text("▶ Start"):visible` — this
// just generalizes it into a shared helper.)
//
// `selectors` may be one selector string or an array of alternatives; each gets :visible appended
// individually (a trailing :visible on only the last branch of a comma-list only filters that
// branch), then they're OR'd together.
async function clickVisible(page, selectors, options = {}) {
  const list = Array.isArray(selectors) ? selectors : [selectors]
  await page.click(list.map(s => `${s}:visible`).join(', '), options)
}

// Same idea as clickVisible, for call sites that only need to wait for one of the alternatives to
// become visible (no click) — e.g. a readiness gate before reading page state.
async function waitForVisible(page, selectors, options = {}) {
  const list = Array.isArray(selectors) ? selectors : [selectors]
  return page.waitForSelector(list.map(s => `${s}:visible`).join(', '), options)
}

// Log one set in the runner's fast table. Since sub-project ②c, every strength metric_type
// (weight_reps/unilateral/timed_hold/jump_height/jump_distance) logs via the fast table, not the wizard —
// so tests that used to drive `#wr-weight-input` + the LOG button now fill the row inputs and tick the ✓.
// Jumps to the first table-mode exercise, fills row 0 (weight optional — skipped for bodyweight/jump/timed
// rows that have no weight input), and marks it complete. Returns false if no table-mode exercise exists.
async function logTableSet(page, { weight = '60', reps = '10' } = {}) {
  const found = await page.evaluate(() => {
    const idx = _runner.exercises.findIndex(e => typeof _isPlainStrengthExercise === 'function' && _isPlainStrengthExercise(e))
    if (idx === -1) return false
    runnerJumpTo(idx)
    return true
  })
  if (!found) return false
  const kg = page.locator('#workout-runner input[oninput*="tableRows[0].weight"]')
  const rp = page.locator('#workout-runner input[oninput*="tableRows[0].reps"]')
  if (await kg.count() > 0) await kg.fill(String(weight))
  if (await rp.count() > 0) await rp.fill(String(reps))
  await page.locator('#workout-runner button[onclick="toggleTableSet(0)"]').click()
  return true
}

module.exports = { loginAsPT, loginAsClient, loginAsPT2, logTableSet, clickVisible, waitForVisible }
