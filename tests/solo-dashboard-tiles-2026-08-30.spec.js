const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')
const { installCappedApi, restoreCappedApi, cappedApiCalls } = require('./capped-api')

// ─── The personal ("solo") dashboard: its cards (2026-08-30; rebuilt 2026-10-03) ───────────────────────────────
//
// WHY THIS FILE EXISTS. Before the 2026-08-30 redesign, renderSoloDashboard had almost no coverage: the only assertion on its output
// anywhere was solo-account.spec.js's "must be visible on mobile". The whole template could be rewritten and the suite stayed green.
//
// REBUILT 2026-10-03 for the dashboard rework (Jake: "nothing really flows or stands out as a dashboard"): solo, client and coach now
// share one skeleton - a Today card, the week strip, a streak and a program tile, then body weight, calendar and goals
// (tests/dashboard-rework-2026-10-03.spec.js drives whole pages; this file pins the BUILDERS and the rules that outlive any layout).
// What was RETIRED with the cards it pinned, so nobody re-adds it thinking it was lost: the "Recent sessions" card and the "My progress"
// personal-bests tile are off the page (Jake chose what stays: Goals stays, Recent sessions and personal bests do not), and the merged
// "Next session" tile's eyebrow / no-View-program rule - the Today card now has a View program button on purpose.
//
// Most tests drive the BUILDERS DIRECTLY. They are pure functions of their arguments, so this needs no seeded rows, cannot strand
// fixtures on Jake's live account, and can exercise states the live account does not have (an empty weight history, a periodised
// phase, an lb preference). The builders are asserted through the SHIPPED functions, never re-implemented here.

test.describe('solo dashboard cards', () => {
  let soloAvailable = false

  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    await page.waitForTimeout(500)
    soloAvailable = await page.evaluate(() => !!window._soloClientId)
  })

  // ── 1. Every card carries a title and a navigation target a solo user may reach ───────────────────────────────
  test('every card has a title and a navigation target on a page a solo user may reach', async ({ page }) => {
    const r = await page.evaluate(() => {
      const today = _ymdLocal(new Date())
      const d = n => _ymdLocal(new Date(Date.now() + n * 86400000))
      const html = [
        _dashWeightHtml([{ date: d(-1), weight_kg: 82.4 }, { date: d(-3), weight_kg: 82.8 }]),
        _dashCalendarHtml([{ date: d(1), kind: 'event', title: 'Massage', colour: 'var(--warning)' }], today),
        _dashGoalsHtml([{ id: 'g', title: 'Bench', target_date: d(20), start_value: 1, current_value: 2, target_value: 3, goal_milestones: [] }], today, false),
        _dashTilesHtml({ weeks: 2, capped: false }, { name: 'P', phase: 'Phase 1', week: 2, totalWeeks: 8, pct: 25 }, true),
      ].join('')
      const box = document.createElement('div')
      box.innerHTML = html
      // Tap every tappable card with navigate() stubbed: where each one goes is what a person gets, not what an attribute says.
      const visited = []
      const realNav = window.navigate
      window._progressTab = null
      window.navigate = (p) => visited.push([p, window._progressTab || null])
      try { box.querySelectorAll('.dash-tap').forEach(el => el.click()) } finally { window.navigate = realNav }
      return {
        cards: box.querySelectorAll('.dash-card').length,
        titles: [...box.querySelectorAll('.dash-card-title')].map(e => e.textContent.trim()),
        visited,
      }
    })
    expect(r.cards, 'weight, calendar, goals, streak and program').toBe(5)
    // Jake, 2026-09-28: "This tile should be 'my calendar' not 'next up'".
    expect(r.titles).toEqual(['Body weight', 'My calendar', 'Goals'])
    // Every destination must be one of soloPages (app-core.js). navigate() does NOT role-gate, so a typo'd or coach-only page would
    // render the wrong dashboard rather than being refused.
    const solo = ['solo-dashboard', 'workouts', 'library', 'programs', 'calendar', 'progress', 'goals', 'settings']
    expect(r.visited.length, 'weight, calendar, goals and the program tile are tappable and each navigates once').toBe(4)
    r.visited.forEach(([page]) => expect(solo, `${page} is not a page a solo user may reach`).toContain(page))
    expect(r.visited.map(v => v[0]), 'weight -> Progress, calendar -> Calendar, goals -> Goals, program -> Workouts').toEqual(['progress', 'calendar', 'goals', 'workouts'])
    // 2026-09-09: the Weight card must NAME its Progress tab - _progressTab persists within an SPA session, so without this it
    // lands on whichever tab was last open.
    expect(r.visited[0][1], 'the weight card lands on Body Weight, not "wherever you were"').toBe('Body Weight')
  })

  // ── 2. Real navigation, not just an attribute ──────────────────────────────────────────────────────────────────
  test('tapping a card actually lands on its page', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.evaluate(() => switchView('solo'))
    await expect(page.locator('#dash-root[data-dash="solo"]')).toBeVisible()
    // Asserting currentPage, not the onclick string - an attribute can be present and still not navigate, which is the whole
    // failure mode of a "clickable" card.
    await page.locator('#dash-weight').click()
    await expect.poll(() => page.evaluate(() => currentPage)).toBe('progress')
  })

  // ── 3. Weight delta: absolute, correct direction, and ROUNDED - in kg AND lb ───────────────────────────────────
  for (const unit of ['kg', 'lb']) {
    test(`the weight card shows an absolute, rounded change at the ${unit} preference`, async ({ page }) => {
      const r = await page.evaluate((u) => {
        const before = window._unitPrefs.weight
        try {
          window._unitPrefs.weight = u
          const d = n => _ymdLocal(new Date(Date.now() + n * 86400000))
          const down = _dashWeightHtml([{ date: d(-1), weight_kg: 82.4 }, { date: d(-3), weight_kg: 82.8 }])
          const up   = _dashWeightHtml([{ date: d(-1), weight_kg: 83.2 }, { date: d(-3), weight_kg: 82.8 }])
          const flat = _dashWeightHtml([{ date: d(-1), weight_kg: 82.8 }, { date: d(-3), weight_kg: 82.8 }])
          return { down, up, flat }
        } finally { window._unitPrefs.weight = before }
      }, unit)

      expect(r.down, 'a loss must show a down arrow').toContain('↓')
      expect(r.up, 'a gain must show an up arrow').toContain('↑')
      expect(r.flat, 'an unchanged weight must say so, not show a 0 change').toContain('no change')

      // THE regression guard. fmtWeight only rounds when asked, and weightToPref returns the raw float for kg, so 82.8 - 82.4
      // rendered as "0.3999999999999915 kg" on screen. Same binary float class as the "20.800000000000004%" axis label
      // _tickNum was written for.
      const floaty = /\d\.\d{4,}/
      expect(floaty.test(r.down), `unrounded float in the change: ${r.down.match(floaty)}`).toBe(false)
      expect(floaty.test(r.up), 'unrounded float in the change').toBe(false)
      // And it must be an ABSOLUTE change in the user's unit, not a percentage - _deltaBadge exists but returns a percentage, which
      // would disagree with the Weight page.
      expect(r.down).toContain(unit)
      expect(r.down, 'the change must not be expressed as a percentage').not.toContain('%')
    })
  }

  // ── 4. Start must use the CLIENT'S CLONE template id ───────────────────────────────────────────────────────────
  test('the Today card\'s Start launches the clone template id, and the card itself is not a tap target', async ({ page }) => {
    const r = await page.evaluate(() => {
      const today = _ymdLocal(new Date())
      const day = tid => ({ ds: today, label: 'Sat', num: 3, today: true, kind: 'plan', done: [], planned: [{ workout_templates: { name: 'Upper A' }, _clientTemplateId: tid }] })
      const ctx = d => ({ role: 'solo', clientId: 'client-9', todayStr: today, days: [d], hasProgram: true, program: null, next: null })
      const dWith = day('CLONE-123'), dWithout = day(null)
      return { withClone: _dashHeroHtml(dWith, ctx(dWith)), noClone: _dashHeroHtml(dWithout, ctx(dWithout)) }
    })
    expect(r.withClone).toContain("startWorkoutRunner('client-9','CLONE-123')")
    // A mis-tap must never begin a real session (the runner writes a resume draft, so that is not free to undo): only the BUTTON
    // starts one, the section around it is not clickable.
    expect(r.withClone, 'the Today card is not itself a click target').not.toMatch(/<section[^>]*onclick/)
    // No clone id means no runnable template. Offering Start would launch the master phase-slot template, which is not what the
    // athlete's plan says: Workouts is where that session can be started.
    expect(r.noClone, 'no Start button without a clone id').not.toContain('startWorkoutRunner')
    expect(r.noClone).toContain('Open Workouts')
  })

  // ── 4b. The program and phase name the Today card (Jake, 2026-09-28: "'Current program' and 'next session' panels do the same thing") ─
  test('the Today card names the program above the session, and says nothing about one when there is none', async ({ page }) => {
    const r = await page.evaluate(() => {
      const today = _ymdLocal(new Date())
      const day = { ds: today, label: 'Sat', num: 3, today: true, kind: 'plan', done: [], planned: [{ workout_templates: { name: 'Upper A' }, _clientTemplateId: 'clone-1' }] }
      const ctx = (role, program) => ({ role, clientId: 'c1', todayStr: today, days: [day], hasProgram: !!program, program, next: null })
      return {
        solo: _dashHeroHtml(day, ctx('solo', { name: 'Hypertrophy Block' })),
        client: _dashHeroHtml(day, ctx('client', { name: 'Hypertrophy Block' })),
        none: _dashHeroHtml(day, ctx('solo', null)),
      }
    })
    expect(r.solo).toContain('Today · Hypertrophy Block')
    expect(r.client, 'a coached client is told what is "up next"').toContain('Up next · Hypertrophy Block')
    expect(r.none).toContain('>Today<')
    expect(r.solo.indexOf('Hypertrophy Block'), 'the program reads above the session name').toBeLessThan(r.solo.indexOf('Upper A'))
  })

  // ── 5. A periodised phase must resolve to the RIGHT week ───────────────────────────────────────────────────────
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
    // Without week_number in the query both rows land on every week and this collapses.
    expect(r.wk1, 'week 1 gets only its own session').toEqual(['Week1 Mon'])
    expect(r.wk2, 'week 2 gets only its own session - not week 1 repeated').toEqual(['Week2 Mon'])
    expect(r.clone, 'the clone id must be attached for Start').toBe('c-b')
  })

  // The test above feeds week_number in its FIXTURE, so it proves the resolver works while saying nothing about whether the dashboard
  // actually SELECTS that column. A source assertion is the honest guard for a query column: there is no behavioural way to see a
  // missing select without a periodised programme seeded on the live account. The read is _dashLoadOwn since the 2026-10-03 rework
  // (one loader for the solo AND client pages - the client's copy had been missing week_number and id).
  test('the dashboard query selects the columns the cards depend on', async ({ page }) => {
    const src = await page.evaluate(() => _dashLoadOwn.toString())
    // Isolate the client_programs query, so a week_number appearing in some OTHER select cannot satisfy this.
    const at = src.indexOf("from('client_programs')")
    expect(at, 'could not find the client_programs query').toBeGreaterThan(-1)
    const q = src.slice(at, at + 400)   // the query is one long line; 400 chars covers it
    expect(q, 'week_number: without it a periodised phase collapses onto week 1').toContain('week_number')
    expect(q, 'client_programs.id: without it the clone lookup cannot run, so Start has no template').toContain('id,')
    expect(src, 'the clone map must be fetched from client_program_workouts').toContain('client_program_workouts')
  })

  // ── 6. The chart must not leak across repaints ──────────────────────────────────────────────────────────────────
  // ORDERING GUARD. The behavioural version of this test below is VACUOUS on an account with no weigh-ins: _renderMetricChart only
  // runs when weights exist, so 'the count did not grow' is a pass over ZERO charts. This assertion always runs and always bites.
  test('_destroyManagedCharts runs, and runs BEFORE the innerHTML replace', async ({ page }) => {
    const src = await page.evaluate(() => _dashRenderOwn.toString())
    const destroy = src.indexOf('_destroyManagedCharts()')
    const paint = src.indexOf('el.innerHTML = `')
    expect(destroy, 'the dashboard render must destroy managed charts').toBeGreaterThan(-1)
    expect(paint, 'could not find the innerHTML replace').toBeGreaterThan(-1)
    // Order matters: this replaces the whole subtree, detaching the canvas. Both of _renderMetricChart's own guards then resolve
    // against the NEW element and miss the old instance, which lives on with its listeners and animation loop running. That is
    // bugs/2026-08-17-renderclientweight-leaks-a-chart-on-every-save, and this dashboard repaints on every write.
    expect(destroy, 'destroy must come BEFORE the repaint').toBeLessThan(paint)
  })

  test('repainting the dashboard does not accumulate live charts', async ({ page }) => {
    test.skip(!soloAvailable, 'No solo client record for this PT account')
    await page.evaluate(() => switchView('solo'))
    await expect(page.locator('#dash-root[data-dash="solo"]')).toBeVisible()
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
    // NON-ZERO DENOMINATOR. Without a weigh-in no chart is ever created and this proves nothing - say so out loud rather than
    // reporting a green that means 'there was nothing to leak'. (tests/dashboard-rework-2026-10-03.spec.js proves it with data.)
    test.skip(!r.everCharted, 'no weigh-ins on this account, so no chart is created - see the ordering guard above')
    expect(Math.max(...r.seen), 'live charts grew across repaints: ' + r.seen.join(',')).toBeLessThanOrEqual(1)
  })

  // ── 7. Empty states must render a card, not crash ───────────────────────────────────────────────────────────────
  test('every card has an empty state and none of them throws', async ({ page }) => {
    const r = await page.evaluate(() => {
      const today = _ymdLocal(new Date())
      const out = {}
      const day = { ds: today, label: 'Sat', num: 3, today: true, kind: 'rest', done: [], planned: [] }
      const ctx = { role: 'solo', clientId: 'c1', todayStr: today, days: [day], hasProgram: false, program: null, next: null }
      try { out.weight = _dashWeightHtml([]) } catch (e) { out.weightErr = String(e) }
      try { out.weightNull = _dashWeightHtml(null) } catch (e) { out.weightNullErr = String(e) }
      try { out.calendar = _dashCalendarHtml([], today) } catch (e) { out.calendarErr = String(e) }
      try { out.calendarNull = _dashCalendarHtml(null, today) } catch (e) { out.calendarNullErr = String(e) }
      try { out.goals = _dashGoalsHtml([], today, false) } catch (e) { out.goalsErr = String(e) }
      try { out.goalsNull = _dashGoalsHtml(null, today, false) } catch (e) { out.goalsNullErr = String(e) }
      try { out.hero = _dashHeroHtml(day, ctx) } catch (e) { out.heroErr = String(e) }
      try { out.tiles = _dashTilesHtml({ weeks: 0, capped: false }, null, true) } catch (e) { out.tilesErr = String(e) }
      try { out.week = _dashWeekHtml(_dashWeekDays(today, {}, []), { done: 0, planned: 0 }, null) } catch (e) { out.weekErr = String(e) }
      try { out.progNull = JSON.stringify(_programWorkoutsByDate(null, null)) } catch (e) { out.progErr = String(e) }
      return out
    })
    ;['weightErr', 'weightNullErr', 'calendarErr', 'calendarNullErr', 'goalsErr', 'goalsNullErr', 'heroErr', 'tilesErr', 'weekErr', 'progErr'].forEach(k =>
      expect(r[k], `${k} should not be set`).toBeUndefined())
    for (const k of ['weight', 'weightNull', 'calendar', 'calendarNull', 'goals', 'goalsNull']) expect(r[k], `${k} says it is empty`).toContain('dash-empty')
    expect(r.goals, 'an empty goals card still links through').toContain('_dashOpenGoals(false)')
    expect(r.weight, 'and so does an empty weight card').toContain('_dashOpenWeight()')
    expect(r.hero).toContain('Nothing planned')
    expect(r.tiles).toContain('None')
    // {} not null: callers iterate the result, and a null would move the failure into their loop.
    expect(r.progNull).toBe('{}')
  })

  // ── 8. The merged timeline: events AND programmed days, in date order ──────────────────────────────────────────
  test('the calendar timeline merges calendar events with programmed sessions', async ({ page }) => {
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
    // Date-ordered across BOTH sources - nothing in the app merged them before; renderCalendar keeps two separate maps and combines
    // them only visually inside a grid cell.
    expect(r).toEqual(['session:Upper A', 'event:Massage'])
    expect(r.join(','), 'a past session must not appear in "my calendar"').not.toContain('Old session')
  })

  // ── 9. Goals card + the goals route ────────────────────────────────────────────────────────────────────────────
  test('the goals card summarises, links to the goals page, and computes progress', async ({ page }) => {
    const r = await page.evaluate(() => {
      const today = _ymdLocal(new Date())
      const d = n => _ymdLocal(new Date(Date.now() + n * 86400000))
      const goals = [
        { id: 'g1', title: 'Bench 120kg', target_date: d(21), start_value: 100, current_value: 112, target_value: 120, goal_milestones: [] },
        { id: 'g2', title: 'Sub-20 5k', target_date: d(3), start_value: 24, current_value: 21.5, target_value: 20, goal_milestones: [] },
        { id: 'g3', title: 'No deadline', target_date: null, start_value: 0, current_value: 5, target_value: 10, goal_milestones: [] }
      ]
      // Where the card goes is a function, so check what it DOES: a solo user lands on the Goals page, a coached client (who has
      // no goals route) on Progress > Goals.
      const nav = []
      const realNav = window.navigate
      window.navigate = (p) => nav.push([p, window._progressTab || null])
      try { window._progressTab = null; _dashOpenGoals(false); _dashOpenGoals(true) } finally { window.navigate = realNav }
      return {
        nav,
        populated: _dashGoalsHtml(goals, today, false),
        client: _dashGoalsHtml(goals, today, true),
        empty: _dashGoalsHtml([], today, false),
        nullish: _dashGoalsHtml(null, today, false),
        pctRange: _goalPct(goals[0]),
        pctRatio: _goalPct({ current_value: 5, target_value: 10, goal_milestones: [] }),
        pctMilestones: _goalPct({ goal_milestones: [{ completed_at: 'x' }, { completed_at: null }] }),
        pctDivZero: _goalPct({ start_value: 10, current_value: 10, target_value: 10, goal_milestones: [] })
      }
    })
    expect(r.populated, 'the card opens the goals UI').toContain('_dashOpenGoals(false)')
    expect(r.client, 'and a coached client\'s card opens it their way').toContain('_dashOpenGoals(true)')
    expect(r.nav, 'solo: the Goals page; client: Progress, on its Goals tab').toEqual([['goals', null], ['progress', 'Goals']])
    expect(r.populated, 'headline count').toContain('<b>3</b> active')
    // Soonest deadline first, so the card shows what is actually due.
    expect(r.populated.indexOf('Sub-20 5k'), 'the nearer deadline must come first').toBeLessThan(r.populated.indexOf('Bench 120kg'))
    // A goal with no target_date sorts last but is still counted - not silently dropped.
    expect(r.populated).toContain('+1 more')
    expect(r.empty, 'empty state still links through').toContain('_dashOpenGoals(false)')
    expect(r.empty).toContain('dash-empty')
    expect(r.nullish, 'null must not throw').toContain('dash-empty')

    // 100 -> 112 of a 100..120 range is 60%, NOT 93% (112/120) - the start value matters.
    expect(r.pctRange, 'start->target range').toBe(60)
    expect(r.pctRatio, 'bare current/target ratio when there is no start').toBe(50)
    expect(r.pctMilestones, 'falls back to completed milestones').toBe(50)
    // Guards against divide-by-zero: start === target would otherwise render NaN%.
    expect(Number.isFinite(r.pctDivZero), 'start === target must not produce NaN').toBe(true)
  })

  // ── 9b. Personal bests are off the dashboard (Jake, 2026-10-03: Goals stay, Recent sessions and personal bests do not) ──
  // History worth keeping visible: the Benchmarks card became a "My progress" tile (2026-09-28), lost its +Log record form to the
  // Personal Bests page (2026-09-30), and is now gone from the dashboard altogether. The page that owns the records and their write
  // path is Personal Bests (tests/pb-consolidation-2026-08-17.spec.js proves it). This pins the dashboard side: it neither READS
  // performance_logs nor shows a records preview - tests/capped-api.js throws on a table it was not given, so a dashboard that still
  // read it would fail here rather than quietly pass.
  test('the dashboard no longer reads or shows personal bests - the Personal Bests page owns them', async ({ page }) => {
    await installCappedApi(page, { goals: [], events: [], weight_logs: [], client_programs: [], client_program_workouts: [], workout_logs: [] })
    try {
      const html = await page.evaluate(async () => {
        const prev = window._soloClientId
        window._soloClientId = 'solo-guard'
        try { const el = document.createElement('div'); document.body.appendChild(el); await renderSoloDashboard(el); return el.innerHTML } finally { window._soloClientId = prev }
      })
      expect(html, 'rendered (a read of an unknown table would have thrown)').toContain('dash-root')
      for (const gone of ['Log record', 'client-pb-form', 'Benchmarks', 'Personal bests', 'Recent sessions']) expect(html, `${gone} is not on the dashboard`).not.toContain(gone)
      expect((await cappedApiCalls(page)).map(c => c.table), 'no read of performance_logs').not.toContain('performance_logs')
    } finally { await restoreCappedApi(page) }
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
      // Every function in the goals module re-renders into #tab-content (openGoal, backToGoals, deleteGoal). Without that id present,
      // add/edit/delete would silently no-op after the first paint - the exact shape of the 2026-07-08 "+ Log weight" bug on the
      // Progress page.
      tabContent: !!document.getElementById('tab-content'),
      addBtn: !!document.querySelector('[onclick^="showAddGoalModal"]')
    }))
    expect(r.page).toBe('goals')
    expect(r.h1).toContain('Goals')
    expect(r.tabContent, '#tab-content must exist or the goals UI cannot re-render itself').toBe(true)
    expect(r.addBtn, 'a solo user must be able to CREATE a goal - they could not before this route').toBe(true)
  })

  // ── 10. The chart-destroy CLASS, not just the one new instance ──────────────────────────────────────────────────
  test('every chart entry point destroys managed charts first', async ({ page }) => {
    const src = await page.evaluate(async () => {
      const r = await fetch('/js/app-progress.js')
      return r.ok ? r.text() : ''
    })
    expect(src.length, 'could not read app-progress.js').toBeGreaterThan(1000)
    const lines = src.split(/\r?\n/)
    const callers = []

    // EXEMPT, each with a reason checked against the code - not a convenience list.
    // _destroyManagedCharts() destroys EVERY managed chart, so the rule is NOT "every caller must call it". It applies to callers that
    // REBUILD A SUBTREE CONTAINING OTHER CHARTS - full-page renders. In a caller that ADDS a chart beside existing ones, calling it
    // would destroy the others: a bug in the opposite direction, and exactly the guard-refuses-the-legitimate-user shape this
    // project keeps hitting. Each exemption below was read before being granted.
    const EXEMPT = {
      // Toggles a panel's display and renders into a canvas that PERSISTS in the DOM. Nothing is detached, and _renderMetricChart's
      // own Chart.getChart(el).destroy() already handles re-rendering into the same canvas. A blanket destroy would kill every
      // other open panel.
      togglePerfHistory: true,
      // Replaces only its OWN small container (container.innerHTML = '<canvas></canvas>'). A blanket destroy would take out siblings.
      // It DOES leak narrowly on repeated expand/collapse, but the correct fix is destroying the chart that was in THAT container -
      // filed as its own row rather than bent to fit this rule.
      _expandPerfSessionExercise: true,
      // The exercise stats card (2026-10-03). _xsRender rebuilds only ITS OWN host element, and calls _xsDestroyChart(host) on that
      // card's chart BEFORE replacing the host's HTML; _xsDraw then draws into the fresh canvas. A blanket destroy here would kill the
      // charts of every OTHER exercise card on the My progress page each time one card's measure pill is tapped. The full-list
      // render that does rebuild the whole page (_renderPerfExerciseList) calls _destroyManagedCharts() itself.
      _xsDraw: true
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
    expect(callers, 'these render a chart into a rebuilt DOM without destroying the previous one - '
      + 'both of _renderMetricChart\'s own guards resolve against the NEW canvas and miss the old '
      + 'instance, which lives on with its listeners and animation loop running').toEqual([])
  })

})
