// Preconditon for the whole suite: :3001 must be serving CoachApp SPECIFICALLY.
//
// Why this exists (2026-08-29). A full-suite run against a dead :3001 produced 39 identical
// `ERR_CONNECTION_REFUSED` failures, which read exactly like a catastrophic regression — it took a
// process listing and a failure tally to find the real cause. Worse, `scripts/checks.sh` fails the
// same way and prints "Fix tests before pushing", naming the wrong cause entirely.
//
// Serving *something* and serving the *right app* are different checks: a stale entry in
// `.claude/launch.json` can serve a different app on this port, and then every spec fails on a
// confusing assertion rather than a clear cause. So this asserts the TITLE, not a bare 200.
//
// This runs after `webServer` has started (or reused) the server, so by the time we get here a
// failure means the server is genuinely wrong — not merely slow to boot.

// globalSetup runs in its own Node process and does NOT inherit whatever tests/helpers.js loads.
// Without this the credentials are undefined here, captureSession returns false for all three roles,
// and every spec quietly falls back to the form login -- the speed-up would be claimed and not
// delivered. Caught on the first probe run, which reported "captured 0/3" rather than staying silent.
require('dotenv').config()

const DEFAULT_BASE = 'http://localhost:3001'

async function assertPreviewServer (base) {
  let res, body
  try {
    res = await fetch(base + '/')
    body = await res.text()
  } catch (err) {
    throw new Error(
      `\n\nPREVIEW SERVER UNREACHABLE at ${base}\n` +
      `This is NOT a test failure — no test has run yet.\n` +
      `Start the CoachApp entry in .claude/launch.json, or let Playwright's webServer start it.\n` +
      `Underlying error: ${err.message}\n`
    )
  }

  if (!res.ok) {
    throw new Error(
      `\n\nPREVIEW SERVER at ${base} RETURNED HTTP ${res.status}\n` +
      `This is NOT a test failure — the server is up but is not serving the app.\n`
    )
  }

  const m = body.match(/<title>([^<]*)<\/title>/i)
  const title = m ? m[1].trim() : '(no <title> element found)'
  if (title !== 'CoachApp') {
    throw new Error(
      `\n\nWRONG APP ON ${base}: serving "${title}", not CoachApp.\n` +
      `This is NOT a test failure. A stale configuration is serving a different app on this port.\n` +
      `Remove the wrong config from .claude/launch.json entirely — do not just reorder it — then re-run.\n`
    )
  }
}

// One real form login per role, captured here so the 462 login call sites in tests/ can inject it
// instead of re-typing credentials. See tests/session-store.js for the measurement that motivated it
// and for why every failure path falls back to the form rather than failing the run.
async function captureSessions (base) {
  const fs = require('fs')
  const { chromium } = require('@playwright/test')
  const { captureSession, DIR } = require('./session-store')

  const roles = [
    ['pt', process.env.PT_EMAIL, process.env.PT_PASSWORD],
    ['client', process.env.CLIENT_EMAIL, process.env.CLIENT_PASSWORD],
    ['pt2', process.env.PT2_EMAIL, process.env.PT2_PASSWORD]
  ]

  // Clear first, so "a file exists" means "captured on THIS run" and can never mean "left over from
  // a run last week". Without this, a capture that failed would leave the previous run's tokens in
  // place and every spec would silently authenticate as a stale session -- working right up until the
  // refresh token was rotated, then failing somewhere unrelated.
  fs.rmSync(DIR, { recursive: true, force: true })

  const browser = await chromium.launch()
  try {
    const got = []
    for (const [role, email, password] of roles) {
      if (await captureSession(browser, base, role, email, password)) got.push(role)
    }
    // Said out loud on every run. A capture that silently produced nothing would restore the old
    // per-spec cost while the commit message claimed a speed-up.
    console.log(`  [session-store] captured ${got.length}/${roles.length} role sessions: ${got.join(', ') || '(none — every spec will form-login)'}`)
  } finally {
    await browser.close()
  }
}

module.exports = async () => {
  const base = process.env.BASE_URL || DEFAULT_BASE
  await assertPreviewServer(base)
  // NO_SESSION_REUSE=1 forces every spec back onto the form login. Kept as an escape hatch for
  // diagnosing a suspected session-reuse problem without editing any file.
  if (!process.env.NO_SESSION_REUSE) await captureSessions(base)
}

// Exported so scripts/check-preview-server.selftest.mjs can prove this check is capable of FAILING.
// A precondition nobody has watched fail is indistinguishable from one that does nothing.
module.exports.assertPreviewServer = assertPreviewServer
