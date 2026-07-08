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

  test('solo nav shows Dashboard, Workouts, Programs, Calendar, Progress', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await expect(page.locator('[data-page="solo-dashboard"]').first()).toBeVisible()
    await expect(page.locator('[data-page="workouts"]').first()).toBeVisible()
    await expect(page.locator('[data-page="programs"]').first()).toBeVisible()
    await expect(page.locator('[data-page="calendar"]').first()).toBeVisible()
    await expect(page.locator('[data-page="progress"]').first()).toBeVisible()
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

  test('solo Progress page loads with tabs', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.click('[data-page="progress"]')
    await page.waitForTimeout(1000)
    await expect(page.locator('h1')).toContainText('My Progress', { timeout: 8000 })
    await expect(page.locator('button:has-text("Body Weight")')).toBeVisible()
    await expect(page.locator('button:has-text("Cardio")')).toBeVisible()
    await expect(page.locator('button:has-text("Personal Bests")')).toBeVisible()
    await expect(page.locator('button:has-text("Performance")')).toBeVisible()
  })

  test('session detail slide-in opens and closes', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.click('[data-page="workouts"]')
    await page.waitForTimeout(2000)
    // Skip if no program assigned (E2E account may not have one)
    const hasPhase = await page.locator('button[onclick*="cl-phase"]').first().isVisible({ timeout: 4000 }).catch(() => false)
    if (!hasPhase) return
    // Expand first phase then first day
    await page.locator('button[onclick*="cl-phase"]').first().click()
    await page.waitForTimeout(500)
    await page.locator('button[onclick*="-d1"]').first().click()
    await page.waitForTimeout(500)
    // Click first session name span
    await page.locator('span[onclick*="openSessionDetail"]').first().click()
    await page.waitForTimeout(500)
    // Slide-in panel must be in DOM
    await expect(page.locator('#session-detail-panel')).toBeAttached({ timeout: 5000 })
    await expect(page.locator('#session-detail-drawer')).toBeAttached()
    // Close via X button
    await page.locator('button[onclick="closeSessionDetail()"]').click()
    await page.waitForSelector('#session-detail-panel', { state: 'detached', timeout: 5000 })
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
})
