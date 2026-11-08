const { test, expect } = require('./fixtures')
const { loginAsPT2, sweepPT2, acceptConfirm } = require('./helpers')

// Phase 2a of the solo audit response (Jake, 2026-11-08): "Add kg" beside % of 1RM and RPE. The whole path against the real database, on PT2, whose steady state is "owns nothing".
const SETS = [{ repsMin: '5', weight: 100 }, { repsMin: '5', weight: '90' }, { repsMin: '5', weight: '' }, { repsMin: '8', bodyweight: true }]
const seed = (page, sets = SETS, duration = 4) => page.evaluate(async ({ sets, duration }) => {
  const uid = currentUser.id
  const one = async (q, l) => { const { data, error } = await q; if (error) throw new Error(l + ': ' + error.message); return data }
  const prog = await one(db.from('programs').insert({ coach_id: uid, name: '[E2E] add kg', is_personal: false }).select('id').single(), 'program')
  const phase = await one(db.from('program_phases').insert({ program_id: prog.id, name: 'Block', duration_weeks: duration, order_index: 0 }).select('id').single(), 'phase')
  const t = await one(db.from('workout_templates').insert({ coach_id: uid, name: '[E2E] add kg day', is_personal: false }).select('id').single(), 'template')
  await one(db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: 'Squat', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0,
    sets_json: sets }).select('id'), 'exercise')
  await one(db.from('program_phase_workouts').insert({ phase_id: phase.id, template_id: t.id, day_of_week: 1, day_label: 'Mon', session_order: 1, week_number: 1 }).select('id'), 'slot')
  return { programId: prog.id, phaseId: phase.id }
}, { sets, duration })
const openDialog = async (page, s) => {
  await page.evaluate(async ({ programId, phaseId }) => { await openProgram(programId); showPeriodizationModal(phaseId, programId) }, s)
  await page.click('#pz-basis-kg')
}
const weeks = (page, phaseId) => page.evaluate(async (phaseId) => {
  const { data, error } = await db.from('program_phase_workouts').select('week_number, workout_templates(workout_template_exercises(sets_json))').eq('phase_id', phaseId).order('week_number')
  if (error) throw new Error(error.message)
  return data.map(r => ({ w: r.week_number, sets: r.workout_templates.workout_template_exercises[0].sets_json.map(x => x.weight ?? null) }))
}, phaseId)

test.describe('Add kg periodization', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT2(page); await sweepPT2(page) })
  test.afterEach(async ({ page }) => { await sweepPT2(page) })

  test('the dialog previews each week, then Generate raises every typed weight and only those', async ({ page }) => {
    test.setTimeout(120_000)
    const s = await seed(page)
    await openDialog(page, s)
    await expect(page.locator('#pz-step-kg')).toHaveValue('2.5')
    await expect(page.locator('#pz-preview')).toContainText('+7.5')
    await expect(page.locator('#periodization-modal')).not.toContainText('Undulating')
    await page.click('#periodization-modal .btn-primary')
    await expect(page.locator('#periodization-modal')).toHaveCount(0)
    await expect(page.locator('body'), 'the phase says what it does').toContainText('+2.5 kg a week')
    expect(await page.evaluate(async (id) => (await db.from('program_phases').select('periodization_type, periodization_config').eq('id', id).single()).data, s.phaseId))
      .toEqual({ periodization_type: 'linear', periodization_config: { basis: 'kg', stepKg: 2.5 } })

    const gen = page.evaluate(({ phaseId, programId }) => generatePhasePeriodization(phaseId, programId), s)
    await acceptConfirm(page)
    await gen
    expect(await weeks(page, s.phaseId)).toEqual([
      { w: 1, sets: [100, '90', '', null] },
      { w: 2, sets: [102.5, '92.5', '', null] },
      { w: 3, sets: [105, '95', '', null] },
      { w: 4, sets: [107.5, '97.5', '', null] }])
  })

  test('a deload week goes back to Week 1 weights', async ({ page }) => {
    test.setTimeout(120_000)
    const s = await seed(page)
    await openDialog(page, s)
    await page.check('#pz-deload-on')
    await page.fill('#pz-deload-week', '3')
    await expect(page.locator('#pz-preview')).toContainText('deload')
    await page.click('#periodization-modal .btn-primary')
    await expect(page.locator('#periodization-modal')).toHaveCount(0)
    const gen = page.evaluate(({ phaseId, programId }) => generatePhasePeriodization(phaseId, programId), s)
    await acceptConfirm(page)
    await gen
    expect((await weeks(page, s.phaseId)).map(w => w.sets[0])).toEqual([100, 102.5, 100, 107.5])
  })

  test('a blank or zero step is refused and saves nothing', async ({ page }) => {
    const s = await seed(page)
    await openDialog(page, s)
    for (const bad of ['', '0']) {
      await page.fill('#pz-step-kg', bad)
      await page.evaluate(() => { document.getElementById('pz-error').textContent = '' })   // a leftover message from the last pass must not satisfy this one
      await page.evaluate(() => savePeriodizationConfig())                                   // awaited, so a wrongly accepted save has landed before the read below
      await expect(page.locator('#pz-error')).toContainText('how much to add')
      await expect(page.locator('#periodization-modal'), 'the dialog stays open').toBeVisible()
    }
    expect(await page.evaluate(async (id) => (await db.from('program_phases').select('periodization_type').eq('id', id).single()).data.periodization_type, s.phaseId)).toBeNull()
  })

  test('the step is typed in the person\'s own unit and stored in kg', async ({ page }) => {
    const s = await seed(page)
    const r = await page.evaluate(async ({ programId, phaseId }) => {
      window._unitPrefs.weight = 'lb'
      try {
        await openProgram(programId); showPeriodizationModal(phaseId, programId); setPeriodizationBasis('kg', 4)
        const shown = document.getElementById('pz-step-kg').value
        const label = document.querySelector('#periodization-modal label[for="pz-step-kg"]').textContent
        document.getElementById('pz-step-kg').value = '5'
        await savePeriodizationConfig()
        const { data } = await db.from('program_phases').select('periodization_config').eq('id', phaseId).single()
        return { shown, label, stepKg: data.periodization_config.stepKg }
      } finally { window._unitPrefs.weight = 'kg' }
    }, s)
    expect([r.shown, r.label]).toEqual(['5', 'Add each week (lb)'])
    expect(r.stepKg).toBeCloseTo(2.268, 2)
  })

  test('going to Add kg and back keeps the Type chosen before', async ({ page }) => {
    const s = await seed(page)
    const r = await page.evaluate(async ({ programId, phaseId }) => {
      await openProgram(programId); showPeriodizationModal(phaseId, programId)
      const seen = []
      for (const start of ['', 'undulating']) {
        window._pzType = start; setPeriodizationBasis('kg', 4); const during = window._pzType; setPeriodizationBasis('rpe', 4); seen.push([during, window._pzType])
      }
      return seen
    }, s)
    expect(r).toEqual([['linear', ''], ['linear', 'undulating']])
  })

  test('an unchanged Save in lb keeps the stored kg exactly', async ({ page }) => {
    const s = await seed(page)
    const r = await page.evaluate(async ({ programId, phaseId }) => {
      await db.from('program_phases').update({ periodization_type: 'linear', periodization_config: { basis: 'kg', stepKg: 2.5 } }).eq('id', phaseId)
      window._unitPrefs.weight = 'lb'
      try {
        await openProgram(programId); showPeriodizationModal(phaseId, programId)
        await savePeriodizationConfig()
        return (await db.from('program_phases').select('periodization_config').eq('id', phaseId).single()).data.periodization_config.stepKg
      } finally { window._unitPrefs.weight = 'kg' }
    }, s)
    expect(r).toBe(2.5)
  })

  const generateToast = async (page, s) => {
    await openDialog(page, s)
    return s
  }

  test('a phase whose only later week is a deload is not told it has no weights', async ({ page }) => {
    test.setTimeout(90_000)
    const s = await seed(page, SETS, 2)
    await generateToast(page, s)
    await page.check('#pz-deload-on')
    await page.fill('#pz-deload-week', '2')
    await page.click('#periodization-modal .btn-primary')
    await expect(page.locator('#periodization-modal')).toHaveCount(0)
    const gen = page.evaluate(({ phaseId, programId }) => generatePhasePeriodization(phaseId, programId), s)
    await acceptConfirm(page)
    await gen
    await expect(page.locator('#app-toast')).not.toContainText('no set in Week 1')
  })

  test('a phase with no typed weights is told to add weights, not an RPE', async ({ page }) => {
    test.setTimeout(90_000)
    const s = await seed(page, [{ repsMin: '8', bodyweight: true }])
    await generateToast(page, s)
    await page.click('#periodization-modal .btn-primary')
    await expect(page.locator('#periodization-modal')).toHaveCount(0)
    const gen = page.evaluate(({ phaseId, programId }) => generatePhasePeriodization(phaseId, programId), s)
    await acceptConfirm(page)
    await gen
    await expect(page.locator('#app-toast')).toContainText('Add weights in the workout editor')
  })

  test('MIRROR: the % and RPE methods still show their Type row and fields', async ({ page }) => {
    const s = await seed(page)
    await openDialog(page, s)
    await page.click('#pz-basis-rpe')
    await page.click('#periodization-modal button:has-text("Linear")')
    await expect(page.locator('#periodization-modal')).toContainText('Undulating')
    await expect(page.locator('#pz-start-rpe')).toBeVisible()
    await expect(page.locator('#pz-step-kg')).toHaveCount(0)
    await page.click('#pz-basis-pct')
    await expect(page.locator('#pz-start')).toBeVisible()
  })
})
