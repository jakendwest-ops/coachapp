const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── The strength form (Step B, docs/superpowers/plans/2026-11-15-workout-builder-speed.md) ────────────────────────────────
//
// The settled list: docs/superpowers/specs/2026-11-11-add-exercise-sheet-scope.md. The real save round trip (draft -> Save workout
// -> reopen) is pinned by workout-builder-2026-10-28.spec.js; THESE pin the form's own behaviour on the real sheet: the range rule while
// typing and on the rest steppers, start-from-previous, More options and its red ✕, the pinned footer, Enter, and "set 1 sets it".
//
// Nothing here writes to the database: the sheet is opened over an in-memory draft, and the add is caught before it stages.

async function openSheet(page, { previous = null, type = 'weight_reps', sets = null } = {}) {
  await loginAsPT(page)
  await page.evaluate(({ previous, type, sets }) => {
    window._templateDraft = { exercises: previous ? [previous] : [] }
    _showExerciseSetsModal({ targetId: 'spec', runnerCtx: null, coachId: currentUser.id, picked: { id: null, name: 'Bench Press' }, existingType: type, existingSets: sets })
  }, { previous, type, sets })
  await expect(page.locator('#att-sets-container')).toBeVisible()
}
const S = (o = {}) => ({ repsMin: '8', repsMax: '8', effortType: 'rpe', effortMin: '8', effortMax: '8', restMin: '2:00', restMax: '2:00', ...o })
const flushed = page => page.evaluate(() => { flushTemplateSets('att-sets-container'); return JSON.parse(JSON.stringify(window._templateSets)) })

test.describe('the range rule while typing (Jake, 2026-11-13)', () => {
  test('typing a high end below the low end moves the LOW end down to it; typing a low end above the high end moves the high end up', async ({ page }) => {
    await openSheet(page, { sets: [S(), S()] })
    await page.click('#sf-reps-range-0')
    await page.fill('#ts-rmin-0', '10')
    await page.fill('#ts-rmax-0', '8'); await page.press('#ts-rmax-0', 'Tab')
    await expect(page.locator('#ts-rmin-0'), 'the typed 8 stays; the other end moves to match').toHaveValue('8')
    await page.fill('#ts-rmin-0', '12'); await page.press('#ts-rmin-0', 'Tab')
    await expect(page.locator('#ts-rmax-0')).toHaveValue('12')
    expect((await flushed(page)).map(s => [s.repsMin, s.repsMax])).toEqual([['12', '12'], ['12', '12']])
  })

  test('rest − / + steps 30 s; on Fixed it never goes below 0:00; on a range each end stops at the other', async ({ page }) => {
    await openSheet(page, { sets: [S()] })
    await page.click('#sf-rest-inc-min-0')
    await expect(page.locator('#ts-restmin-0')).toHaveValue('2:30')
    for (let i = 0; i < 7; i++) await page.click('#sf-rest-dec-min-0')
    await expect(page.locator('#ts-restmin-0'), 'floored at zero').toHaveValue('0:00')
    await page.click('#sf-rest-range-0')
    await page.click('#sf-rest-inc-max-0'); await page.click('#sf-rest-inc-max-0')   // 0:00 - 1:00
    await page.click('#sf-rest-inc-min-0'); await page.click('#sf-rest-inc-min-0'); await page.click('#sf-rest-inc-min-0')
    await expect(page.locator('#ts-restmin-0'), 'the low end stops at the high end').toHaveValue('1:00')
    await page.click('#sf-rest-dec-max-0')
    await expect(page.locator('#ts-restmax-0'), 'and the high end stops at the low end').toHaveValue('1:00')
  })

  test('Fixed after Range keeps the low end as the one value', async ({ page }) => {
    await openSheet(page, { sets: [S({ repsMin: '6', repsMax: '10' })] })
    await expect(page.locator('#sf-reps-range-0'), 'a stored range opens on Range').toHaveAttribute('aria-pressed', 'true')
    await page.click('#sf-reps-fixed-0')
    await expect(page.locator('#ts-rmax-0')).toHaveCount(0)
    expect((await flushed(page))[0]).toMatchObject({ repsMin: '6', repsMax: '6' })
  })
})

test.describe('a new exercise starts from the previous one (settled point 5)', () => {
  test('sets, reps, effort and rest come from the previous exercise, and a grey line says so', async ({ page }) => {
    await openSheet(page, { previous: { exercise_name: 'Squat', metric_type: 'weight_reps', sets_json: [S({ repsMin: '5', repsMax: '5', restMin: '3:00', restMax: '3:00', weight: '140' }), S({ repsMin: '5', repsMax: '5', restMin: '3:00', restMax: '3:00', weight: '140' })] } })
    await expect(page.locator('#sf-copied')).toContainText('copied from Squat')
    await expect(page.locator('#ts-step-n')).toHaveText('2')
    await expect(page.locator('#ts-rmin-0')).toHaveValue('5')
    await expect(page.locator('#ts-restmin-0')).toHaveValue('3:00')
    expect((await flushed(page)).every(s => !s.weight), 'a weight is never carried to a different lift').toBe(true)
  })

  test('nothing to start from (no previous strength exercise): three blank sets and no line', async ({ page }) => {
    await openSheet(page, { previous: { exercise_name: 'Row', metric_type: 'interval', sets_json: [{ workSecs: 30 }] } })
    await expect(page.locator('#sf-copied')).toHaveCount(0)
    await expect(page.locator('#ts-step-n')).toHaveText('3')
  })
})

test.describe('More options', () => {
  test('Notes is a chip; its red ✕ clears the note and hides the box', async ({ page }) => {
    await openSheet(page, { sets: [S()] })
    await expect(page.locator('#att-notes')).toBeHidden()
    await page.click('#sf-chip-notes')
    await page.fill('#att-notes', 'pause at the bottom')
    await page.click('#sf-x-notes')
    await expect(page.locator('#att-notes')).toBeHidden()
    await expect(page.locator('#att-notes')).toHaveValue('')
  })

  test('Load: a weight, then its red ✕ clears it from every set', async ({ page }) => {
    await openSheet(page, { sets: [S(), S()] })
    await page.click('#sf-chip-load')
    await page.fill('#ts-weight-0', '60')
    expect((await flushed(page)).map(s => Number(s.weight)), 'stored in kg (a number), on every set').toEqual([60, 60])
    await page.click('#sf-x-load')
    await expect(page.locator('#sf-opt-load')).toHaveCount(0)
    expect((await flushed(page)).map(s => s.weight)).toEqual(['', ''])
  })

  test('Bodyweight is a chip (Jake, 2026-11-15) and takes Load away', async ({ page }) => {
    await openSheet(page, { sets: [S()] })
    await page.click('#ts-bw-all')
    await expect(page.locator('#ts-bw-all')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#sf-chip-load')).toHaveCount(0)
    expect((await flushed(page))[0].bodyweight).toBe(true)
  })

  test('Type lives in More options; picking a non-strength type gives that type its own editor back', async ({ page }) => {
    await openSheet(page, { sets: [S()] })
    await expect(page.locator('#att-type')).toBeHidden()
    await page.click('#sf-chip-type')
    await page.selectOption('#att-type', 'timed_hold')
    await expect(page.locator('#att-sets-container')).not.toHaveAttribute('data-sf', '1')
    await expect(page.locator('#att-type'), 'the type control stays reachable on every type').toBeVisible()
  })
})

test.describe('straight sets on a "today\'s" base: set 1 sets the weight (Jake, 2026-11-15)', () => {
  test('set 1 saves with no %, sets 2 on with the %, and the screen says so', async ({ page }) => {
    await openSheet(page, { sets: [S(), S(), S()] })
    await page.click('#sf-chip-load'); await page.click('#sf-load-pct')
    await page.click('#sf-basis-topSet')
    await page.fill('#ts-imin-1', '80')   // set 1 sets the weight: the group's % box is set 2's
    await expect(page.locator('#sf-set1-note')).toContainText('Set 1 sets the weight')
    const clean = await page.evaluate(() => { flushTemplateSets('att-sets-container'); return _cleanTemplateSets(window._templateSets, _deriveFromMetricType('weight_reps'), 'weight_reps').map(s => [s.intensityMin, s.intensityBasis]) })
    expect(clean).toEqual([[null, 'topSet'], ['80', 'topSet'], ['80', 'topSet']])
    await expect(page.locator('#ts-block-all'), 'still one group').toBeVisible()
  })

  test('a unilateral exercise is offered only the saved-1RM base (the save makes every other base "stored")', async ({ page }) => {
    await openSheet(page, { type: 'unilateral', sets: [S()] })
    await page.click('#sf-chip-load'); await page.click('#sf-load-pct')
    await expect(page.locator('.sf-bases')).toHaveCount(0)
    await expect(page.locator('#ts-basis-help')).toHaveText(await page.evaluate(() => _intensityBasisHelp('stored')))
  })
})

test.describe('the sheet itself', () => {
  test('390 px: the footer is pinned - Add exercise is on screen without scrolling, and stays there scrolled to the end', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openSheet(page, { sets: [S(), S(), S()] })
    await page.click('#ts-topset-0')   // the longest page
    const onScreen = async () => { const b = await page.locator('#att-confirm-btn').boundingBox(); return !!b && b.y >= 0 && b.y + b.height <= 844 }
    expect(await onScreen(), 'at the top').toBe(true)
    await page.locator('#add-to-template-modal .modal').evaluate(e => { e.scrollTop = 99999 })
    expect(await onScreen(), 'at the bottom').toBe(true)
    expect(await page.locator('#add-to-template-modal .modal').evaluate(e => e.scrollWidth <= e.clientWidth), 'nothing runs off the side').toBe(true)
  })

  test('desktop: Enter in a box adds the exercise and goes on to the next one ("Add another")', async ({ page }) => {
    await openSheet(page, { sets: [S()] })
    await page.evaluate(() => { window.__added = null; window._stageAddExercise = a => { window.__added = a } })
    await page.fill('#ts-rmin-0', '6')
    await page.press('#ts-rmin-0', 'Enter')
    expect(await page.evaluate(() => window.__added)).toBe(true)
  })
})
