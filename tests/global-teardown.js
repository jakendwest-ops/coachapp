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
// REAP_AGE_HOURS=0 because the question here is "what is left RIGHT NOW", including rows this run
// created moments ago — that is precisely the leak being measured. It is a DRY RUN: age 0 must never
// be combined with a delete, or a concurrent run's live fixtures would be in scope.

module.exports = async () => {
  if (process.env.CI || process.env.NO_REAP) return
  // Playwright queues this teardown before it awaits globalSetup, so it runs even when setup THREW.
  // On an aborted run — preview server down, or the CI-overlap refusal — the real cause has already
  // been reported and a sign-in plus a seven-table scan would just delay the exit.
  if (process.env.COACHAPP_SETUP_COMPLETE !== '1') return

  const { runReaper } = require('./reap-helper')
  const r = await runReaper({ ageHours: 0 })

  if (!r.ok && !r.lines.length) {
    console.log(`  [debris] report unavailable — ${r.error}`)
    return
  }
  // Name the tables, not just the total — "13 rows" sends you hunting, "5 in workout_logs" does not.
  const verdict = r.verdict || '(no output)'
  const perTable = r.lines.filter(l => /row\(s\)/.test(l) && !l.startsWith('e.g.') && l !== verdict)
  console.log(`  [debris] ${verdict}`)
  for (const t of perTable) console.log(`  [debris]   ${t}`)
  if (!r.ok) console.log(`  [debris]   (report incomplete — ${r.error})`)
}
