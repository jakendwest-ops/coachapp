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
// Fixed with ONE shared helper, weightFromInput (app-core.js), used at the prefilled sites:
//   cwf-weight (the log sheet, 2026-10-13; orm-${i} of the 1RM grid until then) · ls-weight-${bi}-${si} · ls-orm-${bi} · wr-edit-weight · ts-weight-${i}
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

  // End to end on the surface Jake originally reported (a 1RM stored as 200 kg drifting to 199.99 through a lb round trip). The grid that pre-filled a lb value and re-read it is gone
  // (2026-10-13): "Update best" opens a sheet whose weight box starts EMPTY, so nothing is ever read back from the painted display value. What must still hold, through the REAL list, lift
  // page and save1RM: an older row is never rewritten, and a value typed in lb is converted once.
  test('END TO END: Update best typed in lb appends one converted row and leaves the older kg row exactly as it was', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      const out = await page.evaluate(async () => {
        const tag = '[E2E] rt ' + Date.now()
        const { data: c } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: tag + ' client' }).select('id').single()
        await db.from('client_1rms').insert({
          client_id: c.id, exercise_name: tag + ' A', one_rm_kg: 200, recorded_at: '2026-09-01'
        })

        const prev = window._unitPrefs
        window._unitPrefs = { ...(prev || {}), weight: 'lb' }
        const host = document.createElement('div'); host.id = 'pb-1rms-section'
        document.body.appendChild(host)
        await renderClient1RMs(c.id, host)
        const listed = host.querySelector('.pb-best')?.textContent.trim()
        const idx = (window._pbLifts || []).findIndex(x => x.name === tag + ' A')
        await openLiftPage(c.id, idx)
        updateBest()
        document.getElementById('1rm-weight').value = '440.9'
        document.getElementById('1rm-date').value = '2026-10-01'
        await save1RM(c.id)
        await new Promise(r => setTimeout(r, 1500))

        const { data: rows } = await db.from('client_1rms')
          .select('one_rm_kg, recorded_at').eq('client_id', c.id).order('recorded_at')
        window._unitPrefs = prev
        host.remove()
        return { ids: { clientId: c.id }, listed, rows: (rows || []).map(r => [Number(r.one_rm_kg), r.recorded_at]) }
      })
      ids = out.ids
      expect(out.listed, 'the list paints the stored 200 kg in pounds').toBe('440.9 lb')
      expect(out.rows.length, 'one new dated entry was appended').toBe(2)
      expect(out.rows[0], 'the older row is exactly as it was stored: 200, not 199.99').toEqual([200, '2026-09-01'])
      expect(out.rows[1][0], 'the typed 440.9 lb is converted once').toBeCloseTo(440.9 / 2.20462, 2)
      expect(out.rows[1][1]).toBe('2026-10-01')
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
