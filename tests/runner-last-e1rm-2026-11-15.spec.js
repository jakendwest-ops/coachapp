const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')

// ─── "% of last session's e1RM" in the logger (Step E, docs/superpowers/plans/2026-11-15-workout-builder-speed.md) ──────────
//
// Jake, 2026-11-15: every % option shows on both the Straight sets and the Top set pages. Straight sets have no top set today, so
// their e1RM comes from this exercise's best WORKING set last session: intensityBasis 'lastBest'.
//
// In-memory runner state with the history handed in, as runner-topset-ghost-2026-10-03.spec.js does: nothing is written to the
// database, so there is no fixture to leak.

const SET = { repsMin: 5, repsMax: 5, intensityMin: 80, intensityMax: 80, intensityBasis: 'lastBest' }
// Best working set 100 x 5 -> e1RM 100 x (1 + 5/30) = 116.67 -> 80% = 93.3 -> floors to 92.5 (the 2.5 kg plate step).
// The 140 x 3 warm-up would give a far higher base and must be left out.
const LAST = [
  { set_number: 1, weight_kg: 140, reps_achieved: 3, phase: 'warmup' },
  { set_number: 2, weight_kg: 100, reps_achieved: 5, phase: 'work' },
  { set_number: 3, weight_kg: 90,  reps_achieved: 5, phase: 'work' },
]

async function startRunner(page, { last, settled = true }) {
  await loginAsClient(page)
  await page.evaluate(({ set, last, settled }) => {
    window._unitPrefs = { ...(window._unitPrefs || {}), weight: 'kg', jumpHeight: 'cm' }
    _runner = {
      clientId: 'last-e1rm-spec', startTime: Date.now(), exIdx: 0,
      lastSession: last ? { 'Squat': { date: '2026-11-08', sets: last } } : { 'Squat': null },
      lastSessionDone: settled ? { 'Squat': true } : {},
      exercises: [{
        name: 'Squat', type: 'strength', metricType: 'weight_reps', targetSets: 3, sets_json: [set, set, set],
        loggedSets: [], exerciseId: null, order_index: 0, restSecs: 60, oneRM: 200,   // a saved 1RM that must NEVER be used
      }],
    }
    renderRunner()
  }, { set: SET, last, settled })
  await expect(page.locator('#workout-runner button:text-is("End")')).toBeVisible()
}

test.describe("% of last session's e1RM (2026-11-15)", () => {
  test('every set shows the weight worked out from last time\'s best WORKING set, not the warm-up', async ({ page }) => {
    await startRunner(page, { last: LAST })
    for (const i of [0, 1, 2]) {
      await expect(page.locator(`#set-${i}-weight`), `set ${i + 1}: 80% of the e1RM from 100 x 5`).toHaveAttribute('placeholder', '92.5')
    }
    await expect(page.locator('#workout-runner').getByText('OF LAST E1RM').first()).toBeVisible()
    await expect(page.locator('#workout-runner').getByText(/Set your 1RM/i), 'it needs no saved 1RM').toHaveCount(0)
  })

  test('no history: an honest blank and a note saying why - never a saved 1RM and never a guess', async ({ page }) => {
    await startRunner(page, { last: null })
    await expect(page.locator('#set-0-weight'), 'the plain unit word every blank weight box shows: no number').toHaveAttribute('placeholder', 'kg')
    await expect(page.locator('#set-0-basis-note')).toContainText("Can't work out a weight from last time")
    await expect(page.locator('#workout-runner').getByText(/Set your 1RM/i)).toHaveCount(0)
  })

  test('while last session is still being read, no "cannot" note flashes up', async ({ page }) => {
    await startRunner(page, { last: null, settled: false })
    await expect(page.locator('#set-0-weight')).toHaveAttribute('placeholder', 'kg')
    await expect(page.locator('#set-0-basis-note'), 'the read has not settled: "nothing from last time" would be false').toHaveCount(0)
  })
})
