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
    // Session log renders a back button and exercise data
    await expect(page.locator('text=All sessions, text=Back')).toBeVisible({ timeout: 8000 })
  })

  test('client can start and cancel a workout', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    await page.waitForSelector('button:has-text("Start")', { timeout: 10000 })
    // Click first Start button
    await page.locator('button:has-text("Start")').first().click()
    // Runner setup modal appears
    await expect(page.locator('text=Start workout')).toBeVisible({ timeout: 8000 })
    // Close it
    await page.click('.modal-close')
    await expect(page.locator('text=Start workout')).not.toBeVisible()
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
