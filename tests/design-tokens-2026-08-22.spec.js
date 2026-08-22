const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Asserts every token RESOLVES in a real browser. The round-trip proof in
// scripts/tokenise-verify.mjs proves no VALUE changed; it cannot prove a token is
// DEFINED. A typo'd var(--text-bse, 13px) round-trips perfectly and silently uses
// its fallback forever, so this is the layer that catches that.
const EXPECTED = {
  '--text-2xs': '9px', '--text-xs': '10px', '--text-sm': '11px', '--text-md': '12px',
  '--text-base': '13px', '--text-lg': '14px', '--text-xl': '16px', '--text-2xl': '18px',
  '--text-3xl': '20px', '--text-4xl': '24px', '--text-display': '32px',
  '--legacy-text-7': '7px', '--legacy-text-8': '8px', '--legacy-text-10-5': '10.5px',
  '--legacy-text-11-5': '11.5px', '--legacy-text-12-5': '12.5px', '--legacy-text-13-5': '13.5px',
  '--legacy-text-15': '15px', '--legacy-text-17': '17px', '--legacy-text-19': '19px',
  '--legacy-text-22': '22px', '--legacy-text-26': '26px', '--legacy-text-30': '30px',
  '--legacy-text-40': '40px', '--legacy-text-64': '64px',
  '--radius-xs': '4px', '--radius-sm': '8px', '--radius-md': '12px',
  '--radius-xl': '20px', '--radius-full': '999px',
  '--legacy-radius-2': '2px', '--legacy-radius-3': '3px', '--legacy-radius-5': '5px',
  '--legacy-radius-7': '7px', '--legacy-radius-9': '9px', '--legacy-radius-16': '16px',
  '--legacy-radius-18': '18px', '--legacy-radius-24': '24px'
}

test.describe('design tokens resolve', () => {
  test('every type and radius token resolves to its intended value', async ({ page }) => {
    await loginAsPT(page)
    const actual = await page.evaluate((names) => {
      const cs = getComputedStyle(document.documentElement)
      const out = {}
      for (const n of names) out[n] = cs.getPropertyValue(n).trim()
      return out
    }, Object.keys(EXPECTED))
    for (const [name, want] of Object.entries(EXPECTED)) {
      expect(actual[name], `${name} must resolve to ${want} -- an undefined token silently falls back forever`).toBe(want)
    }
  })

  test('the two PRE-EXISTING radius tokens are unchanged', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement)
      return { radius: cs.getPropertyValue('--radius').trim(), lg: cs.getPropertyValue('--radius-lg').trim() }
    })
    expect(r.radius, '--radius has 7 var() consumers; changing it moves pixels').toBe('10px')
    expect(r.lg, '--radius-lg has 2 var() consumers; changing it moves pixels').toBe('14px')
  })

  test('--font is defined, so the typeface has a single swap point', async ({ page }) => {
    await loginAsPT(page)
    const f = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font').trim())
    expect(f).toContain('Inter')
  })
})
