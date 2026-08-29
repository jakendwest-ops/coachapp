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

module.exports = async () => {
  await assertPreviewServer(process.env.BASE_URL || DEFAULT_BASE)
}

// Exported so scripts/check-preview-server.selftest.mjs can prove this check is capable of FAILING.
// A precondition nobody has watched fail is indistinguishable from one that does nothing.
module.exports.assertPreviewServer = assertPreviewServer
