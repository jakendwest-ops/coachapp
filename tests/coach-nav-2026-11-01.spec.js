// The coach's phone navigation (MVP item 8, approved by Jake 2026-11-01). The bar was the six-item sidebar list; now it is Dashboard ·
// Clients · Training plans · Calendar · More, and Workouts and Settings live in the More sheet (the Personal view's pattern, 2026-10-31).
// The desktop sidebar keeps all six; the client's bar is unchanged. The suite runs at phone width (390x844, playwright.config.js). The pure
// pieces are pinned by tests-node/coach-nav.test.mjs. Read-only: nothing is written.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

const bar = (page) => page.evaluate(() => [...document.querySelectorAll('.bottom-nav-item')].map(a => ({ page: a.dataset.page, label: a.textContent.trim(), lit: a.classList.contains('active') })))

test.describe('the coach\'s phone bar', () => {
  test('five items: Dashboard, Clients, Training plans, Calendar, More - and every one is a 44px target', async ({ page }) => {
    await loginAsPT(page)
    await page.waitForSelector('.bottom-nav-item:visible')
    const b = await bar(page)
    expect(b.map(i => i.page)).toEqual(['dashboard', 'clients', 'programs', 'calendar', '__more__'])
    expect(b.map(i => i.label)).toEqual(['Dashboard', 'Clients', 'Training plans', 'Calendar', 'More'])
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.bottom-nav-item')].map(a => { const r = a.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }))
    for (const [w, h] of sizes) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44) }
    const over = await page.evaluate(() => document.querySelector('.bottom-nav').scrollWidth > document.querySelector('.bottom-nav').clientWidth)
    expect(over, 'the bar fits the phone width').toBe(false)
  })

  test('More opens with Workouts and Settings; Workouts goes there and More stays lit; the same for Settings', async ({ page }) => {
    await loginAsPT(page)
    await page.click('.bottom-nav-item[data-page="__more__"]:visible')
    await page.waitForSelector('#more-sheet-modal', { state: 'visible' })
    const rows = await page.evaluate(() => [...document.querySelectorAll('#more-sheet-modal .more-row')].map(r => r.textContent.trim()))
    expect(rows.slice(0, 2)).toEqual(['Workouts', 'Settings'])
    expect(rows).not.toContain('Exercise library')
    for (const t of ['Download my data', 'Send feedback', 'Privacy policy', 'Sign out']) expect(rows).toContain(t)
    const master = await page.evaluate(() => !!window._masterAccount)
    expect(rows.includes('Switch to Personal view'), 'the switch row only on an account that has a Personal view').toBe(master)

    await page.click('#more-sheet-modal button:has-text("Workouts")')
    await expect(page.locator('#more-sheet-modal')).toHaveCount(0)
    await page.waitForFunction(() => currentPage === 'workouts')
    expect((await bar(page)).filter(i => i.lit).map(i => i.page)).toEqual(['__more__'])

    await page.click('.bottom-nav-item[data-page="__more__"]:visible')
    await page.click('#more-sheet-modal button:has-text("Settings")')
    await page.waitForFunction(() => currentPage === 'settings')
    expect((await bar(page)).filter(i => i.lit).map(i => i.page)).toEqual(['__more__'])

    await page.click('.bottom-nav-item[data-page="clients"]:visible')
    await page.waitForFunction(() => currentPage === 'clients')
    expect((await bar(page)).filter(i => i.lit).map(i => i.page), 'a bar page lights itself').toEqual(['clients'])
  })

  test('on a desktop the sidebar still lists all six, and Workouts lights itself there', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAsPT(page)
    await page.waitForSelector('.sidebar .nav-item:visible')
    const side = await page.evaluate(() => [...document.querySelectorAll('.sidebar .nav-item')].map(a => a.dataset.page))
    expect(side).toEqual(['dashboard', 'clients', 'workouts', 'calendar', 'programs', 'settings'])
    await page.click('.sidebar .nav-item[data-page="workouts"]')
    await page.waitForFunction(() => currentPage === 'workouts')
    const lit = await page.evaluate(() => [...document.querySelectorAll('.sidebar .nav-item.active')].map(a => a.dataset.page))
    expect(lit).toEqual(['workouts'])
  })
})

test('the client\'s bar is unchanged: five pages, no More', async ({ page }) => {
  await loginAsClient(page)
  await page.waitForSelector('.bottom-nav-item:visible')
  expect((await bar(page)).map(i => i.page)).toEqual(['client-dashboard', 'workouts', 'calendar', 'progress', 'settings'])
})
