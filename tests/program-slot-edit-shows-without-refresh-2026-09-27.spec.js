const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Ledger row 2026-08-07-programs-builder-major-slowdown-editing-a-cardio-workout-and (Jake, live):
// "editing the cardio workouts (tues/thurs/sat) and then not saving the changes … the changes did not save
// at all until i refreshed the page." Two earlier fixture reproductions (on the OLD editor) came back green.
// The template editor was rebuilt around a staged draft + explicit Save in v2026.09.6, so this drives the
// CURRENT path end to end, exactly as Jake would: a cardio workout in a programme's Tuesday slot → the slot's
// Edit → change it → Save → Back to program — and asserts the programme shows the change with NO reload.
// Owns every fixture (tagged, rowcount-checked cleanup).
const TAG = '[E2E-SLOTEDIT]'

test('a cardio workout edited from a programme slot shows its change in the programme straight after Save, without a refresh', async ({ page }) => {
  await loginAsPT(page)
  const stamp = Date.now()
  const before = `${TAG} Cardio ${stamp}`
  const after = `${TAG} Cardio EDITED ${stamp}`

  const fx = await page.evaluate(async ({ tag, stamp, before }) => {
    const me = currentUser.id
    const one = async (table, row) => {
      const { data, error } = await db.from(table).insert(row).select('id').single()
      if (error) throw new Error(`${table}: ${error.message}`)
      return data.id
    }
    const programId = await one('programs', { coach_id: me, name: `${tag} program ${stamp}`, is_personal: false })
    const phaseId = await one('program_phases', { program_id: programId, name: `${tag} phase`, duration_weeks: 4, order_index: 0 })
    const templateId = await one('workout_templates', { coach_id: me, name: before, is_personal: false, program_id: programId })
    await one('workout_template_exercises', { template_id: templateId, exercise_name: `${tag} Row`, exercise_type: 'cardio',
      metric_type: 'interval', order_index: 0, sets_json: [{ workSecs: 60, restSecs: 30, rounds: 5 }] })
    const pwId = await one('program_phase_workouts', { phase_id: phaseId, template_id: templateId, day_of_week: 2, day_label: 'Tuesday', week_number: 1 })
    return { programId, templateId, pwId }
  }, { tag: TAG, stamp, before })

  try {
    await page.evaluate((id) => openProgram(id), fx.programId)
    await expect(page.locator('#main-content'), 'the programme builder shows the slot').toContainText(before)

    // The slot's Edit, as the builder wires it.
    await page.evaluate(({ templateId, pwId }) => _editPhaseWorkout(templateId, pwId), fx)
    await expect.poll(() => page.evaluate(() => window._templateDraft?.templateId)).toBe(fx.templateId)

    // Stage the change through the real rename handler, then Save.
    await page.evaluate((newName) => {
      const mk = (id) => { let e = document.getElementById(id); if (!e) { e = document.createElement('input'); e.id = id; document.body.appendChild(e) } return e }
      mk('et-name').value = newName
      mk('et-desc').value = ''
      if (!document.getElementById('et-error')) { const d = document.createElement('div'); d.id = 'et-error'; document.body.appendChild(d) }
      _stageRenameTemplate()
    }, after)
    const saved = await page.evaluate(() => saveTemplateDraft())
    expect(saved, 'Save must report success').toBe('ok')

    // The write landed…
    const dbName = await page.evaluate(async (id) => (await db.from('workout_templates').select('name').eq('id', id).single()).data?.name, fx.templateId)
    expect(dbName, 'the rename must be in the database').toBe(after)

    // …and — Jake's symptom — the programme must SHOW it without a reload.
    await page.evaluate(() => _templateGoBack())
    await expect(page.locator('#main-content'), 'Back to program must show the edited name without a refresh').toContainText(after)
    await expect(page.locator('#main-content')).not.toContainText(before + '<')
  } finally {
    const reaped = await page.evaluate(async (fx) => {
      const n = r => (r.data || []).length
      await db.from('workout_template_exercises').delete().eq('template_id', fx.templateId).select('id')
      return {
        program: n(await db.from('programs').delete().eq('id', fx.programId).eq('coach_id', currentUser.id).select('id')),
        template: n(await db.from('workout_templates').delete().eq('id', fx.templateId).eq('coach_id', currentUser.id).select('id')),
      }
    }, fx)
    expect(reaped, 'cleanup must remove the programme and the template').toEqual({ program: 1, template: 1 })
  }
})
