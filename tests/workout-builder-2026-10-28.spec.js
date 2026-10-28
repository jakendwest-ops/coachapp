const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── The exercise builder, rebuilt (Jake, 2026-10-28) ────────────────────────────────────────────────────────
//
// Ledger: docs/bugs/2026-10-28-template-page-and-edit-exercise-modal-need-a-ui-ux-rework.md,
//         docs/bugs/2026-10-28-back-off-sets-need-a-clear-choice-of-percent-of-top-set-weight-or-percent-of-e1rm.md,
//         docs/bugs/2026-10-28-the-copy-set-up-arrow-button-is-unintuitive.md.
//
// Jake: "the exercise builder is looking much better" (the prototype). What changed in the editor:
//   - sets that match are ONE group: "Straight sets" / "Top set + back-offs", a number-of-sets stepper, one row of fields;
//     "Customise each set" opens the per-set cards, which also open BY THEMSELVES when saved sets already differ;
//   - the back-off "% of" dropdown has three plainly-named choices, with a worked example you can type into;
//   - AMRAP and bodyweight stay visible switches (Jake's 2026-08-14 rule), and the copy button says "Same as set N".
// The pure rules are pinned by tests-node/set-editor-groups.test.mjs and tests-node/intensity-basis.test.mjs; THESE drive the
// real editor and the real save path, because the bug class here lives in render/save wiring (_cleanTemplateSets is an allowlist).
//
// Owns its fixtures end to end: a fresh template + exercise per test, removed in afterEach.

let fixture = null

async function openEditor(page, sets, { type = 'weight_reps', extraExercise = false } = {}) {
  await loginAsPT(page)
  const tag = '[E2E] Builder 10-28 ' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
  const setup = await page.evaluate(async ({ tag, sets, type, extraExercise }) => {
    const { data: t, error: tErr } = await db.from('workout_templates')
      .insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: tag }).select('id').single()
    if (tErr) return { error: 'template: ' + tErr.message }
    const rows = [{ template_id: t.id, exercise_name: tag + ' Exercise', exercise_type: 'strength', metric_type: type, order_index: 0, sets_json: sets }]
    if (extraExercise) rows.push({ template_id: t.id, exercise_name: tag + ' Second', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 1, sets_json: [{ repsMin: '5', effortType: 'rpe' }] })
    const { error: exErr } = await db.from('workout_template_exercises').insert(rows)
    if (exErr) return { error: 'exercise: ' + exErr.message }
    return { templateId: t.id }
  }, { tag, sets, type, extraExercise })
  expect(setup.error, 'fixture setup must succeed before any assertion runs').toBeUndefined()
  fixture = { templateId: setup.templateId, tag }
  await reopen(page)
}

// A fresh openTemplate() re-reads the database (not the in-memory draft), then opens the first exercise's editor: proves a value
// really round-tripped through the save path.
async function reopen(page) {
  await page.evaluate(async (id) => { await openTemplate(id) }, fixture.templateId)
  await page.evaluate(async () => {
    const row = window._templateDraft.exercises[0]
    await showEditTemplateExerciseModal(row._draftKey, window._templateDraft.templateId)
  })
  await page.waitForSelector('#att-sets-container', { state: 'visible' })
}

// Same two steps a coach takes: the editor's Save (stages in memory) then "Save workout" (writes).
async function save(page) {
  await page.click('#att-confirm-btn')
  await page.waitForSelector('#save-template-draft-btn')
  const err = await page.evaluate(async () => {
    try { await saveTemplateDraft(); return null } catch (e) { return e?.message || String(e) }
  })
  expect(err, 'saveTemplateDraft must not throw').toBeNull()
}

const sets = page => page.evaluate(() => window._templateSets)

test.afterEach(async ({ page }) => {
  if (!fixture) return
  const { templateId } = fixture
  fixture = null
  // .select('id') and a row count: an RLS-refused delete resolves as { data: [], error: null } and looks exactly like one that worked.
  const gone = await page.evaluate(async (id) => {
    const a = await db.from('workout_template_exercises').delete().eq('template_id', id).select('id')
    const b = await db.from('workout_templates').delete().eq('id', id).select('id')
    return { error: a.error?.message || b.error?.message || null, templates: b.data?.length ?? 0 }
  }, templateId)
  expect(gone.error, 'teardown must not hit an error').toBeNull()
  expect(gone.templates, 'and must actually remove the fixture template').toBe(1)
})

const THREE = () => [0, 1, 2].map(() => ({ repsMin: '8', effortType: 'rpe', effortMin: '8', restMin: '2:00' }))

test.describe('editor: sets that match are one group', () => {
  test('three matching sets open as ONE row with a count of 3, not three cards', async ({ page }) => {
    await openEditor(page, THREE())
    await expect(page.locator('#ts-block-all')).toBeVisible()
    await expect(page.locator('#ts-step-n')).toHaveText('3')
    await expect(page.locator('#ts-rmin-1'), 'only the group\'s first set has fields in this view').toHaveCount(0)
    await expect(page.locator('#ts-show-each')).toHaveText('Customise each set (3)')
    await expect(page.locator('#ts-straight-0')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#ts-topset-0')).toHaveAttribute('aria-pressed', 'false')
  })

  test('the stepper adds and removes sets, never below one, and the new sets copy the group', async ({ page }) => {
    await openEditor(page, THREE())
    await page.fill('#ts-rmin-0', '6')
    await page.click('#ts-step-inc')
    await expect(page.locator('#ts-step-n')).toHaveText('4')
    await page.click('#ts-step-dec'); await page.click('#ts-step-dec'); await page.click('#ts-step-dec')
    await expect(page.locator('#ts-step-n')).toHaveText('1')
    await page.click('#ts-step-dec')
    await expect(page.locator('#ts-step-n'), 'a group never drops below one set').toHaveText('1')
    await page.click('#ts-step-inc'); await page.click('#ts-step-inc')
    await save(page)
    await reopen(page)
    const s = await sets(page)
    expect(s.length).toBe(3)
    expect(s.map(x => x.repsMin), 'what was typed on set 1 reached every set, including the added ones').toEqual(['6', '6', '6'])
  })

  test('typing on the group sets every set, and it survives a save and reopen', async ({ page }) => {
    await openEditor(page, THREE())
    await page.fill('#ts-rmin-0', '10')
    await page.fill('#ts-restmin-0', '1:30')
    await save(page)
    await reopen(page)
    const s = await sets(page)
    expect(s.map(x => x.repsMin)).toEqual(['10', '10', '10'])
    expect(s.map(x => x.restMin)).toEqual(['1:30', '1:30', '1:30'])
    await expect(page.locator('#ts-block-all'), 'they still match, so it reopens grouped').toBeVisible()
  })

  test('saved sets that already differ open one by one, with a way to make them match', async ({ page }) => {
    const mixed = THREE(); mixed[2].repsMin = '5'
    await openEditor(page, mixed)
    await expect(page.locator('#ts-block-all'), 'a difference must never be hidden by the grouped view').toHaveCount(0)
    await expect(page.locator('#ts-rmin-2')).toHaveValue('5')
    await expect(page.locator('.wb-notice')).toContainText('different targets')
    await page.click('#ts-make-same')
    await expect(page.locator('#ts-block-all')).toBeVisible()
    await save(page)
    await reopen(page)
    expect((await sets(page)).map(x => x.repsMin), 'matching on the first set is a tap the coach made, not something we did silently').toEqual(['8', '8', '8'])
  })

  test('"Customise each set" shows a labelled "Same as set N" button, not a bare arrow', async ({ page }) => {
    await openEditor(page, THREE())
    await page.click('#ts-show-each')
    await expect(page.locator('#ts-block-all')).toHaveCount(0)
    const copy = page.getByRole('button', { name: 'Copy set 1 into set 2' })
    await expect(copy).toBeVisible()
    await expect(copy).toHaveText('Same as set 1')
    await page.fill('#ts-rmin-0', '12')
    await copy.click()
    await expect(page.locator('#ts-rmin-1'), 'the button copies the set above into this one').toHaveValue('12')
    await expect(page.locator('#ts-rmin-2'), 'and leaves the others alone').toHaveValue('8')
  })

  test('the AMRAP switch makes the LAST set as-many-reps-as-possible, stays in the group, and saves', async ({ page }) => {
    await openEditor(page, THREE())
    const amrap = page.locator('#ts-amrap-last')
    await expect(amrap, 'AMRAP is a visible switch, never hidden by grouping (Jake, 2026-08-14)').toBeVisible()
    await expect(amrap).toHaveAttribute('aria-pressed', 'false')
    await amrap.click()
    await expect(amrap).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#ts-block-all'), 'still the grouped view').toBeVisible()
    await save(page)
    await reopen(page)
    const s = await sets(page)
    expect(s.map(x => !!x.amrap)).toEqual([false, false, true])
    await expect(page.locator('#ts-block-all'), 'the "3 × 8, then AMRAP" shape is still one group').toBeVisible()
    await expect(page.locator('#ts-amrap-last')).toHaveAttribute('aria-pressed', 'true')
  })

  test('the bodyweight switch marks every set and takes the weight box away', async ({ page }) => {
    await openEditor(page, THREE())
    await expect(page.locator('#ts-weight-0')).toBeVisible()
    await page.click('#ts-bw-all')
    await expect(page.locator('#ts-bw-all')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#ts-weight-0'), 'a bodyweight set has no weight to prescribe').toHaveCount(0)
    await save(page)
    await reopen(page)
    expect((await sets(page)).map(x => !!x.bodyweight)).toEqual([true, true, true])
  })
})

test.describe('editor: top set + back-offs and the "% of" choice', () => {
  test('choosing "Top set + back-offs" makes the back-off set and offers the three "% of" choices', async ({ page }) => {
    await openEditor(page, [{ repsMin: '3', effortType: 'rpe', effortMin: '8' }])
    await page.click('#ts-topset-0')
    await expect(page.locator('#ts-block-top')).toBeVisible()
    await expect(page.locator('#ts-block-back')).toBeVisible()
    await expect(page.locator('#ts-step-n'), 'one back-off set was made').toHaveText('1')
    const options = await page.locator('#ts-basis-1 option').allTextContents()
    expect(options).toEqual(['Today\'s top set weight', 'Today\'s estimated 1RM', 'Last saved 1RM'])
    await expect(page.locator('#ts-basis-1'), 'a new back-off set starts on the top set weight: no effort or saved 1RM needed').toHaveValue('topSetWeight')
    await expect(page.locator('#ts-basis-help')).not.toBeEmpty()
  })

  test('the worked example shows what each choice gives for the same top set', async ({ page }) => {
    await openEditor(page, [{ repsMin: '4', effortType: 'rpe', effortMin: '7' }])
    await page.click('#ts-topset-0')
    await page.fill('#ts-imin-1', '70')
    const calc = page.locator('#ts-example-calc')
    await page.fill('#ts-example-kg', '100')
    // 100 kg x 4 at RPE 7 -> an estimated 1RM of about 123 kg.
    await page.selectOption('#ts-basis-1', 'topSetWeight')
    await expect(calc).toContainText('70% =')
    await expect(calc).toContainText('70 kg')
    await page.selectOption('#ts-basis-1', 'topSet')
    await expect(calc).toContainText('estimated 1RM')
    await expect(calc).toContainText('85 kg')
    await page.selectOption('#ts-basis-1', 'stored')
    await expect(calc).toContainText('82.5 kg')
    // Changing the example weight re-works the sentence without touching the saved sets.
    await page.selectOption('#ts-basis-1', 'topSetWeight')
    await page.fill('#ts-example-kg', '130')
    await expect(calc, '70% of 130 is 91, rounded down to the nearest 2.5 as the runner does').toContainText('90 kg')
  })

  for (const basis of ['topSetWeight', 'topSet', 'stored']) {
    test(`"${basis}" is saved on the back-off set and comes back on reopen`, async ({ page }) => {
      await openEditor(page, [{ repsMin: '3', effortType: 'rpe', effortMin: '8' }])
      await page.click('#ts-topset-0')
      await page.fill('#ts-rmin-1', '8')
      await page.selectOption('#ts-basis-1', basis)
      await page.fill('#ts-imin-1', '70')
      await save(page)
      await reopen(page)
      const s = await sets(page)
      expect(s[0].isTopSet).toBe(true)
      expect(s[1].intensityBasis).toBe(basis)
      expect(Number(s[1].intensityMin)).toBe(70)
      expect(s[1].isTopSet, 'only set 1 is ever the top set').toBeFalsy()
      await expect(page.locator('#ts-basis-1')).toHaveValue(basis)
      await expect(page.locator('#ts-imin-1')).toHaveValue('70')
    })
  }

  test('a top set with several back-offs keeps them in step, and the stepper counts only the back-offs', async ({ page }) => {
    await openEditor(page, [{ repsMin: '3', effortType: 'rpe', effortMin: '8' }])
    await page.click('#ts-topset-0')
    await page.fill('#ts-rmin-1', '8')
    await page.fill('#ts-imin-1', '75')
    await page.click('#ts-step-inc'); await page.click('#ts-step-inc')
    await expect(page.locator('#ts-step-n')).toHaveText('3')
    await save(page)
    await reopen(page)
    const s = await sets(page)
    expect(s.length, 'the top set plus three back-offs').toBe(4)
    expect(s.slice(1).map(x => x.intensityMin)).toEqual(['75', '75', '75'])
    expect(s.slice(1).map(x => x.repsMin)).toEqual(['8', '8', '8'])
    expect(s.slice(1).every(x => x.intensityBasis === 'topSetWeight')).toBe(true)
  })

  test('the last back-off can be AMRAP while the others stay fixed', async ({ page }) => {
    await openEditor(page, [{ repsMin: '3', effortType: 'rpe', effortMin: '8' }])
    await page.click('#ts-topset-0')
    await page.fill('#ts-imin-1', '70')
    await page.click('#ts-step-inc')
    await page.click('#ts-amrap-last')
    await save(page)
    await reopen(page)
    expect((await sets(page)).map(x => !!x.amrap)).toEqual([false, false, true])
  })

  test('switching back to straight sets keeps the sets and warns about a back-off that still points at the top set', async ({ page }) => {
    await openEditor(page, [{ repsMin: '3', effortType: 'rpe', effortMin: '8' }])
    await page.click('#ts-topset-0')
    await page.fill('#ts-imin-1', '70')
    await page.selectOption('#ts-basis-1', 'topSet')
    await page.click('#ts-straight-0')
    await expect(page.locator('#ts-straight-0')).toHaveAttribute('aria-pressed', 'true')
    const text = await page.locator('#att-sets-container').innerText()
    expect(text, 'the warning names the set, as before').toContain('no longer a top set')
    const s = await sets(page)
    expect(s.length).toBe(2)
    expect(s[1].intensityBasis, 'nothing was silently rewritten').toBe('topSet')
  })

  test('the top set has no weight box, and a back-off set can still have a fixed weight', async ({ page }) => {
    await openEditor(page, [{ repsMin: '3', effortType: 'rpe', effortMin: '8' }])
    await page.click('#ts-topset-0')
    await expect(page.locator('#ts-weight-0'), 'you choose the weight on the day').toHaveCount(0)
    await expect(page.locator('#ts-block-top')).toContainText('You choose the weight on the day')
    await expect(page.locator('#ts-topset-effort-warning'), 'an RPE is prescribed, so no warning').toBeHidden()
    await page.fill('#ts-emin-0', '')
    await page.fill('#ts-emax-0', '')
    await page.evaluate(() => _syncTopSetEffortWarning())
    await expect(page.locator('#ts-topset-effort-warning'), 'no effort on a top set is called out').toBeVisible()
  })
})

test.describe('editor: other exercise types keep their cards', () => {
  test('a timed hold keeps the per-set cards (no structure control, no grouped view)', async ({ page }) => {
    await openEditor(page, [{ durationSecs: 30 }, { durationSecs: 30 }], { type: 'timed_hold' })
    await expect(page.locator('#ts-block-all')).toHaveCount(0)
    await expect(page.locator('#ts-topset-0')).toHaveCount(0)
    await expect(page.locator('#att-sets-container')).toContainText('Set 2')
  })

  test('unilateral has the grouped view but no top-set choice', async ({ page }) => {
    await openEditor(page, [{ repsMin: '8' }, { repsMin: '8' }], { type: 'unilateral' })
    await expect(page.locator('#ts-block-all')).toBeVisible()
    await expect(page.locator('#ts-topset-0'), 'the top set exists on weight and reps only').toHaveCount(0)
  })
})

test.describe('the workout page', () => {
  test('tap a card, edit, save: the card updates; remove from the editor, then Undo brings it back', async ({ page }) => {
    await openEditor(page, THREE(), { extraExercise: true })
    await page.click('#att-confirm-btn')                       // close the editor opened by the helper, nothing changed
    const first = page.getByRole('button', { name: new RegExp('^Edit .* Exercise$') })
    await expect(first).toBeVisible()
    await expect(first).toContainText('3 × 8 reps')

    await first.click()
    await expect(page.locator('#edit-tex-modal')).toBeVisible()
    await page.fill('#ts-rmin-0', '5')
    await page.click('#att-confirm-btn')
    await expect(first, 'the card shows the new numbers straight away').toContainText('3 × 5 reps')

    await first.click()
    await page.locator('#edit-tex-modal .btn-danger', { hasText: 'Remove' }).click()
    await expect(page.locator('#edit-tex-modal')).toHaveCount(0)
    await expect(page.locator('.tpl-undo')).toContainText('Removed')
    await expect(page.locator('#tpl-ex-list .card')).toHaveCount(1)

    await page.click('#tpl-undo-btn')
    await expect(page.locator('#tpl-ex-list .card')).toHaveCount(2)
    await expect(page.locator('#tpl-ex-list .card').first(), 'back where it was, edits kept').toContainText('3 × 5 reps')
  })
})
