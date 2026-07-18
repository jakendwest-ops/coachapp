const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Solo/Personal account tests require Jake's master account (_soloClientId must be set).
// The E2E PT test account (coachapp.e2e.pt@gmail.com) has no solo client record,
// so these tests skip when run against the test account and pass when run as Jake.

test.describe('Solo / Personal account', () => {
  let soloAvailable = false

  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    // loadUserInfo is async — 500ms is enough; if not set by then, it won't be
    await page.waitForTimeout(500)
    soloAvailable = await page.evaluate(() => !!window._soloClientId)
    if (soloAvailable) {
      await page.evaluate(() => switchView('solo'))
      await page.waitForTimeout(1000)
    }
  })

  test('Personal pill is visible in view switcher', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    const display = await page.evaluate(() => document.getElementById('mvs-personal')?.style.display)
    expect(display).not.toBe('none')
  })

  test('switching to Personal shows solo dashboard', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await expect(page.locator('h1')).not.toContainText('Welcome back', { timeout: 5000 })
    // Solo nav has no Clients link
    await expect(page.locator('[data-page="clients"]')).not.toBeVisible()
  })

  test('solo nav shows Dashboard, Workouts, Library, Programs, Calendar, Progress', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await expect(page.locator('[data-page="solo-dashboard"]').first()).toBeVisible()
    await expect(page.locator('[data-page="workouts"]').first()).toBeVisible()
    await expect(page.locator('[data-page="library"]').first()).toBeVisible()
    await expect(page.locator('[data-page="programs"]').first()).toBeVisible()
    await expect(page.locator('[data-page="calendar"]').first()).toBeVisible()
    await expect(page.locator('[data-page="progress"]').first()).toBeVisible()
  })

  test('solo can reach the Library nav item and see Templates/Exercise Library tabs (2026-07-11)', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.click('[data-page="library"]')
    await page.waitForTimeout(1000)
    await expect(page.locator('h1')).toContainText('Library', { timeout: 8000 })
    await expect(page.locator('#wt-tab-templates')).toBeVisible()
    await expect(page.locator('#wt-tab-exercises')).toBeVisible()
    await expect(page.locator('button:has-text("New template")')).toBeVisible()
  })

  test('solo Workouts page shows program accordion, not template builder', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.click('[data-page="workouts"]')
    await page.waitForTimeout(1500)
    await expect(page.locator('h1')).toContainText('Workouts', { timeout: 8000 })
    // Template builder "New template" button must NOT be visible in solo view
    await expect(page.locator('button:has-text("New template")')).not.toBeVisible()
  })

  test('finishing a runner session as solo lands on Workouts, not a broken client-profile fetch (regression, 2026-07-08)', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    // _afterRunnerSave used to only branch for role 'client', so 'solo' fell through to
    // openClient() — which queries clients.coach_id = currentUser.id, but a solo client
    // record has coach_id = NULL, so that query returns 0 rows and errors.
    await page.evaluate(() => _afterRunnerSave(window._soloClientId))
    await page.waitForTimeout(1000)
    await expect(page.locator('h1')).toContainText('Workouts', { timeout: 8000 })
  })

  test('solo Programs page loads', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.click('[data-page="programs"]')
    await expect(page.locator('h1')).toContainText('Programs', { timeout: 8000 })
    await expect(page.locator('button:has-text("New program")')).toBeVisible()
  })

  test('solo Calendar page loads', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.click('[data-page="calendar"]')
    await expect(page.locator('h1')).toContainText('Calendar', { timeout: 8000 })
  })

  test('solo Progress page loads with tabs (2026-07-08: Cardio folded into Personal Bests, no longer its own top-level tab)', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.click('[data-page="progress"]')
    await page.waitForTimeout(1000)
    await expect(page.locator('h1')).toContainText('My Progress', { timeout: 8000 })
    await expect(page.locator('button:has-text("Body Weight")')).toBeVisible()
    await expect(page.locator('button:has-text("Personal Bests")')).toBeVisible()
    await expect(page.locator('button:has-text("Performance")')).toBeVisible()
  })

  test('tapping a day shows its workout inline, with no slider (2026-07-17 week-tabs redesign)', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.click('[data-page="workouts"]')
    await page.waitForTimeout(2000)
    // Skip if no program assigned (E2E account may not have one)
    const hasPhase = await page.locator('button[onclick*="cl-phase"]').first().isVisible({ timeout: 4000 }).catch(() => false)
    if (!hasPhase) return
    // The active phase is expanded by default now — open the first day to reveal its workout inline.
    const dayBtn = page.locator('button[onclick*="-d1"]').first()
    if (await dayBtn.isVisible({ timeout: 3000 }).catch(() => false)) await dayBtn.click()
    await page.waitForTimeout(400)
    // Exercises show inline under the day (set counts) — the redundant slide-in slider is gone.
    await expect(page.locator('text=/\\d+ set/').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('#session-detail-panel')).toHaveCount(0)
  })

  test('solo stats strip stays visible (not display:none) on mobile', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.setViewportSize({ width: 400, height: 844 })
    await page.waitForTimeout(300)
    await expect(page.locator('.solo-stats')).toBeVisible()
  })

  test('switching back to PT restores coach dashboard', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.evaluate(() => switchView('coach'))
    await page.waitForTimeout(800)
    await expect(page.locator('h1')).toContainText('Welcome back', { timeout: 8000 })
    await expect(page.locator('[data-page="clients"]').first()).toBeVisible()
  })

  test('solo dashboard shows a "Current program" header with a View program button, when a program is assigned (2026-07-05)', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    const hasProgram = await page.locator('text=Current program').isVisible({ timeout: 3000 }).catch(() => false)
    test.skip(!hasProgram, 'No program assigned to this solo account')
    await expect(page.locator('text=Current program')).toBeVisible()
    await expect(page.locator('button:has-text("View program")')).toBeVisible()
    await page.locator('button:has-text("View program")').click()
    await expect(page.locator('h1')).toContainText('Workouts', { timeout: 8000 })
  })

  test('exercise created in Personal view never appears in the PT-facing Exercise Library, and vice versa (regression, 2026-07-10)', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    // Personal and PT share the same coach_id (same auth.uid()) — exercises used to be
    // distinguished by nothing at all, so a lift created in either context leaked into both.
    const fixture = await page.evaluate(async () => {
      const { data: personalEx } = await db.from('exercises').insert({ coach_id: currentUser.id, is_personal: true, name: '[E2E] Personal-Only Lift' }).select('id').single()
      const { data: ptEx } = await db.from('exercises').insert({ coach_id: currentUser.id, is_personal: false, name: '[E2E] PT-Only Lift' }).select('id').single()
      return { personalId: personalEx.id, ptId: ptEx.id }
    })
    try {
      await page.evaluate(() => switchView('coach'))
      await page.waitForTimeout(800)
      await page.click('[data-page="workouts"]')
      await page.waitForTimeout(1000)
      await page.click('button:has-text("Exercise Library")')
      await page.waitForTimeout(500)
      await expect(page.locator('text=[E2E] PT-Only Lift')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('text=[E2E] Personal-Only Lift')).not.toBeVisible()

      await page.evaluate(() => switchView('solo'))
      await page.waitForTimeout(800)
      const picked = await page.evaluate(async () => {
        await _openExercisePicker(currentUser.id, () => {})
        const names = (_exercisePickerState?.allExercises || []).map(e => e.name)
        _closeExercisePicker()
        return names
      })
      expect(picked).toContain('[E2E] Personal-Only Lift')
      expect(picked).not.toContain('[E2E] PT-Only Lift')
    } finally {
      await page.evaluate(async ({ personalId, ptId }) => {
        await db.from('exercises').delete().eq('id', personalId)
        await db.from('exercises').delete().eq('id', ptId)
      }, fixture)
    }
  })

  test('workout template created in Personal view never appears in the PT-facing Templates list, and vice versa (regression, 2026-07-11)', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    // Same coach_id-sharing issue as exercises (fixed 2026-07-10) -- workout_templates had no
    // equivalent is_personal split until now, so a standalone template built in either context
    // leaked into both the PT's real Templates list and the Personal Library.
    // Cleanup is by-name (not by captured id) so a partial-failure during fixture creation still
    // leaves no orphaned [E2E] rows -- see feedback_test_fixture_isolation.
    try {
      await page.evaluate(async () => {
        await db.from('workout_templates').insert({ coach_id: currentUser.id, is_personal: true, name: '[E2E] Personal-Only Template' })
        await db.from('workout_templates').insert({ coach_id: currentUser.id, is_personal: false, name: '[E2E] PT-Only Template' })
      })
      await page.evaluate(() => switchView('coach'))
      await page.waitForTimeout(800)
      await page.click('[data-page="workouts"]')
      await page.waitForTimeout(1000)
      await expect(page.locator('text=[E2E] PT-Only Template')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('text=[E2E] Personal-Only Template')).not.toBeVisible()

      await page.evaluate(() => switchView('solo'))
      await page.waitForTimeout(800)
      await page.click('[data-page="library"]')
      await page.waitForTimeout(1000)
      await expect(page.locator('text=[E2E] Personal-Only Template')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('text=[E2E] PT-Only Template')).not.toBeVisible()
    } finally {
      await page.evaluate(async () => {
        await db.from('workout_templates').delete().eq('coach_id', currentUser.id).in('name', ['[E2E] Personal-Only Template', '[E2E] PT-Only Template'])
      })
    }
  })

  test('program day-slot picker only offers Personal templates in Personal view, and vice versa (regression, 2026-07-11)', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    // Pre-existing bug independent of the Library nav feature: openProgram's day-slot picker had
    // no is_personal split either, so solo already saw the PT's real template pool in this dropdown.
    // Cleanup is by-name (not by captured id) so a partial-failure -- e.g. the New program flow
    // throwing after the program row is already inserted -- still leaves no orphaned [E2E] rows.
    try {
      await page.evaluate(async () => {
        await db.from('workout_templates').insert({ coach_id: currentUser.id, is_personal: true, name: '[E2E] Personal Picker Template' })
        await db.from('workout_templates').insert({ coach_id: currentUser.id, is_personal: false, name: '[E2E] PT Picker Template' })
      })
      await page.click('[data-page="programs"]')
      await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
      await page.click('button:has-text("New program")')
      await page.fill('#pm-name', '[E2E] Personal Picker Program')
      await page.click('#pm-save-btn')
      await page.waitForSelector('h1:has-text("[E2E] Personal Picker Program")', { timeout: 8000 })

      const names = await page.evaluate(() => (window._programTemplates || []).map(t => t.name))
      expect(names).toContain('[E2E] Personal Picker Template')
      expect(names).not.toContain('[E2E] PT Picker Template')
    } finally {
      await page.evaluate(async () => {
        await db.from('workout_templates').delete().eq('coach_id', currentUser.id).in('name', ['[E2E] Personal Picker Template', '[E2E] PT Picker Template'])
        await db.from('programs').delete().eq('coach_id', currentUser.id).eq('name', '[E2E] Personal Picker Program')
      })
    }
  })
})
