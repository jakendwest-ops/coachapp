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

// The index.html THIS checkout expects to be served. In a git worktree __dirname is the worktree's
// tests/, so this resolves to the worktree's own index.html — which is the entire point of the
// fourth check below.
const LOCAL_INDEX = require('path').join(__dirname, '..', 'index.html')

// The scripts and stylesheets an index.html loads, as relative paths (query strings dropped). One definition: the check below
// and its self-test both use it, so the self-test exercises the very pattern the check relies on.
function moduleRefsOf (html) {
  return [...new Set([...String(html).matchAll(/(?:src|href)="((?:js|css)\/[^"?#]+)[^"]*"/g)].map(m => m[1]))]
}

async function assertPreviewServer (base, localIndexPath = LOCAL_INDEX) {
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

  // THE RIGHT APP FROM THE WRONG DIRECTORY (added 2026-09-30).
  //
  // The title check above passes for ANY CoachApp checkout, and until today .claude/launch.json —
  // which is git-TRACKED — hardcoded `Join-Path 'C:/Users/jaken/OneDrive/coachapp'`. A git worktree
  // inherited that file, so its server served the MAIN checkout's js while Playwright ran the
  // WORKTREE's specs. Measured on the rpe-top-set worktree: 5 specs failed in ways that looked like
  // application bugs; pointed at the right root, the same specs went 13 passed / 3 failed.
  //
  // That is the reports-success-while-doing-nothing shape at suite scale — a worktree run can go
  // GREEN having tested code the author never wrote. The title check could never catch it, because
  // both copies are honestly called CoachApp. This compares the bytes.
  let local
  try {
    local = require('fs').readFileSync(localIndexPath, 'utf8')
  } catch (err) {
    // Fail OPEN: if this checkout's index.html cannot be read, that is not a reason to refuse to run
    // the suite. Say so rather than passing silently.
    console.log(`  [preview-server] could not read ${localIndexPath} (${err.code}) — skipped the same-checkout check.`)
    return
  }
  // Normalise the two differences that are NOT a wrong-directory signal:
  //
  //  - a leading BOM. index.html is written with one (ef bb bf), and the two read paths disagree
  //    about it: fs.readFileSync(...,'utf8') KEEPS U+FEFF, while Response.text() decodes through a
  //    TextDecoder that strips it. Comparing raw made this check fire on a server that was serving
  //    exactly the right directory — caught on its first real run, 2026-09-30. playwright.config.js
  //    documents the same trap for .claude/launch.json.
  //  - line endings. core.autocrlf can leave the working copy CRLF.
  const norm = s => s.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  if (norm(body) !== norm(local)) {
    const vers = s => (s.match(/[\w-]+\.js\?v=\d+/g) || []).join(' ')
    throw new Error(
      `\n\nRIGHT APP, WRONG DIRECTORY on ${base}\n` +
      `This is NOT a test failure — the server is serving a DIFFERENT CoachApp checkout than the\n` +
      `one these tests came from, so every result would describe code you are not editing.\n\n` +
      `  this checkout : ${localIndexPath}\n` +
      `    ${vers(local) || '(no module version tags found)'}\n` +
      `  being served  :\n` +
      `    ${vers(body) || '(no module version tags found)'}\n\n` +
      `Usual cause: running from a git worktree while .claude/launch.json points at another root.\n` +
      `The server prints the directory it serves on startup — check that line, or set\n` +
      `PREVIEW_SERVER_CMD to a PLAIN static server rooted in this directory — \`node scripts/preview-server.mjs . 3001\`\n` +
      `is one that refuses dotfiles and binds loopback only (one that injects a\n` +
      `live-reload snippet — live-server, browser-sync, vite — serves bytes that differ from the files\n` +
      `and will trip this same check).\n`
    )
  }

  // THE SAME index.html OVER ANOTHER CHECKOUT'S MODULES (added 2026-10-01).
  //
  // The comparison above catches the 2026-09-30 worktree bug only because a js change normally moves a `?v=` tag in
  // index.html. It is blind exactly when index.html is byte-identical: a branch whose diff does not touch index.html
  // (css-only, test-only, scripts-only), or a js change whose cache-bust bump was forgotten (checks.sh only notices
  // that at PUSH, after the suite has run). Demonstrated directly: this worktree's NEW index.html served with three
  // OLD modules passed the check.
  //
  // So every script and stylesheet this checkout's index.html references is fetched from the server and compared
  // byte for byte (same BOM / CRLF normalisation) with this checkout's own copy. A module the server does not serve at
  // all counts as different. A local file that cannot be READ is skipped with a line, never a refusal — same fail-open
  // rule as above. No query string is sent: the server keys on the path, and the cache-bust is for browsers.
  const fs = require('fs')
  const path = require('path')
  const root = path.dirname(localIndexPath)
  const refs = moduleRefsOf(local)
  // "Compared nothing" must not read as "compared and matched": if index.html's quoting or paths ever stop matching the
  // pattern, this loop would pass silently over zero files. scripts/check-preview-server.selftest.mjs asserts the REAL
  // index.html yields the nine modules and the stylesheet, so a pattern that has gone blind fails there.
  if (!refs.length) console.log('  [preview-server] WARNING: no js/ or css/ references found in index.html — the module comparison compared NOTHING.')
  const different = []
  await Promise.all(refs.map(async rel => {
    let mine
    try {
      mine = fs.readFileSync(path.join(root, rel), 'utf8')
    } catch (err) {
      console.log(`  [preview-server] could not read ${rel} (${err.code}) — not compared.`)
      return
    }
    try {
      const r = await fetch(`${base}/${rel}`)
      if (!r.ok) { different.push(`${rel} (server answered HTTP ${r.status})`); return }
      if (norm(await r.text()) !== norm(mine)) different.push(rel)
    } catch (err) {
      different.push(`${rel} (${err.message})`)
    }
  }))
  // The ONE deliberate way past the module comparison: a red / neuter run serves this tree's index.html over an OLDER
  // copy of specific modules (scripts/preview-server.mjs OVERRIDE_DIR) to watch a test fail on the code it guards.
  // Opt-in by name, loud, and it excuses only the module bytes — never the index.html comparison above.
  if (different.length && process.env.ALLOW_SERVER_MODULE_MISMATCH) {
    console.log(`  [preview-server] WARNING: serving ${different.length} file(s) that differ from this checkout (${different.join(', ')}) — ` +
      'continuing only because ALLOW_SERVER_MODULE_MISMATCH is set. Results describe the SERVED code, not this checkout.')
    return
  }
  if (different.length) {
    throw new Error(
      `\n\nRIGHT APP, WRONG DIRECTORY on ${base} — index.html matches, the code does not\n` +
      `This is NOT a test failure — the server is serving ${different.length} of ${refs.length} script/stylesheet file(s) that\n` +
      `differ from this checkout's, so every result would describe code you are not editing.\n\n` +
      different.map(f => `    ${f}`).join('\n') + '\n\n' +
      `Usual cause: running from a git worktree while .claude/launch.json (or a server already\n` +
      `listening on this port) points at another root. The server prints the directory it serves on\n` +
      `startup. A plain static server rooted in this directory is the fix (\`node scripts/preview-server.mjs . 3001\`\n` +
      `— loopback only, refuses dotfiles; do not write a throwaway one that binds every interface); one that injects a\n` +
      `live-reload snippet serves bytes that differ from the files and will trip this check too.\n`
    )
  }
}

// RETIRED 2026-09-27 — kept for the record, no longer called. CI no longer runs any browser test (Jake's
// choice: the `e2e` job was removed from .github/workflows/deploy.yml — it ran the same two spec files
// the local pre-push hook already runs), so a CI run can no longer touch the test account and there is
// nothing to collide with. The check below refused a local run during EVERY CI run regardless, which is
// what made each release wait (twice on 2026-09-27). The history below is why it existed.
//
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

// Reap leftover [E2E] fixture rows BEFORE anything runs, so every suite starts from a known floor.
//
// THE LOOP THIS BREAKS, measured 2026-09-05. 52 of 99 specs insert rows; only 13 have an
// afterEach/afterAll. The other 39 clean up inline, so cleanup runs ONLY IF THE TEST PASSES —
// a failing test leaves debris, debris makes later tests fail, and those failures leave more.
// Concretely: ledger-fixes-2026-08-02 creates '[E2E] Zero-Set Session' with a fixed name and date
// and had built up FOURTEEN identical rows, so its own assertion about "the" session was a coin
// flip. It was producing the debris that broke it. 39 rows were reaped the day this was added.
//
// WHY HERE AND NOT IN A SPEC. There used to be a zz-cleanup-e2e.spec.js doing this, which meant it
// ran MID-SUITE and could reap rows a live test was still using. globalSetup runs before any test
// exists, so nothing of this run is ever in scope.
//
// SKIPPED IN CI ON PURPOSE. The reaper's age cutoff is what protects a long-running local suite,
// and CI cannot see Jake's laptop — assertNoOverlappingCiRun only guards the other direction. CI
// runs two spec files against this account; the debris it leaves is not worth the risk of reaping
// out from under a local run.
//
// FAILS OPEN. Refusing to run the tests because a cleanup helper could not reach the database would
// be a far worse bug than the debris it prevents. It says so on the line, every run.
async function reapDebris () {
  if (process.env.CI || process.env.NO_REAP) return
  const { runReaper } = require('./reap-helper')
  const r = await runReaper({ del: true })
  if (r.ok) console.log(`  [reap] ${r.verdict}`)
  else console.log(`  [reap] SKIPPED — ${r.error}`)
}

module.exports = async () => {
  // Cleared FIRST. The flag is set at the end of a successful setup and read by global-teardown; in a
  // long-lived process (npm run test:ui) a stale '1' from an earlier successful run would otherwise
  // survive into a later run whose setup fails, and the teardown would scan anyway.
  delete process.env.COACHAPP_SETUP_COMPLETE
  const base = process.env.BASE_URL || DEFAULT_BASE
  // assertNoOverlappingCiRun() used to run here — retired 2026-09-27, see its definition above.
  await assertPreviewServer(base)
  // Before any fixture exists.
  await reapDebris()
  // NO_SESSION_REUSE=1 forces every spec back onto the form login. Kept as an escape hatch for
  // diagnosing a suspected session-reuse problem without editing any file.
  if (!process.env.NO_SESSION_REUSE) await captureSessions(base)
  // Playwright queues globalTeardown BEFORE awaiting globalSetup, so the teardown runs even when the
  // checks above THROW (verified against playwright/lib/runner/index.js). Without this flag, an
  // aborted run — server down, or the CI-overlap refusal — would still pay a Supabase sign-in and a
  // seven-table scan before exiting, after the real cause had already been reported.
  process.env.COACHAPP_SETUP_COMPLETE = '1'
  // Start of the clock the teardown reads. See global-teardown.js for why a run's DURATION is worth
  // reporting: on 2026-09-06 the same commit produced 55 failures on a loaded machine and 0 on an idle
  // one, and the only thing that told them apart was diffing commits for forty minutes.
  process.env.COACHAPP_RUN_STARTED = String(Date.now())
}

// Exported so scripts/check-preview-server.selftest.mjs can prove this check is capable of FAILING.
// A precondition nobody has watched fail is indistinguishable from one that does nothing.
module.exports.assertPreviewServer = assertPreviewServer
module.exports.moduleRefsOf = moduleRefsOf
