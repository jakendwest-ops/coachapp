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

module.exports = { loginAsPT, loginAsClient, loginAsPT2 }
