const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('Program periodization', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    await page.click('[data-page="programs"]')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('configure Linear periodization on a multi-week phase and generate weeks', async ({ page }) => {
    // Create a throwaway test program
    await page.click('button:has-text("New program")')
    await page.fill('#pm-name', '[E2E] Periodization Test')
    await page.click('#pm-save-btn')
    await page.waitForSelector('h1:has-text("[E2E] Periodization Test")', { timeout: 8000 })

    // Add a 3-week phase
    await page.click('button:has-text("Add phase")')
    await page.fill('#pf-name', 'Block 1')
    await page.fill('#pf-weeks', '3')
    await page.click('#pf-save-btn')
    await expect(page.locator('text=Block 1')).toBeVisible({ timeout: 8000 })

    // Assign a workout to Monday, Week 1 — inline grid, no modal. Picks whatever template is first.
    const mondaySelect = 'select.pwg-select[data-day="1"]'
    await expect(page.locator(mondaySelect)).toBeVisible({ timeout: 8000 })
    const templateOptions = await page.locator(`${mondaySelect} option`).evaluateAll(opts => opts.filter(o => o.value && o.value !== '__new__').map(o => o.value))
    test.skip(templateOptions.length === 0, 'E2E PT account has no workout templates to assign')
    await page.selectOption(mondaySelect, templateOptions[0])
    await expect(page.locator('[id^="phase-workouts-"] button[onclick*="removePhaseWorkout"]').first()).toBeVisible({ timeout: 8000 })

    // Configure periodization on the phase
    await page.click('button:has-text("Configure")')
    await expect(page.locator('#periodization-modal')).toBeVisible({ timeout: 4000 })
    await page.click('#periodization-modal button:has-text("Linear")')
    await expect(page.locator('#pz-start')).toBeVisible({ timeout: 4000 })
    await page.fill('#pz-start', '65')
    await page.fill('#pz-end', '85')
    await page.click('#periodization-modal .modal-footer button:has-text("Save")')
    await page.waitForSelector('#periodization-modal', { state: 'detached', timeout: 4000 })
    await expect(page.locator('text=Periodization:').locator('..').locator('text=Linear')).toBeVisible({ timeout: 4000 })

    // Generate weeks 2-3 from the Week 1 base
    page.once('dialog', d => d.accept())
    await page.click('button:has-text("Generate weeks")')
    await expect(page.locator('text=WEEK 2')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=WEEK 3')).toBeVisible({ timeout: 10000 })

    // Cleanup — delete the throwaway program
    page.once('dialog', d => d.accept())
    await page.click('button:has-text("Delete")')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('periodization Configure modal — Undulating shows tier fields, Cancel closes without saving', async ({ page }) => {
    await page.click('button:has-text("New program")')
    await page.fill('#pm-name', '[E2E] Periodization Cancel Test')
    await page.click('#pm-save-btn')
    await page.waitForSelector('h1:has-text("[E2E] Periodization Cancel Test")', { timeout: 8000 })

    await page.click('button:has-text("Add phase")')
    await page.fill('#pf-name', 'Block 1')
    await page.fill('#pf-weeks', '4')
    await page.click('#pf-save-btn')
    await expect(page.locator('text=Block 1')).toBeVisible({ timeout: 8000 })

    await page.click('button:has-text("Configure")')
    await expect(page.locator('#periodization-modal')).toBeVisible({ timeout: 4000 })
    await page.click('#periodization-modal button:has-text("Undulating")')
    await expect(page.locator('#pz-tier-heavy-pct')).toBeVisible({ timeout: 4000 })
    await expect(page.locator('#pz-tier-moderate-pct')).toBeVisible()
    await expect(page.locator('#pz-tier-light-pct')).toBeVisible()

    await page.click('#periodization-modal .modal-footer button:has-text("Cancel")')
    await page.waitForSelector('#periodization-modal', { state: 'detached', timeout: 4000 })
    // Not saved — phase still shows None
    await expect(page.locator('text=Periodization:').locator('..').locator('text=None')).toBeVisible({ timeout: 4000 })

    page.once('dialog', d => d.accept())
    await page.click('button:has-text("Delete")')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })
})

test.describe('Inline assign grid', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    await page.click('[data-page="programs"]')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('7-day grid renders with no modal, and search filters a day\'s options', async ({ page }) => {
    await page.click('button:has-text("New program")')
    await page.fill('#pm-name', '[E2E] Inline Grid Test')
    await page.click('#pm-save-btn')
    await page.waitForSelector('h1:has-text("[E2E] Inline Grid Test")', { timeout: 8000 })

    await page.click('button:has-text("Add phase")')
    await page.fill('#pf-name', 'Block 1')
    await page.fill('#pf-weeks', '1')
    await page.click('#pf-save-btn')
    await expect(page.locator('text=Block 1')).toBeVisible({ timeout: 8000 })

    // No modal anywhere in the phase-building flow — old "+ Assign workout" button/modal are gone
    await expect(page.locator('button:has-text("+ Assign workout")')).toHaveCount(0)
    await expect(page.locator('#phase-workout-modal')).toHaveCount(0)

    // All 7 days present
    for (let day = 1; day <= 7; day++) {
      await expect(page.locator(`select.pwg-select[data-day="${day}"]`)).toBeVisible({ timeout: 8000 })
    }

    const mondaySelect = 'select.pwg-select[data-day="1"]'
    const totalBefore = await page.locator(`${mondaySelect} option`).count()
    test.skip(totalBefore <= 3, 'E2E PT account has too few templates to meaningfully test search filtering')

    await page.fill('.pwg-search >> nth=0', 'zzz-no-such-template-zzz')
    const visibleAfter = await page.locator(`${mondaySelect} option`).evaluateAll(opts => opts.filter(o => !o.hidden).length)
    expect(visibleAfter).toBeLessThan(totalBefore)
    // Placeholder option always stays visible regardless of query
    const placeholderHidden = await page.locator(`${mondaySelect} option[value=""]`).evaluate(el => el.hidden)
    expect(placeholderHidden).toBe(false)

    page.once('dialog', d => d.accept())
    await page.click('button:has-text("Delete")')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('picking an already-filled slot is rejected instead of creating a duplicate', async ({ page }) => {
    await page.click('button:has-text("New program")')
    await page.fill('#pm-name', '[E2E] Grid Race Test')
    await page.click('#pm-save-btn')
    await page.waitForSelector('h1:has-text("[E2E] Grid Race Test")', { timeout: 8000 })

    await page.click('button:has-text("Add phase")')
    await page.fill('#pf-name', 'Block 1')
    await page.fill('#pf-weeks', '1')
    await page.click('#pf-save-btn')
    await expect(page.locator('text=Block 1')).toBeVisible({ timeout: 8000 })

    const mondaySelect = 'select.pwg-select[data-day="1"]'
    await expect(page.locator(mondaySelect)).toBeVisible({ timeout: 8000 })
    const templateOptions = await page.locator(`${mondaySelect} option`).evaluateAll(opts => opts.filter(o => o.value && o.value !== '__new__').map(o => o.value))
    test.skip(templateOptions.length === 0, 'E2E PT account has no workout templates to assign')

    // Simulate a concurrent insert filling Monday's first slot behind the scenes, then try to
    // assign through the (now-stale) UI select — the guard should reject it, not duplicate the row
    const phaseId = await page.locator(mondaySelect).getAttribute('data-phase')
    await page.evaluate(async ({ phaseId, templateId }) => {
      await db.from('program_phase_workouts').insert({ phase_id: phaseId, day_of_week: 1, day_label: 'Monday', template_id: templateId, session_order: 1, week_number: 1 })
    }, { phaseId, templateId: templateOptions[0] })

    await page.selectOption(mondaySelect, templateOptions[0])
    await expect(page.locator('text=That slot was just filled')).toBeVisible({ timeout: 8000 })

    const rowCount = await page.evaluate(async (phaseId) => {
      const { data } = await db.from('program_phase_workouts').select('id').eq('phase_id', phaseId).eq('day_of_week', 1).eq('session_order', 1)
      return data.length
    }, phaseId)
    expect(rowCount).toBe(1)

    page.once('dialog', d => d.accept())
    await page.click('button:has-text("Delete")')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('creating a new workout from the grid returns to the program via "Back to program"', async ({ page }) => {
    await page.click('button:has-text("New program")')
    await page.fill('#pm-name', '[E2E] Grid Create Test')
    await page.click('#pm-save-btn')
    await page.waitForSelector('h1:has-text("[E2E] Grid Create Test")', { timeout: 8000 })

    await page.click('button:has-text("Add phase")')
    await page.fill('#pf-name', 'Block 1')
    await page.fill('#pf-weeks', '1')
    await page.click('#pf-save-btn')
    await expect(page.locator('text=Block 1')).toBeVisible({ timeout: 8000 })

    const mondaySelect = 'select.pwg-select[data-day="1"]'
    await expect(page.locator(mondaySelect)).toBeVisible({ timeout: 8000 })
    await page.selectOption(mondaySelect, '__new__')
    await expect(page.locator('#create-template-modal')).toBeVisible({ timeout: 4000 })
    await page.fill('#ct-name', '[E2E] Grid Created Template')
    await page.click('#create-template-modal button:has-text("Create")')

    await expect(page.locator('text=Back to program')).toBeVisible({ timeout: 8000 })
    await page.click('text=Back to program')
    await expect(page.locator('h1:has-text("[E2E] Grid Create Test")')).toBeVisible({ timeout: 8000 })

    // Cleanup — the created template isn't attached to the program via program_phase_workouts, delete separately
    await page.evaluate(async () => {
      const { data } = await db.from('workout_templates').select('id').eq('name', '[E2E] Grid Created Template')
      if (data?.length) await db.from('workout_templates').delete().in('id', data.map(t => t.id))
    })
    page.once('dialog', d => d.accept())
    await page.click('button:has-text("Delete")')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('a template created inline for one day slot does not clutter the picker for other slots or programs (2026-07-10)', async ({ page }) => {
    // Regression: openProgram's template query had no .is('program_id', null) filter, so every
    // one-off "+ Create new workout" template stayed in the reuse pool forever -- found live when
    // a 12-phase program's picker showed the same name 4+ times with no way to tell which day
    // each already belonged to. The inline "__new__" option is also relabeled "(this day only)"
    // to make the distinction clear at the point of choice.
    await page.click('button:has-text("New program")')
    await page.fill('#pm-name', '[E2E] Picker Scope Test')
    await page.click('#pm-save-btn')
    await page.waitForSelector('h1:has-text("[E2E] Picker Scope Test")', { timeout: 8000 })

    await page.click('button:has-text("Add phase")')
    await page.fill('#pf-name', 'Block 1')
    await page.fill('#pf-weeks', '1')
    await page.click('#pf-save-btn')
    await expect(page.locator('text=Block 1')).toBeVisible({ timeout: 8000 })

    await expect(page.locator('select.pwg-select option[value="__new__"]').first()).toHaveText('＋ Create new workout (this day only)')

    const programId = await page.evaluate(async () => {
      const { data } = await db.from('programs').select('id').eq('name', '[E2E] Picker Scope Test').single()
      return data.id
    })
    const templateId = await page.evaluate(async (programId) => {
      const { data } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: programId, client_id: null, name: '[E2E] Day-Only Template' }).select('id').single()
      return data.id
    }, programId)

    try {
      await page.evaluate(async (programId) => { await openProgram(programId) }, programId)
      await page.waitForTimeout(800)
      const appears = await page.evaluate(() => (window._programTemplates || []).some(t => t.name === '[E2E] Day-Only Template'))
      expect(appears).toBe(false)
    } finally {
      await page.evaluate(async (templateId) => { await db.from('workout_templates').delete().eq('id', templateId) }, templateId)
      page.once('dialog', d => d.accept())
      await page.click('button:has-text("Delete")')
      await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
    }
  })
})

test.describe('Assignment-time 1RM check', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    await page.click('[data-page="programs"]')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('assigning a program with a %1RM exercise shows the missing-1RM checklist and saves an entered value', async ({ page }) => {
    // Arrange directly via Supabase — template creation UI is covered elsewhere; this test is about the assign-flow check itself
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] 1RM Check Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single()
      const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] 1RM Check Squat' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: tmpl.id, exercise_name: '[E2E] Test Squat', exercise_type: 'strength', order_index: 0, sets_json: [{ effortType: 'rpe', repsMin: '5', repsMax: '5', intensityMin: '70', intensityMax: '70' }] })
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 })
      const { data: clients } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
      if (clients?.[0]) await db.from('client_1rms').delete().eq('client_id', clients[0].id).eq('exercise_name', '[E2E] Test Squat')
      return { programId: prog.id, templateId: tmpl.id, clientId: clients?.[0]?.id || null }
    })
    test.skip(!setup.clientId, 'E2E PT account has no clients to assign to')

    await page.reload()
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
    await page.click('text=[E2E] 1RM Check Program')
    await page.waitForSelector('button:has-text("Assign to client")', { timeout: 8000 })
    await page.click('button:has-text("Assign to client")')
    await expect(page.locator('#apc-modal')).toBeVisible({ timeout: 4000 })
    await page.selectOption('#apc-client', setup.clientId)
    await expect(page.locator('#apc-missing-1rm')).toContainText('[E2E] Test Squat', { timeout: 6000 })
    await expect(page.locator('#apc-missing-1rm')).toContainText('missing 1', { timeout: 4000 })

    await page.fill('#mor-0-weight', '100')
    await page.click('#apc-modal .modal-footer button:has-text("Assign")')
    await page.waitForSelector('#apc-modal', { state: 'detached', timeout: 8000 })

    const saved = await page.evaluate(async (clientId) => {
      const { data } = await db.from('client_1rms').select('one_rm_kg').eq('client_id', clientId).eq('exercise_name', '[E2E] Test Squat')
      return data
    }, setup.clientId)
    expect(saved.length).toBe(1)
    expect(saved[0].one_rm_kg).toBe(100)

    // Cleanup
    await page.evaluate(async ({ programId, templateId, clientId }) => {
      const { data: cpRows } = await db.from('client_programs').select('id').eq('client_id', clientId).eq('program_id', programId)
      for (const cp of cpRows || []) {
        const { data: cpwRows } = await db.from('client_program_workouts').select('workout_template_id').eq('client_program_id', cp.id)
        await db.from('client_programs').delete().eq('id', cp.id)
        const ids = cpwRows.map(r => r.workout_template_id).filter(Boolean)
        if (ids.length) await db.from('workout_templates').delete().in('id', ids)
      }
      await db.from('client_1rms').delete().eq('client_id', clientId).eq('exercise_name', '[E2E] Test Squat')
      await db.from('programs').delete().eq('id', programId)
      await db.from('workout_templates').delete().eq('id', templateId)
    }, { programId: setup.programId, templateId: setup.templateId, clientId: setup.clientId })
  })

  test('missing-1RM checklist shows read-only "on file" entries alongside the quick-entry ones', async ({ page }) => {
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] 1RM Have Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single()
      const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] 1RM Have Squat' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: tmpl.id, exercise_name: '[E2E] Have Squat', exercise_type: 'strength', order_index: 0, sets_json: [{ effortType: 'rpe', repsMin: '5', repsMax: '5', intensityMin: '70', intensityMax: '70' }] })
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 })
      const { data: clients } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
      const clientId = clients?.[0]?.id || null
      if (clientId) {
        await db.from('client_1rms').delete().eq('client_id', clientId).eq('exercise_name', '[E2E] Have Squat')
        await db.from('client_1rms').insert({ client_id: clientId, exercise_name: '[E2E] Have Squat', one_rm_kg: 123, recorded_at: new Date().toISOString().split('T')[0] })
      }
      return { programId: prog.id, templateId: tmpl.id, clientId }
    })
    test.skip(!setup.clientId, 'E2E PT account has no clients to assign to')

    await page.reload()
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
    await page.click('text=[E2E] 1RM Have Program')
    await page.waitForSelector('button:has-text("Assign to client")', { timeout: 8000 })
    await page.click('button:has-text("Assign to client")')
    await expect(page.locator('#apc-modal')).toBeVisible({ timeout: 4000 })
    await page.selectOption('#apc-client', setup.clientId)
    await expect(page.locator('#apc-missing-1rm')).toContainText('all on file', { timeout: 6000 })
    await expect(page.locator('#apc-missing-1rm')).toContainText('123.0 kg (on file)')

    await page.click('#apc-modal .modal-footer button:has-text("Cancel")')
    await page.waitForSelector('#apc-modal', { state: 'detached', timeout: 4000 })

    // Cleanup
    await page.evaluate(async ({ programId, templateId, clientId }) => {
      await db.from('client_1rms').delete().eq('client_id', clientId).eq('exercise_name', '[E2E] Have Squat')
      await db.from('programs').delete().eq('id', programId)
      await db.from('workout_templates').delete().eq('id', templateId)
    }, { programId: setup.programId, templateId: setup.templateId, clientId: setup.clientId })
  })
})

test.describe('Duplicate week / fork-on-edit / delete blocking', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    await page.click('[data-page="programs"]')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('duplicating a week copies its day/workout assignments into the next empty week', async ({ page }) => {
    await page.click('button:has-text("New program")')
    await page.fill('#pm-name', '[E2E] Duplicate Week Test')
    await page.click('#pm-save-btn')
    await page.waitForSelector('h1:has-text("[E2E] Duplicate Week Test")', { timeout: 8000 })

    await page.click('button:has-text("Add phase")')
    await page.fill('#pf-name', 'Block 1')
    await page.fill('#pf-weeks', '2')
    await page.click('#pf-save-btn')
    await expect(page.locator('text=Block 1')).toBeVisible({ timeout: 8000 })

    const mondaySelect = 'select.pwg-select[data-day="1"]'
    await expect(page.locator(mondaySelect)).toBeVisible({ timeout: 8000 })
    const templateOptions = await page.locator(`${mondaySelect} option`).evaluateAll(opts => opts.filter(o => o.value && o.value !== '__new__').map(o => o.value))
    test.skip(templateOptions.length === 0, 'E2E PT account has no workout templates to assign')
    const phaseId = await page.locator(mondaySelect).getAttribute('data-phase')
    await page.selectOption(mondaySelect, templateOptions[0])
    await expect(page.locator('[id^="phase-workouts-"] button[onclick*="removePhaseWorkout"]').first()).toBeVisible({ timeout: 8000 })

    await expect(page.locator('button:has-text("Duplicate week")')).toBeVisible({ timeout: 4000 })
    await page.click('button:has-text("Duplicate week")')
    await expect(page.locator('[id^="phase-workouts-"]').locator('text=WEEK 2')).toBeVisible({ timeout: 8000 })

    const weeks = await page.evaluate(async (phaseId) => {
      const { data } = await db.from('program_phase_workouts').select('week_number, template_id').eq('phase_id', phaseId)
      return data
    }, phaseId)
    const week1 = weeks.find(w => w.week_number === 1)
    const week2Rows = weeks.filter(w => w.week_number === 2)
    expect(week2Rows.length).toBe(1)
    expect(week2Rows[0].template_id).toBe(week1.template_id)

    page.once('dialog', d => d.accept())
    await page.click('button:has-text("Delete")')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('editing a workout assigned to two slots forks a copy instead of overwriting the shared one', async ({ page }) => {
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Fork Test Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single()
      const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: '[E2E] Shared Workout' }).select('id').single()
      const { data: mon } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 }).select('id').single()
      const { data: tue } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 2, day_label: 'Tuesday', session_order: 1, template_id: tmpl.id, week_number: 1 }).select('id').single()
      return { programId: prog.id, templateId: tmpl.id, mondayPwId: mon.id, tuesdayPwId: tue.id }
    })

    await page.reload()
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
    await page.click('text=[E2E] Fork Test Program')
    await page.waitForSelector('text=[E2E] Shared Workout', { timeout: 8000 })

    // Open Monday's session (first occurrence in Mon→Sun order) and rename it
    await page.locator('text=[E2E] Shared Workout').first().click()
    await expect(page.locator('#session-detail-drawer')).toBeVisible({ timeout: 4000 })
    await page.click('#session-detail-drawer button:has-text("Edit")')
    await expect(page.locator('h1:has-text("[E2E] Shared Workout")')).toBeVisible({ timeout: 8000 })
    await page.click('button:has-text("Edit")')
    await expect(page.locator('#edit-template-modal')).toBeVisible({ timeout: 4000 })
    await page.fill('#et-name', '[E2E] Shared Workout (Monday only)')
    await page.click('#edit-template-modal button:has-text("Save")')
    await page.waitForSelector('#edit-template-modal', { state: 'detached', timeout: 8000 })

    const rows = await page.evaluate(async ({ mondayPwId, tuesdayPwId }) => {
      const { data: mon } = await db.from('program_phase_workouts').select('template_id').eq('id', mondayPwId).single()
      const { data: tue } = await db.from('program_phase_workouts').select('template_id').eq('id', tuesdayPwId).single()
      return { monTemplateId: mon.template_id, tueTemplateId: tue.template_id }
    }, { mondayPwId: setup.mondayPwId, tuesdayPwId: setup.tuesdayPwId })

    expect(rows.tueTemplateId).toBe(setup.templateId) // Tuesday untouched — still the shared original
    expect(rows.monTemplateId).not.toBe(setup.templateId) // Monday forked to its own copy

    // Cleanup
    await page.evaluate(async ({ programId, templateId, monTemplateId }) => {
      await db.from('workout_template_exercises').delete().eq('template_id', monTemplateId)
      await db.from('workout_templates').delete().eq('id', monTemplateId)
      await db.from('workout_templates').delete().eq('id', templateId)
      await db.from('programs').delete().eq('id', programId)
    }, { programId: setup.programId, templateId: setup.templateId, monTemplateId: rows.monTemplateId })
  })

  test('deleting a program with an assigned client names them in the block toast', async ({ page }) => {
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Delete Block Test' }).select('id').single()
      const { data: clients } = await db.from('clients').select('id, full_name').eq('coach_id', currentUser.id).limit(1)
      const client = clients?.[0]
      if (client) await db.from('client_programs').insert({ client_id: client.id, program_id: prog.id })
      return { programId: prog.id, clientId: client?.id || null, clientName: client?.full_name || null }
    })
    test.skip(!setup.clientId, 'E2E PT account has no clients to assign to')

    await page.reload()
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
    await page.click('text=[E2E] Delete Block Test')
    await page.waitForSelector('button:has-text("Delete")', { timeout: 8000 })
    await page.click('button:has-text("Delete")')
    await expect(page.locator('#app-toast')).toContainText(setup.clientName, { timeout: 4000 })

    // Cleanup
    await page.evaluate(async ({ programId, clientId }) => {
      await db.from('client_programs').delete().eq('client_id', clientId).eq('program_id', programId)
      await db.from('programs').delete().eq('id', programId)
    }, { programId: setup.programId, clientId: setup.clientId })
  })

  test('deleting a week removes its sessions and renumbers later weeks down by 1 (2026-07-10)', async ({ page }) => {
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Delete Week Test' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 3, order_index: 0 }).select('id').single()
      const mk = async (name) => (await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name }).select('id').single()).data.id
      const tmplW1 = await mk('[E2E] DW Week1 Session')
      const tmplW2 = await mk('[E2E] DW Week2 Session')
      const tmplW3 = await mk('[E2E] DW Week3 Session')
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmplW1, week_number: 1 })
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmplW2, week_number: 2 })
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmplW3, week_number: 3 })
      return { programId: prog.id, phaseId: phase.id, tmplW1, tmplW2, tmplW3 }
    })

    try {
      await page.click('[data-page="programs"]')
      await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
      await page.evaluate((programId) => openProgram(programId), setup.programId)
      await page.waitForSelector('text=WEEK 3', { timeout: 8000 })
      await expect(page.locator('button:has-text("Delete week")').first()).toBeVisible({ timeout: 4000 })

      page.once('dialog', d => d.accept())
      await page.evaluate(({ phaseId }) => deletePhaseWeek(phaseId, 2), setup)
      await page.waitForTimeout(1000)

      const result = await page.evaluate(async ({ phaseId }) => {
        const { data: rows } = await db.from('program_phase_workouts').select('week_number, template_id').eq('phase_id', phaseId)
        const { data: phaseRow } = await db.from('program_phases').select('duration_weeks').eq('id', phaseId).single()
        return { rows, duration: phaseRow.duration_weeks }
      }, setup)

      expect(result.duration).toBe(2)
      expect(result.rows.length).toBe(2)
      const week1 = result.rows.find(r => r.week_number === 1)
      const week2 = result.rows.find(r => r.week_number === 2)
      expect(week1?.template_id).toBe(setup.tmplW1) // untouched
      expect(week2?.template_id).toBe(setup.tmplW3) // old week 3 shifted down into week 2's slot
      expect(result.rows.some(r => r.week_number === 3)).toBe(false)

      // The deleted week's own template is gone; the shifted-down week's template survives
      const remainingTemplates = await page.evaluate(async ({ tmplW2, tmplW3 }) => {
        const { data } = await db.from('workout_templates').select('id').in('id', [tmplW2, tmplW3])
        return (data || []).map(t => t.id)
      }, setup)
      expect(remainingTemplates).not.toContain(setup.tmplW2)
      expect(remainingTemplates).toContain(setup.tmplW3)
    } finally {
      await page.evaluate(async ({ programId, tmplW1, tmplW2, tmplW3 }) => {
        await db.from('programs').delete().eq('id', programId) // cascades program_phases -> program_phase_workouts
        await db.from('workout_templates').delete().in('id', [tmplW1, tmplW2, tmplW3])
      }, setup)
    }
  })

  test('deleting a week never destroys a shared standalone template also assigned to that slot (2026-07-10)', async ({ page }) => {
    // Regression guard for the exact bug deleteProgram() was fixed for this morning: a slot can
    // reference a template with program_id/generated_from_phase_id both null (a genuine
    // standalone template the coach reuses elsewhere) -- deleting the week must not delete it.
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Delete Week Shared Test' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single()
      const { data: shared } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] DW Shared Template' }).select('id').single()
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: shared.id, week_number: 1 })
      return { programId: prog.id, phaseId: phase.id, sharedTemplateId: shared.id }
    })

    try {
      page.once('dialog', d => d.accept())
      await page.evaluate(({ phaseId }) => deletePhaseWeek(phaseId, 1), setup)
      await page.waitForTimeout(800)

      const stillExists = await page.evaluate(async (sharedTemplateId) => {
        const { data } = await db.from('workout_templates').select('id').eq('id', sharedTemplateId).maybeSingle()
        return !!data
      }, setup.sharedTemplateId)
      expect(stillExists).toBe(true)
    } finally {
      await page.evaluate(async ({ programId, sharedTemplateId }) => {
        await db.from('programs').delete().eq('id', programId)
        await db.from('workout_templates').delete().eq('id', sharedTemplateId)
      }, setup)
    }
  })
})
