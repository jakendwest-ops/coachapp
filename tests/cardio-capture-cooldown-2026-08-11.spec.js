// 2026-08-11 — captured HR/watts/pace vanished whenever an interval exercise had a cool-down.
//
// The capture card is shown once, at exercise-finish, and _applyCardioCapture stamped what the athlete
// typed onto `loggedSets[loggedSets.length - 1]` — the literal last row. That is correct for ordinary
// cardio, where the last row IS the last round. It is wrong for an interval block with a cool-down,
// because _logIntervalPhase logs warmup, then the work rounds, then the COOL-DOWN — so the literal
// last row carries phase 'cooldown'.
//
// Every Progress aggregate filters through _countableSets (`!phase || phase === 'work'`), deliberately,
// so that recording a warmup can't inflate set counts or volume (Jake, 2026-07-25). The capture
// therefore landed in the one row guaranteed to be thrown away by every reader:
//
//   athlete types "Avg HR 158"  ->  written to the cool-down row  ->  filtered out of _metricPointsFor
//   ->  p.avgHr = 0  ->  the HR chart shows nothing at all.
//
// Silent at the input (it accepted the number), silent at the save (the row persisted fine), and
// silent at the chart (an empty series looks identical to "never measured"). All five captured fields
// ride the same row, so avg HR, max HR, watts, pace/500m and stroke rate were lost together.
//
// Fixed by attaching to the last COUNTABLE round instead of the last row, falling back to the literal
// last row when an exercise has no countable round at all.
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Drives _applyCardioCapture directly against a hand-built runner state. No fixtures in the DB — the
// bug is entirely in which in-memory row receives the value, so a DB round-trip would only add noise.
async function capture (page, loggedSets) {
  return page.evaluate((loggedSets) => {
    localStorage.setItem('_cardioCaptureToggles', JSON.stringify({ hr: true, watts: true, pace: true, strokeRate: true }))
    const ex = { name: 'Probe', type: 'cardio', loggedSets: JSON.parse(JSON.stringify(loggedSets)) }
    window._runner = { exercises: [ex], exIdx: 0 }

    const mk = (id, val) => {
      let e = document.getElementById(id)
      if (!e) { e = document.createElement('input'); e.id = id; document.body.appendChild(e) }
      e.value = val
      return e
    }
    mk('wr-capture-avg-hr', '158')
    mk('wr-capture-max-hr', '174')
    mk('wr-capture-watts', '210')
    mk('wr-capture-pace', '1:52')
    mk('wr-capture-stroke-rate', '26')

    _applyCardioCapture(ex)

    ;['wr-capture-avg-hr', 'wr-capture-max-hr', 'wr-capture-watts', 'wr-capture-pace', 'wr-capture-stroke-rate']
      .forEach(id => document.getElementById(id)?.remove())

    return ex.loggedSets
  }, loggedSets)
}

// Mirrors _countableSets in app-progress — the filter every aggregate actually applies.
const countable = sets => sets.filter(s => !s.phase || s.phase === 'work')

test.describe('cardio capture survives a cool-down (2026-08-11)', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page) })

  test('captured HR lands on a countable round, not the cool-down that follows it', async ({ page }) => {
    const sets = await capture(page, [
      { phase: 'warmup', duration: '5:00' },
      { phase: 'work', duration: '4:00' },
      { phase: 'work', duration: '4:00' },
      { phase: 'cooldown', duration: '5:00' },
    ])

    const cooldown = sets[3]
    const lastWork = sets[2]
    console.log('lastWork:', JSON.stringify(lastWork), '| cooldown:', JSON.stringify(cooldown))

    // The regression: every one of these was on the cool-down row and nowhere else.
    expect(lastWork.avgHr).toBe('158')
    expect(lastWork.maxHr).toBe('174')
    expect(lastWork.avgWatts).toBe('210')
    expect(lastWork.pace).toBe('1:52')
    expect(lastWork.strokeRate).toBe('26')
    expect(cooldown.avgHr, 'the cool-down must not carry the capture').toBeUndefined()

    // The point of the fix: the value must survive the filter every Progress aggregate applies.
    const surviving = countable(sets).filter(s => s.avgHr)
    expect(surviving.length, 'HR was written somewhere every reader discards').toBe(1)
  })

  test('the earlier work round is left alone — one console glance is not stamped across every round', async ({ page }) => {
    const sets = await capture(page, [
      { phase: 'work', duration: '4:00' },
      { phase: 'work', duration: '4:00' },
      { phase: 'cooldown', duration: '5:00' },
    ])
    expect(sets[0].avgHr, 'an earlier round was not measured and must stay blank').toBeUndefined()
    expect(sets[1].avgHr).toBe('158')
  })

  test('ordinary cardio (no phases at all) is unchanged — the fix must not move the common case', async ({ page }) => {
    const sets = await capture(page, [{ duration: '20:00' }, { duration: '20:00' }])
    expect(sets[1].avgHr).toBe('158')
    expect(sets[0].avgHr).toBeUndefined()
  })

  test('an exercise with no countable round keeps the value rather than dropping it', async ({ page }) => {
    // Degenerate, but losing the number outright would be worse than parking it on the cool-down.
    const sets = await capture(page, [{ phase: 'warmup', duration: '5:00' }, { phase: 'cooldown', duration: '5:00' }])
    expect(sets[1].avgHr).toBe('158')
  })
})
