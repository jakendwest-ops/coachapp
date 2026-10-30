const { test, expect } = require('@playwright/test')

// The app can be added to a phone's home screen and opens as an app (2026-10-30, Solo product review MVP "installable app",
// step 1). Ledger: docs/bugs/2026-10-30-app-cannot-be-installed-to-the-home-screen.md. No sign-in needed: everything checked
// here is what a phone reads from the page and the files it links, before any login.

test.describe('Installable app: manifest, icons, iPhone tags', () => {
  test('the page links a manifest that a phone can install from', async ({ page }) => {
    await page.goto('/')
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(href, 'index.html links a manifest').toBeTruthy()

    const r = await page.request.get(new URL(href, page.url()).href)
    expect(r.status(), 'the manifest is served').toBe(200)
    expect(r.headers()['content-type'] || '', 'served as a web app manifest').toMatch(/application\/manifest\+json/)
    const m = await r.json()

    expect(m.name).toBe('CoachApp')
    expect(m.short_name).toBe('CoachApp')
    expect(m.display, 'opens full screen, without the browser bars').toBe('standalone')
    // Relative, so the same files work at https://<user>.github.io/coachapp/ and at a local server's root.
    expect(m.start_url).toBe('./')
    expect(m.scope).toBe('./')
    expect(m.background_color).toBe('#11131a')
    expect(m.theme_color).toBe('#11131a')

    // The start address must land inside the app's own folder (an installed app outside its scope opens in the browser).
    const manifestUrl = new URL(href, page.url())
    const start = new URL(m.start_url, manifestUrl)
    const scope = new URL(m.scope, manifestUrl)
    expect(start.href.startsWith(scope.href), 'start_url is inside scope').toBe(true)

    const sizes = m.icons.map(i => i.sizes)
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect(m.icons.some(i => i.purpose === 'maskable'), 'an Android maskable icon is listed').toBe(true)
  })

  test('every icon the manifest lists loads as a PNG of the stated size', async ({ page }) => {
    await page.goto('/')
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    const manifestUrl = new URL(href, page.url())
    const m = await (await page.request.get(manifestUrl.href)).json()
    expect(m.icons.length).toBeGreaterThanOrEqual(3)
    for (const icon of m.icons) {
      const url = new URL(icon.src, manifestUrl).href
      expect(icon.type, `${icon.src} declares PNG`).toBe('image/png')
      const size = await page.evaluate(async (u) => {
        const img = new Image(); img.src = u
        try { await img.decode() } catch { return null }
        return `${img.naturalWidth}x${img.naturalHeight}`
      }, url)
      expect(size, `${icon.src} decodes at its stated size`).toBe(icon.sizes)
    }
  })

  test('an iPhone gets its home-screen icon, name and full-screen tags', async ({ page }) => {
    await page.goto('/')
    const touch = page.locator('link[rel="apple-touch-icon"]')
    await expect(touch).toHaveCount(1)
    const url = new URL(await touch.getAttribute('href'), page.url()).href
    const size = await page.evaluate(async (u) => {
      const img = new Image(); img.src = u
      try { await img.decode() } catch { return null }
      return `${img.naturalWidth}x${img.naturalHeight}`
    }, url)
    expect(size, 'the iPhone icon is a 180 px PNG').toBe('180x180')
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
    await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'CoachApp')
    // A dark bar, not "black-translucent": translucent draws the page under the status bar, which the app does not pad for.
    await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'black')
  })

  test('the app registers no service worker (step 1 is install only; caching would risk old code after a release)', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#auth-screen, #app-shell', { state: 'attached' })
    const regs = await page.evaluate(async () => (navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0))
    expect(regs).toBe(0)
  })
})
