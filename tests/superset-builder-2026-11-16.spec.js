const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── Supersets in the builder (Step C, docs/superpowers/plans/2026-11-15-workout-builder-speed.md) ──────────────────────────────────
//
// The typed "Superset group" box is gone: "Add + superset" adds this exercise and reopens the picker, and the next one becomes A2 (the letter
// is chosen for you), starting from A1's sets. Sets stay in step across the superset; "Remove from superset" takes one out. The pure rules
// (tags, letter, block reorder, set sync, leave) are pinned by tests-node/superset-builder.test.mjs; THESE drive the real sheet, the real
// picker and the real save, because the wiring (which row gets the letter, where the new row lands, what reaches the database) is the risk.
//
// Owns its fixtures: a fresh template with one exercise, and two fresh library exercises to pick, all removed in afterEach.

let fixture = null

async function setUp(page) {
  await loginAsPT(page)
  const tag = '[E2E] Superset 11-16 ' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
  const setup = await page.evaluate(async (tag) => {
    const { data: t, error: tErr } = await db.from('workout_templates')
      .insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: tag }).select('id').single()
    if (tErr) return { error: 'template: ' + tErr.message }
    const { error: wErr } = await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: tag + ' First', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0, sets_json: [{ repsMin: '5', repsMax: '5', effortType: 'rpe' }] })
    if (wErr) return { error: 'row: ' + wErr.message }
    const { data: lib, error: lErr } = await db.from('exercises').insert([
      { coach_id: currentUser.id, name: tag + ' Press', metric_type: 'weight_reps' },
      { coach_id: currentUser.id, name: tag + ' Row', metric_type: 'weight_reps' },
    ]).select('id')
    if (lErr) return { error: 'library: ' + lErr.message }
    _dropExerciseLibCache()   // the picker keeps the library once read; these two are new
    await openTemplate(t.id)
    return { templateId: t.id, libIds: lib.map(r => r.id) }
  }, tag)
  expect(setup.error, 'fixture setup must succeed before any assertion runs').toBeUndefined()
  fixture = { ...setup, tag }
  return tag
}

async function pick(page, name) {
  await expect(page.locator('#exercise-picker-modal')).toBeVisible({ timeout: 10000 })
  await page.fill('#exp-search', name)
  await page.locator('#exercise-picker-modal').getByText(name, { exact: true }).click()
  await expect(page.locator('#add-to-template-modal')).toBeVisible({ timeout: 10000 })
}

const tags = page => page.locator('#tpl-ex-list .card').evaluateAll(cards => cards.map(c => [c.dataset.exName.replace(/^.* /, ''), c.dataset.ss || '']))

test.afterEach(async ({ page }) => {
  if (!fixture) return
  const { templateId, libIds } = fixture
  fixture = null
  // .select('id') and a row count: an RLS-refused delete resolves as { data: [], error: null } and looks exactly like one that worked.
  const gone = await page.evaluate(async ({ id, libIds }) => {
    const a = await db.from('workout_template_exercises').delete().eq('template_id', id).select('id')
    const b = await db.from('workout_templates').delete().eq('id', id).select('id')
    const c = await db.from('exercises').delete().in('id', libIds).select('id')
    return { error: a.error?.message || b.error?.message || c.error?.message || null, templates: b.data?.length ?? 0, lib: c.data?.length ?? 0 }
  }, { id: templateId, libIds })
  expect(gone.error, 'teardown must not hit an error').toBeNull()
  expect(gone.templates, 'and must actually remove the fixture template').toBe(1)
  expect(gone.lib, 'and both library exercises').toBe(2)
})

test('Add + superset: the next exercise becomes A2, starts from A1\'s sets, and both reach the database as one superset', async ({ page }) => {
  const tag = await setUp(page)
  await expect(page.locator('#att-superset'), 'the typed box is gone').toHaveCount(0)
  await page.click('#tpl-add-btn')
  await pick(page, tag + ' Press')
  await page.click('#ts-step-inc')   // one more set than the copied start
  const a1Sets = await page.locator('#ts-step-n').textContent()
  expect(Number(a1Sets)).toBeGreaterThan(1)
  await expect(page.locator('#sf-ss-note'), 'not in a superset yet: no note').toHaveCount(0)
  await page.click('#att-add-superset')

  await pick(page, tag + ' Row')
  await expect(page.locator('#sf-ss-note')).toContainText('Superset A')
  await expect(page.locator('#ts-step-n'), 'A2 starts from A1\'s sets').toHaveText(a1Sets)
  await expect(page.locator('#att-add-superset'), 'pressed on A2 it would make A3: still offered').toBeVisible()
  await page.click('#att-confirm-btn')

  await expect.poll(() => tags(page)).toEqual([['First', ''], ['Press', 'A1'], ['Row', 'A2']])
  await page.evaluate(async () => { await saveTemplateDraft() })
  const saved = await page.evaluate(async (id) => {
    const { data } = await db.from('workout_template_exercises').select('exercise_name, superset_group, order_index, sets_json').eq('template_id', id).order('order_index')
    return data.map(r => [r.exercise_name.replace(/^.* /, ''), r.superset_group, r.sets_json?.length ?? 0])
  }, fixture.templateId)
  expect(saved).toEqual([['First', null, 1], ['Press', 'A', Number(a1Sets)], ['Row', 'A', Number(a1Sets)]])

  // Reopened from the database, the tags are still there.
  await page.evaluate(async (id) => { await openTemplate(id) }, fixture.templateId)
  await expect.poll(() => tags(page)).toEqual([['First', ''], ['Press', 'A1'], ['Row', 'A2']])
})

test('an A3 sheet does not offer a fourth; Sets changed on one member change the others; Remove from superset takes one out', async ({ page }) => {
  const tag = await setUp(page)
  await page.click('#tpl-add-btn')
  await pick(page, tag + ' Press')
  await page.click('#att-add-superset')
  await pick(page, tag + ' Row')
  await page.click('#att-add-superset')
  await pick(page, tag + ' Press')   // the same lift twice is allowed; it is A3
  await expect(page.locator('#att-add-superset'), 'A3: no fourth').toHaveCount(0)
  await page.click('#att-confirm-btn')
  await expect.poll(() => tags(page)).toEqual([['First', ''], ['Press', 'A1'], ['Row', 'A2'], ['Press', 'A3']])

  // Sets in step: two more sets on A2, and A1 and A3 follow.
  await page.locator('#tpl-ex-list .card[data-ss="A2"] .tpl-ex-main').click()
  await expect(page.locator('#att-ss-remove')).toBeVisible()
  await page.click('#ts-step-inc'); await page.click('#ts-step-inc')
  const n = Number(await page.locator('#ts-step-n').textContent())
  expect(n).toBeGreaterThanOrEqual(3)
  await page.click('#att-confirm-btn')
  const counts = await page.evaluate(() => window._templateDraft.exercises.map(e => e.sets_json?.length ?? 0))
  expect(counts).toEqual([1, n, n, n])

  // Remove from superset: A2 leaves, goes below the other two, and they are renumbered A1, A2.
  await page.locator('#tpl-ex-list .card[data-ss="A2"] .tpl-ex-main').click()
  await page.click('#att-ss-remove')
  await expect.poll(() => tags(page)).toEqual([['First', ''], ['Press', 'A1'], ['Press', 'A2'], ['Row', '']])
})

test('cancelling the picker after "Add + superset" leaves the first exercise as a normal one, with no letter', async ({ page }) => {
  const tag = await setUp(page)
  await page.click('#tpl-add-btn')
  await pick(page, tag + ' Press')
  await page.click('#att-add-superset')
  await expect(page.locator('#exercise-picker-modal')).toBeVisible({ timeout: 10000 })
  await page.locator('#exercise-picker-modal .modal-close').click()
  await expect.poll(() => tags(page)).toEqual([['First', ''], ['Press', '']])
  expect(await page.evaluate(() => window._templateDraft.exercises.map(e => e.superset_group))).toEqual([null, null])
})

test('an existing exercise can start a superset ("Save + superset"), and the new one goes in right below it', async ({ page }) => {
  const tag = await setUp(page)
  await page.click('#tpl-add-btn')
  await pick(page, tag + ' Press')
  await page.click('#att-confirm-btn')
  await page.locator('#tpl-ex-list .card').first().locator('.tpl-ex-main').click()
  await page.click('#att-add-superset')
  await pick(page, tag + ' Row')
  await page.click('#att-confirm-btn')
  await expect.poll(() => tags(page)).toEqual([['First', 'A1'], ['Row', 'A2'], ['Press', '']])
})

test('390 px: the footer with all four buttons stays on screen and nothing runs off the side', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const tag = await setUp(page)
  await page.click('#tpl-add-btn')
  await pick(page, tag + ' Press')
  for (const id of ['#att-add-superset', '#att-add-another', '#att-confirm-btn']) {
    const b = await page.locator(id).boundingBox()
    expect(b && b.y >= 0 && b.y + b.height <= 844 && b.x >= 0 && b.x + b.width <= 390, id + ' on screen').toBe(true)
  }
  expect(await page.locator('#add-to-template-modal .modal').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true)
})

test('Reorder moves a superset as one block: up on A2 takes A1 with it past the exercise above', async ({ page }) => {
  const tag = await setUp(page)
  await page.click('#tpl-add-btn')
  await pick(page, tag + ' Press')
  await page.click('#att-add-superset')
  await pick(page, tag + ' Row')
  await page.click('#att-confirm-btn')
  await page.click('#tpl-reorder-btn')
  await page.locator('#tpl-ex-list .card[data-ss="A2"] button[data-move="-1"]').click()
  await expect.poll(() => tags(page)).toEqual([['Press', 'A1'], ['Row', 'A2'], ['First', '']])
  await expect(page.locator('#tpl-ex-list .card[data-ss="A2"] button[data-move="-1"]'), 'the superset is at the top: nowhere further up').toBeDisabled()
})

// ─── Review fixes, 2026-11-16 ─────────────────────────────────────────────────────────────────────────────────────────────────────
// A superset member used to pass ITS set count on to the others on every save: a top-set A1 lost a back-off when A2 was added (A2 started
// from the back-offs only), a timed-hold or interval A2 cut A1 to one set. Now A2 opens with A1's exact count, and only a CHANGED count is
// passed on, never from an interval.
async function firstToTopSet(page) {
  await page.evaluate(() => {
    const r = window._templateDraft.exercises[0]
    r.sets_json = [{ isTopSet: true, repsMin: '3', repsMax: '3', effortType: 'rpe' }, ...[1, 2, 3].map(() => ({ repsMin: '6', repsMax: '6', effortType: 'rpe' }))]
    r.sets = 4
  })
}
const setCounts = page => page.evaluate(() => window._templateDraft.exercises.map(e => [e.exercise_name.replace(/^.* /, ''), e.sets_json?.length ?? 0]))

test('a top set + 3 back-offs keeps all four sets when A2 is added, and A2 opens with four', async ({ page }) => {
  const tag = await setUp(page)
  await firstToTopSet(page)
  await page.locator('#tpl-ex-list .card').first().locator('.tpl-ex-main').click()
  await page.click('#att-add-superset')
  await pick(page, tag + ' Row')
  await expect(page.locator('#ts-step-n')).toHaveText('4')
  await page.click('#att-confirm-btn')
  expect(await setCounts(page)).toEqual([['First', 4], ['Row', 4]])
  expect(await page.evaluate(() => !!window._templateDraft.exercises[0].sets_json[0].isTopSet), 'A1 is still a top set').toBe(true)
})

test('a timed-hold A2 does not cut A1, and an interval member changes nobody', async ({ page }) => {
  const tag = await setUp(page)
  await firstToTopSet(page)
  await page.locator('#tpl-ex-list .card').first().locator('.tpl-ex-main').click()
  await page.click('#att-add-superset')
  await pick(page, tag + ' Row')
  await page.click('#sf-chip-type')
  await page.selectOption('#att-type', 'timed_hold')
  await page.click('#att-confirm-btn')
  expect((await setCounts(page))[0]).toEqual(['First', 4])
  // Now make A2 an interval: one block. Saving it must not cut A1 to one set.
  await page.locator('#tpl-ex-list .card[data-ss="A2"] .tpl-ex-main').click()
  await page.selectOption('#att-type', 'interval')
  await page.click('#att-confirm-btn')
  expect((await setCounts(page))[0]).toEqual(['First', 4])
})

test('Remove on one of a pair leaves no hidden letter on the other, and Undo puts the pair back', async ({ page }) => {
  const tag = await setUp(page)
  await page.locator('#tpl-ex-list .card').first().locator('.tpl-ex-main').click()
  await page.click('#att-add-superset')
  await pick(page, tag + ' Row')
  await page.click('#att-confirm-btn')
  await page.locator('#tpl-ex-list .card[data-ss="A2"] .tpl-ex-main').click()
  await page.locator('#edit-tex-modal .btn-danger').click()
  expect(await page.evaluate(() => window._templateDraft.exercises.map(e => e.superset_group))).toEqual([null])
  await page.click('#tpl-undo-btn')
  await expect.poll(() => tags(page)).toEqual([['First', 'A1'], ['Row', 'A2']])
})

test('an older superset whose members differ: saving one without touching Sets leaves the others as they were', async ({ page }) => {
  const tag = await setUp(page)
  await page.locator('#tpl-ex-list .card').first().locator('.tpl-ex-main').click()
  await page.click('#att-add-superset')
  await pick(page, tag + ' Row')
  await page.click('#att-confirm-btn')
  await page.evaluate(() => {   // as saved before Step C: A1 with 4 sets, A2 with 2
    const [a, b] = window._templateDraft.exercises
    a.sets_json = [1, 2, 3, 4].map(() => ({ repsMin: '5', repsMax: '5', effortType: 'rpe' })); a.sets = 4
    b.sets_json = [1, 2].map(() => ({ repsMin: '10', repsMax: '10', effortType: 'rpe' })); b.sets = 2
    _renderTemplateExerciseList()
  })
  await page.locator('#tpl-ex-list .card[data-ss="A2"] .tpl-ex-main').click()
  await page.fill('#ts-rmin-0', '12')
  await page.click('#att-confirm-btn')
  expect(await setCounts(page)).toEqual([['First', 4], ['Row', 2]])
})
