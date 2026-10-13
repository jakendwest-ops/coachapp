// Jake, 2026-08-15, on Progress → Performance → Per exercise:
//   "The plot points only show the weight that was used… Bench press shows 95kg on 6th July, however
//    none of the tabs show how many sets or reps i did with this weight."
//   "the 'recent sessions' should be named 'per session'"
//   "I can update the maxes on the landing page, so please can you explain the need to click the 3 dots"
//
// Plus the blank chart in his screenshot: "Barbell Deadlift · 1 session" rendered an empty 90px box,
// because the canvas container was emitted unconditionally and the draw pass bailed on <2 points.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

test.describe('Per-exercise session detail', () => {
  // The whole request in one assertion: a plotted point must carry the sets that produced it. They
  // were already fetched and already in scope — _metricPointsFor just returned scalars and let them
  // fall out of scope, so the page could show "95kg" and never "3 × 8".
  test('a plotted point carries its own sets, ordered by set_number', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const ex = {
        name: 'X', metricType: 'weight_reps',
        sessions: [{ date: '2026-07-06', sets: [
          { set_number: 3, weight_kg: 95, reps_achieved: 6 },
          { set_number: 1, weight_kg: 95, reps_achieved: 8 },
          { set_number: 2, weight_kg: 95, reps_achieved: 8 },
        ] }],
      }
      const p = _metricPointsFor(ex).points[0]
      return { hasSets: Array.isArray(p.sets), count: (p.sets || []).length, order: (p.sets || []).map(s => s.set_number), topWeight: p.topWeight }
    })
    expect(r.hasSets, 'the point must carry its sets — this is the whole request').toBe(true)
    expect(r.count).toBe(3)
    expect(r.order, 'the embed has no inherent order; set_number must sort them').toEqual([1, 2, 3])
    expect(r.topWeight, 'the existing aggregates must still work').toBe(95)
  })

  // Warm-ups are recorded but are not training volume. If they reached the list, a session would read
  // "4 × 95×8" for three working sets.
  test('warm-up and cool-down sets are excluded from the point', async ({ page }) => {
    await loginAsPT(page)
    const n = await page.evaluate(() => {
      const ex = { name: 'X', metricType: 'weight_reps', sessions: [{ date: '2026-07-06', sets: [
        { set_number: 1, weight_kg: 40, reps_achieved: 10, phase: 'warmup' },
        { set_number: 2, weight_kg: 95, reps_achieved: 8, phase: 'work' },
        { set_number: 3, weight_kg: 95, reps_achieved: 8 },
      ] }] }
      return _metricPointsFor(ex).points[0].sets.length
    })
    expect(n, 'only countable sets — a warm-up must not inflate the session line').toBe(2)
  })

  test('identical sets collapse, but a ramp keeps its order', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => ({
      same: _collapsedSetLine([
        { weight_kg: 95, reps_achieved: 8 }, { weight_kg: 95, reps_achieved: 8 }, { weight_kg: 95, reps_achieved: 8 },
      ]),
      // CONSECUTIVE grouping, not global: reordering a ramp into "3 × 95×8" would misreport the session.
      ramp: _collapsedSetLine([
        { weight_kg: 95, reps_achieved: 8 }, { weight_kg: 95, reps_achieved: 8 },
        { weight_kg: 100, reps_achieved: 5 }, { weight_kg: 95, reps_achieved: 8 },
      ]),
      unilateral: _collapsedSetLine([
        { side: 'left', weight_kg: 20, reps_achieved: 10 }, { side: 'right', weight_kg: 20, reps_achieved: 10 },
      ]),
      empty: _collapsedSetLine([]),
    }))
    expect(r.same).toBe('3 × 95×8')
    expect(r.ramp, 'a ramp must not be flattened into one group').toBe('2 × 95×8 · 100×5 · 95×8')
    expect(r.unilateral).toBe('L 20×10 · R 20×10')
    expect(r.empty).toBe('')
  })

  // Jake's screenshot: an exercise with ONE session rendered a blank white 90px gap. The zero-session
  // case was handled; one was not. The set line is what belongs in that slot anyway.
  test('a one-session exercise shows its sets instead of an empty chart box', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const one = [{ date: '2026-07-06', sets: [{ set_number: 1, weight_kg: 140, reps_achieved: 6 }] }]
      const p = _metricPointsFor({ name: 'X', metricType: 'weight_reps', sessions: one }).points
      return { html: _sessionSetsBlockHtml(p), aggLen: _aggregateSeries(p, 'topWeight', 'max').length }
    })
    expect(r.aggLen, 'one session cannot produce a line — this is why the slot was empty').toBe(1)
    expect(r.html, 'the session detail fills the slot the chart cannot').toContain('140×6')
    expect(r.html).toContain('Per session')
  })

  test('the session block caps its length rather than printing every session ever', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const pts = Array.from({ length: 14 }, (_, i) => ({
        date: `2026-07-${String(i + 1).padStart(2, '0')}`,
        sets: [{ set_number: 1, weight_kg: 100 + i, reps_achieved: 5 }],
      }))
      const html = _sessionSetsBlockHtml(pts)
      return { rows: (html.match(/×5/g) || []).length, saysHidden: /earlier session/.test(html), hasNewest: html.includes('113×5') }
    })
    expect(r.rows).toBe(10)
    expect(r.saysHidden, 'a truncated list must say so, not silently drop sessions').toBe(true)
    expect(r.hasNewest, 'the cap keeps the MOST RECENT sessions, not the oldest').toBe(true)
  })
})

test.describe('"Per session" rename', () => {
  // The trap: js/app-progress.js previously migrated a stored 'Per session' ONTO 'Recent sessions'.
  // Renaming the tab without reversing that line gives a tab that silently refuses to open — the
  // label IS the stored state, so a rename here is a state migration, not a cosmetic change.
  test('a stale "Recent sessions" migrates, and "Per session" then sticks', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(async () => {
      window._progressTab = 'Performance'
      window._perfTab = 'Recent sessions'     // the pre-rename stored value
      await renderProgress(document.getElementById('main-content'))
      await new Promise(r2 => setTimeout(r2, 1200))
      const afterMigration = window._perfTab
      window._perfTab = 'Per session'
      await renderPerformance(document.getElementById('progress-tab-content'))
      await new Promise(r2 => setTimeout(r2, 1200))
      return {
        afterMigration,
        afterSelect: window._perfTab,
        buttons: [...document.querySelectorAll('#progress-tab-content button')].map(b => b.textContent.trim()).filter(t => t.startsWith('Per ')),
      }
    })
    expect(r.afterMigration, 'a stored pre-rename value must migrate forward').toBe('Per session')
    expect(r.afterSelect, 'selecting the tab must STICK — the old migration bounced it back').toBe('Per session')
    // 'Per training plan' joined the inventory on 2026-08-16. Kept as an exact-equality assertion rather
    // than a `toContain`: this is the guard that would catch the rename accidentally re-adding a
    // fourth tab or resurrecting 'Recent sessions' alongside its replacement.
    expect(r.buttons).toEqual(['Per exercise', 'Per session', 'Per training plan'])
  })
})

test.describe('Personal Bests: Update best takes a date and an estimate in its sheet, no second screen (ported 2026-10-13)', () => {
  // Jake challenged the ⋯ and was right that it was redundant: it existed only because it was the ONLY route to backdating and to Epley estimation. Both moved into the row, and since
  // 2026-10-13 (Personal Bests as a row per lift) into the Update best sheet on the lift's page. These are the same guards on that sheet.
  test('the sheet backdates and estimates from a set, the old entry survives as history, and the lift page repaints', async ({ page }) => {
    await loginAsPT(page)
    let cid = null
    try {
      const r = await page.evaluate(async () => {
        const { data: c } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: '[E2E] 1RM inline' }).select('id').single()
        await db.from('client_1rms').insert({
          client_id: c.id, exercise_name: '[E2E] Squat', one_rm_kg: 100, recorded_at: '2026-07-01',
        })
        const host = document.createElement('div'); host.id = 'pb-1rms-section'; document.body.appendChild(host)
        await renderClient1RMs(c.id, host)
        const i = (window._pbLifts || []).findIndex(x => x.name === '[E2E] Squat')
        await openLiftPage(c.id, i)
        updateBest()
        const out = { cid: c.id, ellipsisInDom: /⋯/.test(host.innerHTML + document.body.innerHTML), hasDateInput: !!document.getElementById('1rm-date') }

        // Epley: 100 × (1 + 5/30) = 116.67
        _setAdd1RMMode('epley')
        document.getElementById('orm-est-weight').value = '100'
        document.getElementById('orm-est-reps').value = '5'
        _updateAdd1RMEpleyPreview()
        out.preview = document.getElementById('orm-epley-value').textContent

        document.getElementById('1rm-date').value = '2026-05-20'
        await save1RM(c.id)
        for (let k = 0; k < 50 && host.querySelectorAll('.pw-card .pw-item .pw-item-date').length < 2; k++) await new Promise(r2 => setTimeout(r2, 100))      // until the lift page has repainted with both entries
        const { data } = await db.from('client_1rms').select('one_rm_kg, recorded_at').eq('client_id', c.id)
        out.saved = (data || []).map(x => [Number(x.one_rm_kg), x.recorded_at]).sort((a, b) => (a[1] < b[1] ? -1 : 1))
        out.pageTitle = host.querySelector('.pw-title')?.textContent
        out.history = [...host.querySelectorAll('.pw-card .pw-item .pw-item-date')].map(d => d.textContent)
        host.remove()
        return out
      })
      cid = r.cid
      expect(r.ellipsisInDom, 'the ⋯ button is gone — nothing needs a second screen').toBe(false)
      expect(r.hasDateInput, 'backdating is in the sheet').toBe(true)
      expect(r.preview, '100kg × 5 → 116.7 via the shared _estimate1RM').toContain('116.7')
      expect(r.saved.length, 'one entry added, the old one kept as history').toBe(2)
      expect(r.saved[0][1]).toBe('2026-05-20')
      expect(r.saved[0][0], 'saved on the CHOSEN date, not today').toBeCloseTo(116.7, 1)
      expect(r.saved[1]).toEqual([100, '2026-07-01'])
      expect(r.pageTitle, 'the lift page repainted in place, it did not jump back to the list').toBe('[E2E] Squat')
      expect(r.history, 'both dated entries are in the history, newest first').toEqual(['1 Jul 2026', '20 May 2026'])
    } finally {
      if (cid) await page.evaluate(async id => {
        await db.from('client_1rms').delete().eq('client_id', id)
        await db.from('clients').delete().eq('id', id)
      }, cid)
    }
  })

  // client_1rms is append-only exactly so a plateau is recordable: the same weight on a new date is a real, additional entry (found by pre-push review on the old grid, which skipped a
  // date-only change as "nothing changed"). The sheet always inserts what it is given.
  test('the same weight on a new date is a real, additional entry', async ({ page }) => {
    await loginAsPT(page)
    let cid = null
    try {
      const r = await page.evaluate(async () => {
        const { data: c } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: '[E2E] 1RM dateonly' }).select('id').single()
        await db.from('client_1rms').insert({
          client_id: c.id, exercise_name: '[E2E] Plateau', one_rm_kg: 100, recorded_at: '2026-07-01',
        })
        const host = document.createElement('div'); host.id = 'pb-1rms-section'; document.body.appendChild(host)
        await renderClient1RMs(c.id, host)
        const i = (window._pbLifts || []).findIndex(x => x.name === '[E2E] Plateau')
        await openLiftPage(c.id, i)
        updateBest()
        document.getElementById('1rm-weight').value = '100'
        document.getElementById('1rm-date').value = '2026-08-10'
        await save1RM(c.id)
        await new Promise(r2 => setTimeout(r2, 900))
        const err = document.getElementById('1rm-error')?.textContent || ''
        const { data } = await db.from('client_1rms').select('one_rm_kg, recorded_at').eq('client_id', c.id)
        host.remove()
        return { cid: c.id, err, saved: (data || []).map(x => `${Number(x.one_rm_kg)}@${x.recorded_at}`).sort() }
      })
      cid = r.cid
      expect(r.saved, 'the same weight on a new date is a real, additional entry')
        .toEqual(['100@2026-07-01', '100@2026-08-10'])
    } finally {
      if (cid) await page.evaluate(async id => {
        await db.from('client_1rms').delete().eq('client_id', id)
        await db.from('clients').delete().eq('id', id)
      }, cid)
    }
  })

  // The estimate runs weightFromPref -> _estimate1RM -> fmtWeight, and that number-vs-string shape has produced a production bug on two consecutive days. The suite runs entirely in kg, so without this
  // the whole lb branch is invisible.
  for (const unit of ['kg', 'lb']) {
    test(`the sheet's estimate preview is finite and correctly rounded in ${unit}`, async ({ page }) => {
      await loginAsPT(page)
      const r = await page.evaluate(u => {
        const prev = window._unitPrefs.weight
        window._unitPrefs.weight = u
        _showOneRMDetailModal('00000000-0000-4000-8000-000000000000', { id: null, name: '[E2E] Preview' })
        _setAdd1RMMode('epley')
        document.getElementById('orm-est-weight').value = '100'
        document.getElementById('orm-est-reps').value = '5'
        _updateAdd1RMEpleyPreview()
        const out = { label: document.getElementById('orm-epley-value').textContent }
        document.getElementById('modal-1rm')?.remove()
        window._unitPrefs.weight = prev
        return out
      }, unit)
      // Epley is 100 × (1 + 5/30) = 116.67 in whatever unit was typed, so the DISPLAYED figure is the same either way — what differs is the kg conversion in between, where a string would
      // poison the arithmetic and yield NaN.
      expect(r.label).toContain('116.7')
      expect(r.label).toContain(unit)
    })
  }
})
