// How long did this run take, and is that normal?
//
// WHY. Measured 2026-09-06: the SAME commit produced 55 failures on a loaded machine (39.9 min) and
// 0 failures on an idle one (31.4 min, then 28.6 min). Every failure was a TimeoutError — the page
// had simply not painted within 8 seconds — so it looked exactly like a catastrophic regression:
// dozens of failures at once, clustered in whole spec files. It took ~40 minutes to dismiss, and the
// only thing that dismissed it was proving the code had not changed.
//
// The run already knows how long it took. Recording a normal duration and saying so when a run comes
// in far above it turns that investigation into a line of output.
//
// REPORT-ONLY, and deliberately no teeth. The project's rule is to measure a gate before arming one,
// and a slow run is not by itself a failure — it is a reason to distrust the failures it produced.
// Raising the 8-second timeouts instead would be the wrong fix entirely: those waits are what would
// catch a genuine performance regression, and widening them buys quiet by destroying the signal.
//
// FULL RUNS ONLY. A single-spec run takes ~20 seconds and would drag the median to uselessness, so
// anything under MIN_FULL_RUN_MS is neither recorded nor compared. There is no reliable test count
// available in a teardown, so duration is the filter.

const { readFileSync, writeFileSync, existsSync } = require('fs')

const STORE = '.suite-duration.json'
const KEEP = 10
const MIN_FULL_RUN_MS = 10 * 60 * 1000     // below this it is not a full suite
const SLOW_RATIO = 1.25                    // 25% over the median is worth mentioning

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
const mins = (ms) => (ms / 60000).toFixed(1)

// Returns a line to print, or null when there is nothing worth saying.
function reportRunDuration () {
  const started = Number(process.env.COACHAPP_RUN_STARTED || 0)
  if (!started) return null
  const elapsed = Date.now() - started
  if (elapsed < MIN_FULL_RUN_MS) return null   // single spec or a small subset — not comparable

  let history = []
  try {
    if (existsSync(STORE)) history = JSON.parse(readFileSync(STORE, 'utf8')).runs || []
  } catch { history = [] }                     // a corrupt store is simply no history

  const prior = history.filter(n => Number.isFinite(n) && n >= MIN_FULL_RUN_MS)
  let line
  if (prior.length < 3) {
    line = `${mins(elapsed)} min (building a baseline — ${prior.length + 1} full run(s) recorded)`
  } else {
    const med = median(prior)
    const ratio = elapsed / med
    line = ratio >= SLOW_RATIO
      ? `${mins(elapsed)} min — ${Math.round((ratio - 1) * 100)}% SLOWER than the usual ${mins(med)} min. `
        + 'If this run failed, suspect machine load before suspecting the code: timeouts fail first.'
      : `${mins(elapsed)} min (usual ${mins(med)} min)`
  }

  // Record AFTER comparing, so a run never compares against itself.
  try {
    writeFileSync(STORE, JSON.stringify({ runs: [...prior, elapsed].slice(-KEEP) }, null, 2))
  } catch { /* never fail a run over its own bookkeeping */ }

  return line
}

module.exports = { reportRunDuration, median, MIN_FULL_RUN_MS, SLOW_RATIO }
