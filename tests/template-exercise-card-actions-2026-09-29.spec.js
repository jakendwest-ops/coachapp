const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── Workout page: the exercise cards (Jake, 2026-09-28, rebuilt 2026-10-28) ─────────────────────────────────
//
// Ledger: docs/bugs/2026-09-28-template-builder-edit-and-remove-buttons-squeeze-the-set-text.md, then
// docs/bugs/2026-10-28-*-template-page-*.md.
//
// 2026-09-28, Jake: "edit and remove buttons are too big and force the text on the left to be on separate
// lines." The fix then moved an Edit and a Remove button onto their own row under one line per set.
// 2026-10-28, Jake, after seeing the prototype: "the exercise builder is looking much better". The cards are now
// ONE short summary per exercise, the whole card is the Edit button (so nothing sits beside the text at all),
// Remove lives in the editor with an Undo on the page afterwards, and moving exercises is a Reorder mode.
// What stays from the 2026-09-28 bug: the prescription text must not wrap mid-sentence at the project's real
// test width (390px, playwright.config.js).
//
// Drives the real function (_renderTemplateExerciseList), not a re-typed markup — the builders here are
// asserted through the shipped renderer, matching this project's own testing convention
// (tests/solo-dashboard-tiles-2026-08-30.spec.js's own stated rule). window._templateDraft is hand-built,
// the same established pattern tests/ownership-anchors-2026-08-21.spec.js and
// tests/template-draft-save-2026-09-13.spec.js already use — no database write, nothing to clean up.

const BENCH = {
  _draftKey: 'k1', exercise_name: 'Bench Press', exercise_type: 'strength', metric_type: 'weight_reps',
  sets_json: [
    { repsMin: '5', repsMax: '8', effortType: 'rpe', effortMin: '8', restMin: '2:00' },
    { repsMin: '5', repsMax: '8', effortType: 'rpe', effortMin: '8', restMin: '2:00' },
  ],
}
const SQUAT = {
  _draftKey: 'k2', exercise_name: 'Back Squat', exercise_type: 'strength', metric_type: 'weight_reps',
  sets_json: [{ isTopSet: true, repsMin: '4', effortType: 'rpe', effortMin: '7' }, { repsMin: '8', intensityMin: '70', intensityBasis: 'topSetWeight' }],
}

async function renderCards(page, exercises = [BENCH]) {
  await loginAsPT(page)
  await page.evaluate((exercises) => {
    // The real app shell's own fixed bottom-nav is still underneath wherever this synthetic card
    // lands in document flow, and can sit on top of it on screen — Playwright then correctly refuses
    // to click a covered element. That's a collision between this test's own harness and irrelevant
    // chrome, not a real overlap a user would ever hit, so drop it before rendering the card.
    document.querySelector('nav.bottom-nav')?.remove()
    // Same reasoning as the bottom-nav above: loginAsPT lands on the real PT dashboard, which already
    // has its own .page-header (real welcome-back title + subtitle). _renderTemplateExerciseList finds
    // a .page-header by document.querySelector, which returns the FIRST match — without this, that's
    // the real dashboard one, and the function silently overwrites its title text and removes its
    // subtitle node. Harmless to these tests (they only ever query #tpl-ex-list/#template-exercise-list
    // by id) but confusing to debug from a trace, so remove the real one first rather than leave two.
    document.querySelectorAll('.page-header').forEach(e => e.remove())
    // The Reorder button lives in the page header (openTemplate builds it); the harness needs the same one.
    document.body.innerHTML += `<div class="page-header"><div><h1 class="page-title"></h1></div><button class="btn-secondary" id="tpl-reorder-btn" style="display:none" onclick="_toggleTemplateReorder()">Reorder</button></div><div id="template-exercise-list"></div>`
    window._tplReorder = false
    window._tplRemoved = null
    window._templateDraft = {
      templateId: 'x', ctx: {},
      meta: { name: 'Upper Body', description: null },
      metaBaseline: { name: 'Upper Body', description: null },
      exercisesBaseline: [],
      exercises: exercises.map((e, i) => ({ ...e, order_index: i })),
    }
    _renderTemplateExerciseList()
  }, exercises)
  return page.locator('#tpl-ex-list .card').first()
}

test.describe('Workout page exercise cards (2026-10-28)', () => {
  test('the whole card is ONE Edit button, and no Remove button sits on it', async ({ page }) => {
    const card = await renderCards(page)
    const edit = card.getByRole('button', { name: 'Edit Bench Press' })
    await expect(edit).toBeVisible()
    await expect(card.getByRole('button'), 'the card holds exactly one control — the card itself').toHaveCount(1)
    await expect(card.getByRole('button', { name: 'Remove' }), 'Remove moved into the editor (with an Undo here afterwards)').toHaveCount(0)

    const b = await page.evaluate(() => {
      const card = document.querySelector('#tpl-ex-list .card')
      const btn = card.querySelector('button')
      const r = btn.getBoundingClientRect(), c = card.getBoundingClientRect()
      return { fills: r.width >= c.width - 2 && r.height >= c.height - 2, tall: r.height >= 44 }
    })
    expect(b.fills, 'the button covers the whole card, so a tap anywhere on it edits').toBe(true)
    expect(b.tall, 'and it is at least a thumb tall (44px)').toBe(true)
  })

  test('identical sets read as ONE line, which does not wrap mid-sentence at 390px — the 2026-09-28 bug as Jake described it', async ({ page }) => {
    const card = await renderCards(page)
    const h = await page.evaluate(() => {
      const line = document.querySelector('#tpl-ex-list .tpl-ex-line')
      // clientHeight vs scrollHeight can't detect wrap here: this is a plain height:auto block, so
      // both grow together whether it renders as one line or three — neither ever "overflows" the
      // other. A Range over its contents gives one ClientRect per wrapped line fragment instead,
      // which is what actually distinguishes 1 line from 2.
      const range = document.createRange()
      range.selectNodeContents(line)
      const lineTops = new Set([...range.getClientRects()].map(r => Math.round(r.top)))
      return { text: line.textContent, lineCount: lineTops.size, lines: document.querySelectorAll('#tpl-ex-list .tpl-ex-line').length }
    })
    expect(h.lines, 'two identical sets collapse into one line, not one line per set').toBe(1)
    expect(h.text, 'the full prescription text is present, with the count up front').toBe('2 × 5–8 reps · RPE 8 · 2:00 rest')
    expect(h.lineCount, 'one line: no wrap forced by a squeezed column').toBe(1)
    await expect(card).toBeVisible()
  })

  test('a top set card reads "Top set" first, then the back-off sets', async ({ page }) => {
    await renderCards(page, [SQUAT])
    const lines = await page.locator('#tpl-ex-list .tpl-ex-line').allInnerTexts()
    expect(lines[0]).toMatch(/^Top set/)
    expect(lines[1]).toMatch(/^then /)
    await expect(page.locator('#tpl-ex-list .tpl-chip', { hasText: 'Top set' })).toBeVisible()
  })

  test('tapping the card opens the editor for THAT exercise', async ({ page }) => {
    const card = await renderCards(page)
    await page.evaluate(() => { window.__editArgs = null; window.showEditTemplateExerciseModal = (k, id) => { window.__editArgs = [k, id] } })
    await card.getByRole('button', { name: 'Edit Bench Press' }).click()
    expect(await page.evaluate(() => window.__editArgs)).toEqual(['k1', 'x'])
  })

  test('removing from the editor stages the removal and the page offers Undo; Undo puts it back in the same place', async ({ page }) => {
    await renderCards(page, [BENCH, SQUAT])
    // The SECOND exercise, so "put it back where it was" cannot be confused with "put it back at the top".
    await page.evaluate(() => _stageRemoveExercise('k2'))      // exactly what the editor's Remove button calls

    await expect(page.locator('#tpl-ex-list .card')).toHaveCount(1)
    await expect(page.locator('.tpl-undo')).toContainText('Removed Back Squat')
    expect(await page.evaluate(() => window._templateDraft.exercises.map(e => e._draftKey)), 'the removal is staged in the draft, nothing written').toEqual(['k1'])

    await page.locator('#tpl-undo-btn').click()
    await expect(page.locator('.tpl-undo')).toHaveCount(0)
    const after = await page.evaluate(() => window._templateDraft.exercises.map(e => [e._draftKey, e.order_index]))
    expect(after, 'back in its old place, with the order numbers rewritten to match').toEqual([['k1', 0], ['k2', 1]])
    await expect(page.locator('#tpl-ex-list .card').nth(1)).toContainText('Back Squat')
  })

  test('when the Undo bar is dismissed the removal stands', async ({ page }) => {
    await renderCards(page, [BENCH, SQUAT])
    await page.evaluate(() => _stageRemoveExercise('k2'))
    await expect(page.locator('.tpl-undo')).toBeVisible()
    await page.evaluate(() => _dismissRemovedExercise())        // what the 8-second timer calls
    await expect(page.locator('.tpl-undo')).toHaveCount(0)
    expect(await page.evaluate(() => window._templateDraft.exercises.map(e => e._draftKey))).toEqual(['k1'])
  })

  test('Reorder mode: arrows replace the tap-to-edit card, and Done puts the cards back', async ({ page }) => {
    await renderCards(page, [BENCH, SQUAT])
    const reorder = page.locator('#tpl-reorder-btn')
    await expect(reorder, 'with two exercises there is something to reorder').toBeVisible()
    await expect(page.locator('#tpl-ex-list [data-move]'), 'arrows are hidden until asked for').toHaveCount(0)

    await reorder.click()
    await expect(reorder).toHaveText('Done')
    await expect(page.locator('#tpl-ex-list [data-move]')).toHaveCount(4)
    await expect(page.getByRole('button', { name: 'Edit Bench Press' }), 'a card is not an Edit button while arranging').toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Move Bench Press up' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Move Back Squat down' })).toBeDisabled()

    await page.getByRole('button', { name: 'Move Bench Press down' }).click()
    expect(await page.evaluate(() => window._templateDraft.exercises.map(e => e._draftKey))).toEqual(['k2', 'k1'])

    await reorder.click()
    await expect(reorder).toHaveText('Reorder')
    await expect(page.locator('#tpl-ex-list [data-move]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit Back Squat' })).toBeVisible()
  })

  test('one exercise: no Reorder button, and "+ Add exercise" sits after the list', async ({ page }) => {
    await renderCards(page, [BENCH])
    await expect(page.locator('#tpl-reorder-btn')).toBeHidden()
    const order = await page.evaluate(() => {
      const list = document.getElementById('tpl-ex-list'), add = document.getElementById('tpl-add-btn')
      return !!add && !!(list.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING)
    })
    expect(order, 'the add button follows the cards, where the eye is after reading them').toBe(true)
  })
})
