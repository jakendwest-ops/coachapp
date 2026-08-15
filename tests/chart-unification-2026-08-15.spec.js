// Jake, 2026-08-14: "The grid style and data/plot points within this weight section is the style that
// I would like within the performance section … Please include this graph type for all sections that
// require a graph."
//
// Seven `new Chart(` sites in js/app-progress.js with ZERO shared config and THREE teardown idioms,
// collapsed into one _renderMetricChart + one _destroyManagedCharts. These tests pin the invariants
// that refactor claims, and the two defects the pre-push review found in it.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

test.describe('Chart unification — one style, one teardown', () => {
  // THE bug the review caught, and the SECOND time in two days this exact shape has bitten (the 1RM
  // grid crash, 2026-08-14). weightToPref returns a NUMBER in kg but a STRING in lb, so a reduce()
  // over its output CONCATENATES: "0" + "197.3" + "196.4" → NaN. The whole averaged series went NaN
  // in lb, drew nothing (pointRadius 0, spanGaps false), and the legend still advertised "7-day avg".
  // The suite runs entirely in kg, which is why nothing caught it.
  for (const unit of ['kg', 'lb']) {
    test(`_rollingAvg returns finite numbers when weightToPref yields ${unit}`, async ({ page }) => {
      await loginAsPT(page)
      const r = await page.evaluate(u => {
        const prev = window._unitPrefs.weight
        window._unitPrefs.weight = u
        // Exactly what renderProgressWeight feeds it — the real conversion, not hand-made numbers.
        const disp = [89.5, 89.1, 88.7, 88.2, 87.9].map(kg => weightToPref(kg))
        const avg = _rollingAvg(disp)
        window._unitPrefs.weight = prev
        return { typeOfFirst: typeof disp[0], avg, allFinite: avg.every(v => v != null && Number.isFinite(v)) }
      }, unit)
      // The premise: in lb these really are strings. If this ever flips, the bug class changed.
      expect(r.typeOfFirst).toBe(unit === 'lb' ? 'string' : 'number')
      expect(r.allFinite, `every rolling-average point must be a finite number in ${unit}`).toBe(true)
      expect(r.avg.some(v => Number.isNaN(v))).toBe(false)
    })
  }

  // The float artifacts Jake could see in his own screenshot: "20.800000000000004%" on the body-fat
  // axis. Fixed centrally so it cannot spread as the other six charts adopt the style.
  test('tick values are rounded, so no float tail can reach an axis label', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => ({
      artifacts: [20.800000000000004, 20.400000000000006, 0.1 + 0.2].map(_tickNum),
      zeroSurvives: _tickNum(0),
      negatives: _tickNum(-3.25),
    }))
    expect(r.artifacts).toEqual([20.8, 20.4, 0.3])
    expect(r.zeroSurvives, '0 is a real value, not a missing one').toBe(0)
    // -3.2, not -3.3: JS Math.round breaks halves toward POSITIVE infinity, so Math.round(-32.5) is
    // -32. Asserted as the real behaviour rather than the intuitive one. Irrelevant for an axis tick
    // (a half-unit either way at 1dp), but worth pinning so the next reader is not surprised by it.
    expect(r.negatives).toBe(-3.2)
  })

  // The invariant the whole refactor claims to have made structural. renderProgressPBs and
  // renderProgressWeight are entered DIRECTLY from saveClientPB / saveClientWeight (app-clients.js),
  // bypassing renderProgress — so without their own teardown, each save replaced the container's
  // innerHTML and orphaned every chart on it, while the registry kept growing.
  test('re-rendering a chart surface does not accumulate live Chart instances', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(async () => {
      const el = document.getElementById('main-content')
      const counts = []
      for (let i = 0; i < 3; i++) {
        await renderProgressWeight(el)
        await new Promise(r2 => setTimeout(r2, 600))
        // Count instances Chart.js itself still considers live, not our bookkeeping — the registry
        // could be emptied while the instances leak, which is precisely the old bug.
        counts.push(_activeCharts.filter(c => c.canvas && Chart.getChart(c.canvas) === c).length)
      }
      return { counts, registrySize: _activeCharts.length }
    })
    // Whatever the surface renders (1 chart, or 2 with resting-HR data), it must be the SAME after
    // three renders — not 1, 2, 3.
    expect(new Set(r.counts).size, `live chart count must not grow across re-renders: ${r.counts}`).toBe(1)
    expect(r.registrySize, 'the registry must not accumulate dead entries either').toBeLessThanOrEqual(r.counts[0])
  })

  // One teardown path replaced three. A detached canvas whose Chart was never destroyed keeps its
  // listeners and animation loop alive.
  test('_destroyManagedCharts destroys every tracked instance', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const ids = ['zz-cu-a', 'zz-cu-b', 'zz-cu-c']
      ids.forEach(id => {
        const c = document.createElement('canvas'); c.id = id; document.body.appendChild(c)
        _renderMetricChart(c, { labels: ['a', 'b'], series: [{ data: [1, 2] }] })
      })
      const before = ids.filter(i => !!Chart.getChart(document.getElementById(i))).length
      _destroyManagedCharts()
      const after = ids.filter(i => !!Chart.getChart(document.getElementById(i))).length
      const registry = _activeCharts.length
      ids.forEach(i => document.getElementById(i)?.remove())
      return { before, after, registry }
    })
    expect(r.before).toBe(3)
    expect(r.after, 'every instance must be destroyed, not just dropped from the list').toBe(0)
    expect(r.registry).toBe(0)
  })

  // Rendering onto the SAME canvas twice must replace, never stack — this is what makes the range
  // pills and the accordion re-open safe.
  test('re-rendering the same canvas replaces rather than stacks', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.id = 'zz-cu-same'; document.body.appendChild(c)
      const a = _renderMetricChart(c, { labels: ['a', 'b'], series: [{ data: [1, 2] }] })
      const b = _renderMetricChart(c, { labels: ['a', 'b'], series: [{ data: [3, 4] }] })
      const out = { different: a !== b, live: Chart.getChart(c) === b, registry: _activeCharts.filter(x => x.canvas === c).length }
      _destroyManagedCharts(); c.remove()
      return out
    })
    expect(r.different).toBe(true)
    expect(r.live, 'the newest instance owns the canvas').toBe(true)
    expect(r.registry, 'the superseded instance must not linger in the registry').toBe(1)
  })

  // A dual-axis chart must tint each axis to its own series, or the reader cannot tell which scale
  // belongs to which line. The first cut of the helper flattened both to muted grey — on the very
  // chart that had just gained a second axis.
  test('a dual-axis chart colour-codes its axes; a single-axis one stays neutral', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const mk = (id, series) => {
        const c = document.createElement('canvas'); c.id = id; document.body.appendChild(c)
        const ch = _renderMetricChart(c, { labels: ['a', 'b'], series })
        const o = ch.options.scales
        return { y: o.y.ticks.color, y2: o.y2 ? o.y2.ticks.color : null }
      }
      const dual = mk('zz-cu-dual', [
        { label: 'W', data: [1, 2], colour: '#111111' },
        { label: 'B', data: [3, 4], colour: '#222222', axis: 'y2' },
      ])
      const single = mk('zz-cu-single', [{ label: 'W', data: [1, 2], colour: '#111111' }])
      _destroyManagedCharts()
      document.getElementById('zz-cu-dual')?.remove(); document.getElementById('zz-cu-single')?.remove()
      return { dual, single }
    })
    expect(r.dual.y).toBe('#111111')
    expect(r.dual.y2).toBe('#222222')
    expect(r.single.y2).toBeNull()
    expect(r.single.y, 'nothing to disambiguate on one axis — a coloured axis there is just noise').not.toBe('#111111')
  })

  // Personal Bests had NO chart at all before this — the biggest gap against "all sections that
  // require a graph". It plots only entries sharing the BEST record's unit: the same lift can be
  // logged in kg or lbs, and drawing 117.5 next to 259 on one axis reads as a collapse in performance.
  test('Personal Bests renders a chart, excluding entries logged in another unit', async ({ page }) => {
    await loginAsClient(page)
    let cid = null
    try {
      const r = await page.evaluate(async () => {
        const clientId = await _getCurrentClientId()
        const tag = `[E2E] ChartUnit ${Date.now()}`
        const mk = (value, unit, date) => ({ client_id: clientId, logged_by: currentUser.id, name: tag, category: 'strength', value, unit, date })
        const { error } = await db.from('performance_logs').insert([
          mk(100, 'kg', '2026-06-01'), mk(110, 'kg', '2026-07-01'), mk(117.5, 'kg', '2026-08-01'),
          mk(259, 'lbs', '2026-08-10'),   // same lift, other unit — must NOT be plotted
        ])
        if (error) throw new Error(error.message)
        const el = document.getElementById('main-content')
        await renderProgressPBs(el)
        await new Promise(r2 => setTimeout(r2, 800))
        const canvases = [...document.querySelectorAll('canvas[id^="pb-chart-"]')]
        const mine = canvases.map(c => Chart.getChart(c)).filter(Boolean)
        return {
          clientId, tag,
          charts: mine.length,
          points: mine.map(c => c.data.datasets[0].data.length),
        }
      })
      cid = { clientId: r.clientId, tag: r.tag }
      expect(r.charts, 'Personal Bests must now draw a chart').toBeGreaterThan(0)
      expect(r.points, 'the lbs entry must be excluded — 4 entries, 3 plotted').toContain(3)
    } finally {
      if (cid) await page.evaluate(async c => {
        await db.from('performance_logs').delete().eq('client_id', c.clientId).eq('name', c.tag)
      }, cid)
    }
  })
})
