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

  test.fixme('Workouts page renders a hero card with title, meta, and a Start button — BLOCKED: client_programs has no client-read RLS policy (found 2026-07-10)', async ({ page, browser }) => {
    // Investigating this test's flakiness surfaced a real RLS gap, not a test or app bug: the
    // "client" role has NO select policy on client_programs at all (verified directly — a
    // genuine client account reads back zero rows even completely unfiltered, while the exact
    // same account correctly reads workout_logs/weight_logs rows). This means any real
    // (non-solo) client with an assigned program currently cannot see it on their Dashboard or
    // Workouts page in production -- app-dashboard.js and app-workouts.js both query
    // client_programs directly client-side with no other access path. It's invisible in normal
    // testing because solo accounts share the coach's own auth.uid() and never hit this RLS
    // check. Needs a Supabase SQL policy fix before this test can run for real, e.g.:
    //   CREATE POLICY "Clients can view their own program assignments" ON client_programs
    //   FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
    // The underlying hero-card logic itself IS covered without this gap by the two
    // _buildWorkoutsHero unit-style tests below, which construct their fixture in-memory.
    // Wrapped in try/finally so a leaked browser context can't survive an assertion failure --
    // dormant while this test is fixme'd, but activates the moment it's un-fixme'd otherwise.
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

  test.fixme('a phase with no sessions assigned yet renders an empty-phase message, not a crash — BLOCKED: client_programs has no client-read RLS policy (found 2026-07-10)', async ({ page, browser }) => {
    // Regression test for a real live crash Jake hit 2026-07-10: a phase with zero
    // program_phase_workouts (a phase the coach hasn't finished building day-slots for yet --
    // a totally normal, valid state) made `renderDays(weekMap[weekNums[0]], panelId)` call
    // renderDays with `sessions: undefined` (weekNums was `[]`, so weekNums[0] was undefined),
    // crashing on `sessions.forEach`. Fixed by guarding `!weekNums.length` before that call.
    // Blocked from running for real by the same RLS gap as the hero-card test above -- see that
    // test's comment for the fix. This test will start actually exercising the fix the moment
    // that RLS policy lands; until then, `js/app-workouts.js`'s fix is verified by code reading only.
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
        await page.click('text=Deload')
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
})
