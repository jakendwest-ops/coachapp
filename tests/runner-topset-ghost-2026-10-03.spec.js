const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')

// ─── RPE top sets show no ghost text from last session (Jake, 2026-10-03) ────────────────────────────────────────
//
// Jake, with a screenshot of a top-set exercise whose three weight boxes all read "130" in grey: "There shouldnt be
// ghost text in runner when using RPE top sets. These fields should only be populated once the top set has been
// established."
//
// 130 was LAST SESSION's weight for each set number. For a plain exercise that is a useful reference. For a top-set
// exercise it is wrong: the weight is not prescribed (it is whatever the lifter works up to at the prescribed RPE) and
// the backoff weights are a percentage of TODAY's top set. renderStrengthTable's own comment already said an honest
// blank beats a plausible stale number — and the line after it fell back to last session's weight for that set number.
//
// Like runner-layout-2026-09-28.spec.js, everything here is in-memory runner state with the history handed in directly:
// nothing is written to the database, so there is no fixture to leak. Each test gets a fresh page.
//
// What must NOT change is pinned too, because a blanket "no ghosts" would be the easy over-reach: the PRESCRIBED reps
// (the coach's plan, not history), and every ghost on an exercise that has no top set.

const TOP  = { repsMin: 3, repsMax: 3, effortType: 'rpe', effortMin: 6, effortMax: 6, isTopSet: true }
const BACK = { repsMin: 6, repsMax: 6, intensityMin: 65, intensityMax: 65, intensityBasis: 'topSet' }
// Last session, shaped like Jake's screenshot: 130 kg on every set, an RPE on the top set, and a fourth set whose reps
// (12) can only reach the screen if last session leaks into a row the coach prescribed nothing for.
const LAST = [
  { set_number: 1, weight_kg: 130, reps_achieved: 3,  effort_value: 8, effort_type: 'rpe' },
  { set_number: 2, weight_kg: 130, reps_achieved: 6 },
  { set_number: 3, weight_kg: 130, reps_achieved: 6 },
  { set_number: 4, weight_kg: 130, reps_achieved: 12 },
]

async function startRunner(page, { sets, targetSets = sets.length, metricType = 'weight_reps', last = LAST }) {
  await loginAsClient(page)
  await page.evaluate(({ sets, targetSets, metricType, last }) => {
    window._unitPrefs = { ...(window._unitPrefs || {}), weight: 'kg', jumpHeight: 'cm' }
    _runner = {
      clientId: 'topset-ghost-spec', startTime: Date.now(), exIdx: 0,
      lastSession: { 'Top Set Lift': { date: '2026-09-25', sets: last } },
      exercises: [{
        name: 'Top Set Lift', type: 'strength', metricType, targetSets, sets_json: sets,
        loggedSets: [], exerciseId: null, order_index: 0, restSecs: 60,
      }],
    }
    renderRunner()
  }, { sets, targetSets, metricType, last })
  await expect(page.locator('#workout-runner button:text-is("End")')).toBeVisible()
}

test.describe('RPE top sets: no ghost text from last session (2026-10-03)', () => {
  test('before the top set is logged, no weight box shows a number — not last session\'s 130, and not the unit word either', async ({ page }) => {
    await startRunner(page, { sets: [TOP, BACK, BACK] })
    for (const i of [0, 1, 2]) {
      await expect(page.locator(`#set-${i}-weight`), `set ${i + 1}'s weight box must be empty until the top set is established`)
        .toHaveAttribute('placeholder', '')
    }
  })

  test('the top set\'s effort box does not echo last session\'s RPE either', async ({ page }) => {
    await startRunner(page, { sets: [TOP, BACK, BACK] })
    await expect(page.locator('#set-0-effort'), 'last time was RPE 8 on the same scale — still not a suggestion for today').toHaveAttribute('placeholder', '')
  })

  test('the coach\'s PRESCRIBED reps still show; a row the coach prescribed nothing for shows the bare word, not last session\'s reps', async ({ page }) => {
    // Four rows against three prescriptions: row 4 has nothing prescribed, and last session's set 4 was 12 reps.
    await startRunner(page, { sets: [TOP, BACK, BACK], targetSets: 4 })
    await expect(page.locator('#set-0-reps'), 'the top set\'s prescribed 3').toHaveAttribute('placeholder', '3')
    await expect(page.locator('#set-1-reps'), 'the backoff\'s prescribed 6').toHaveAttribute('placeholder', '6')
    await expect(page.locator('#set-3-reps'), 'no prescription for row 4: the bare word, never last session\'s 12').toHaveAttribute('placeholder', 'reps')
    await expect(page.locator('#set-3-weight'), 'nor last session\'s 130 on that row').toHaveAttribute('placeholder', '')
  })

  test('once the top set is ticked, the backoff boxes are populated from TODAY\'s top set — and still nothing from last session', async ({ page }) => {
    await startRunner(page, { sets: [TOP, BACK, BACK] })
    // 100 x 3 @ RPE 8 -> 86.3% -> e1RM 115.87. 65% = 75.3 -> floors to 75 (the 2.5 kg plate step).
    await page.fill('#set-0-weight', '100')
    await page.fill('#set-0-reps', '3')
    await page.fill('#set-0-effort', '8')
    await page.click('#set-0-done')
    await expect(page.locator('#set-1-weight')).toHaveAttribute('placeholder', '75')
    await expect(page.locator('#set-2-weight')).toHaveAttribute('placeholder', '75')
    await expect(page.locator('#workout-runner').getByText('Log the top set first'), 'the "do this first" note goes once it is done').toHaveCount(0)
  })

  test('(scope) an exercise with NO top set keeps every last-session ghost, exactly as before', async ({ page }) => {
    const plain = { repsMin: 3, repsMax: 3, effortType: 'rpe', effortMin: 6, effortMax: 6 }
    await startRunner(page, { sets: [plain, plain, plain] })
    await expect(page.locator('#set-0-weight')).toHaveAttribute('placeholder', '130')
    await expect(page.locator('#set-0-effort')).toHaveAttribute('placeholder', '8')
  })

  test('(scope) a stale isTopSet flag on a non-weight exercise does not blank that exercise\'s ghosts', async ({ page }) => {
    // The builder only honours a top set on weight_reps (app-workouts.js: `isTop = i === 0 && metricType === 'weight_reps'`),
    // but toggling the metric type preserves the flag. The runner must apply the same gate, or flipping a jump exercise
    // would silently strip its last-session height ghost.
    await startRunner(page, {
      sets: [{ repsMin: 5, isTopSet: true }], metricType: 'jump_height',
      last: [{ set_number: 1, height_cm: 60, reps_achieved: 5 }],
    })
    await expect(page.locator('#set-0-height_cm')).toHaveAttribute('placeholder', '60')
  })
})
