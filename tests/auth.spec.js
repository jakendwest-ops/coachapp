const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient, clickVisible, waitForVisible } = require('./helpers')

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
    // Navigate to Settings and click sign out. Two sign-out buttons exist — the sidebar's
    // #sign-out-btn (hidden below 900px) and the Settings page's own #settings-sign-out-btn
    // (always present once Settings is open, viewport-independent) — clickVisible picks
    // whichever is actually reachable at the current viewport.
    await clickVisible(page, '[data-page="settings"]')
    await waitForVisible(page, ['#sign-out-btn', '#settings-sign-out-btn'], { timeout: 8000 })
    await clickVisible(page, ['#sign-out-btn', '#settings-sign-out-btn'])
    // Auth screen should reappear
    await expect(page.locator('#auth-screen')).toBeVisible({ timeout: 10000 })
  })
})
