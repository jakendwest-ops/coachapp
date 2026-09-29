const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── Template builder: Edit/Remove buttons don't squeeze the set text (Jake, 2026-09-28) ─────────────────
//
// Ledger: docs/bugs/2026-09-28-template-builder-edit-and-remove-buttons-squeeze-the-set-text.md
//
// Jake's own words: "edit and remove buttons are too big and force the text on the left to be on separate
// lines." At the project's real test width (390px, playwright.config.js) the Edit/Remove buttons sat beside
// the set text in one flex row, leaving it ~140px and wrapping "5–8 reps · RPE 8 · 2:00 rest" mid-line. They
// now sit on their own full-width row below the set text, same idea as the runner's bottom bar.
//
// Drives the real function (_renderTemplateExerciseList), not a re-typed markup — the builders here are
// asserted through the shipped renderer, matching this project's own testing convention
// (tests/solo-dashboard-tiles-2026-08-30.spec.js's own stated rule). window._templateDraft is hand-built,
// the same established pattern tests/ownership-anchors-2026-08-21.spec.js and
// tests/template-draft-save-2026-09-13.spec.js already use — no database write, nothing to clean up.

async function renderCard(page) {
  await loginAsPT(page)
  await page.evaluate(() => {
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
    document.body.innerHTML += `<div class="page-header"><div><h1 class="page-title"></h1></div></div><div id="template-exercise-list"></div>`
    window._templateDraft = {
      templateId: 'x', ctx: {},
      meta: { name: 'Upper Body', description: null },
      metaBaseline: { name: 'Upper Body', description: null },
      exercisesBaseline: [],
      exercises: [{
        _draftKey: 'k1', exercise_name: 'Bench Press', exercise_type: 'strength', metric_type: 'weight_reps',
        sets_json: [
          { repsMin: '5', repsMax: '8', effortType: 'rpe', effortMin: '8', restMin: '2:00' },
          { repsMin: '5', repsMax: '8', effortType: 'rpe', effortMin: '8', restMin: '2:00' },
        ],
      }],
    }
    _renderTemplateExerciseList()
  })
  return page.locator('#tpl-ex-list .card').first()
}

test.describe('Template exercise card: Edit/Remove layout (2026-09-29)', () => {
  test('Edit and Remove sit on their own row below the set text, not beside it', async ({ page }) => {
    const card = await renderCard(page)
    const edit = card.getByRole('button', { name: 'Edit', exact: true })
    const remove = card.getByRole('button', { name: 'Remove', exact: true })
    await expect(edit).toBeVisible()
    await expect(remove).toBeVisible()

    const b = await page.evaluate(() => {
      const card = document.querySelector('#tpl-ex-list .card')
      const editEl = [...card.querySelectorAll('button')].find(b => b.textContent.trim() === 'Edit')
      const removeEl = [...card.querySelectorAll('button')].find(b => b.textContent.trim() === 'Remove')
      const nameEl = [...card.querySelectorAll('span')].find(s => s.textContent.trim() === 'Bench Press')
      // The real markup is <div><span>Set 1:</span> 5–8 reps ...</div> — a label SPAN plus trailing text, not
      // a leaf div. Match on the span's own text, not "no children" (which nothing here actually has).
      const set1 = [...card.querySelectorAll('div')].find(d => d.querySelector(':scope > span')?.textContent.trim() === 'Set 1:')
      return {
        editTop: editEl.getBoundingClientRect().top, nameTop: nameEl.getBoundingClientRect().top,
        editBottom: editEl.getBoundingClientRect().bottom, removeBottom: removeEl.getBoundingClientRect().bottom,
        set1Bottom: set1 ? set1.getBoundingClientRect().bottom : null,
        editFull: editEl.getBoundingClientRect().width > 100,
      }
    })
    expect(b.editTop, 'Edit is not on the same row as the exercise name/number/arrows').toBeGreaterThan(b.nameTop + 10)
    expect(b.set1Bottom, 'the Set 1 line was found').not.toBeNull()
    expect(b.editTop, 'the button row comes after the set text, not beside it').toBeGreaterThanOrEqual(b.set1Bottom)
    expect(b.editFull, 'each button takes a real share of the row width, not a cramped inline pair').toBe(true)
  })

  test('at 390px the set line no longer wraps mid-sentence — the bug as Jake described it', async ({ page }) => {
    const card = await renderCard(page)
    const h = await page.evaluate(() => {
      const set1 = [...document.querySelectorAll('#tpl-ex-list div')].find(d => d.querySelector(':scope > span')?.textContent.trim() === 'Set 1:')
      // clientHeight vs scrollHeight can't detect wrap here: this is a plain height:auto block, so
      // both grow together whether it renders as one line or three — neither ever "overflows" the
      // other. A Range over its contents gives one ClientRect per wrapped line fragment instead,
      // which is what actually distinguishes 1 line from 2 (confirmed against the real unfixed
      // markup: this exact string reports 2 distinct rect tops at the current ~163px column width).
      const range = document.createRange()
      range.selectNodeContents(set1)
      const lineTops = new Set([...range.getClientRects()].map(r => Math.round(r.top)))
      return { text: set1.textContent, lineCount: lineTops.size }
    })
    expect(h.text, 'the full prescription text is present').toContain('5–8 reps · RPE 8 · 2:00 rest')
    expect(h.lineCount, 'one line: no wrap forced by a squeezed column').toBe(1)
    await expect(card).toBeVisible()
  })

  test('Remove still stages the removal, and Edit still opens the edit modal — behaviour unchanged, only layout moved', async ({ page }) => {
    const card = await renderCard(page)
    let editCalled = null
    await page.evaluate(() => { window.__editArgs = null; window.showEditTemplateExerciseModal = (k, id) => { window.__editArgs = [k, id] } })
    await card.getByRole('button', { name: 'Edit', exact: true }).click()
    editCalled = await page.evaluate(() => window.__editArgs)
    expect(editCalled).toEqual(['k1', 'x'])

    await card.getByRole('button', { name: 'Remove', exact: true }).click()
    const remaining = await page.evaluate(() => window._templateDraft.exercises.length)
    expect(remaining, 'Remove still calls the real _stageRemoveExercise, which staged the delete').toBe(0)
  })
})
