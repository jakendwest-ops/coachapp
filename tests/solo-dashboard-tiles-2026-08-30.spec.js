const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── Solo dashboard "at a glance" tiles (2026-08-30) ────────────────────────────
//
// WHY THIS FILE EXISTS. Before the redesign, renderSoloDashboard had almost no coverage: the only
// assertion on its output anywhere was solo-account.spec.js's ".solo-stats must be visible on
// mobile". The whole template could be rewritten and the suite stayed green.
//
// Most tests here drive the TILE BUILDERS DIRECTLY. They are pure functions of their arguments, so
// this needs no seeded rows, cannot strand fixtures on Jake's live account, and — the real point —
// can exercise states the live account does not currently have (an empty weight history, a
// periodised phase, an lb preference). The two that must prove real navigation are integration
// tests and skip without a solo record, matching solo-account.spec.js.
//
// The builders are asserted through the SHIPPED functions, never re-implemented here: a test that
// re-types the markup would pass whether or not the source is correct.

const D = n => `(() => { const d = new Date(Date.now() + (${n}) * 86400000); return _ymdLocal(d) })()`

test.describe('solo dashboard tiles', () => {
  let soloAvailable = false

  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    await page.waitForTimeout(500)
    soloAvailable = await page.evaluate(() => !!window._soloClientId)
  })

  // ── 1. All four tiles, populated ──────────────────────────────────────────────
  test('all four tiles render, each with a title and a navigation target', async ({ page }) => {
    const r = await page.evaluate(() => {
      const today = _ymdLocal(new Date())
      const d = n => _ymdLocal(new Date(Date.now() + n * 86400000))
      const html = [
        _soloTileWeight([{ date: d(-1), weight_kg: 82.4 }, { date: d(-3), weight_kg: 82.8 }], today),
        _soloTileNextSession([{ date: d(0), kind: 'session', title: 'Upper A', templateId: 'clone-1' }], 'c1', today),
        _soloTileNextUp([{ date: d(1), kind: 'event', title: 'Massage', colour: 'var(--warning)' }], today),
        _soloTileRecent([{ id: 's1', name: 'Push Day', date: d(-1), workout_log_exercises: [1, 2] }], 'c1')
      ].join('')
      const box = document.createElement('div')
      box.innerHTML = html
      return {
        tiles: box.querySelectorAll('.solo-tile').length,
        titles: [...box.querySelectorAll('.card-title')].map(e => e.textContent.trim()),
        targets: [...box.querySelectorAll('.solo-tile')].map(e => e.getAttribute('onclick'))
      }
    })
    expect(r.tiles, 'four tiles').toBe(4)
    expect(r.titles).toEqual(['Weight', 'Next session', 'Next up', 'Recent sessions'])
    // Every destination must be one of soloPages (app-core.js:733). navigate() does NOT role-gate,
    // so a typo'd or coach-only page would render the wrong dashboard rather than being refused.
    const solo = ['solo-dashboard', 'workouts', 'library', 'programs', 'calendar', 'progress', 'settings']
    r.targets.forEach(t => {
      const m = /navigate\('([a-z-]+)'\)/.exec(t || '')
      expect(m, `every tile must carry a navigate() target, got: ${t}`).toBeTruthy()
      expect(solo, `${m[1]} is not a page a solo user may reach`).toContain(m[1])
    })
  })

  // ── 2. Real navigation, not just an attribute ─────────────────────────────────
  test('clicking a tile actually lands on its page', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.evaluate(() => switchView('solo'))
    await page.waitForTimeout(1200)
    // Asserting currentPage, not the onclick string — an attribute can be present and still not
    // navigate, which is the whole failure mode of a "clickable" tile.
    await page.locator('.solo-tiles .solo-tile').first().click()
    await page.waitForTimeout(900)
    expect(await page.evaluate(() => currentPage)).toBe('progress')
  })

  // ── 3. Weight delta: absolute, correct direction, and ROUNDED — in kg AND lb ──
  for (const unit of ['kg', 'lb']) {
    test(`weight tile shows an absolute, rounded delta at the ${unit} preference`, async ({ page }) => {
      const r = await page.evaluate((u) => {
        const before = window._unitPrefs.weight
        try {
          window._unitPrefs.weight = u
          const today = _ymdLocal(new Date())
          const d = n => _ymdLocal(new Date(Date.now() + n * 86400000))
          const down = _soloTileWeight([{ date: d(-1), weight_kg: 82.4 }, { date: d(-3), weight_kg: 82.8 }], today)
          const up   = _soloTileWeight([{ date: d(-1), weight_kg: 83.2 }, { date: d(-3), weight_kg: 82.8 }], today)
          const flat = _soloTileWeight([{ date: d(-1), weight_kg: 82.8 }, { date: d(-3), weight_kg: 82.8 }], today)
          return { down, up, flat }
        } finally { window._unitPrefs.weight = before }
      }, unit)

      expect(r.down, 'a loss must show a down arrow').toContain('↓')
      expect(r.up, 'a gain must show an up arrow').toContain('↑')
      expect(r.flat, 'an unchanged weight must say so, not show a 0 delta').toContain('no change')

      // THE regression guard. fmtWeight only rounds when asked, and weightToPref returns the raw
      // float for kg, so 82.8 - 82.4 rendered as "0.3999999999999915 kg" on screen. Same binary
      // float class as the "20.800000000000004%" axis label _tickNum was written for.
      const floaty = /\d\.\d{4,}/
      expect(floaty.test(r.down), `unrounded float in the delta: ${r.down.match(floaty)}`).toBe(false)
      expect(floaty.test(r.up), 'unrounded float in the delta').toBe(false)
      // And it must be an ABSOLUTE change in the user's unit, not a percentage — _deltaBadge exists
      // but returns a percentage, which would disagree with the Weight page and the old card.
      expect(r.down).toContain(unit)
      expect(r.down, 'the delta must not be expressed as a percentage').not.toContain('%')
    })
  }

  // ── 4. Start must use the CLIENT'S CLONE template id ──────────────────────────
  test('next-session Start passes the clone template id, and is a separate control', async ({ page }) => {
    const r = await page.evaluate(() => {
      const today = _ymdLocal(new Date())
      const withClone = _soloTileNextSession(
        [{ date: today, kind: 'session', title: 'Upper A', templateId: 'CLONE-123' }], 'client-9', today)
      const noClone = _soloTileNextSession(
        [{ date: today, kind: 'session', title: 'Upper A', templateId: null }], 'client-9', today)
      return { withClone, noClone }
    })
    expect(r.withClone).toContain("startWorkoutRunner('client-9','CLONE-123')")
    // stopPropagation is load-bearing: without it a Start tap ALSO fires the tile's navigate, and a
    // mis-tap would begin a real session — the runner writes a resume draft, so that is not free to undo.
    expect(r.withClone, 'Start must not also trigger the tile navigation').toContain('event.stopPropagation()')
    // No clone id means no runnable template. Offering Start would launch the master phase-slot
    // template, which is not what the athlete's plan says.
    expect(r.noClone, 'no Start button without a clone id').not.toContain('startWorkoutRunner')
  })

  // ── 5. A periodised phase must resolve to the RIGHT week ──────────────────────
  test('_programWorkoutsByDate places week 2 sessions on week 2, not week 1', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Monday of a fixed past week, so the assertion does not drift with the day it runs.
      const start = '2026-08-03' // a Monday
      const cp = {
        id: 'cp1', start_date: start,
        programs: { program_phases: [{
          id: 'p1', name: 'Block 1', duration_weeks: 2, order_index: 0,
          program_phase_workouts: [
            { id: 'a', day_of_week: 1, session_order: 1, week_number: 1, workout_templates: { id: 't1', name: 'Week1 Mon' } },
            { id: 'b', day_of_week: 1, session_order: 1, week_number: 2, workout_templates: { id: 't2', name: 'Week2 Mon' } }
          ]
        }] }
      }
      const map = _programWorkoutsByDate(cp, { a: { templateId: 'c-a' }, b: { templateId: 'c-b' } })
      return {
        wk1: (map['2026-08-03'] || []).map(p => p.workout_templates.name),
        wk2: (map['2026-08-10'] || []).map(p => p.workout_templates.name),
        clone: (map['2026-08-10'] || [])[0]?._clientTemplateId
      }
    })
    // Without week_number in the query (it was absent from the solo dashboard's until 2026-08-30)
    // both rows land on every week and this collapses.
    expect(r.wk1, 'week 1 gets only its own session').toEqual(['Week1 Mon'])
    expect(r.wk2, 'week 2 gets only its own session — not week 1 repeated').toEqual(['Week2 Mon'])
    expect(r.clone, 'the clone id must be attached for Start').toBe('c-b')
  })

  // The test above feeds week_number in its FIXTURE, so it proves the resolver works while saying
  // nothing about whether the dashboard actually SELECTS that column. It did not until 2026-08-30,
  // and without it every week of a periodised phase collapses onto week 1 with no error anywhere.
  // A source assertion is the honest guard for a query column: there is no behavioural way to see a
  // missing select without a periodised programme seeded on the live account.
  test('the solo dashboard query selects the columns the tiles depend on', async ({ page }) => {
    const src = await page.evaluate(() => renderSoloDashboard.toString())
    // Isolate the client_programs query, so a week_number appearing in some OTHER select cannot
    // satisfy this. Plain string slicing rather than a regex: the thing guarded is one substring,
    // and a regex here would just be a second thing that can be wrong.
    const at = src.indexOf("from('client_programs')")
    expect(at, 'could not find the client_programs query').toBeGreaterThan(-1)
    const q = src.slice(at, at + 400)   // the query is one long line; 400 chars covers it
    expect(q, 'week_number: without it a periodised phase collapses onto week 1').toContain('week_number')
    expect(q, 'client_programs.id: without it the clone lookup cannot run, so Start has no template').toContain('id,')
    expect(src, 'the clone map must be fetched from client_program_workouts').toContain('client_program_workouts')
  })

  // ── 6. The chart must not leak across repaints ────────────────────────────────
  // ORDERING GUARD. The behavioural version of this test below is VACUOUS on an account with no
  // weigh-ins: _renderMetricChart only runs when weights exist, so 'the count did not grow' is a
  // pass over ZERO charts. Verified by neutering — removing _destroyManagedCharts() left it GREEN.
  // This assertion always runs and always bites.
  test('_destroyManagedCharts runs, and runs BEFORE the innerHTML replace', async ({ page }) => {
    const src = await page.evaluate(() => renderSoloDashboard.toString())
    const destroy = src.indexOf('_destroyManagedCharts()')
    const paint = src.indexOf('el.innerHTML = `')
    expect(destroy, 'renderSoloDashboard must destroy managed charts').toBeGreaterThan(-1)
    expect(paint, 'could not find the innerHTML replace').toBeGreaterThan(-1)
    // Order matters: this replaces the whole subtree, detaching the canvas. Both of
    // _renderMetricChart's own guards then resolve against the NEW element and miss the old
    // instance, which lives on with its listeners and animation loop running. That is
    // bugs/2026-08-17-renderclientweight-leaks-a-chart-on-every-save, and this dashboard repaints
    // on every write via _renderOwnDashboard.
    expect(destroy, 'destroy must come BEFORE the repaint').toBeLessThan(paint)
  })

  test('repainting the dashboard does not accumulate live charts', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.evaluate(() => switchView('solo'))
    await page.waitForTimeout(1200)
    const r = await page.evaluate(async () => {
      const el = document.getElementById('main-content')
      const seen = []
      for (let i = 0; i < 3; i++) {
        await renderSoloDashboard(el)
        await new Promise(r => setTimeout(r, 400))
        seen.push(_activeCharts.length)
      }
      return { seen, everCharted: seen.some(n => n > 0) }
    })
    // NON-ZERO DENOMINATOR. Without a weigh-in no chart is ever created and this proves nothing —
    // say so out loud rather than reporting a green that means 'there was nothing to leak'.
    test.skip(!r.everCharted, 'no weigh-ins on this account, so no chart is created — see the ordering guard above')
    expect(Math.max(...r.seen), 'live charts grew across repaints: ' + r.seen.join(',')).toBeLessThanOrEqual(1)
  })

  // ── 7. Empty states must render a tile, not crash ─────────────────────────────
  test('every tile has an empty state and none of them throws', async ({ page }) => {
    const r = await page.evaluate(() => {
      const today = _ymdLocal(new Date())
      const out = {}
      try { out.weight = _soloTileWeight([], today) } catch (e) { out.weightErr = String(e) }
      try { out.weightNull = _soloTileWeight(null, today) } catch (e) { out.weightNullErr = String(e) }
      try { out.next = _soloTileNextSession([], 'c1', today) } catch (e) { out.nextErr = String(e) }
      try { out.up = _soloTileNextUp([], today) } catch (e) { out.upErr = String(e) }
      try { out.recent = _soloTileRecent(null, 'c1') } catch (e) { out.recentErr = String(e) }
      try { out.progNull = JSON.stringify(_programWorkoutsByDate(null, null)) } catch (e) { out.progErr = String(e) }
      return out
    })
    ;['weightErr', 'weightNullErr', 'nextErr', 'upErr', 'recentErr', 'progErr'].forEach(k =>
      expect(r[k], `${k} should not be set`).toBeUndefined())
    expect(r.weight).toContain('solo-tile-empty')
    expect(r.next).toContain('solo-tile-empty')
    expect(r.up).toContain('solo-tile-empty')
    expect(r.recent).toContain('solo-tile-empty')
    // {} not null: callers iterate the result, and a null would move the failure into their loop.
    expect(r.progNull).toBe('{}')
  })

  // ── 8. The merged timeline: events AND programmed days, in date order ─────────
  test('the Next-up timeline merges calendar events with programmed sessions', async ({ page }) => {
    const r = await page.evaluate(() => {
      const today = _ymdLocal(new Date())
      const d = n => _ymdLocal(new Date(Date.now() + n * 86400000))
      const merged = _soloUpcoming(
        [{ date: d(2), title: 'Massage', type: 'review' }],
        { [d(1)]: [{ workout_templates: { name: 'Upper A' }, _clientTemplateId: 'c1' }],
          [d(-4)]: [{ workout_templates: { name: 'Old session' }, _clientTemplateId: 'c0' }] },
        today)
      return merged.map(m => `${m.kind}:${m.title}`)
    })
    // Date-ordered across BOTH sources — nothing in the app merged them before; renderCalendar keeps
    // two separate maps and combines them only visually inside a grid cell.
    expect(r).toEqual(['session:Upper A', 'event:Massage'])
    expect(r.join(','), 'a past session must not appear in "next up"').not.toContain('Old session')
  })

  // ── 9. Goals tile + the new goals route ──────────────────────────────────────
  test('goals tile summarises, links to the goals page, and computes progress', async ({ page }) => {
    const r = await page.evaluate(() => {
      const today = _ymdLocal(new Date())
      const d = n => _ymdLocal(new Date(Date.now() + n * 86400000))
      const goals = [
        { id: 'g1', title: 'Bench 120kg', target_date: d(21), start_value: 100, current_value: 112, target_value: 120, goal_milestones: [] },
        { id: 'g2', title: 'Sub-20 5k', target_date: d(3), start_value: 24, current_value: 21.5, target_value: 20, goal_milestones: [] },
        { id: 'g3', title: 'No deadline', target_date: null, start_value: 0, current_value: 5, target_value: 10, goal_milestones: [] }
      ]
      return {
        populated: _soloTileGoals(goals, today),
        empty: _soloTileGoals([], today),
        nullish: _soloTileGoals(null, today),
        pctRange: _goalPct(goals[0]),
        pctRatio: _goalPct({ current_value: 5, target_value: 10, goal_milestones: [] }),
        pctMilestones: _goalPct({ goal_milestones: [{ completed_at: 'x' }, { completed_at: null }] }),
        pctDivZero: _goalPct({ start_value: 10, current_value: 10, target_value: 10, goal_milestones: [] })
      }
    })
    expect(r.populated, 'the tile must link to the goals page').toContain("navigate('goals')")
    expect(r.populated, 'headline count').toContain('3')
    // Soonest deadline first, so the headline number is followed by what is actually due.
    expect(r.populated.indexOf('Sub-20 5k'), 'the nearer deadline must come first')
      .toBeLessThan(r.populated.indexOf('Bench 120kg'))
    // A goal with no target_date sorts last but is still counted — not silently dropped.
    expect(r.populated).toContain('+1 more')
    expect(r.empty, 'empty state still links through').toContain("navigate('goals')")
    expect(r.empty).toContain('solo-tile-empty')
    expect(r.nullish, 'null must not throw').toContain('solo-tile-empty')

    // 100 -> 112 of a 100..120 range is 60%, NOT 93% (112/120) — the start value matters.
    expect(r.pctRange, 'start->target range').toBe(60)
    expect(r.pctRatio, 'bare current/target ratio when there is no start').toBe(50)
    expect(r.pctMilestones, 'falls back to completed milestones').toBe(50)
    // Guards against divide-by-zero: start === target would otherwise render NaN%.
    expect(Number.isFinite(r.pctDivZero), 'start === target must not produce NaN').toBe(true)
  })

  test('a solo user can reach the goals page, and it carries the real goals UI', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.evaluate(() => switchView('solo'))
    await page.waitForTimeout(1200)
    await page.evaluate(() => navigate('goals'))
    await page.waitForTimeout(1800)
    const r = await page.evaluate(() => ({
      page: currentPage,
      h1: document.querySelector('h1')?.textContent,
      // Every function in the goals module re-renders into #tab-content (openGoal, backToGoals,
      // deleteGoal). Without that id present, add/edit/delete would silently no-op after the first
      // paint — the exact shape of the 2026-07-08 "+ Log weight" bug on the Progress page.
      tabContent: !!document.getElementById('tab-content'),
      addBtn: !!document.querySelector('[onclick^="showAddGoalModal"]')
    }))
    expect(r.page).toBe('goals')
    expect(r.h1).toContain('Goals')
    expect(r.tabContent, '#tab-content must exist or the goals UI cannot re-render itself').toBe(true)
    expect(r.addBtn, 'a solo user must be able to CREATE a goal — they could not before this route').toBe(true)
  })

  // ── 10. The chart-destroy CLASS, not just the one new instance ────────────────
  test('every chart entry point destroys managed charts first', async ({ page }) => {
    const src = await page.evaluate(async () => {
      const r = await fetch('/js/app-progress.js')
      return r.ok ? r.text() : ''
    })
    expect(src.length, 'could not read app-progress.js').toBeGreaterThan(1000)
    const lines = src.split(/\r?\n/)
    const callers = []

    // EXEMPT, each with a reason checked against the code — not a convenience list.
    // _destroyManagedCharts() destroys EVERY managed chart, so the rule is NOT "every caller must
    // call it". It applies to callers that REBUILD A SUBTREE CONTAINING OTHER CHARTS — full-page
    // renders. In a caller that ADDS a chart beside existing ones, calling it would destroy the
    // others: a bug in the opposite direction, and exactly the guard-refuses-the-legitimate-user
    // shape this project keeps hitting. Both exemptions were read before being granted.
    const EXEMPT = {
      // Toggles a panel's display and renders into a canvas that PERSISTS in the DOM. Nothing is
      // detached, and _renderMetricChart's own Chart.getChart(el).destroy() already handles
      // re-rendering into the same canvas. A blanket destroy would kill every other open panel.
      togglePerfHistory: true,
      // Replaces only its OWN small container (container.innerHTML = '<canvas></canvas>'). A blanket
      // destroy would take out siblings. It DOES leak narrowly on repeated expand/collapse, but the
      // correct fix is destroying the chart that was in THAT container — filed as its own row rather
      // than bent to fit this rule.
      _expandPerfSessionExercise: true
    }

    lines.forEach((l, i) => {
      if (!/_renderMetricChart\(/.test(l)) return
      if (/^function _renderMetricChart/.test(l)) return
      // Look back for a destroy within the enclosing function.
      let start = i
      while (start > 0 && !/^(async )?function /.test(lines[start])) start--
      const body = lines.slice(start, i).join('\n')
      const fn = (lines[start].match(/function ([_a-zA-Z0-9]+)/) || [])[1]
      if (!body.includes('_destroyManagedCharts()') && !EXEMPT[fn]) {
        callers.push(fn + ':' + (i + 1))
      }
    })
    // Non-zero denominator: if the scan finds no callers at all it would pass vacuously.
    const total = lines.filter(l => /_renderMetricChart\(/.test(l) && !/^function _renderMetricChart/.test(l)).length
    expect(total, 'the scan must actually find chart callers').toBeGreaterThan(5)
    expect(callers, 'these render a chart into a rebuilt DOM without destroying the previous one — '
      + 'both of _renderMetricChart\'s own guards resolve against the NEW canvas and miss the old '
      + 'instance, which lives on with its listeners and animation loop running').toEqual([])
  })

})
