const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Solo/Personal account tests require Jake's master account (_soloClientId must be set).
// The E2E PT test account (coachapp.e2e.pt@gmail.com) has no solo client record,
// so these tests skip when run against the test account and pass when run as Jake.

test.describe('Solo / Personal account', () => {
  let soloAvailable = false

  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    // loadUserInfo is async — give it time to set _soloClientId
    await page.waitForTimeout(3000)
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
    await expect(page.locator('[data-page="dashboard"]')).toBeVisible()
    await expect(page.locator('[data-page="workouts"]')).toBeVisible()
    await expect(page.locator('[data-page="programs"]')).toBeVisible()
    await expect(page.locator('[data-page="calendar"]')).toBeVisible()
    await expect(page.locator('[data-page="progress"]')).toBeVisible()
  })

  test('solo Workouts page shows program accordion, not template builder', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.click('[data-page="workouts"]')
    await page.waitForTimeout(1500)
    await expect(page.locator('h1')).toContainText('Workouts', { timeout: 8000 })
    // Template builder "New template" button must NOT be visible in solo view
    await expect(page.locator('button:has-text("New template")')).not.toBeVisible()
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
    await expect(page.locator('button:has-text("Strength")')).toBeVisible()
    await expect(page.locator('button:has-text("Cardio")')).toBeVisible()
    await expect(page.locator('button:has-text("Personal Bests")')).toBeVisible()
    await expect(page.locator('button:has-text("1RMs")')).toBeVisible()
  })

  test('switching back to PT restores coach dashboard', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.evaluate(() => switchView('coach'))
    await page.waitForTimeout(800)
    await expect(page.locator('h1')).toContainText('Welcome back', { timeout: 8000 })
    await expect(page.locator('[data-page="clients"]')).toBeVisible()
  })
})
