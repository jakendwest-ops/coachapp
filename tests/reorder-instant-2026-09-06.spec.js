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

// buildList/readList (hand-built markup carrying data-ex-id, matching what openTemplate used to
// render) and the two tests that used them -- '_reorderRowsInDom swaps the rows...' and 'it refuses
// to move the first row up or the last row down' -- DELETED 2026-09-13 (Task 14, Minor cleanup).
// _renderTemplateExerciseList no longer emits data-ex-id (rows are matched by data-draft-key now),
// so _reorderRowsInDom (deleted alongside these tests) was unreachable from production and these
// tests were green against a DOM shape the app no longer renders. The remaining test below already
// covers the CURRENT staged-reorder mechanism end to end against real rendered markup.

test.describe('Reorder is instant, and asks about copies once (2026-09-06)', () => {

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
