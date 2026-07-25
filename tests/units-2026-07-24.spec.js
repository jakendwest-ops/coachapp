const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsClient } = require('./helpers')

// Sub-project — account-wide, per-metric-type unit preference (weight kg/lb, jump height cm/in,
// cardio distance km/mi). Storage stays canonical (kg/cm/metres) everywhere; window._unitPrefs
// drives conversion only at display/entry boundaries. See the plan for the full rewired-site list —
// this spec covers the shared formatter/parser contract plus one real end-to-end round trip through
// the builder and Settings, rather than re-testing every individual display site.
test.describe('Units toggle — weight/jump-height/cardio-distance preference (2026-07-24)', () => {

  test('weightToPref/weightFromPref round-trip and blank/null contract', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      window._unitPrefs = { weight: 'kg', jumpHeight: 'cm', cardioDistance: 'km' }
      const kgNative = { to: weightToPref(100), from: weightFromPref('100') }
      window._unitPrefs.weight = 'lb'
      const toLb = weightToPref(100)          // 100kg -> ~220.5lb
      const backToKg = weightFromPref(toLb)   // should round-trip back to ~100
      const blankTo = weightToPref('')
      const blankFrom = weightFromPref('')
      const nullFrom = weightFromPref(null)
      const fmtBlank = fmtWeight(null)
      const fmtLb = fmtWeight(100)
      return { kgNative, toLb, backToKg, blankTo, blankFrom, nullFrom, fmtBlank, fmtLb }
    })
    // Native (kg) case: passthrough, no forced rounding — must not change existing behaviour.
    expect(r.kgNative.to).toBe(100)
    expect(r.kgNative.from).toBe(100)
    // Converted case round-trips within rounding tolerance (weightToPref rounds to 1dp, returning a
    // string via _stripTrailingZero — same shape as fmtDistanceM's existing converted-unit output).
    expect(parseFloat(r.toLb)).toBeCloseTo(220.5, 0)
    expect(parseFloat(r.backToKg)).toBeCloseTo(100, 0)
    // Blank/null contract: toPref returns '', fromPref returns null — matching fmtDistanceM's contract.
    expect(r.blankTo).toBe('')
    expect(r.blankFrom).toBeNull()
    expect(r.nullFrom).toBeNull()
    expect(r.fmtBlank).toBe('')
    expect(r.fmtLb).toBe('220.5lb')
  })

  test('jumpHeightToPref/jumpHeightFromPref and distanceToPref/distanceFromPref round-trip', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      window._unitPrefs = { weight: 'kg', jumpHeight: 'in', cardioDistance: 'mi' }
      const jh = { to: jumpHeightToPref(50), back: jumpHeightFromPref(jumpHeightToPref(50)) }
      const dist = { to: distanceToPref(1609.344), back: distanceFromPref(distanceToPref(1609.344)) }
      window._unitPrefs.jumpHeight = 'cm'
      window._unitPrefs.cardioDistance = 'km'
      const jhNative = jumpHeightToPref(50)
      const distNative = distanceToPref(500)   // native (km-pref) distance stays in metres, unconverted
      return { jh, dist, jhNative, distNative }
    })
    expect(parseFloat(r.jh.to)).toBeCloseTo(19.7, 0)
    expect(parseFloat(r.jh.back)).toBeCloseTo(50, 0)
    expect(parseFloat(r.dist.to)).toBeCloseTo(1, 1)        // 1609.344m -> ~1mi
    expect(r.dist.back).toBeCloseTo(1609.344, -1)
    expect(r.jhNative).toBe(50)
    expect(r.distNative).toBe(500)
  })

  // Completeness net, mirroring the plan's own verification requirement: after every display/entry
  // site was rewired by hand this session, grep the touched files for any hardcoded unit literal that
  // slipped through. A line is only flagged if it does NOT also reference window._unitPrefs — one
  // legitimate hit remains (app-runner.js's end-of-workout volume tile), which is a kg literal inside
  // a branch already gated on `_unitPrefs.weight==='lb'`, so it's excluded by that same check rather
  // than by an unexplained allowlist. Excludes app-core.js itself (the helpers legitimately contain
  // 'kg'/'cm' in comments and the native-unit passthrough branches) and app-clients.js's body-height
  // field (out of scope — a client's own height, not a jump-height or weight value).
  test('no leftover hardcoded kg/cm unit literals in the rewired display/entry files', async ({ page }) => {
    await loginAsPT(page)
    const hits = await page.evaluate(async () => {
      const files = ['js/app-workouts.js', 'js/app-runner.js', 'js/app-progress.js', 'js/app-programs.js', 'js/app-dashboard.js']
      const out = {}
      for (const f of files) {
        const src = await (await fetch('/' + f)).text()
        const flagged = src.split('\n')
          .map((line, i) => ({ line, num: i + 1 }))
          .filter(({ line }) => /\+\s*'kg'|\+\s*' kg'|\+\s*'cm'|\+\s*' cm'/.test(line) && !line.includes('_unitPrefs'))
        if (flagged.length) out[f] = flagged.map(f => `${f.num}: ${f.line.trim()}`)
      }
      return out
    })
    expect(hits, JSON.stringify(hits)).toEqual({})
  })

  // End-to-end: switch the account to lb, build a template with a weight target through the real
  // renderTemplateSets/flushTemplateSets pair (not a raw object), confirm the input DISPLAYS in lb
  // and flushing it back reads canonical kg into sets_json — the exact bug class fixed this session
  // (naively wrapping the read side broke deliberate field-clearing; this proves the fix round-trips).
  test('builder set editor round-trips a weight target through lb without corrupting canonical kg', async ({ page }) => {
    await loginAsPT(page)
    try {
      const r = await page.evaluate(async () => {
        await db.from('profiles').update({ weight_unit: 'lb' }).eq('id', currentUser.id)
        window._unitPrefs.weight = 'lb'

        const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) } return e }
        mk('att-type', 'select'); mk('att-sets-container', 'div')

        // 100kg canonical, prescribed before the toggle existed — must now DISPLAY as lb.
        window._templateSets = [{ effortType: 'rpe', repsMin: '5', weight: 100 }]
        renderTemplateSets('att-sets-container', 'weight_reps')
        const displayed = document.getElementById('ts-weight-0').value

        // User edits the (lb-displayed) field — flushing must convert back to canonical kg.
        document.getElementById('ts-weight-0').value = '110'
        flushTemplateSets('att-sets-container')
        const afterEdit = window._templateSets[0].weight

        // Clearing the field to blank must actually clear it (the exact regression the explicit
        // existence-check pattern was written to prevent), not silently restore the old value.
        document.getElementById('ts-weight-0').value = ''
        flushTemplateSets('att-sets-container')
        const afterClear = window._templateSets[0].weight

        return { displayed, afterEdit, afterClear }
      })
      // 100kg * 2.2046226218 ≈ 220.5lb (1dp, matching weightToPref's rounding contract).
      expect(r.displayed).toBe('220.5')
      // 110lb / 2.2046226218 ≈ 49.9kg
      expect(r.afterEdit).toBeCloseTo(49.9, 0)
      expect(r.afterClear).toBe('')
    } finally {
      await page.evaluate(async () => {
        await db.from('profiles').update({ weight_unit: 'kg' }).eq('id', currentUser.id)
      })
    }
  })

  // Settings save path: saveSettingsUnits must persist all three columns and update the in-memory
  // window._unitPrefs immediately (every render function reads it fresh — no reload required).
  test('saveSettingsUnits persists to profiles and updates window._unitPrefs without a reload', async ({ page }) => {
    await loginAsPT(page)
    try {
      const r = await page.evaluate(async () => {
        const mk = (id, t = 'select') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) } return e }
        const w = mk('settings-unit-weight'); w.innerHTML = '<option value="lb">lb</option>'; w.value = 'lb'
        const j = mk('settings-unit-jump'); j.innerHTML = '<option value="in">in</option>'; j.value = 'in'
        const d = mk('settings-unit-distance'); d.innerHTML = '<option value="mi">mi</option>'; d.value = 'mi'
        mk('settings-units-msg', 'span')

        await saveSettingsUnits()
        const inMemory = { ...window._unitPrefs }
        const { data } = await db.from('profiles').select('weight_unit, jump_height_unit, cardio_distance_unit').eq('id', currentUser.id).single()
        return { inMemory, stored: data }
      })
      expect(r.inMemory).toEqual({ weight: 'lb', jumpHeight: 'in', cardioDistance: 'mi' })
      expect(r.stored).toEqual({ weight_unit: 'lb', jump_height_unit: 'in', cardio_distance_unit: 'mi' })
    } finally {
      await page.evaluate(async () => {
        await db.from('profiles').update({ weight_unit: 'kg', jump_height_unit: 'cm', cardio_distance_unit: 'km' }).eq('id', currentUser.id)
      })
    }
  })

  // A client's own preference is a SEPARATE profile row from their coach's — flipping the coach's
  // setting must never leak into a real client's view. (Coach + solo intentionally DO share one row,
  // since solo is a view over the coach's own account — that's the confirmed "account-wide" design,
  // not a gap.)
  test('a client\'s unit preference is independent of their coach\'s', async ({ page }) => {
    await loginAsPT(page)
    const coachId = await page.evaluate(() => currentUser.id)
    await page.evaluate(async (id) => { await db.from('profiles').update({ weight_unit: 'lb' }).eq('id', id) }, coachId)
    try {
      // loginAsClient's page.goto('/') would otherwise just resume this same PT session — sign out
      // first so the auth screen actually reappears for the client login.
      await page.evaluate(() => db.auth.signOut())
      await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 10000 })
      await loginAsClient(page)
      const clientPref = await page.evaluate(() => window._unitPrefs.weight)
      expect(clientPref, 'a client account must not inherit its coach\'s weight_unit').toBe('kg')
    } finally {
      // The try block ends on the CLIENT's session (it signed out of PT partway through to log in as
      // client) — RLS on profiles is self-scoped, so writing the coach's row needs the coach's own
      // session back first. Forgetting this left weight_unit stuck on 'lb' on the shared PT fixture
      // after every run of this test, since the reset below was silently rejected, not merely skipped —
      // found when it broke unrelated weight-display assertions across several other spec files.
      await page.evaluate(() => db.auth.signOut())
      await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 10000 })
      await loginAsPT(page)
      await page.evaluate(async (id) => { await db.from('profiles').update({ weight_unit: 'kg' }).eq('id', id) }, coachId)
    }
  })
})
