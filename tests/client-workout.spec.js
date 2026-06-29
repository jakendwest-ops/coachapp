const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')

test.describe('Client workout flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page)
  })

  test('client dashboard loads with hero card', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Hi,')
    await expect(page.locator('text=UP NEXT')).toBeVisible()
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
    const hasAccordion = await page.locator('button').filter({ hasText: /session/ }).first().isVisible({ timeout: 3000 }).catch(() => false)
    if (!hasAccordion) return // test client has no program — skip

    const firstPhaseBtn = page.locator('button').filter({ hasText: /session/ }).first()
    await firstPhaseBtn.click()

    // A session row should appear showing exercise count
    await expect(page.locator('text=/\\d+ exercise/')).toBeVisible({ timeout: 5000 })
  })

  test('client can tap session name to see exercise list', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    await page.waitForTimeout(1500)

    // Only run if this client has a program assigned
    const hasAccordion = await page.locator('button').filter({ hasText: /session/ }).first().isVisible({ timeout: 3000 }).catch(() => false)
    if (!hasAccordion) return

    // Expand the first phase
    const firstPhaseBtn = page.locator('button').filter({ hasText: /session/ }).first()
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

  test('session history rows are tappable', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    // Wait for session list to render
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
})
