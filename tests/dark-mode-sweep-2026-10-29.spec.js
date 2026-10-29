const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient, soloReady, logTableSet } = require('./helpers')

// ─── Dark mode is the default (2026-10-29) ──────────────────────────────────────────────────────────────
//
// Jake, 2026-10-28: "i also prefer the dark mode, could we make that the default across the app"
// (docs/bugs/2026-10-28-dark-mode-should-be-the-default-across-the-app.md). Until then css/main.css had one light palette and
// nothing else. Now the colour tokens are dark by default, :root[data-theme="light"] restores the old palette, a script in the
// <head> of index.html (and the privacy page, and 404.html) applies the saved choice before first paint, and Settings > Appearance
// offers Dark / Light / Match my phone (kept on this device in localStorage 'coachapp-theme').
//
// What this file pins:
//   1. The defaults and the saved choice (login page, privacy page, reload, Match my phone following the phone live).
//   2. Light is EXACTLY the palette the app had before (a table of the old values), so choosing Light changes nothing.
//   3. THE SWEEP: every screen a coach, a client and a Personal account can reach, plus a dialog and the runner, is scanned in dark for
//      (a) a pale surface left over and (b) text below 3:1 contrast against what is behind it. The scan reads the rendered page, so
//      it also catches a colour written into a template string in js/. Contrast between 3:1 and 4.5:1 is NOT asserted (the metric and
//      category colours are deliberate mid-tones that read on both themes; red text sits at about 4.5:1).
// The scan is read-only. The runner test uses the ownWorkout fixture, which cleans up after itself.

// The page's own scan. Runs in the browser. A "pale surface" is a low-saturation background that is light (luminance over 0.5) and
// not tiny; saturated fills (gold PR badge, coloured chips) are excluded on purpose. Text contrast is measured against the first
// opaque background up the tree, which is how a reader sees it on these flat surfaces.
const SCAN = () => {
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
  const bgOf = el => { let e = el; while (e && e.nodeType === 1) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; e = e.parentElement } return parse(getComputedStyle(document.body).backgroundColor) }
  const sigOf = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')
  const light = new Set(), lowc = new Set()
  let scanned = 0
  document.querySelectorAll('body *').forEach(el => {
    if (el.closest('option')) return
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) return
    scanned++
    const bg = parse(cs.backgroundColor)
    if (bg && bg.a > 0.5 && r.width * r.height > 600 && lum([bg.r, bg.g, bg.b]) > 0.5 && Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b) < 70) {
      light.add(sigOf(el) + ' bg=' + cs.backgroundColor)
    }
    if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) {
      const fg = parse(cs.color), back = bgOf(el)
      if (fg && back) {
        const a = lum([fg.r, fg.g, fg.b]), b = lum([back.r, back.g, back.b])
        const cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
        if (cr < 3) lowc.add(sigOf(el) + ' ' + cs.color + ' on rgb(' + back.r + ',' + back.g + ',' + back.b + ') = ' + cr.toFixed(1) + ' "' + el.textContent.trim().slice(0, 24) + '"')
      }
    }
  })
  return { scanned, light: [...light].slice(0, 10), lowc: [...lowc].slice(0, 10) }
}

// Wait until nothing says Loading and the element count has stopped moving (two polls in a row the same).
async function settled(page) {
  await expect.poll(() => page.evaluate(() => !/Loading…|Loading\.\.\./.test(document.body.innerText)), { timeout: 20000 }).toBe(true)
  let last = -1
  await expect.poll(async () => {
    const n = await page.evaluate(() => document.querySelectorAll('body *').length)
    const same = n === last; last = n; return same
  }, { intervals: [250], timeout: 10000 }).toBe(true)
}

async function expectClean(page, label, minSeen = 20) {
  const res = await page.evaluate(SCAN)
  expect(res.scanned, label + ': the scan saw nothing, so it proved nothing').toBeGreaterThan(minSeen)
  expect(res.light, label + ': a pale surface is left in the dark theme').toEqual([])
  expect(res.lowc, label + ': text is below 3:1 contrast').toEqual([])
}

// Every page the signed-in role can navigate to: the nav items in the page, plus the ones the mobile "More" sheet adds.
async function sweepPages(page, roleLabel) {
  const pages = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-page]')].map(e => e.getAttribute('data-page')).concat(['settings', 'calendar']))].filter(p => p && p !== '__more__'))
  expect(pages.length, roleLabel + ': found no pages to sweep').toBeGreaterThan(3)
  for (const p of pages) {
    await page.evaluate(p => navigate(p), p)
    await settled(page)
    await expectClean(page, roleLabel + ' > ' + p)
  }
}

test.describe('dark mode: the default, the choice, light unchanged', () => {
  test('a signed-out visitor sees the dark login page', async ({ browser }) => {
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()
      await page.goto('/')
      await expect(page.locator('#auth-screen')).toBeVisible({ timeout: 15000 })
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 19, 26)')
      await expectClean(page, 'login page', 8)
    } finally { await ctx.close() }
  })

  test('the privacy page is dark by default and light when Light is chosen', async ({ browser }) => {
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()
      await page.goto('/privacy-policy.html')
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 19, 26)')
      await expectClean(page, 'privacy page')
      await page.evaluate(() => localStorage.setItem('coachapp-theme', 'light'))
      await page.reload()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 249, 252)')
    } finally { await ctx.close() }
  })

  test('a saved choice is applied by the head script, and Match my phone follows the phone', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark' })
    try {
      const page = await ctx.newPage()
      await page.addInitScript(() => { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); localStorage.setItem('coachapp-theme', 'light') } })
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f4f5f7')
      // "system": dark phone gives dark, light phone gives light, and a flip while the page is open is followed live
      await page.evaluate(() => setThemeChoice('system'))
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await page.emulateMedia({ colorScheme: 'light' })
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      await page.emulateMedia({ colorScheme: 'dark' })
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      // an unknown stored value reads as dark
      await page.evaluate(() => localStorage.setItem('coachapp-theme', 'purple'))
      expect(await page.evaluate(() => getThemeChoice())).toBe('dark')
    } finally { await ctx.close() }
  })

  test('Light is exactly the palette the app had before dark mode', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark' })
    try {
      const page = await ctx.newPage()
      await page.addInitScript(() => localStorage.setItem('coachapp-theme', 'light'))
      await page.goto('/')
      const OLD = {
        '--bg': '#f4f5f7', '--surface': '#ffffff', '--sidebar-bg': '#111827', '--sidebar-text': '#9ca3af', '--sidebar-hover': '#1f2937', '--sidebar-active': '#6366f1',
        '--accent': '#6366f1', '--accent-hover': '#4f46e5', '--accent-light': '#eef2ff', '--text': '#111827', '--text-muted': '#6b7280', '--border': '#e5e7eb',
        '--surface-2': '#eceff3', '--danger': '#ef4444', '--danger-light': '#fef2f2', '--success': '#10b981', '--success-light': '#d1fae5', '--warning': '#f59e0b',
        '--warning-light': '#fef3c7', '--shadow-sm': '0 1px 2px rgba(0,0,0,0.06)', '--shadow': '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        '--shadow-md': '0 4px 12px rgba(0,0,0,0.08)', '--shadow-lg': '0 20px 60px rgba(0,0,0,0.12)'
      }
      const got = await page.evaluate(names => Object.fromEntries(names.map(n => [n, getComputedStyle(document.documentElement).getPropertyValue(n).trim()])), Object.keys(OLD))
      expect(got).toEqual(OLD)
    } finally { await ctx.close() }
  })

  test('Settings > Appearance applies the choice at once and keeps it', async ({ page }) => {
    await loginAsPT(page)
    await page.evaluate(() => navigate('settings'))
    const sel = page.locator('#settings-theme')
    await expect(sel).toBeVisible({ timeout: 15000 })
    await expect(sel).toHaveValue('dark')
    await sel.selectOption('light')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(() => localStorage.getItem('coachapp-theme'))).toBe('light')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await settled(page)
    await page.evaluate(() => navigate('settings'))
    await expect(page.locator('#settings-theme')).toHaveValue('light')
    await page.locator('#settings-theme').selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    // leave the shared browser profile on the default
    await page.evaluate(() => localStorage.removeItem('coachapp-theme'))
  })
})

test.describe('dark mode sweep: nothing is left light, nothing is unreadable', () => {
  test('a coach: every page, and a confirm dialog', async ({ page }) => {
    test.slow()
    await loginAsPT(page)
    await sweepPages(page, 'coach')
    await page.evaluate(() => { window.__p = confirmDialog('Delete this?', { title: 'Please confirm', confirmLabel: 'Delete', danger: true }) })
    await expect(page.locator('.modal-overlay button:has-text("Cancel")')).toBeVisible()
    await expectClean(page, 'coach confirm dialog')
  })

  test('a client: every page', async ({ page }) => {
    test.slow()
    await loginAsClient(page)
    await sweepPages(page, 'client')
  })

  test('a Personal (solo) account: every page', async ({ page }) => {
    test.slow()
    await soloReady(page)
    await sweepPages(page, 'solo')
  })

  test('the runner, and its rest timer after a set is logged', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    const wk = await ownWorkout()
    await wk.start()
    await settled(page)
    await expectClean(page, 'runner')
    await logTableSet(page, { weight: '60', reps: '10' })
    await settled(page)
    await expectClean(page, 'runner after a set')
  })
})
