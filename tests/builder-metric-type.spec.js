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

  // 2026-07-22 — the optional set-target fields moved behind a native <details> disclosure to cut the
  // builder's scroll height. That introduces two ways to silently lose prescribed data, because
  // flushTemplateSets reads every field back OUT of the DOM by id:
  //   (a) a field the user typed into while it was COLLAPSED (still in the DOM — must still be read)
  //   (b) a field NOT RENDERED AT ALL for the current metric_type (must be PRESERVED, not clobbered
  //       to undefined — this is what the `??` in flushTemplateSets is for)
  // Same class as les-043: removing/hiding a container must not remove what it held.
  test('collapsed and unrendered set fields survive flushTemplateSets', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(() => {
      const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) } return e }
      mk('att-type', 'select'); mk('att-sets-container', 'div')

      window._templateSets = [{ effortType: 'rpe', isDistanceBased: true, distanceM: '500' }]
      renderTemplateSets('att-sets-container', 'cardio')
      const closedByDefault = document.querySelector('.ts-more')?.open === false
      document.getElementById('ts-wattsmin-0').value = '210'   // typed while collapsed
      flushTemplateSets('att-sets-container')
      const collapsedWrite = window._templateSets[0].wattsMin

      // Switch metric_type — the cardio inputs are now absent from the DOM entirely.
      renderTemplateSets('att-sets-container', 'weight_reps')
      flushTemplateSets('att-sets-container')
      const afterSwitch = { d: window._templateSets[0].distanceM, w: window._templateSets[0].wattsMin }

      // A set carrying a legacy km-era paceKm value must still get an editable input (its only
      // remaining escape hatch — the field is otherwise retired) and the disclosure must auto-open.
      window._templateSets = [{ effortType: 'rpe', isDistanceBased: true, paceKmMin: '4:30' }]
      renderTemplateSets('att-sets-container', 'cardio')
      return {
        closedByDefault, collapsedWrite, afterSwitch,
        legacyInput: !!document.getElementById('ts-pkmmin-0'),
        legacyAutoOpen: document.querySelector('.ts-more')?.open === true,
      }
    })

    expect(r.closedByDefault).toBe(true)
    expect(r.collapsedWrite).toBe('210')        // read even though the user never expanded it
    expect(r.afterSwitch.d).toBe('500')         // not clobbered when the input isn't rendered
    expect(r.afterSwitch.w).toBe('210')
    expect(r.legacyInput).toBe(true)            // legacy paceKm still editable/clearable
    expect(r.legacyAutoOpen).toBe(true)         // and surfaced, not buried
  })
})
