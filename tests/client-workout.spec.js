const { test, expect } = require('./fixtures')
const { loginAsClient, loginAsPT } = require('./helpers')

test.describe('Client workout flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page)
  })

  test('client dashboard loads with hero card', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Hi,')
    await expect(page.locator('text=UP NEXT')).toBeVisible()
  })

  test('client dashboard shows a "Current program" header with a View program button, when a program is assigned (2026-07-05)', async ({ page }) => {
    const hasProgram = await page.locator('text=Current program').isVisible({ timeout: 3000 }).catch(() => false)
    test.skip(!hasProgram, 'No program assigned to this test client')
    await expect(page.locator('text=Current program')).toBeVisible()
    await expect(page.locator('button:has-text("View program")')).toBeVisible()
    await page.locator('button:has-text("View program")').click()
    await expect(page.locator('h1')).toContainText('Workouts', { timeout: 8000 })
  })

  test('client can navigate to Workouts page', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    // Page renders the Workouts h1 and either a program accordion or templates list
    await page.waitForSelector('button:has-text("▶ Start"), button:has-text("Start")', { timeout: 10000 })
    await expect(page.locator('h1')).toContainText('Workouts')
  })

  test('workout sessions list is visible with Start buttons', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    await page.waitForSelector('button:has-text("▶ Start"), button:has-text("Start")', { timeout: 10000 })
    const startBtns = page.locator('button:has-text("▶ Start"), button:has-text("Start")')
    expect(await startBtns.count()).toBeGreaterThan(0)
  })

  test('program accordion phase expands to show sessions with exercise count', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    await page.waitForTimeout(1500)

    // Only run if this client has a program assigned (accordion will be present)
    const hasAccordion = await page.locator('button[onclick*="toggleClientPhase(\'cl-phase-"]').first().isVisible({ timeout: 3000 }).catch(() => false)
    if (!hasAccordion) return // test client has no program — skip

    const firstPhaseBtn = page.locator('button[onclick*="toggleClientPhase(\'cl-phase-"]').first()
    await firstPhaseBtn.click()

    // A session row should appear showing exercise count
    await expect(page.locator('text=/\\d+ exercise/')).toBeVisible({ timeout: 5000 })
  })

  test('client can tap session name to see exercise list', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    await page.waitForTimeout(1500)

    // Only run if this client has a program assigned
    const hasAccordion = await page.locator('button[onclick*="toggleClientPhase(\'cl-phase-"]').first().isVisible({ timeout: 3000 }).catch(() => false)
    if (!hasAccordion) return

    // Expand the first phase
    const firstPhaseBtn = page.locator('button[onclick*="toggleClientPhase(\'cl-phase-"]').first()
    await firstPhaseBtn.click()
    await page.waitForSelector('[id^="cl-sess-"]', { timeout: 5000 })

    // Tap the session name div (not the Start button) to expand exercise detail
    const sessionNameDiv = page.locator('[style*="cursor:pointer"]').filter({ hasText: /exercise/ }).first()
    await sessionNameDiv.click()

    // An exercise detail panel should now be visible
    const detailPanel = page.locator('[id^="cl-sess-"]').first()
    await expect(detailPanel).toBeVisible({ timeout: 3000 })
    const detailText = await detailPanel.textContent()
    expect(detailText?.trim().length).toBeGreaterThan(0)
  })

  test('session history is collapsed by default and expands on click', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    const historyToggle = page.locator('button[onclick="toggleClientPhase(\'client-session-history\')"]')
    if (await historyToggle.count() === 0) return // no sessions yet — nothing to expand
    const panel = page.locator('#client-session-history')
    await expect(panel).toBeHidden()
    await historyToggle.click()
    await expect(panel).toBeVisible()
  })

  test('session history rows are tappable', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    // Session history is a collapsible section — expand it before checking rows
    const historyToggle = page.locator('button[onclick="toggleClientPhase(\'client-session-history\')"]')
    if (await historyToggle.count() === 0) return // no sessions yet — nothing to expand
    await historyToggle.click()
    await page.waitForSelector('#client-session-list', { timeout: 10000 })
    const rows = page.locator('#client-session-list .list-row')
    const count = await rows.count()
    if (count === 0) {
      // No sessions yet — acceptable, skip navigation check
      return
    }
    // Click first session row — should open the session log
    await rows.first().click()
    // Session log renders a back button and the session title
    await expect(page.locator('text=All sessions')).toBeVisible({ timeout: 8000 })
  })

  test('client can start and cancel a workout', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    await page.waitForTimeout(1500)
    // If program accordion is present, expand first phase to reveal Start buttons
    const firstPhaseBtn = page.locator('button').filter({ hasText: /session/i }).first()
    if (await firstPhaseBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstPhaseBtn.click()
    }
    await page.waitForSelector('button:has-text("Start"):visible, button:has-text("▶ Start"):visible', { timeout: 10000 })
    // Click first visible Start button — launches runner
    await page.locator('button:has-text("Start")').first().click()
    // Runner renders with a red End button
    const endBtn = page.locator('button:has-text("End")')
    await expect(endBtn).toBeVisible({ timeout: 8000 })
    // End the runner
    await endBtn.click()
    // Confirm dialog may appear — click any confirm button
    const confirmBtn = page.locator('button:has-text("End session"), button:has-text("Yes"), button:has-text("Confirm"), button:has-text("Finish")')
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.first().click()
    }
    // Runner is gone when End button is no longer visible
    await expect(endBtn).not.toBeVisible({ timeout: 8000 })
  })

  test('client weight log form works', async ({ page }) => {
    // Weight section is on dashboard
    await expect(page.locator('h1')).toContainText('Hi,', { timeout: 8000 })
    // Scroll to weight section and click Log
    const logBtn = page.locator('button:has-text("+ Log")').first()
    if (await logBtn.isVisible()) {
      await logBtn.click()
      await expect(page.locator('#cwf-weight')).toBeVisible()
    }
  })

  test('_resolveTemplateOwnerCoachId looks up the client\'s own coach_id for role "client" (2026-07-08 defensive fix)', async ({ page }) => {
    // saveEditTemplate/deleteTemplate previously always filtered by currentUser.id, which is
    // never a valid coach_id for a real client account — this helper is the fix, matching the
    // same role-check pattern already used by startWorkoutRunner.
    const { resolved, expected } = await page.evaluate(async () => {
      const resolved = await _resolveTemplateOwnerCoachId()
      const { data } = await db.from('clients').select('coach_id').eq('user_id', currentUser.id).single()
      return { resolved, expected: data?.coach_id || currentUser.id }
    })
    expect(resolved).toBe(expected)
  })
})

test.describe('Workouts page hero card + Recent sessions rename (2026-07-08)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page)
  })

  test('Workouts page renders a hero card with title, meta, and a Start button', async ({ page, browser }) => {
    // Was test.fixme'd 2026-07-10 pending a real RLS gap: the "client" role had NO select
    // policy on client_programs at all (verified directly — a genuine client account read back
    // zero rows even completely unfiltered, while the exact same account correctly read
    // workout_logs/weight_logs rows). Fixed 2026-07-10 via a new Supabase policy
    // ("Clients can view their own program assignments", confirmed live in pg_policies) — this
    // test now runs for real. Wrapped in try/finally so a leaked browser context can't survive
    // an assertion failure.
    const ptContext = await browser.newContext()
    try {
      const ptPage = await ptContext.newPage()
      await loginAsPT(ptPage)

      const setup = await ptPage.evaluate(async () => {
        const { data: clients } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
        const clientId = clients[0].id
        const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Hero Card Program' }).select('id').single()
        const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 4, order_index: 0 }).select('id').single()
        // client_program_workouts always points at a client-owned clone of the master template
        // (client_id set, program_id null) -- matches _cloneProgramForClient's real shape, since
        // the client-side read of this row goes through RLS as the client, not the coach.
        const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, client_id: clientId, program_id: null, name: '[E2E] Hero Card Session' }).select('id').single()
        const { data: pw } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 }).select('id').single()
        const { data: cp } = await db.from('client_programs').insert({ client_id: clientId, program_id: prog.id, start_date: new Date().toISOString().split('T')[0] }).select('id').single()
        await db.from('client_program_workouts').insert({ client_program_id: cp.id, program_phase_workout_id: pw.id, workout_template_id: tmpl.id, week_number: 1 })
        return { progId: prog.id, cpId: cp.id }
      })

      try {
        await page.click('[data-page="workouts"]')
        await page.waitForTimeout(1000)
        await expect(page.locator('text=Up next')).toBeVisible({ timeout: 8000 })
        await expect(page.locator('button', { hasText: /Start/ }).first()).toBeVisible()
      } finally {
        // Cleanup — this fixture is entirely self-owned, so tear it down completely
        await ptPage.evaluate(async ({ progId, cpId }) => {
          await db.from('client_program_workouts').delete().eq('client_program_id', cpId)
          await db.from('client_programs').delete().eq('id', cpId)
          const { data: phases } = await db.from('program_phases').select('id').eq('program_id', progId)
          const phaseIds = (phases || []).map(p => p.id)
          if (phaseIds.length) {
            const { data: pws } = await db.from('program_phase_workouts').select('id, template_id').in('phase_id', phaseIds)
            await db.from('program_phase_workouts').delete().in('id', (pws || []).map(p => p.id))
            const templateIds = [...new Set((pws || []).map(p => p.template_id).filter(Boolean))]
            if (templateIds.length) await db.from('workout_templates').delete().in('id', templateIds)
          }
          await db.from('program_phases').delete().eq('program_id', progId)
          await db.from('programs').delete().eq('id', progId)
        }, setup)
      }
    } finally {
      await ptContext.close()
    }
  })

  test('a phase with no sessions assigned yet renders an empty-phase message, not a crash', async ({ page, browser }) => {
    // Regression test for a real live crash Jake hit 2026-07-10: a phase with zero
    // program_phase_workouts (a phase the coach hasn't finished building day-slots for yet --
    // a totally normal, valid state) made `renderDays(weekMap[weekNums[0]], panelId)` call
    // renderDays with `sessions: undefined` (weekNums was `[]`, so weekNums[0] was undefined),
    // crashing on `sessions.forEach`. Fixed by guarding `!weekNums.length` before that call.
    // Was blocked from running for real by the same RLS gap as the hero-card test above -- fixed
    // 2026-07-10 (see that test's comment), this test now runs for real.
    const ptContext = await browser.newContext()
    try {
      const ptPage = await ptContext.newPage()
      await loginAsPT(ptPage)

      const setup = await ptPage.evaluate(async () => {
        const { data: clients } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
        const clientId = clients[0].id
        const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Empty Phase Program' }).select('id').single()
        // Phase 1: no sessions at all -- the exact crash condition
        const { data: emptyPhase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Deload', duration_weeks: 1, order_index: 0 }).select('id').single()
        // Phase 2: one real session, so the rest of the accordion still has something to render
        const { data: phase2 } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 4, order_index: 1 }).select('id').single()
        const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, client_id: clientId, program_id: null, name: '[E2E] Empty Phase Session' }).select('id').single()
        const { data: pw } = await db.from('program_phase_workouts').insert({ phase_id: phase2.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 }).select('id').single()
        const { data: cp } = await db.from('client_programs').insert({ client_id: clientId, program_id: prog.id, start_date: new Date().toISOString().split('T')[0] }).select('id').single()
        await db.from('client_program_workouts').insert({ client_program_id: cp.id, program_phase_workout_id: pw.id, workout_template_id: tmpl.id, week_number: 1 })
        return { progId: prog.id, cpId: cp.id }
      })

      try {
        await page.click('[data-page="workouts"]')
        await page.waitForTimeout(1000)
        const consoleErrors = []
        page.on('pageerror', err => consoleErrors.push(err.message))
        // The hero card also shows the phase name in its meta line ("Deload · Week 1"), so a
        // plain text=Deload locator is ambiguous and can land on that instead of the actual
        // accordion toggle button — scope to the button specifically.
        await page.click('button:has-text("Deload")')
        await expect(page.locator('text=No sessions added to this phase yet')).toBeVisible({ timeout: 5000 })
        expect(consoleErrors).toEqual([])
      } finally {
        await ptPage.evaluate(async ({ progId, cpId }) => {
          await db.from('client_program_workouts').delete().eq('client_program_id', cpId)
          await db.from('client_programs').delete().eq('id', cpId)
          const { data: phases } = await db.from('program_phases').select('id').eq('program_id', progId)
          const phaseIds = (phases || []).map(p => p.id)
          if (phaseIds.length) {
            const { data: pws } = await db.from('program_phase_workouts').select('id, template_id').in('phase_id', phaseIds)
            await db.from('program_phase_workouts').delete().in('id', (pws || []).map(p => p.id))
            const templateIds = [...new Set((pws || []).map(p => p.template_id).filter(Boolean))]
            if (templateIds.length) await db.from('workout_templates').delete().in('id', templateIds)
          }
          await db.from('program_phases').delete().eq('program_id', progId)
          await db.from('programs').delete().eq('id', progId)
        }, setup)
      }
    } finally {
      await ptContext.close()
    }
  })

  test('client_programs embed chain (programs > program_phases > program_phase_workouts) resolves fully for the client role, not just the outer table', async ({ page, browser }) => {
    // Regression test for 2026-07-10: an RLS fix on client_programs alone looked complete
    // (verified by reading that one table directly as the client) but wasn't -- the app's real
    // queries (app-dashboard.js, app-workouts.js) embed programs(program_phases(program_phase_
    // workouts(...))) *inside* client_programs, and three of those four tables had no
    // client-read policy at all. PostgREST doesn't error on an unreadable embed level -- it
    // silently returns null/[], which crashed the dashboard the moment a real client's own
    // `programs` embed resolved to null. This test queries the exact same nested shape the app
    // uses and asserts every level is populated, not just the entry table.
    const ptContext = await browser.newContext()
    try {
      const ptPage = await ptContext.newPage()
      await loginAsPT(ptPage)

      const setup = await ptPage.evaluate(async () => {
        const { data: clients } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
        const clientId = clients[0].id
        const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Embed Chain Program' }).select('id').single()
        const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 4, order_index: 0 }).select('id').single()
        const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, client_id: clientId, program_id: null, name: '[E2E] Embed Chain Session' }).select('id').single()
        const { data: pw } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 }).select('id').single()
        const { data: cp } = await db.from('client_programs').insert({ client_id: clientId, program_id: prog.id, start_date: new Date().toISOString().split('T')[0] }).select('id').single()
        await db.from('client_program_workouts').insert({ client_program_id: cp.id, program_phase_workout_id: pw.id, workout_template_id: tmpl.id, week_number: 1 })
        return { progId: prog.id, cpId: cp.id }
      })

      try {
        // Query as the CLIENT (the fixture's own `page`, already logged in via beforeEach) using
        // the exact nested embed shape app-dashboard.js/app-workouts.js actually use.
        const result = await page.evaluate(async () => {
          const { data: clientRow } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
          const { data } = await db.from('client_programs')
            .select('id, start_date, programs(id, name, program_phases(id, name, program_phase_workouts(id)))')
            .eq('client_id', clientRow.id)
            .order('created_at', { ascending: false })
            .limit(1)
          return data?.[0] || null
        })
        expect(result).not.toBeNull()
        expect(result.programs).not.toBeNull() // this is the exact level that silently nulled out
        expect(result.programs.name).toBe('[E2E] Embed Chain Program')
        expect(result.programs.program_phases).toBeInstanceOf(Array)
        expect(result.programs.program_phases.length).toBeGreaterThan(0)
        expect(result.programs.program_phases[0].program_phase_workouts).toBeInstanceOf(Array)
        expect(result.programs.program_phases[0].program_phase_workouts.length).toBeGreaterThan(0)
      } finally {
        await ptPage.evaluate(async ({ progId, cpId }) => {
          await db.from('client_program_workouts').delete().eq('client_program_id', cpId)
          await db.from('client_programs').delete().eq('id', cpId)
          const { data: phases } = await db.from('program_phases').select('id').eq('program_id', progId)
          const phaseIds = (phases || []).map(p => p.id)
          if (phaseIds.length) {
            const { data: pws } = await db.from('program_phase_workouts').select('id, template_id').in('phase_id', phaseIds)
            await db.from('program_phase_workouts').delete().in('id', (pws || []).map(p => p.id))
            const templateIds = [...new Set((pws || []).map(p => p.template_id).filter(Boolean))]
            if (templateIds.length) await db.from('workout_templates').delete().in('id', templateIds)
          }
          await db.from('program_phases').delete().eq('program_id', progId)
          await db.from('programs').delete().eq('id', progId)
        }, setup)
      }
    } finally {
      await ptContext.close()
    }
  })

  test('_buildWorkoutsHero falls back to a freeform start action when no program is assigned', async ({ page }) => {
    const hero = await page.evaluate(() => _buildWorkoutsHero('fake-client-id', null, {}))
    expect(hero.title).toBe('No program assigned')
    expect(hero.action).toContain("startWorkoutRunner('fake-client-id')")
  })

  test('_buildWorkoutsHero resolves the next scheduled session\'s real templateId when one exists', async ({ page }) => {
    const hero = await page.evaluate(() => {
      const activeAssignment = {
        start_date: new Date().toISOString().split('T')[0], // starts today -> weeksSinceStart 0, weekInPhase 1
        programs: { name: 'Test Program', program_phases: [{ order_index: 0, name: 'Phase 1', duration_weeks: 4,
          program_phase_workouts: [{ id: 'pw-1', day_of_week: 1, session_order: 1, week_number: 1 }] }] }
      }
      const cpwMap = { 'pw-1': { templateId: 'tmpl-abc' } }
      return _buildWorkoutsHero('client-1', activeAssignment, cpwMap)
    })
    expect(hero.title).toBe('Test Program')
    expect(hero.meta).toContain('Phase 1')
    expect(hero.action).toContain("startWorkoutRunner('client-1','tmpl-abc')")
  })

  test('"Recent sessions" replaces "Session history", capped to 5, date-only rows', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    await page.waitForTimeout(1000)
    const toggle = page.locator('button[onclick="toggleClientPhase(\'client-session-history\')"]')
    if (await toggle.count() === 0) return // no sessions yet
    await expect(page.locator('text=Recent sessions')).toBeVisible()
    await expect(page.locator('text=Session history')).toHaveCount(0)
    await toggle.click()
    await page.waitForSelector('#client-session-list', { timeout: 10000 })
    const rows = page.locator('#client-session-list .list-row')
    const count = await rows.count()
    expect(count).toBeLessThanOrEqual(5)
  })

  test('workout_template_exercises resolves for the client role, both directly and via the nested client_program_workouts embed (regression, 2026-07-10)', async ({ page, browser }) => {
    // Regression for a second, deeper instance of this morning's embed-chain miss:
    // workout_template_exercises had NO select policy for the client role at all -- the only
    // select-capable policy was "coaches manage own template exercises" (coach_id = auth.uid()),
    // which never matches a real client's own auth.uid(). Solo was invisible to this because
    // solo's auth.uid() IS the coach's own id. This broke openSessionDetail (direct query --
    // showed "No exercises added yet" on every real session) and the client Workouts-page
    // accordion (nested embed silently nulled the exercises level). Fixed via a new client-read
    // policy on workout_template_exercises mirroring the two existing workout_templates policies.
    const ptContext = await browser.newContext()
    try {
      const ptPage = await ptContext.newPage()
      await loginAsPT(ptPage)

      const setup = await ptPage.evaluate(async () => {
        const { data: clients } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
        const clientId = clients[0].id
        const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Exercises Chain Program' }).select('id').single()
        const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single()
        const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, client_id: clientId, program_id: null, name: '[E2E] Exercises Chain Session' }).select('id').single()
        await db.from('workout_template_exercises').insert({ template_id: tmpl.id, exercise_name: '[E2E] Chain Squat', exercise_type: 'strength', order_index: 0, sets_json: [{ repsMin: '5', repsMax: '5' }] })
        const { data: pw } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 }).select('id').single()
        const { data: cp } = await db.from('client_programs').insert({ client_id: clientId, program_id: prog.id, start_date: new Date().toISOString().split('T')[0] }).select('id').single()
        await db.from('client_program_workouts').insert({ client_program_id: cp.id, program_phase_workout_id: pw.id, workout_template_id: tmpl.id, week_number: 1 })
        return { progId: prog.id, cpId: cp.id, templateId: tmpl.id }
      })

      try {
        const result = await page.evaluate(async (templateId) => {
          // Direct query -- exact shape openSessionDetail uses.
          const { data: direct } = await db.from('workout_template_exercises')
            .select('exercise_name, exercise_type, order_index, sets_json, notes')
            .eq('template_id', templateId)
            .order('order_index')
          // Nested embed -- exact shape renderClientWorkoutsPage/renderClientPrograms use.
          const { data: clientRow } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
          const { data: cpw } = await db.from('client_program_workouts')
            .select('workout_template_id, workout_templates(id, name, workout_template_exercises(exercise_name, order_index, sets_json))')
            .eq('workout_template_id', templateId)
          return { direct, nested: cpw?.[0]?.workout_templates?.workout_template_exercises }
        }, setup.templateId)

        expect(result.direct).toBeInstanceOf(Array)
        expect(result.direct.length).toBeGreaterThan(0)
        expect(result.direct[0].exercise_name).toBe('[E2E] Chain Squat')

        expect(result.nested).toBeInstanceOf(Array) // this is the exact level that silently nulled out
        expect(result.nested.length).toBeGreaterThan(0)
        expect(result.nested[0].exercise_name).toBe('[E2E] Chain Squat')
      } finally {
        await ptPage.evaluate(async ({ progId, cpId, templateId }) => {
          await db.from('client_program_workouts').delete().eq('client_program_id', cpId)
          await db.from('client_programs').delete().eq('id', cpId)
          const { data: phases } = await db.from('program_phases').select('id').eq('program_id', progId)
          const phaseIds = (phases || []).map(p => p.id)
          if (phaseIds.length) await db.from('program_phase_workouts').delete().in('phase_id', phaseIds)
          await db.from('workout_template_exercises').delete().eq('template_id', templateId)
          await db.from('workout_templates').delete().eq('id', templateId)
          await db.from('program_phases').delete().eq('program_id', progId)
          await db.from('programs').delete().eq('id', progId)
        }, setup)
      }
    } finally {
      await ptContext.close()
    }
  })

  test('client can insert, update, and delete their own client_1rms row (regression, 2026-07-10)', async ({ page }) => {
    // client_1rms had write policies for solo (coach_id IS NULL) but none at all for a real
    // coached client writing their own 1RM -- e.g. via the runner's mid-workout/post-session
    // prompts or the My Progress "Add 1RM" form. A real insert attempt failed with an RLS
    // violation (manual testing, 2026-07-03). Fixed via 3 new client-scoped write policies.
    const clientId = await page.evaluate(async () => {
      const { data } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
      return data.id
    })

    let rowId = null
    try {
      const inserted = await page.evaluate(async (clientId) => {
        const { data, error } = await db.from('client_1rms')
          .insert({ client_id: clientId, exercise_name: '[E2E] 1RM Write Test', one_rm_kg: 100, recorded_at: new Date().toISOString().split('T')[0] })
          .select('id')
          .single()
        return { data, error: error?.message }
      }, clientId)
      expect(inserted.error).toBeUndefined()
      expect(inserted.data?.id).toBeTruthy()
      rowId = inserted.data.id

      const updated = await page.evaluate(async (rowId) => {
        const { error } = await db.from('client_1rms').update({ one_rm_kg: 105 }).eq('id', rowId)
        return error?.message
      }, rowId)
      expect(updated).toBeUndefined()

      const readBack = await page.evaluate(async (rowId) => {
        const { data } = await db.from('client_1rms').select('one_rm_kg').eq('id', rowId).single()
        return data?.one_rm_kg
      }, rowId)
      expect(readBack).toBe(105)
    } finally {
      if (rowId) {
        const deleteErr = await page.evaluate(async (rowId) => {
          const { error } = await db.from('client_1rms').delete().eq('id', rowId)
          return error?.message
        }, rowId)
        expect(deleteErr).toBeUndefined()
      }
    }
  })

  test('a client cannot read another client\'s workout_template clones (cross-client RLS leak, 2026-07-11)', async ({ page, browser }) => {
    // The "Client reads workout templates" policy scoped by coach_id ALONE, with no client_id
    // restriction. Client-plan clones are written with coach_id = the coach and client_id = the
    // client (_cloneTemplateForClient, app-programs.js), so every client of the same coach matched
    // that policy and could read every OTHER client's personalised template clones via a direct
    // API call. A client's own clones are covered separately by `client_read_own_templates`
    // (client_id-scoped), so the coach_id policy only ever needed the coach's non-client-owned
    // rows -- it is now restricted with `client_id is null`.
    const ptContext = await browser.newContext()
    try {
      const ptPage = await ptContext.newPage()
      await loginAsPT(ptPage)

      // Own the fixture: create a throwaway OTHER client, and a template clone belonging to them.
      const setup = await ptPage.evaluate(async () => {
        const { data: other } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: '[E2E] Other Client (RLS leak test)' })
          .select('id').single()
        const { data: tmpl } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, client_id: other.id, program_id: null, name: '[E2E] Other Client Private Session' })
          .select('id').single()
        return { otherClientId: other.id, otherTemplateId: tmpl.id }
      })

      try {
        // As the REAL client (fixture `page`, logged in via beforeEach), try to read it directly.
        const leaked = await page.evaluate(async (otherTemplateId) => {
          const { data } = await db.from('workout_templates').select('id, name').eq('id', otherTemplateId)
          return data || []
        }, setup.otherTemplateId)
        expect(leaked).toHaveLength(0)

        // And it must not appear in an unfiltered listing either.
        const names = await page.evaluate(async () => {
          const { data } = await db.from('workout_templates').select('name').limit(1000)
          return (data || []).map(t => t.name)
        })
        expect(names).not.toContain('[E2E] Other Client Private Session')
      } finally {
        await ptPage.evaluate(async ({ otherClientId, otherTemplateId }) => {
          await db.from('workout_templates').delete().eq('id', otherTemplateId)
          await db.from('clients').delete().eq('id', otherClientId)
        }, setup)
      }
    } finally {
      await ptContext.close()
    }
  })

  test('tightening the coach_id policy does not break a client reading their program\'s MASTER templates via the dashboard/calendar embed (2026-07-11)', async ({ page, browser }) => {
    // Guard against the session-23/24 failure mode. The client Dashboard hero (app-dashboard.js)
    // and client Calendar (app-calendar-goals.js) embed workout_templates through
    // client_programs > programs > program_phases > program_phase_workouts -- i.e. the MASTER
    // templates (client_id null), NOT the client's own clones. Those masters are readable only
    // via the coach_id policy, so `client_id is null` must stay permitted or PostgREST silently
    // nulls the embed and the client's dashboard/calendar break with no error.
    const ptContext = await browser.newContext()
    try {
      const ptPage = await ptContext.newPage()
      await loginAsPT(ptPage)

      const setup = await ptPage.evaluate(async () => {
        const { data: clientRow } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
        const clientId = clientRow[0].id
        const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Master Embed Program' }).select('id').single()
        const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 4, order_index: 0 }).select('id').single()
        // The MASTER template: coach-owned, client_id null (this is the row under test).
        const { data: master } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, client_id: null, program_id: prog.id, name: '[E2E] Master Session' })
          .select('id').single()
        const { data: pw } = await db.from('program_phase_workouts')
          .insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: master.id, week_number: 1 })
          .select('id').single()
        const { data: cp } = await db.from('client_programs')
          .insert({ client_id: clientId, program_id: prog.id, start_date: new Date().toISOString().split('T')[0] })
          .select('id').single()
        return { progId: prog.id, cpId: cp.id, masterId: master.id, pwId: pw.id }
      })

      try {
        // Query as the CLIENT using the exact embed shape app-dashboard.js:262 uses.
        const result = await page.evaluate(async () => {
          const { data: clientRow } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
          const { data } = await db.from('client_programs')
            .select('start_date, programs(name, program_phases(id, name, program_phase_workouts(id, day_of_week, workout_templates(id, name))))')
            .eq('client_id', clientRow.id)
            .order('created_at', { ascending: false })
            .limit(1)
          return data?.[0] || null
        })
        expect(result).not.toBeNull()
        const pws = result.programs?.program_phases?.[0]?.program_phase_workouts || []
        expect(pws.length).toBeGreaterThan(0)
        // The exact level that would silently null out if the coach_id policy over-restricted.
        expect(pws[0].workout_templates).not.toBeNull()
        expect(pws[0].workout_templates.name).toBe('[E2E] Master Session')
      } finally {
        await ptPage.evaluate(async ({ progId, cpId, masterId, pwId }) => {
          await db.from('client_programs').delete().eq('id', cpId)
          await db.from('program_phase_workouts').delete().eq('id', pwId)
          await db.from('workout_templates').delete().eq('id', masterId)
          await db.from('program_phases').delete().eq('program_id', progId)
          await db.from('programs').delete().eq('id', progId)
        }, setup)
      }
    } finally {
      await ptContext.close()
    }
  })

  test('a logged personal best actually appears on the Personal Bests page (regression, 2026-07-12)', async ({ page }) => {
    // Every personal best anyone ever logged was saved correctly and then NEVER DISPLAYED.
    // renderProgressPBs embedded `performance_exercises(name, category, unit)` — a table that does
    // not exist and has no relationship to performance_logs — so PostgREST rejected the whole query.
    // The error was discarded (`const { data: logs } =`, no error check), `logs` came back
    // undefined, and the page fell through to its "No personal bests logged yet" empty state.
    // The columns were plain fields on performance_logs all along — exactly what saveClientPB writes.
    // Found by the RLS audit, which enumerates the tables the app references; that one wasn't real.
    const clientId = await page.evaluate(async () => {
      const { data } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
      return data.id
    })

    const insertErr = await page.evaluate(async (clientId) => {
      const { error } = await db.from('performance_logs').insert({
        client_id: clientId, logged_by: currentUser.id,
        category: 'strength', name: '[E2E] PB Deadlift', value: 200, unit: 'kg',
        date: new Date().toISOString().split('T')[0],
      })
      return error ? error.message : null
    }, clientId)
    expect(insertErr).toBeNull() // the WRITE was never the problem — only the read

    try {
      await page.click('[data-page="progress"]')
      await page.waitForTimeout(1000)
      await page.click('button:has-text("Personal Bests")')
      await page.waitForTimeout(1500)

      await expect(page.locator('text=[E2E] PB Deadlift')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('text=No personal bests logged yet')).toHaveCount(0)
    } finally {
      // Verify the cleanup actually cleaned. A working INSERT does not imply a working DELETE — they
      // are separate RLS policies — and an RLS-denied delete removes 0 rows while returning NO error.
      // Left unchecked, this test would quietly strand a row in the real performance_logs table on
      // every single suite run, and still pass (a second row just groups under the same name).
      const cleanup = await page.evaluate(async (clientId) => {
        const { error } = await db.from('performance_logs').delete()
          .eq('client_id', clientId).eq('name', '[E2E] PB Deadlift')
        const { data: left } = await db.from('performance_logs').select('id')
          .eq('client_id', clientId).eq('name', '[E2E] PB Deadlift')
        return { err: error ? error.message : null, remaining: (left || []).length }
      }, clientId)
      expect(cleanup.err, 'cleanup delete errored').toBeNull()
      expect(cleanup.remaining, 'cleanup deleted nothing — RLS likely denies DELETE on performance_logs for a client, and this test has been stranding rows in the real database').toBe(0)
    }
  })
})
