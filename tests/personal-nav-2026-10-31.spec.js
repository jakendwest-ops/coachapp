// Personal view's four destinations: Today, Train, Progress, More (2026-10-31, approved by Jake).
// Plan: docs/superpowers/plans/2026-10-31-personal-view-four-tabs.md. Every test here was run against the old code first and failed.
const { test, expect } = require('./fixtures')
const { loginAsPT, soloReady } = require('./helpers')

const activeTab = (page) => page.locator('.bottom-nav-item.active').getAttribute('data-page')

test.describe('Personal view: Train', () => {
  test('Train opens on Workouts with a Workouts | Plans switch; Plans keeps Train lit', async ({ page }) => {
    await soloReady(page)
    await page.evaluate(() => navigate('workouts'))
    const sw = page.locator('#train-switch')
    await expect(sw).toBeVisible()
    await expect(sw.locator('button')).toHaveText(['Workouts', 'Plans'])
    await expect(sw.locator('button[aria-pressed="true"]')).toHaveText('Workouts')
    expect(await activeTab(page)).toBe('workouts')
    await sw.locator('button', { hasText: 'Plans' }).click()
    await expect.poll(() => page.evaluate(() => currentPage)).toBe('programs')
    await expect(page.locator('#train-switch button[aria-pressed="true"]')).toHaveText('Plans')
    expect(await activeTab(page), 'Plans lives under Train').toBe('workouts')
  })

  test('the Library is the Exercise library under More, with no templates tab and a way back to More', async ({ page }) => {
    await soloReady(page)
    await page.evaluate(() => navigate('library'))
    await expect(page.locator('h1.page-title')).toHaveText('Exercise library')
    await expect(page.locator('#wt-tab-templates')).toHaveCount(0)
    await expect(page.locator('button', { hasText: '+ New template' })).toHaveCount(0)
    expect(await activeTab(page)).toBe('__more__')
    await page.locator('[data-more-back]').click()
    await expect(page.locator('#more-sheet-modal')).toBeVisible()
  })

  test('COACH: Workouts, Training plans and the Library are unchanged (no Train switch, templates tab kept)', async ({ page }) => {
    await loginAsPT(page)
    await page.evaluate(() => { if (currentProfile?.role === 'solo') switchView('coach') })
    await expect.poll(() => page.evaluate(() => currentProfile?.role)).toBe('coach')
    for (const pg of ['workouts', 'programs', 'library']) {
      await page.evaluate((p) => navigate(p), pg)
      await expect.poll(() => page.evaluate(() => currentPage)).toBe(pg)
      await page.waitForTimeout(800)
      await expect(page.locator('#train-switch'), `${pg}: no Train switch for a coach`).toHaveCount(0)
    }
    await expect(page.locator('#wt-tab-templates')).toHaveCount(1)
  })
})
