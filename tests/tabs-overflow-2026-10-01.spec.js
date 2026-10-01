// The tab strip must scroll ITSELF on a phone, not slide the whole page (found by the RPE end-to-end journey's
// phone-size screenshots, 2026-10-01).
//
// `.tabs` was a plain flex row: 609px of tabs in a 358px column, with no overflow rule of its own. Its overflow
// escaped to `main#main-content` — which has overflow-y:auto, and CSS then makes overflow-x auto too — so reaching
// the far-right tabs (Weight / Performance / Programs / 1RMs) slid the WHOLE page area sideways: the client's name
// and buttons left the screen. The document itself stayed exactly the viewport width, which is why nothing
// measuring document.scrollWidth ever noticed.
//
// Runs at the project's 390x844 viewport (playwright.config.js).
const { test, expect } = require('./fixtures')
const { loginAsPT, clickVisible } = require('./helpers')

let clientId = null

test.beforeEach(async ({ page }) => {
  await loginAsPT(page)
  clientId = await page.evaluate(async () => {
    const { data, error } = await db.from('clients')
      .insert({ coach_id: currentUser.id, full_name: '[E2E] Tabs ' + Date.now() }).select('id').single()
    if (error) throw new Error('fixture client: ' + error.message)
    return data.id
  })
})

test.afterEach(async ({ page }) => {
  if (!clientId) return
  const id = clientId; clientId = null
  await page.evaluate(async id => { await db.from('clients').delete().eq('id', id).select('id') }, id).catch(err => console.warn('[tabs-overflow] CLEANUP FAILED — rows may be left in the test account:', err.message))
})

// How far is the page area scrolled / able to scroll sideways, and is the strip its own scroller?
const probe = page => page.evaluate(() => {
  const main = document.getElementById('main-content')
  const strip = document.querySelector('.tabs')
  const cs = strip && getComputedStyle(strip)
  return {
    mainOverflows: main.scrollWidth - main.clientWidth,        // > 0: the PAGE AREA can be dragged sideways
    mainScrollLeft: Math.round(main.scrollLeft),
    stripOverflowX: cs?.overflowX,
    stripScrolls: strip ? strip.scrollWidth - strip.clientWidth : null,   // > 0 is FINE: tabs beyond the edge
  }
})

test.describe('tab strips scroll themselves (390px)', () => {
  test("client profile: the page area never scrolls sideways, even after reaching the last tab", async ({ page }) => {
    await page.evaluate(id => openClient(id), clientId)
    await page.waitForSelector('.tabs .tab-btn')
    const before = await probe(page)
    expect(before.stripScrolls, 'precondition: the tabs really are wider than the screen').toBeGreaterThan(0)
    expect(before.mainOverflows, 'the tab strip must not widen the page area').toBeLessThanOrEqual(1)

    // Reach the far-right tab the way a person does: it starts off-screen, so scroll the STRIP, then tap.
    await page.locator('button.tab-btn:has-text("1RMs")').click()
    await expect(page.locator('button.tab-btn:has-text("1RMs")')).toHaveClass(/active/)
    const after = await probe(page)
    expect(after.mainScrollLeft, 'tapping a far tab slid the whole page sideways').toBe(0)
    expect(after.mainOverflows).toBeLessThanOrEqual(1)
    expect(after.stripOverflowX, 'the strip is what scrolls').toMatch(/auto|scroll/)
  })

  test('the header stays on screen after selecting the last tab', async ({ page }) => {
    await page.evaluate(id => openClient(id), clientId)
    await page.waitForSelector('.tabs .tab-btn')
    await page.locator('button.tab-btn:has-text("1RMs")').click()
    const box = await page.locator('main#main-content h1, main#main-content .page-title, .client-header h1').first().boundingBox()
    expect(box, 'the client name heading must still be on screen').toBeTruthy()
    expect(box.x, 'and not slid off the left edge').toBeGreaterThanOrEqual(0)
  })

  test('the Workouts page tab strip behaves the same way', async ({ page }) => {
    await clickVisible(page, '[data-page="workouts"]')
    await page.waitForSelector('.tabs .tab-btn')
    const p = await probe(page)
    expect(p.mainOverflows).toBeLessThanOrEqual(1)
    expect(p.mainScrollLeft).toBe(0)
  })

  // The CSS trick used to keep the active underline visible inside a scroller must not change what is drawn.
  test('the active tab still shows its underline (not clipped by the scroller)', async ({ page }) => {
    await page.evaluate(id => openClient(id), clientId)
    await page.waitForSelector('.tabs .tab-btn.active')
    const m = await page.evaluate(() => {
      const strip = document.querySelector('.tabs').getBoundingClientRect()
      const b = document.querySelector('.tab-btn.active'); const r = b.getBoundingClientRect()
      const cs = getComputedStyle(b)
      return { underlineWidth: parseFloat(cs.borderBottomWidth), btnBottom: Math.round(r.bottom), stripBottom: Math.round(strip.bottom) }
    })
    expect(m.underlineWidth).toBeGreaterThanOrEqual(2)
    expect(m.btnBottom, 'the underline must sit inside the strip, not past its edge where overflow would clip it')
      .toBeLessThanOrEqual(m.stripBottom)
  })
})
