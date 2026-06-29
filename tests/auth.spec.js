const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

test.describe('Auth', () => {
  test('PT can log in and see coach dashboard', async ({ page }) => {
    await loginAsPT(page)
    // Coach dashboard shows "Welcome back"
    await expect(page.locator('h1')).toContainText('Welcome back')
    // No client dashboard visible
    await expect(page.locator('text=Hi,')).not.toBeVisible()
  })

  test('Client can log in and see client dashboard', async ({ page }) => {
    await loginAsClient(page)
    // Client dashboard shows "Hi,"
    await expect(page.locator('h1')).toContainText('Hi,')
    // Hero "up next" card is visible
    await expect(page.locator('text=UP NEXT')).toBeVisible()
  })

  test('PT can sign out', async ({ page }) => {
    await loginAsPT(page)
    // Navigate to Settings and click sign out
    await page.click('[data-page="settings"]')
    await page.waitForSelector('text=Sign out', { timeout: 8000 })
    await page.click('button:has-text("Sign out")')
    // Auth screen should reappear
    await expect(page.locator('#auth-screen')).toBeVisible({ timeout: 10000 })
  })
})
