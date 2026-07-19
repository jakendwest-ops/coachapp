const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Sub-project ②a: the builder's save path (saveExerciseToTemplate) must persist metric_type and derive
// the legacy exercise_type + per-set unilateral/timed flags from it, so the current runner keeps working.
// This drives the REAL save function (not a raw insert) via injected modal state — the same approach the
// ②b test used for saveRunnerSession — so it actually exercises _deriveFromMetricType + the insert.
test.describe('Builder metric_type picker — save persistence', () => {
  test('saveExerciseToTemplate persists metric_type + derives exercise_type/flags', async ({ page }) => {
    await loginAsPT(page)
    await page.click('text=Personal')
    await page.waitForTimeout(1500)

    const rows = await page.evaluate(async () => {
      const tag = '[E2E] metric-picker ' + Date.now()
      // Real solo template to save into.
      const { data: t } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: null, program_id: null, name: tag, is_personal: true })
        .select('id').single()

      // Minimal DOM the save function reads.
      window._templateCtx = {} // ensures _resolveEditableTemplateId is a no-op passthrough
      const mk = (id, tag2 = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(tag2); e.id = id; document.body.appendChild(e) } return e }
      mk('att-type'); mk('att-notes'); mk('att-superset'); mk('att-error'); mk('add-to-template-modal', 'div')

      const saveOne = async (name, metricType) => {
        document.getElementById('att-type').value = metricType
        document.getElementById('att-notes').value = ''
        document.getElementById('att-superset').value = ''
        window._exerciseDetailPicked = { id: null, name }
        window._templateSets = [{ effortType: 'rpe', repsMin: '8', amrap: true }]
        await saveExerciseToTemplate(t.id)
      }
      await saveOne(tag + ' Uni', 'unilateral')
      await saveOne(tag + ' Hold', 'timed_hold')

      const { data } = await db.from('workout_template_exercises')
        .select('exercise_name, exercise_type, metric_type, sets_json').eq('template_id', t.id).order('order_index')
      // cleanup
      await db.from('workout_template_exercises').delete().eq('template_id', t.id)
      await db.from('workout_templates').delete().eq('id', t.id)
      return data
    })

    const uni = rows.find(r => r.exercise_name.endsWith('Uni'))
    expect(uni.metric_type).toBe('unilateral')
    expect(uni.exercise_type).toBe('strength')      // derived
    expect(uni.sets_json[0].unilateral).toBe(true)  // derived onto the set
    expect(uni.sets_json[0].timed).toBe(false)
    expect(uni.sets_json[0].amrap).toBe(true)       // per-set flag preserved

    const hold = rows.find(r => r.exercise_name.endsWith('Hold'))
    expect(hold.metric_type).toBe('timed_hold')
    expect(hold.exercise_type).toBe('strength')
    expect(hold.sets_json[0].timed).toBe(true)
    expect(hold.sets_json[0].unilateral).toBe(false)
  })
})
