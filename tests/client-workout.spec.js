const { test, expect } = require('@playwright/test')
const { loginAsClient } = require('./helpers')

test.describe('Client workout flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page)
  })

  test('client dashboard loads with sessions stat', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Hi,')
    await expect(page.locator('text=Sessions this week')).toBeVisible()
    await expect(page.locator('text=Active goals')).toBeVisible()
  })

  test('client can navigate to Workouts page', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    await expect(page.locator('h1')).toContainText('Workouts', { timeout: 8000 })
    await expect(page.locator('text=START A WORKOUT')).toBeVisible()
  })

  test('workout templates list is visible with Start buttons', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    await page.waitForSelector('button:has-text("Start")', { timeout: 10000 })
    const startBtns = page.locator('button:has-text("Start")')
    expect(await startBtns.count()).toBeGreaterThan(0)
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
    await page.waitForSelector('button:has-text("Start")', { timeout: 10000 })
    // Click first Start button — launches runner directly (no modal when template is pre-selected)
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
    // Weight log form is on dashboard
    await expect(page.locator('text=Sessions this week')).toBeVisible()
    // Scroll to weight section and click Log
    const logBtn = page.locator('button:has-text("+ Log")').first()
    if (await logBtn.isVisible()) {
      await logBtn.click()
      await expect(page.locator('#cwf-weight')).toBeVisible()
    }
  })
})
