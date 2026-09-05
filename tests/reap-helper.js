// Shared spawn-and-parse for scripts/reap-e2e-debris.mjs.
//
// global-setup.js (reap, --delete) and global-teardown.js (report, dry run) previously hand-rolled
// the same execFile + promisify + timeout + stdout-line-parsing. Two reviewers independently flagged
// it as drift-prone: a change to the timeout, the truncation length or the error shape in one is easy
// to forget in the other. One copy, two callers.

const { execFile } = require('child_process')
const { promisify } = require('util')
const run = promisify(execFile)

const TIMEOUT_MS = 120000
const NL = String.fromCharCode(10)

// Returns { ok, lines, verdict, error }.
//   lines   — every non-empty output line, trimmed
//   verdict — the last line, which the script always makes its summary
// Never throws. Both callers are non-fatal by design: refusing to run the tests because a cleanup
// helper could not reach the database would be a far worse bug than the debris it prevents.
async function runReaper ({ del = false, ageHours = null } = {}) {
  const args = ['scripts/reap-e2e-debris.mjs']
  if (del) args.push('--delete')
  const env = { ...process.env }
  if (ageHours !== null) env.REAP_AGE_HOURS = String(ageHours)

  try {
    const { stdout } = await run('node', args, { timeout: TIMEOUT_MS, env })
    const lines = stdout.trim().split(NL).map(l => l.trim()).filter(Boolean)
    return { ok: true, lines, verdict: lines[lines.length - 1] || '(no output)', error: null }
  } catch (err) {
    // A non-zero exit still carries useful stdout (the reaper exits 1 when a table was unreadable,
    // having already printed the tables it COULD read). Keep it rather than reporting only the
    // message — a partial report beats none.
    const stdout = String(err.stdout || '')
    const lines = stdout.trim().split(NL).map(l => l.trim()).filter(Boolean)
    return {
      ok: false,
      lines,
      verdict: lines[lines.length - 1] || '',
      error: String(err.message || 'unknown').split(NL)[0].slice(0, 90)
    }
  }
}

module.exports = { runReaper }
