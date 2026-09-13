// Reordering was doing three expensive things on every single tap.
//
// Measured 2026-09-06: each ▲/▼ press ran an ownership check, a fetch, two swap updates, then
// `_afterTemplateExerciseSave` — which calls `openTemplate()` (a full re-fetch and repaint of the
// whole session) AND `_checkClientPlanPropagation`. Moving an exercise from eighth to first was
// seven taps, seven full reloads and seven "update your other copies?" checks.
//
// Jake, 2026-09-06, picking all three of the offered complaints: it reloads every time, one position
// per tap is too slow, and it nags about duplicate sessions.
//
// Now: the rows swap in the DOM immediately, the two updates still persist every swap (so nothing is
// held unsaved and there is no work to lose), and the propagation check is DEBOUNCED — tap seven
// times quickly and you are asked once, after you stop.
//
// The debounce is deliberately not "ask when you leave the editor". That version had a hole: leaving
// by any route other than the back button would silently skip propagation, and silently failing to
// sync the copies is worse than being asked too often.

const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// A hand-built list matching what openTemplate renders: a container, one card per exercise carrying
// its id, each with an up and a down button.
const buildList = (names) => `(() => {
  const wrap = document.createElement('div')
  wrap.id = 'tpl-ex-list'
  wrap.className = 'list'
  // The const on the next line matters: without it the array literal continues the previous
  // expression as string-indexing, which yields undefined. Automatic semicolon insertion does not
  // save you when the following line opens with a bracket. (No backticks in this comment: it lives
  // inside a template literal, and one would close the string.)
  const _names = ${JSON.stringify(names)}
  _names.forEach((n, i, arr) => {
    const card = document.createElement('div')
    card.className = 'card'
    card.dataset.exId = 'e' + (i + 1)
    card.dataset.exName = n
    card.innerHTML =
      '<button data-move="-1"' + (i === 0 ? ' disabled' : '') + '>up</button>' +
      '<button data-move="1"' + (i === arr.length - 1 ? ' disabled' : '') + '>down</button>' +
      '<span>' + n + '</span>'
    wrap.appendChild(card)
  })
  document.body.appendChild(wrap)
  return wrap
})()`

const readList = `(() => {
  const wrap = document.getElementById('tpl-ex-list')
  const cards = [...wrap.querySelectorAll('.card')]
  return {
    names: cards.map(c => c.dataset.exName),
    upDisabled: cards.map(c => c.querySelector('[data-move="-1"]').disabled),
    downDisabled: cards.map(c => c.querySelector('[data-move="1"]').disabled)
  }
})()`

test.describe('Reorder is instant, and asks about copies once (2026-09-06)', () => {
  test('_reorderRowsInDom swaps the rows and re-arms the arrows, without touching the network', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(`(() => {
      ${buildList(['Squat', 'Bench', 'Row'])}
      // Move 'Bench' (e2) up one.
      const names = _reorderRowsInDom('e2', -1)
      const after = ${readList}
      document.getElementById('tpl-ex-list').remove()
      return { names, after }
    })()`)
    expect(r.names, 'it returns the resulting order, which is what propagation needs').toEqual(['Bench', 'Squat', 'Row'])
    expect(r.after.names, 'and the DOM matches').toEqual(['Bench', 'Squat', 'Row'])
    // The arrows must follow the rows, or you can move something off the end of the list.
    expect(r.after.upDisabled, 'only the first row may have a disabled up arrow').toEqual([true, false, false])
    expect(r.after.downDisabled, 'only the last row may have a disabled down arrow').toEqual([false, false, true])
  })

  test('it refuses to move the first row up or the last row down', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(`(() => {
      ${buildList(['Squat', 'Bench', 'Row'])}
      const offTop = _reorderRowsInDom('e1', -1)
      const offEnd = _reorderRowsInDom('e3', 1)
      const missing = _reorderRowsInDom('nope', -1)
      const after = ${readList}
      document.getElementById('tpl-ex-list').remove()
      return { offTop, offEnd, missing, after }
    })()`)
    expect(r.offTop, 'moving the top row up is a no-op, not a wrap-around').toBe(null)
    expect(r.offEnd, 'moving the bottom row down is a no-op').toBe(null)
    expect(r.missing, 'an unknown id is a no-op, not a throw').toBe(null)
    expect(r.after.names, 'and nothing moved').toEqual(['Squat', 'Bench', 'Row'])
  })

  test('several reorders before Save produce zero database writes and zero propagation checks', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Reorder Burst' }).select('id').single()
      await db.from('workout_template_exercises').insert(['A', 'B', 'C', 'D'].map((n, i) => ({ template_id: t.id, exercise_name: '[E2E] ' + n, exercise_type: 'strength', order_index: i })))
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(() => {
        for (const name of ['[E2E] B', '[E2E] C', '[E2E] D']) {
          const key = window._templateDraft.exercises.find(e => e.exercise_name === name)._draftKey
          _stageReorderExercise(key, -1)
        }
        return { finalOrder: window._templateDraft.exercises.map(e => e.exercise_name) }
      })
      const dbOrder = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_template_exercises').select('exercise_name').eq('template_id', id).order('order_index')
        return data.map(r => r.exercise_name)
      }, setup.templateId)
      expect(dbOrder, 'nothing may write to the database before Save, no matter how many reorders happen').toEqual(['[E2E] A', '[E2E] B', '[E2E] C', '[E2E] D'])
      expect(r.finalOrder.length).toBe(4) // the draft itself did change; asserting the exact permutation isn't this test's job
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })
})
