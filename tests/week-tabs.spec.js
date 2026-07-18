const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

// The 2026-07-17 week-tabs redesign: a week is a row of tabs (one week on screen at a time), days are
// rows, and a day/slot opens its workout inline — the session-detail slider is gone on both the read
// Workouts page and the Programs builder, and the builder no longer scrolls sideways on mobile.

test.describe('Week-tabs redesign', () => {
  test('Programs builder: week tabs switch weeks, no horizontal scroll on mobile, slot opens inline with Edit/Remove', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))

    await loginAsPT(page)

    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] WeekTabs Builder' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 3, order_index: 0 }).select('id').single()
      const mk = async (name, exs) => {
        const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name }).select('id').single()
        await db.from('workout_template_exercises').insert(exs.map((n, i) => ({ template_id: t.id, exercise_name: n, exercise_type: 'strength', order_index: i, sets_json: [{ repsMin: '5' }, { repsMin: '5' }] })))
        return t.id
      }
      const upper = await mk('[E2E] WT Upper', ['[E2E] Bench', '[E2E] OHP', '[E2E] Row'])
      const lower = await mk('[E2E] WT Lower', ['[E2E] Squat', '[E2E] RDL'])
      const rows = []
      for (const w of [1, 2, 3]) {
        rows.push({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: upper, week_number: w })
        rows.push({ phase_id: phase.id, day_of_week: 3, day_label: 'Wednesday', session_order: 1, template_id: lower, week_number: w })
      }
      await db.from('program_phase_workouts').insert(rows)
      return { programId: prog.id, upper, lower }
    })

    try {
      await page.evaluate(async (id) => { await openProgram(id) }, setup.programId)
      await page.waitForSelector('h1:has-text("[E2E] WeekTabs Builder")', { timeout: 8000 })

      // Three week tabs, week 1 active by default
      await expect(page.locator('.week-tab[data-week="1"]')).toBeVisible({ timeout: 8000 })
      await expect(page.locator('.week-tab[data-week="2"]')).toBeVisible()
      await expect(page.locator('.week-tab[data-week="3"]')).toBeVisible()
      await expect(page.locator('.week-tab[data-week="1"]')).toHaveAttribute('aria-selected', 'true')

      // Mobile: the whole point — the day grid must not force the page to scroll sideways
      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForTimeout(200)
      const bodyScrollW = await page.evaluate(() => document.body.scrollWidth)
      expect(bodyScrollW).toBeLessThanOrEqual(390)

      // Switching weeks
      await page.click('.week-tab[data-week="2"]')
      await expect(page.locator('.week-tab[data-week="2"]')).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('.week-tab[data-week="1"]')).toHaveAttribute('aria-selected', 'false')

      // A workout slot opens inline (exercises) with Edit / Remove — no slider
      await page.locator('.pwk-slot-head').first().click()
      await expect(page.locator('.pwk-ex').first()).toBeVisible({ timeout: 4000 })
      await expect(page.locator('.pwk-act.edit').first()).toBeVisible()
      await expect(page.locator('.pwk-act.remove').first()).toBeVisible()
      await expect(page.locator('#session-detail-panel')).toHaveCount(0)

      // Restored per-workout "Save to Library" — copies just this workout into the standalone Library
      const saveBtn = page.locator('.pwk-slot-body button', { hasText: 'Save to Library' }).first()
      await expect(saveBtn).toBeVisible()
      await saveBtn.click()
      await expect(page.locator('#app-toast')).toContainText(/Library/i, { timeout: 6000 })
      const libCopies = await page.evaluate(async () => {
        const { data } = await db.from('workout_templates').select('id')
          .eq('coach_id', currentUser.id).eq('name', '[E2E] WT Upper').is('program_id', null).is('client_id', null)
        return (data || []).length
      })
      expect(libCopies).toBe(1)
    } finally {
      await page.evaluate(async (s) => {
        await db.from('programs').delete().eq('id', s.programId)
        await db.from('workout_templates').delete().in('id', [s.upper, s.lower])
        // the Save-to-Library copy is a new standalone row (program_id null) — sweep it by name
        await db.from('workout_templates').delete().eq('coach_id', currentUser.id).in('name', ['[E2E] WT Upper', '[E2E] WT Lower']).is('program_id', null)
      }, setup)
    }

    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('Workouts read page: week tabs render, switch weeks, and a day opens its workout inline (no slider)', async ({ page, browser }) => {
    const errors = []
    page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))

    await loginAsClient(page)
    const clientId = await page.evaluate(() => _getCurrentClientId())
    test.skip(!clientId, 'No client record for the E2E client account')

    // Assign a 3-week program to this client, as the PT, in a separate context.
    const ptCtx = await browser.newContext()
    const pt = await ptCtx.newPage()
    await loginAsPT(pt)
    const setup = await pt.evaluate(async (clientId) => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] WeekTabs Read' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 3, order_index: 0 }).select('id').single()
      const mkMaster = async (name) => (await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name }).select('id').single()).data.id
      const mUpper = await mkMaster('[E2E] WT Upper'); const mLower = await mkMaster('[E2E] WT Lower')
      const mkClone = async (name, exs) => {
        const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: clientId, name }).select('id').single()
        await db.from('workout_template_exercises').insert(exs.map((n, i) => ({ template_id: t.id, exercise_name: n, exercise_type: 'strength', order_index: i, sets_json: [{ repsMin: '5' }, { repsMin: '5' }] })))
        return t.id
      }
      const cUpper = await mkClone('[E2E] WT Upper', ['[E2E] Bench', '[E2E] OHP']); const cLower = await mkClone('[E2E] WT Lower', ['[E2E] Squat'])
      const { data: cp } = await db.from('client_programs').insert({ client_id: clientId, program_id: prog.id, start_date: new Date().toISOString().split('T')[0] }).select('id').single()
      for (const w of [1, 2, 3]) {
        const { data: mon } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: mUpper, week_number: w }).select('id').single()
        const { data: wed } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 3, day_label: 'Wednesday', session_order: 1, template_id: mLower, week_number: w }).select('id').single()
        await db.from('client_program_workouts').insert([
          { client_program_id: cp.id, program_phase_workout_id: mon.id, workout_template_id: cUpper, week_number: w },
          { client_program_id: cp.id, program_phase_workout_id: wed.id, workout_template_id: cLower, week_number: w },
        ])
      }
      return { programId: prog.id, cpId: cp.id, cUpper, cLower, mUpper, mLower }
    }, clientId)

    try {
      await page.click('[data-page="workouts"]')
      await expect(page.locator('.week-tab[data-week="1"]')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('.week-tab')).toHaveCount(3)

      // Slider is gone on the read page
      await expect(page.locator('#session-detail-panel')).toHaveCount(0)

      // The active phase is open by default; a day row opens its workout inline (exercises visible)
      await page.locator('button[onclick*="toggleClientPhase"]').filter({ hasText: /Upper|Lower|DAY/ }).first().click().catch(() => {})
      await expect(page.locator('text=/\\d+ set/').first()).toBeVisible({ timeout: 4000 })

      // Switching weeks
      await page.click('.week-tab[data-week="3"]')
      await expect(page.locator('.week-tab[data-week="3"]')).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('#session-detail-panel')).toHaveCount(0)
    } finally {
      await pt.evaluate(async (s) => {
        await db.from('client_programs').delete().eq('id', s.cpId)
        await db.from('programs').delete().eq('id', s.programId)
        await db.from('workout_templates').delete().in('id', [s.cUpper, s.cLower, s.mUpper, s.mLower])
      }, setup)
      await ptCtx.close()
    }

    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
