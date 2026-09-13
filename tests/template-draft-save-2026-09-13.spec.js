const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('Template draft: creation', () => {
  test('opening a template builds window._templateDraft as an editable copy, untouched baseline kept separately', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Draft Model Test' }).select('id').single()
      await db.from('workout_template_exercises').insert([
        { template_id: t.id, exercise_name: '[E2E] Bench', exercise_type: 'strength', order_index: 0, sets_json: [{ repsMin: '5' }] },
        { template_id: t.id, exercise_name: '[E2E] Row', exercise_type: 'strength', order_index: 1, sets_json: [{ repsMin: '5' }] },
      ])
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(() => ({
        templateId: window._templateDraft?.templateId,
        exerciseCount: window._templateDraft?.exercises?.length,
        baselineCount: window._templateDraft?.exercisesBaseline?.length,
        names: window._templateDraft?.exercises?.map(e => e.exercise_name),
        allHaveDraftKey: window._templateDraft?.exercises?.every(e => !!e._draftKey),
        allHaveRealId: window._templateDraft?.exercises?.every(e => typeof e.id === 'string'),
        // baseline and exercises must be SEPARATE arrays/objects, not the same reference —
        // otherwise mutating one mutates the other and there is nothing to diff against.
        separateArrays: window._templateDraft?.exercises !== window._templateDraft?.exercisesBaseline,
        meta: window._templateDraft?.meta,
        metaBaseline: window._templateDraft?.metaBaseline,
        separateMeta: window._templateDraft?.meta !== window._templateDraft?.metaBaseline,
      }))
      expect(r.templateId).toBe(setup.templateId)
      expect(r.exerciseCount).toBe(2)
      expect(r.baselineCount).toBe(2)
      expect(r.names).toEqual(['[E2E] Bench', '[E2E] Row'])
      expect(r.allHaveDraftKey, 'every draft row needs a stable local key for DOM/array matching').toBe(true)
      expect(r.allHaveRealId, 'a pre-existing row keeps its real database id in the draft').toBe(true)
      expect(r.separateArrays, 'exercises and exercisesBaseline must not be the same array reference').toBe(true)
      expect(r.meta).toEqual({ name: '[E2E] Draft Model Test', description: null })
      expect(r.separateMeta, 'meta and metaBaseline must not be the same object reference').toBe(true)
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })
})
