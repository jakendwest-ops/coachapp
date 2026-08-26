// Bug 2026-07-09, reproduced 2026-08-26: "entering 200kg when another exercise is already 200kg
// saves as 199.5kg".
//
// The row had been open 48 days with two failed investigations, both of which traced save1RM only.
// There are FIVE 1RM writers, and the real defect was not in any of them — it is in the display:
//
//   200 kg  --weightToPref-->  "440.9" lb  --weightFromPref-->  199.99 kg
//
// Every save that re-reads an untouched prefilled weight field rewrites the row slightly wrong, and
// the next render rounds it again, so the screen keeps showing "200" while the database drifts. That
// is why reading the code twice found nothing: the corruption is invisible from the UI and bounded
// (~0.023 kg), so it never looks like a bug — it looks like data.
//
// Fixed with ONE shared helper, weightFromInput (app-core.js), used at all five prefilled sites:
//   orm-${i} (1RM grid) · ls-weight-${bi}-${si} · ls-orm-${bi} · wr-edit-weight · ts-weight-${i}
// Sites whose inputs are placeholder-only (1rm-weight, rorm-*, orm-est*) are deliberately untouched:
// with no prefill there is no round trip to lose.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('Weight display round-trip must not corrupt the stored kg', () => {

  // The unit test for the shared helper. Direct, because this is the ONE place the fix lives — if it
  // is wrong, all five sites are wrong together.
  test('weightFromInput returns the stored kg verbatim for an untouched field, and converts a real edit', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const mk = (value, shown, kg) => {
        const el = document.createElement('input')
        el.value = value
        if (shown !== undefined) el.dataset.shown = shown
        if (kg !== undefined) el.dataset.kg = kg
        return el
      }
      const prev = window._unitPrefs
      window._unitPrefs = { ...(prev || {}), weight: 'lb' }
      const out = {
        // THE BUG: painted "440.9" from a stored 200. Untouched -> must give back exactly 200.
        untouched: weightFromInput(mk('440.9', '440.9', 200)),
        // Same number retyped by hand is still not an edit.
        retypedSame: weightFromInput(mk('440.9', '440.9', 200)),
        // "200.0" vs "200" is the same untouched field — compared numerically, not as strings.
        looseMatch: weightFromInput(mk('440.90', '440.9', 200)),
        // A genuine edit must convert normally, NOT return the stale stored kg.
        realEdit: weightFromInput(mk('450', '440.9', 200)),
        // A site that renders a weight WITHOUT the attributes must still work — lossily, but work.
        noAttrs: weightFromInput(mk('440.9')),
        blank: weightFromInput(mk('', '440.9', 200)),
        nullEl: weightFromInput(null),
        // Read the app's own constant rather than hardcoding one — a literal here would be a second
        // copy of the same fact, and my first attempt used 2.20462 and failed against 2.2046226218.
        kgPerLb: _WEIGHT_KG_TO_LB
      }
      window._unitPrefs = prev
      return out
    })
    expect(r.untouched, 'THE BUG: an untouched lb field must return the stored kg, not its round trip').toBe(200)
    expect(r.retypedSame).toBe(200)
    expect(r.looseMatch, '"440.90" and "440.9" are the same untouched field').toBe(200)
    expect(r.realEdit, 'a genuine edit must convert, not return the stale stored value').toBeCloseTo(450 / r.kgPerLb, 6)
    expect(r.noAttrs, 'an unstamped input still falls back to the old path').toBeCloseTo(199.99, 1)
    expect(r.blank).toBeNull()
    expect(r.nullEl).toBeNull()
  })

  // End to end on the surface Jake actually reported, through the REAL grid render and the REAL
  // saveOneRMGrid. A DATE-ONLY edit is the path that drifts: saveOneRMGrid's equality guard only
  // skips a row when the value AND the date are unchanged, so changing just the date sends the
  // painted display value down the save path.
  test('END TO END: a date-only edit in lb must not move the stored weight', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      const out = await page.evaluate(async () => {
        const tag = '[E2E] rt ' + Date.now()
        const { data: c } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: tag + ' client' }).select('id').single()
        const today = new Date().toISOString().split('T')[0]
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
        await db.from('client_1rms').insert({
          client_id: c.id, exercise_name: tag + ' A', one_rm_kg: 200, recorded_at: yesterday
        })

        const prev = window._unitPrefs
        window._unitPrefs = { ...(prev || {}), weight: 'lb' }
        const host = document.createElement('div')
        document.body.appendChild(host)
        await renderClient1RMs(c.id, host)

        const idx = (window._oneRMGridRows || []).findIndex(x => x.name === tag + ' A')
        const inp = document.getElementById('orm-' + idx)
        const painted = inp.value
        // Touch ONLY the date. The weight field is left exactly as rendered.
        // Must DIFFER from the input default (which is already today), or saveOneRMGrid's equality
        // guard correctly treats the row as unchanged and skips it — my first attempt set it to
        // today and asserted on a save that never happened.
        document.getElementById('orm-date-' + idx).value = yesterday
        await saveOneRMGrid(c.id)
        await new Promise(r => setTimeout(r, 1500))

        const { data: rows } = await db.from('client_1rms')
          .select('one_rm_kg, recorded_at').eq('client_id', c.id).order('recorded_at')
        window._unitPrefs = prev
        return { ids: { clientId: c.id }, painted, kgs: (rows || []).map(r => r.one_rm_kg) }
      })
      ids = out.ids
      expect(out.painted, 'the grid paints a rounded lb value — this is the lossy proxy').toBe('440.9')
      expect(out.kgs.length, 'the date-only edit must have appended a new dated entry').toBe(2)
      for (const kg of out.kgs) {
        expect(kg, 'THE BUG: a date-only edit rewrote the weight as 199.99 instead of 200').toBe(200)
      }
    } finally {
      if (ids) await page.evaluate(async i => {
        await db.from('client_1rms').delete().eq('client_id', i.clientId)
        await db.from('clients').delete().eq('id', i.clientId)
      }, ids)
    }
  })

  // The class guard. Five sites were fixed by stamping data-shown/data-kg; a sixth added later
  // without them would silently rejoin the lossy path, which is this codebase's most-repeated
  // failure shape. This pins the inventory so a new prefilled weight input has to be a deliberate
  // decision rather than an oversight.
  test('every prefilled weight input still stamps the attributes weightFromInput needs', async ({ page }) => {
    await loginAsPT(page)
    const srcs = await page.evaluate(async () => {
      const names = ['js/app-progress.js', 'js/app-runner.js', 'js/app-workouts.js']
      const out = {}
      for (const n of names) out[n] = await (await fetch('/' + n)).text()
      return out
    })
    const offenders = []
    for (const [file, src] of Object.entries(srcs)) {
      // A weight input painted straight from weightToPref, with no weightInputAttrs alongside it.
      const re = /value="\$\{[^"]*weightToPref\([^"]*\}"/g
      let m
      while ((m = re.exec(src)) !== null) offenders.push(`${file}: ${m[0].slice(0, 90)}`)
    }
    expect(offenders, 'a prefilled weight input bypassing weightInputAttrs rejoins the lossy path')
      .toEqual([])
  })
})
