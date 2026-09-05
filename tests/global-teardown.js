// Post-run debris report: how many [E2E] fixture rows did this run leave behind?
//
// WHY THIS EXISTS. Before it, a leak was INVISIBLE. Rows accumulated silently and the only symptom
// was a test failing mysteriously days later — on 2026-09-05, fourteen identical
// '[E2E] Zero-Set Session' rows had built up until the spec that created them could no longer tell
// which one it meant. Nobody could have known without going and looking. This turns that into a
// number printed at the end of every run.
//
// REPORT-ONLY, ON PURPOSE. It does not fail the run. This project's rule is to measure a gate before
// giving it teeth (checks.sh rule 2's clients sub-check could never fire; two others flagged correct
// queries). Once the number has a track record and a real floor is known, it can become a ratchet.
// Turning a green suite red today, for a hygiene figure nobody has calibrated, is how a check gets
// switched off in week one.
//
// Uses REAP_AGE_HOURS=0 because the question here is "what is left RIGHT NOW", including rows this
// run created moments ago — that is precisely the leak being measured.

module.exports = async () => {
  if (process.env.CI || process.env.NO_REAP) return
  const { execFile } = require('child_process')
  const { promisify } = require('util')
  const run = promisify(execFile)
  const firstLine = (s) => String(s).split(String.fromCharCode(10))[0].slice(0, 90)

  try {
    const { stdout } = await run('node', ['scripts/reap-e2e-debris.mjs'], {
      timeout: 120000,
      env: { ...process.env, REAP_AGE_HOURS: '0' }
    })
    const lines = stdout.trim().split(String.fromCharCode(10)).map(l => l.trim()).filter(Boolean)
    const verdict = lines.pop() || '(no output)'
    // Name the tables, not just the total — "39 rows" sends you hunting, "14 in workout_logs" does not.
    const perTable = lines.filter(l => /row\(s\)$|row\(s\)\s/.test(l) && !l.startsWith('e.g.'))
    console.log(`  [debris] ${verdict}`)
    for (const t of perTable) console.log(`  [debris]   ${t}`)
  } catch (err) {
    console.log(`  [debris] report unavailable — ${firstLine(err.message)}`)
  }
}
