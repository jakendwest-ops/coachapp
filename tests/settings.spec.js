const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    await page.click('[data-page="settings"]')
    await page.waitForSelector('text=Settings', { timeout: 8000 })
  })

  test('settings page renders all sections', async ({ page }) => {
    await expect(page.locator('text=Profile')).toBeVisible()
    await expect(page.locator('h2:has-text("Branding")')).toBeVisible()
    await expect(page.locator('text=Change password')).toBeVisible()
    await expect(page.locator('text=Data & privacy')).toBeVisible()
  })

  test('delete account button opens modal with DELETE input', async ({ page }) => {
    await page.click('button:has-text("Delete account")')
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 4000 })
    await expect(page.locator('text=This will permanently delete')).toBeVisible()
    await expect(page.locator('#delete-confirm-input')).toBeVisible()
    await expect(page.locator('#delete-confirm-btn')).toBeVisible()
  })

  test('delete account modal cancel closes modal', async ({ page }) => {
    await page.click('button:has-text("Delete account")')
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 4000 })
    await page.click('button:has-text("Cancel")')
    await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 4000 })
  })

  test('delete account modal shows error without correct input', async ({ page }) => {
    await page.click('button:has-text("Delete account")')
    await expect(page.locator('#delete-confirm-input')).toBeVisible({ timeout: 4000 })
    await page.waitForTimeout(200)
    await page.click('#delete-confirm-btn')
    // Error element becomes visible after clicking without correct input
    await expect(page.locator('#delete-confirm-error')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.modal-overlay')).toBeVisible()
  })

  test('download my data button exists and is clickable', async ({ page }) => {
    const btn = page.locator('button:has-text("Download my data")')
    await expect(btn).toBeVisible()
    // Smoke test: button is present and clickable without JS errors
    await btn.click()
    await page.waitForTimeout(1000)
    await expect(btn).toBeVisible()
  })
})
