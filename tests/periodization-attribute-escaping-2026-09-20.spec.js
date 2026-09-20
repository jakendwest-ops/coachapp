const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── Periodization modal: stored config values must not break out of their attributes (R1b) ────────
//
// Ledger: bugs/2026-09-06-periodization-reps-is-an-unescaped-stored-attribute-and-the-checker-is-blind.
//
// renderPeriodizationBody interpolated values from the phase's periodization_config — an UNTYPED jsonb
// column — straight into value="" attributes with no escaper. A value like  foo" onmouseover="…  broke
// out of the attribute and landed a live event handler on the input, every time that programme's
// Periodization modal was reopened. Direction is coach -> same coach (self-XSS), which is why the row is
// high and not critical; it is still stored, and it was the eighth instance of the class.
//
// This is a pure RENDER test: showPeriodizationModal reads the phase from window._openProgramPhases, so
// the fixtures are stubbed and NO database rows are created — nothing to strand, nothing to reap. The
// exploit lives entirely in the render function, so a stub reaches it exactly.
//
// Three properties, each asserted on the real DOM the browser built:
//   1. no attribute that was not written by the template (a breakout adds one), and no element injected;
//   2. a hostile string round-trips as LITERAL TEXT through .value — the guard against the other failure
//      (escapeAttr in a plain attribute backslash-corrupts the value and the corruption is then SAVED);
//   3. benign values and defaults render unchanged, so the escaping cannot refuse the legitimate user.
test.describe('periodization modal renders stored config values as data, not markup', () => {
  // Opens the REAL modal for a stubbed phase and returns what the browser built.
  const openWith = (page, type, config) => page.evaluate(({ type, config }) => {
    delete window.__xss
    window._openProgramPhases = [{ id: crypto.randomUUID(), name: 'Phase', duration_weeks: 6, periodization_type: type, periodization_config: config }]
    showPeriodizationModal(window._openProgramPhases[0].id, crypto.randomUUID())
    const body = document.getElementById('pz-body')
    const attrsOf = (id) => { const e = document.getElementById(id); return e ? e.getAttributeNames().sort() : null }
    const valueOf = (id) => document.getElementById(id)?.value ?? null
    return {
      injectedElements: body.querySelectorAll('img, script, svg').length,
      xss: window.__xss ?? null,
      tiers: ['heavy', 'moderate', 'light'].map(t => ({
        t, repsAttrs: attrsOf(`pz-tier-${t}-reps`), repsValue: valueOf(`pz-tier-${t}-reps`),
        pctAttrs: attrsOf(`pz-tier-${t}-pct`), pctValue: valueOf(`pz-tier-${t}-pct`)
      })),
      linear: ['pz-start', 'pz-end', 'pz-deload-week', 'pz-deload-pct'].map(id => ({ id, attrs: attrsOf(id), value: valueOf(id) })),
      deloadChecked: document.getElementById('pz-deload-on')?.checked ?? null,
      deloadDisplay: document.getElementById('pz-deload-fields')?.style.display ?? null
    }
  }, { type, config })

  const TEXT_ATTRS = ['class', 'id', 'placeholder', 'type', 'value']

  test('undulating: a hostile reps string stays inside its value="" and round-trips as literal text', async ({ page }) => {
    await loginAsPT(page)
    const hostile = {
      heavy: 'foo" onmouseover="window.__xss=1" data-x="',
      moderate: '<img src=x onerror=window.__xss=2>',
      light: `it's "10-12" & 3<4`
    }
    const r = await openWith(page, 'undulating', { tiers: {
      heavy: { pct: 85, reps: hostile.heavy }, moderate: { pct: 70, reps: hostile.moderate }, light: { pct: 55, reps: hostile.light }
    } })

    for (const tier of r.tiers) {
      expect.soft(tier.repsAttrs, `${tier.t}: no attribute may be added by a breakout`).toEqual(TEXT_ATTRS)
      expect.soft(tier.repsValue, `${tier.t}: the hostile string must round-trip as the literal text (not backslash-corrupted)`).toBe(hostile[tier.t])
    }
    expect.soft(r.injectedElements, 'no element may be injected into the modal body').toBe(0)
    expect(r.xss, 'and nothing may have executed').toBeNull()
  })

  test('undulating: the pct fields are untyped jsonb too — a quote in one cannot add an attribute', async ({ page }) => {
    await loginAsPT(page)
    const r = await openWith(page, 'undulating', { tiers: {
      heavy: { pct: '85" onmouseover="window.__xss=3', reps: '3-5' }, moderate: { pct: 70, reps: '6-8' }, light: { pct: 55, reps: '10-12' }
    } })
    const heavy = r.tiers.find(t => t.t === 'heavy')
    expect.soft(heavy.pctAttrs, 'no attribute may be added through the pct value').toEqual(['class', 'id', 'max', 'min', 'placeholder', 'type', 'value'])
    expect(r.xss).toBeNull()
  })

  test('linear: hostile start / end / deload values cannot add attributes or elements', async ({ page }) => {
    await loginAsPT(page)
    const r = await openWith(page, 'linear', {
      startPct: '65" onmouseover="window.__xss=4',
      endPct: '85"><img src=x onerror=window.__xss=5><input value="',
      deloadWeek: '3" autofocus onfocus="window.__xss=6',
      deloadPct: '50" onmouseover="window.__xss=7'
    })
    const attrsFor = (id) => r.linear.find(x => x.id === id).attrs
    expect.soft(attrsFor('pz-start'), 'start %1RM').toEqual(['class', 'id', 'max', 'min', 'type', 'value'])
    expect.soft(attrsFor('pz-end'), 'end %1RM').toEqual(['class', 'id', 'max', 'min', 'type', 'value'])
    expect.soft(attrsFor('pz-deload-week'), 'deload week').toEqual(['class', 'id', 'max', 'min', 'type', 'value'])
    expect.soft(attrsFor('pz-deload-pct'), 'deload %1RM').toEqual(['class', 'id', 'max', 'min', 'type', 'value'])
    expect.soft(r.injectedElements, 'no element may be injected').toBe(0)
    expect(r.xss).toBeNull()
  })

  // ── the legitimate user is not refused ────────────────────────────────────────────────────────
  test('MIRROR: benign saved values render exactly as saved, and a saved deload week shows its fields', async ({ page }) => {
    await loginAsPT(page)
    const lin = await openWith(page, 'linear', { startPct: 60, endPct: 90, deloadWeek: 4, deloadPct: 55 })
    const v = (id) => lin.linear.find(x => x.id === id).value
    expect(v('pz-start')).toBe('60')
    expect(v('pz-end')).toBe('90')
    expect(v('pz-deload-week')).toBe('4')
    expect(v('pz-deload-pct')).toBe('55')
    expect(lin.deloadChecked, 'a saved deload week switches the deload option on').toBe(true)
    expect(lin.deloadDisplay, 'and shows its fields').toBe('grid')

    const und = await openWith(page, 'undulating', { tiers: {
      heavy: { pct: 88, reps: '2-4' }, moderate: { pct: 72, reps: '5-7' }, light: { pct: 58, reps: '9-11' }
    } })
    expect(und.tiers.map(t => t.repsValue)).toEqual(['2-4', '5-7', '9-11'])
    expect(und.tiers.map(t => t.pctValue)).toEqual(['88', '72', '58'])
  })

  test('MIRROR: an empty config renders the defaults, and an unset deload week leaves its fields hidden', async ({ page }) => {
    await loginAsPT(page)
    const lin = await openWith(page, 'linear', {})
    const v = (id) => lin.linear.find(x => x.id === id).value
    expect(v('pz-start'), 'default start').toBe('65')
    expect(v('pz-end'), 'default end').toBe('85')
    expect(v('pz-deload-pct'), 'default deload %').toBe('50')
    expect(lin.deloadChecked).toBe(false)
    expect(lin.deloadDisplay).toBe('none')

    const und = await openWith(page, 'undulating', {})
    expect(und.tiers.map(t => t.repsValue), 'default reps per tier').toEqual(['3-5', '6-8', '10-12'])
    expect(und.tiers.map(t => t.pctValue), 'default %1RM per tier').toEqual(['85', '70', '55'])
  })
})
