const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('PT Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
  })

  test('shows stats row with client count and sessions', async ({ page }) => {
    await expect(page.locator('.stat-card').first()).toBeVisible()
    await expect(page.locator('text=Total clients')).toBeVisible()
    await expect(page.locator('text=Sessions this week')).toBeVisible()
  })

  test('shows compliance filter tabs', async ({ page }) => {
    await expect(page.locator('#cf-All')).toBeVisible()
    await expect(page.locator('#cf-At-risk')).toBeVisible()
    await expect(page.locator('#cf-Active')).toBeVisible()
  })

  test('compliance filter hides rows correctly', async ({ page }) => {
    // Click "At risk" filter
    await page.click('#cf-At-risk')
    // At-risk rows visible, active rows hidden
    const activeRows = page.locator('.compliance-row[data-zone="active"]')
    for (const row of await activeRows.all()) {
      await expect(row).toBeHidden()
    }
  })

  test('can navigate to client from activity feed', async ({ page }) => {
    // Click first client name in activity feed
    const firstClient = page.locator('[onclick*="openClient"]').first()
    await firstClient.click()
    // Client profile header should appear
    await expect(page.locator('.page-header, [class*="client"]')).toBeVisible({ timeout: 8000 })
  })

  test('clients list shows last session recency', async ({ page }) => {
    await page.click('[data-page="clients"]')
    await page.waitForSelector('#client-list', { timeout: 8000 })
    // Each row should have a recency label (Today / Xd ago / No sessions)
    const rows = page.locator('#client-list .list-row')
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
    // At least one recency label exists
    const recencyLabels = page.locator('#client-list .row-right span:last-child')
    await expect(recencyLabels.first()).toBeVisible()
  })
})
