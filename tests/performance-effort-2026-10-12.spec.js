const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── Jake, 2026-10-12 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
//
// "None of the performance tables show recorded effort (rpe or rir)." and "In the runner, the RPE is not shown whereas the RIR is."
// Progress > Performance printed "62.5×4, 65×4, 62.4×4" and never the RPE or RIR the athlete logged against each set, while the Stats sheet printed
// "62.5×4 @7 · 65×4 @8". The Per session query did not even SELECT effort_type / effort_value; the Per exercise one did and the line dropped it.
// And the Stats sheet itself wrote an RIR as "@0 RIR" but an RPE as a bare "@7", so an RPE did not read as one.
//
// Nothing here writes to the database: the formatter is called directly, and the Per session read is answered by a route that behaves like
// PostgREST (it returns only the columns the page asked for), so a query that forgets the effort columns shows up as a missing "@7 RPE".

const set = (n, w, r, extra = {}) => ({ set_number: n, weight_kg: w, reps_achieved: r, ...extra })
const rpe = v => ({ effort_type: 'rpe', effort_value: v })
const rir = v => ({ effort_type: 'rir', effort_value: v })

test.describe('Recorded effort in the Performance tables (2026-10-12)', () => {
  test('a set line carries its effort, RPE and RIR each naming their scale; sets with different effort do not collapse', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(([rpeSets, rirSets, mixed, none, junk, legacy]) => ({
      rpe: _collapsedSetLine(rpeSets),
      plain: _setDetailsLine(rpeSets),
      rir: _collapsedSetLine(rirSets),
      mixed: _collapsedSetLine(mixed),
      none: _collapsedSetLine(none),
      junk: _collapsedSetLine(junk),
      legacy: _collapsedSetLine(legacy)
    }), [
      [set(1, 62.5, 4, rpe(7)), set(2, 65, 4, rpe(8)), set(3, 62.4, 4, rpe(7))],
      [set(1, 82.5, 6, rir(0)), set(2, 80, 9, rir(0)), set(3, 80, 7, rir(0))],
      [set(1, 95, 8, rpe(7)), set(2, 95, 8, rpe(7)), set(3, 95, 8, rpe(8)), set(4, 95, 8)],
      [set(1, 95, 8), set(2, 95, 8)],
      [set(1, 95, 8, { effort_type: 'tempo', effort_value: 8 }), set(2, 95, 8, { effort_type: 'rpe', effort_value: null }), set(3, 95, 8, { effort_type: 'rpe', effort_value: 'abc' })],
      [set(1, 95, 8, { effort_type: null, effort_value: 8 }), set(2, 95, 8, { effort_type: null, effort_value: 8 })]
    ])
    expect(r.rpe, 'an RPE is named as one, like an RIR').toBe('62.5×4 @7 RPE · 65×4 @8 RPE · 62.4×4 @7 RPE')
    expect(r.plain, 'the plain line (the Per session list) carries it too').toBe('62.5×4 @7 RPE, 65×4 @8 RPE, 62.4×4 @7 RPE')
    expect(r.rir, 'RIR 0 ("to failure") is a real value and is shown').toBe('82.5×6 @0 RIR · 80×9 @0 RIR · 80×7 @0 RIR')
    expect(r.mixed, 'two sets at RPE 7 collapse; the RPE 8 set and the set with no effort do not join them').toBe('2 × 95×8 @7 RPE · 95×8 @8 RPE · 95×8')
    expect(r.none, 'a set with no effort reads exactly as it always did').toBe('2 × 95×8')
    expect(r.junk, 'an unknown scale, no value, or a value that is not a number is not shown (RPE and RIR run in opposite directions, so a guess could invert it)').toBe('3 × 95×8')
    expect(r.legacy, 'a set logged before the scale was recorded (no type) is shown as RPE - Jake, 2026-10-12').toBe('2 × 95×8 @8 RPE')
  })

  // Jake, 2026-10-12: "include per block" - the Per program tab gets an average effort for each block's window of the exercise, RIR converted to RPE.
  test('Per program: each block shows its average effort; RIR is converted, a set with no scale counts as RPE, a block with no effort shows no line', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const host = document.createElement('div'); host.id = 'blk-result'; document.body.appendChild(host)
      const keep = { c: window._blockCache, e: window._blockExCache, s: window._blockState }
      const s = (n, w, r, extra = {}) => ({ set_number: n, weight_kg: w, reps_achieved: r, ...extra })
      window._blockCache = [
        { key: 'past:a', name: 'Block A', start: '2026-05-04', end: '2026-06-28', weeks: 8, open: false },
        { key: 'past:b', name: 'Block B', start: '2026-07-06', end: '2026-08-30', weeks: 8, open: false },
        { key: 'past:c', name: 'Block C', start: '2026-09-07', end: '2026-10-04', weeks: 4, open: false }
      ]
      window._blockExCache = [{ name: 'Barbell Military Press', metricType: 'weight_reps', sessions: [
        { date: '2026-05-11', sets: [s(1, 60, 5, { effort_type: 'rpe', effort_value: 7 }), s(2, 60, 5, { effort_type: 'rpe', effort_value: 8 })] },
        { date: '2026-07-13', sets: [s(1, 62.5, 5, { effort_type: 'rir', effort_value: 1 }), s(2, 62.5, 5, { effort_type: 'rir', effort_value: 2 }), s(3, 62.5, 5, { effort_type: null, effort_value: 7 }), s(4, 62.5, 5, { effort_type: 'rpe', effort_value: 88 })] },
        { date: '2026-09-14', sets: [s(1, 65, 5)] }
      ] }]
      const read = (a, b) => {
        window._blockState = { a, b, ex: 'Barbell Military Press' }
        _renderBlockComparison()
        return [...host.querySelectorAll('[data-block-effort]')].map(e => e.textContent.replace(/\s+/g, ' ').trim())
      }
      try {
        return { ab: read('past:a', 'past:b'), c: read('past:c', ''), cWords: host.textContent.includes('Block C') }
      } finally { window._blockCache = keep.c; window._blockExCache = keep.e; window._blockState = keep.s; host.remove() }
    })
    expect(r.ab[0], 'RPE 7 and 8 average 7.5').toBe('Average effort @7.5 RPE · 2 sets')
    expect(r.ab[1], 'RIR 1 and 2 are RPE 9 and 8, and a set with no scale is RPE 7: (9 + 8 + 7) / 3 = 8, and it says RIR was converted').toBe('Average effort @8 RPE · 3 sets (RIR counted as 10 − RIR)')
    expect(r.c, 'a block whose sets have no effort shows no effort line').toEqual([])
    expect(r.cWords, 'and the block itself is still shown').toBe(true)
  })

  test('Per session: a stored value that looks like markup is shown as text, never run', async ({ page }) => {
    await loginAsPT(page)
    await page.route('**/rest/v1/workout_logs*', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ id: 'fixture-log', name: 'Probe', date: '2026-10-12', workout_log_exercises: [
        { exercise_name: 'Probe lift', exercise_type: 'strength', metric_type: 'weight_reps', workout_log_sets: [{ weight_kg: 50, reps_achieved: '<img src=x onerror="window.__pwned=1">', effort_type: 'rpe', effort_value: 7 }] }
      ] }])
    }))
    const r = await page.evaluate(async () => {
      window.__pwned = 0
      const el = document.createElement('div'); el.id = 'perf-xss-host'; document.body.appendChild(el)
      await renderProgressPerSession('fixture-client', el)
      _togglePerfSession(0)
      const out = { imgs: el.querySelectorAll('img').length, pwned: window.__pwned, text: document.getElementById('perf-sess-0')?.innerText || '' }
      el.remove()
      return out
    })
    expect(r.imgs, 'no element was made from the stored text').toBe(0)
    expect(r.pwned, 'and no handler ran').toBe(0)
    expect(r.text, 'the text is shown as text').toContain('<img')
  })

  test('Per exercise: the "Per session" block under the chart shows the effort', async ({ page }) => {
    await loginAsPT(page)
    const html = await page.evaluate((pts) => _sessionSetsBlockHtml(pts), [
      { date: '2026-10-12', sets: [set(1, 62.5, 4, rpe(7)), set(2, 65, 4, rpe(8))] },
      { date: '2026-10-09', sets: [set(1, 80, 8, rir(1))] }
    ])
    expect(html).toContain('62.5×4 @7 RPE')
    expect(html).toContain('65×4 @8 RPE')
    expect(html).toContain('80×8 @1 RIR')
  })

  test('Per session: the query asks for effort and the expanded session shows it', async ({ page }) => {
    await loginAsPT(page)
    const asked = []
    await page.route('**/rest/v1/workout_logs*', route => {
      const url = new URL(route.request().url())
      const select = url.searchParams.get('select') || ''
      asked.push(select)
      // PostgREST returns ONLY the columns a select names, so project the fixture's sets down to the ones asked for.
      const cols = (select.match(/workout_log_sets\(([^)]*)\)/)?.[1] || '').split(',').map(c => c.trim()).filter(Boolean)
      const proj = s => Object.fromEntries(Object.entries(s).filter(([k]) => cols.includes(k)))
      const sets = [
        { weight_kg: 62.5, reps_achieved: 4, effort_type: 'rpe', effort_value: 7 },
        { weight_kg: 65, reps_achieved: 4, effort_type: 'rpe', effort_value: 8 },
        { weight_kg: 62.4, reps_achieved: 4, effort_type: 'rpe', effort_value: 7 }
      ].map(proj)
      const rirSets = [{ weight_kg: 82.5, reps_achieved: 6, effort_type: 'rir', effort_value: 0 }].map(proj)
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'fixture-log', name: 'Heavy Upper Body', date: '2026-10-12', workout_log_exercises: [
          { exercise_name: 'Barbell Military Press', exercise_type: 'strength', metric_type: 'weight_reps', workout_log_sets: sets },
          { exercise_name: 'Chest Supported Machine Row', exercise_type: 'strength', metric_type: 'weight_reps', workout_log_sets: rirSets }
        ] }])
      })
    })
    await page.evaluate(() => {
      const el = document.createElement('div'); el.id = 'perf-fixture-host'; document.body.appendChild(el)
      return renderProgressPerSession('fixture-client', el)
    })
    await page.evaluate(() => _togglePerfSession(0))
    const text = await page.locator('#perf-sess-0').innerText()
    expect(asked.some(s => /effort_type/.test(s) && /effort_value/.test(s)), 'the read selects effort_type and effort_value').toBe(true)
    expect(text, 'the RPE exercise shows each set\'s RPE').toContain('62.5×4 @7 RPE, 65×4 @8 RPE, 62.4×4 @7 RPE')
    expect(text, 'the RIR exercise shows its RIR').toContain('82.5×6 @0 RIR')
    await page.evaluate(() => document.getElementById('perf-fixture-host')?.remove())
  })
})
