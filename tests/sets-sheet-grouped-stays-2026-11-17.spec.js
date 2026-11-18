const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── The "same for every set" view stays put (Jake, 2026-11-17) ─────────────────────────────────────────────────────────────
//
// docs/bugs/2026-11-17-fixed-range-or-rest-step-switches-the-sets-sheet-to-each-set-different.md: tapping Fixed / Range, or the
// rest − / +, changed only the set whose boxes are drawn, so the sets stopped matching and the sheet jumped to "Each set different".
// The sets change together unless "Customise each set" is tapped. Nothing here writes to the database (an in-memory draft).

async function openSheet(page, sets) {
  await loginAsPT(page)
  await page.evaluate(sets => {
    window._templateDraft = { exercises: [] }
    _showExerciseSetsModal({ targetId: 'spec', runnerCtx: null, coachId: currentUser.id, picked: { id: null, name: 'Chest Supported Dumbbell Row' }, existingType: 'weight_reps', existingSets: sets })
  }, sets)
  await expect(page.locator('#att-sets-container')).toBeVisible()
}
const S = (o = {}) => ({ repsMin: '8', repsMax: '10', effortType: 'rir', effortMin: '1', effortMax: '1', restMin: '1:30', restMax: '1:30', ...o })
const flushed = page => page.evaluate(() => { flushTemplateSets('att-sets-container'); return JSON.parse(JSON.stringify(window._templateSets)) })
const stillGrouped = async (page, block) => {
  await expect(page.locator(block), 'still the "same for every set" view').toBeVisible()
  await expect(page.locator('.sf-tile'), 'no per-set tiles').toHaveCount(0)
}

test.describe('Straight sets', () => {
  test('Range to Fixed on reps changes every set and keeps the view', async ({ page }) => {
    await openSheet(page, [S(), S(), S(), S()])
    await page.click('#sf-reps-fixed-0')
    await stillGrouped(page, '#ts-block-all')
    expect((await flushed(page)).map(s => [s.repsMin, s.repsMax])).toEqual(Array(4).fill(['8', '8']))
  })

  test('Fixed to Range on reps keeps the view', async ({ page }) => {
    await openSheet(page, [S({ repsMax: '8' }), S({ repsMax: '8' }), S({ repsMax: '8' })])
    await page.click('#sf-reps-range-0')
    await stillGrouped(page, '#ts-block-all')
  })

  test('rest + changes every set and keeps the view', async ({ page }) => {
    await openSheet(page, [S(), S(), S()])
    await page.click('#sf-rest-inc-min-0')
    await stillGrouped(page, '#ts-block-all')
    expect((await flushed(page)).map(s => [s.restMin, s.restMax])).toEqual(Array(3).fill(['2:00', '2:00']))
  })

  test('under "Customise each set" a change stays on the one set', async ({ page }) => {
    await openSheet(page, [S(), S(), S()])
    await page.click('#ts-show-each')
    await page.click('#sf-reps-fixed-0')
    expect((await flushed(page)).map(s => [s.repsMin, s.repsMax])).toEqual([['8', '8'], ['8', '10'], ['8', '10']])
  })
})

test.describe('Top set + back-offs', () => {
  const top = () => [S({ isTopSet: true, repsMin: '5', repsMax: '5' }), S(), S(), S()]

  test('Fixed on the back-offs changes every back-off, not the top set, and keeps the view', async ({ page }) => {
    await openSheet(page, top())
    await page.click('#sf-reps-fixed-1')
    await stillGrouped(page, '#ts-block-back')
    expect((await flushed(page)).map(s => [s.repsMin, s.repsMax])).toEqual([['5', '5'], ['8', '8'], ['8', '8'], ['8', '8']])
  })

  test('rest − on the back-offs changes every back-off, not the top set, and keeps the view', async ({ page }) => {
    await openSheet(page, top())
    await page.click('#sf-rest-dec-min-1')
    await stillGrouped(page, '#ts-block-back')
    expect((await flushed(page)).map(s => s.restMin)).toEqual(['1:30', '1:00', '1:00', '1:00'])
  })
})
