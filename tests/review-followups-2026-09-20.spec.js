const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── Follow-ups from the multi-agent review of R1b–R1e (2026-09-20) ────────────────────────────────
//
// The review found no blocking issues, but two independent reviewers found the SAME missed sink, and one
// found a second: the R1b class sweep was keyed on the variable name `cfg.` and so missed a reader that
// aliases the same untyped jsonb as `c`.
//
//   1. `_periodizationLabel` (js/app-programs.js) builds "Linear 65→85%" / "Undulating (85%/70%/55%)" from
//      periodization_config values and the phase header interpolates the result RAW. The taint crosses a
//      function return, which the escaping checker cannot follow — so the label is HTML-safe at its SOURCE.
//   2. `clientOverviewTab(client, programName)` interpolated the coach-typed programme name raw. Pre-existing,
//      and in a function R1d edited.
//
// Both are pure functions, so these are pure render tests: no database rows, nothing to reap.
test.describe('escaping follow-ups from the R1b–R1e review', () => {
  const HOSTILE = '<img src=x onerror=window.__xss=1>'

  // Puts the returned markup into the DOM exactly the way the callers do, and reports what the browser built.
  const build = (page, fnBody) => page.evaluate(({ fnBody, hostile }) => {
    const html = new Function('hostile', `return (${fnBody})(hostile)`)(hostile)
    const host = document.createElement('div')
    host.innerHTML = html
    return { html, imgs: host.querySelectorAll('img').length, text: host.textContent }
  }, { fnBody, hostile: HOSTILE })

  test('_periodizationLabel: a hostile stored value cannot inject an element into the phase header', async ({ page }) => {
    await loginAsPT(page)
    const lin = await build(page, `h => '<span>' + _periodizationLabel({ periodization_type: 'linear', periodization_config: { startPct: h, endPct: 85 } }) + '</span>'`)
    const und = await build(page, `h => '<span>' + _periodizationLabel({ periodization_type: 'undulating', periodization_config: { tiers: { heavy: { pct: h }, moderate: { pct: 70 }, light: { pct: 55 } } } }) + '</span>'`)
    const end = await build(page, `h => '<span>' + _periodizationLabel({ periodization_type: 'linear', periodization_config: { startPct: 65, endPct: h } }) + '</span>'`)

    for (const [name, r] of [['linear start', lin], ['undulating tier', und], ['linear end', end]]) {
      expect.soft(r.imgs, `${name}: no element may be injected`).toBe(0)
      expect.soft(r.html, `${name}: the value is escaped, not dropped`).toContain('&lt;img')
      expect.soft(r.text, `${name}: and it is shown as text`).toContain('<img src=x')
    }
  })

  test('MIRROR: _periodizationLabel still reads as it always did for real values, including a stored 0', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => ({
      linear: _periodizationLabel({ periodization_type: 'linear', periodization_config: { startPct: 65, endPct: 85 } }),
      undulating: _periodizationLabel({ periodization_type: 'undulating', periodization_config: { tiers: { heavy: { pct: 85 }, moderate: { pct: 70 }, light: { pct: 55 } } } }),
      linearNoEnd: _periodizationLabel({ periodization_type: 'linear', periodization_config: { startPct: 65 } }),
      zero: _periodizationLabel({ periodization_type: 'linear', periodization_config: { startPct: 0, endPct: 90 } }),
      none: _periodizationLabel({ periodization_type: null, periodization_config: null }),
      noConfig: _periodizationLabel({ periodization_type: 'undulating', periodization_config: null })
    }))
    expect(r.linear).toBe('Linear 65→85%')
    expect(r.undulating).toBe('Undulating (85%/70%/55%)')
    expect(r.linearNoEnd, 'a half-set config shows just the type').toBe('Linear')
    expect(r.zero, 'a stored 0 is a real value, not blank').toBe('Linear 0→90%')
    expect(r.none, 'no periodization → no label').toBeNull()
    expect(r.noConfig).toBe('Undulating')
  })

  test('clientOverviewTab: a coach-typed programme name cannot inject an element into the client Overview', async ({ page }) => {
    await loginAsPT(page)
    const r = await build(page, `h => clientOverviewTab({ id: 'c', full_name: 'X', status: 'active', email: null, phone: null, date_of_birth: null, height_cm: null, notes: null }, h)`)
    expect.soft(r.imgs, 'no element may be injected through the programme name').toBe(0)
    expect.soft(r.html, 'escaped, not dropped').toContain('&lt;img')
    expect(r.text, 'and shown as text').toContain('<img src=x')
  })

  test('MIRROR: clientOverviewTab still shows a normal programme name, and nothing when there is none', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const c = { id: 'c', full_name: 'X', status: 'active', email: null, phone: null, date_of_birth: null, height_cm: null, notes: null }
      const host = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent }
      return { withName: host(clientOverviewTab(c, `Hypertrophy Block — O'Brien & Co`)), without: host(clientOverviewTab(c, null)) }
    })
    expect(r.withName).toContain('Active program')
    expect(r.withName, 'punctuation renders as typed').toContain(`Hypertrophy Block — O'Brien & Co`)
    expect(r.without).not.toContain('Active program')
  })
})
