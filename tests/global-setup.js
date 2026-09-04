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

// Refuse to start a LOCAL run while CI is running the same tests against the same account.
//
// THE PROBLEM. Every test — local and CI — drives ONE live Supabase account. 54 of 97 spec files use
// FIXED fixture names rather than timestamped ones, and four cleanups delete by name PREFIX. Two
// overlapping runs therefore reap each other's live fixtures, and the result is a scatter of
// unrelated-looking failures on both sides with no hint of the real cause. That is the worst shape a
// failure can take here: it looks exactly like a regression.
//
// WHY NOT A SEPARATE CI ACCOUNT, which was the obvious idea. Measured 2026-09-04: the suite has 66
// skip-guards, and 14 spec files require the master-account setup (`window._soloClientId`); others
// need "a client with a programme assigned", "a standalone template", "a client to use as a victim".
// A fresh account satisfies none of that, so CI would go GREEN having silently skipped a large part of
// the suite — the reports-success-while-doing-nothing shape, installed deliberately. Replicating the
// account state is exactly the hidden shared-fixture dependency that left 242 rows of debris behind
// once already.
//
// WHY THIS DIRECTION ONLY. Jake pushes, so he knows CI is about to start; the dangerous case is
// starting a local run while a push's CI is still going. That is the case this catches. CI is not
// given the reverse check because it cannot see his laptop, and pretending otherwise would be a
// mechanism that only appears to work.
//
// FAILS OPEN. No `gh`, not logged in, no network, any error at all — the run proceeds with a warning.
// Refusing to run the tests because a convenience check could not reach GitHub would be a far worse
// bug than the collision it prevents.
async function assertNoOverlappingCiRun () {
  if (process.env.CI || process.env.NO_CI_CHECK) return
  const { execFile } = require('child_process')
  const { promisify } = require('util')
  const run = promisify(execFile)

  let inProgress = []
  try {
    const { stdout } = await run('gh',
      ['run', 'list', '--limit', '5', '--json', 'status,displayTitle,databaseId'],
      { timeout: 8000 })
    inProgress = JSON.parse(stdout).filter(r => r.status === 'in_progress' || r.status === 'queued')
  } catch (err) {
    console.log(`  [ci-overlap] could not check GitHub (${String(err.message).split('\n')[0].slice(0, 60)}) — continuing.`)
    return
  }

  if (!inProgress.length) return

  const list = inProgress.map(r => `      #${r.databaseId}  ${r.displayTitle}`).join('\n')
  throw new Error(
    `\n\nA CI RUN IS IN PROGRESS ON THE SAME TEST ACCOUNT\n\n` +
    `This is NOT a test failure — nothing has run yet.\n\n${list}\n\n` +
    `Both runs drive one live Supabase account, and 54 of 97 specs use fixed fixture names, so they\n` +
    `would delete each other's rows and fail in ways that look like regressions.\n\n` +
    `Wait for it to finish (the smoke gate takes about 4 minutes), or set NO_CI_CHECK=1 to override\n` +
    `if you know the CI run is not touching the browser tests.\n`
  )
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
  // FIRST, before the server check and before any login: this is the cheapest refusal available and
  // the only one that costs nothing when it declines to act.
  await assertNoOverlappingCiRun()
  await assertPreviewServer(base)
  // NO_SESSION_REUSE=1 forces every spec back onto the form login. Kept as an escape hatch for
  // diagnosing a suspected session-reuse problem without editing any file.
  if (!process.env.NO_SESSION_REUSE) await captureSessions(base)
}

// Exported so scripts/check-preview-server.selftest.mjs can prove this check is capable of FAILING.
// A precondition nobody has watched fail is indistinguishable from one that does nothing.
module.exports.assertPreviewServer = assertPreviewServer
