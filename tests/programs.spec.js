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
