const { test, expect } = require('./fixtures')
const { loginAsPT, clickVisible } = require('./helpers')

test.describe('PT Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
  })

  // REWORKED 2026-10-03 (Jake: the dashboard is a landing page and hub). The "Total clients / Sessions this week / Active goals" strip
  // and the per-client adherence list with its At risk / Active filter are replaced by the Today card (who logged today), the week as
  // bars, a "Trained this week" tile and a "Needs attention" list of the clients with no session in 7 days
  // (tests/dashboard-rework-2026-10-03.spec.js drives the numbers; this file keeps the coach's first-screen smoke checks).
  test('shows the Today card, the week and the two number tiles', async ({ page }) => {
    await expect(page.locator('#dash-hero')).toBeVisible()
    await expect(page.locator('#dash-week')).toBeVisible()
    await expect(page.locator('#dash-trained')).toBeVisible()
    await expect(page.locator('#dash-ending')).toBeVisible()
    await expect(page.locator('#dash-week .dash-bar-col')).toHaveCount(7)
  })

  test('shows the cards a coach checks each morning', async ({ page }) => {
    await expect(page.locator('#dash-weighins')).toBeVisible()
    await expect(page.locator('#dash-coming')).toBeVisible()
    await expect(page.locator('#dash-goals')).toBeVisible()
  })

  test('the buttons that start a coach\'s day are there: add a client, build a workout', async ({ page }) => {
    await expect(page.locator('.dash-icon[aria-label="Add client"]')).toBeVisible()
    await expect(page.locator('.dash-icon[aria-label="Build a workout"]')).toBeVisible()
  })

  test('can open a client from the dashboard', async ({ page }) => {
    // A client row in the Today card or the "Needs attention" list. Skips when the account has neither (an empty roster).
    const firstClient = page.locator('#dash-root [onclick*="openClient"]').first()
    test.skip(!(await firstClient.isVisible({ timeout: 3000 }).catch(() => false)), 'no client row on this account\'s dashboard')
    await firstClient.click()
    // Client profile header should appear
    await expect(page.locator('.page-header, [class*="client"]')).toBeVisible({ timeout: 8000 })
  })

  test('dashboard cards have a real background (not the undefined-class bug)', async ({ page }) => {
    const bg = await page.locator('#dash-root .dash-card').first().evaluate(el => getComputedStyle(el).backgroundColor)
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
  })

  test('clients list shows last session recency', async ({ page }) => {
    await clickVisible(page, '[data-page="clients"]')
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
