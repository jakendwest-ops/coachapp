const { test, expect } = require('./fixtures')
const { loginAsClient, loginAsPT, clickVisible } = require('./helpers')

test.describe('Progress page regressions (2026-07-05)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page)
  })

  test('cardio set formatting in session-detail no longer renders blank fields', async ({ page }) => {
    // Exercises the exact branch added to openSessionDetail's set-line builder —
    // same lightweight pattern as the existing "Timed set render regression" tests.
    const result = await page.evaluate(() => {
      const s = { isDistanceBased: false, duration: '25:00', pace500Min: '2:00', pace500Max: '2:05', hrZoneMin: '140', hrZoneMax: '160' }
      const paceStr   = (s.pace500Min || s.pace500Max) ? `${s.pace500Min||'?'}–${s.pace500Max||'?'}/500m` : null
      const paceKmStr = (s.paceKmMin  || s.paceKmMax)  ? `${s.paceKmMin||'?'}–${s.paceKmMax||'?'}/km`   : null
      const strokeStr = (s.strokeRateMin || s.strokeRateMax) ? `${s.strokeRateMin||'?'}–${s.strokeRateMax||'?'} spm` : null
      const hrStr     = (s.hrZoneMin || s.hrZoneMax) ? `HR ${s.hrZoneMin||'?'}–${s.hrZoneMax||'?'}` : null
      const restHrStr = s.restHrMax ? `rest HR <${s.restHrMax}` : null
      const durStr    = s.duration ? Math.floor((parseRest(s.duration)||0) / 60) + ':' + String((parseRest(s.duration)||0) % 60).padStart(2, '0') : null
      const distStr   = s.distance ? s.distance + ' km' : null
      const parts = s.isDistanceBased
        ? [distStr, paceStr || paceKmStr, strokeStr, hrStr, restHrStr]
        : [durStr, paceStr || paceKmStr, strokeStr, hrStr, restHrStr]
      return parts.filter(Boolean).join(' · ') || '—'
    })
    expect(result).not.toBe('—')
    expect(result).toContain('25:00')
    expect(result).toContain('2:00–2:05/500m')
    expect(result).toContain('HR 140–160')
  })

  test('Add 1RM modal uses the styled .modal class, not the undefined .modal-box', async ({ page }) => {
    // Prefill an exercise name (2026-07-06 picker rewrite: a bare showAdd1RMModal(cid) with no
    // prefill now opens the exercise picker first, not this modal directly — passing a prefill
    // matches the "+ Update" button's call shape and isolates this test to the .modal CSS check).
    await page.evaluate(async () => {
      const cid = await _getCurrentClientId()
      showAdd1RMModal(cid, 'Playwright Test Exercise')
    })

    const box = page.locator('#modal-1rm .modal')
    await expect(box).toBeVisible({ timeout: 3000 })
    await expect(page.locator('#modal-1rm .modal-box')).toHaveCount(0)
    // .modal has a real background + border-radius; an unstyled div would compute transparent/0
    const bg = await box.evaluate(el => getComputedStyle(el).backgroundColor)
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
  })
})

test.describe('Progress page bug fixes (2026-07-08)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page)
  })

  test('Body Weight "Starting" tile prefers the starting_weight_kg goal field over the earliest logged entry (regression)', async ({ page }) => {
    // Isolates the exact value-selection logic added to renderProgressWeight — entering a
    // starting-weight goal used to have zero visible effect on this tile, since it always read
    // the earliest weight_logs row instead.
    const result = await page.evaluate(() => {
      const startingWeightKg = 95.5
      const first = { weight_kg: 88 }
      const effectiveStarting = startingWeightKg ?? first.weight_kg
      return effectiveStarting
    })
    expect(result).toBe(95.5)
  })

  test('Body Weight Y-axis clamp activates with only ONE of starting/goal weight set (regression — previously required both)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const goalWeightKg = null
      const startingWeightKg = 90
      const loggedWeights = [82, 84, 86]
      const anchors = [goalWeightKg, startingWeightKg, ...loggedWeights].filter(v => v != null)
      return (goalWeightKg != null || startingWeightKg != null)
        ? { min: Math.floor(Math.min(...anchors) * 2) / 2, max: Math.ceil((Math.max(...anchors) + 1) * 2) / 2 }
        : {}
    })
    // Previously this would have been {} (no clamp) since goalWeightKg was null — now it
    // must span at least up to the entered starting weight, not just the logged data range.
    expect(result.max).toBeGreaterThanOrEqual(90)
    expect(result.min).toBeLessThanOrEqual(82)
  })

  test('"Log weight" button on the Body Weight tab actually opens the form (regression — was wired to a Dashboard-only DOM node)', async ({ page }) => {
    await clickVisible(page, '[data-page="progress"]')
    await page.waitForTimeout(500)
    await page.evaluate(() => { window._progressTab = 'Body Weight'; renderProgress(document.getElementById('main-content')) })
    await page.waitForTimeout(500)
    const form = page.locator('#client-weight-form')
    await expect(form).toBeAttached()
    await expect(form).toBeHidden()
    await page.click('button:has-text("+ Log weight")')
    await expect(form).toBeVisible({ timeout: 3000 })
    // Form must have somewhere to actually write the entry — these inputs used to only exist
    // on the Dashboard page, never on Progress, so the button previously did nothing at all.
    await expect(page.locator('#cwf-date')).toBeVisible()
    await expect(page.locator('#cwf-weight')).toBeVisible()
  })
})

test.describe('Performance / Personal Bests restructure (2026-07-08)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page)
  })

  test('Progress tabs are Body Weight / Personal Bests / Performance / Goals — neither Cardio nor Benchmarks is a tab', async ({ page }) => {
    await clickVisible(page, '[data-page="progress"]')
    await page.waitForTimeout(500)
    await expect(page.locator('h1')).toContainText('My Progress')
    await expect(page.locator('button:has-text("Body Weight")')).toBeVisible()
    await expect(page.locator('button:has-text("Personal Bests")')).toBeVisible()   // the 1RM tab, renamed 2026-08-17
    await expect(page.locator('button', { hasText: /^Benchmarks$/ })).toHaveCount(0) // deleted 2026-09-19
    await expect(page.locator('button:has-text("Performance")')).toBeVisible()
    await expect(page.locator('button', { hasText: /^Goals$/ })).toBeVisible()      // added 2026-09-29, own tab instead of dashboard-tile-only
    await expect(page.locator('button', { hasText: /^1RMs$/ })).toHaveCount(0)      // gone 2026-08-17
    // Exact-text match on any button, page-wide — "Cardio bests" is a heading div, not a button,
    // so this can't false-pass against Personal Bests' new sub-section label.
    await expect(page.locator('button', { hasText: /^Cardio$/ })).toHaveCount(0)
  })

  test('Goals tab (2026-09-29) renders the real renderClientGoals view, not a placeholder', async ({ page }) => {
    // Jake: "'Goals' does not have its own page." A `goals` route already existed (2026-08-30) but was
    // reachable only from the dashboard tile. This makes it a tab here too, reusing renderClientGoals —
    // the same function that route already calls — rather than a second implementation of goal rendering.
    // Not awaited (renderProgress is async) and no manual sleep after: the chip-row itself paints
    // synchronously before renderProgress's first internal await, so the first expect below can
    // already find it; both expects poll for the rest, same as Phase 2's real-wait direction.
    await page.evaluate(() => { window._progressTab = 'Goals'; renderProgress(document.getElementById('main-content')) })
    await expect(page.locator('.chip-row .chip', { hasText: 'Goals' })).toHaveAttribute('aria-selected', 'true')
    // "+ Add goal" only exists in renderClientGoals' own output — its presence here is proof this tab
    // actually mounted that function into #progress-tab-content, not just showing a "Coming soon" shell.
    await expect(page.locator('#progress-tab-content button:has-text("+ Add goal")')).toBeVisible({ timeout: 3000 })
  })

  test('Goals tab (2026-09-29): opening a goal from here actually opens it, not a dead click', async ({ page, browser }) => {
    // Found by review: renderClientGoals' own children (openGoal, deleteGoal, saveNewGoal, backToGoals,
    // milestone/check-in modals) all hardcode document.getElementById('tab-content') to repaint
    // themselves — the id the `goals` route and the coach's client-profile Goals tab both already
    // provide. The first version of this branch left that id missing from #progress-tab-content, so a
    // goal tap here silently did nothing (openGoal threw on a null el, swallowed as an unhandled
    // rejection with no visible error). This proves the fix: the branch now wraps its host in the id
    // renderClientGoals' children actually look for.
    const TAG = '[E2E] Progress tab goal-open check'
    // Goals RLS requires the COACH as created_by (tests/goal-ownership-2026-08-21.spec.js's own fixture
    // — a client inserting their own goal directly is refused, by design: the coach sets goals, the
    // client tracks progress). Insert as PT in a separate context; the client's own `page` never sees a
    // service key it doesn't have.
    const ptCtx = await browser.newContext()
    let goalId = null
    try {
      const ptPage = await ptCtx.newPage()
      await loginAsPT(ptPage)
      const clientId = await page.evaluate(async () => await _getCurrentClientId())
      expect(clientId, 'the E2E client must have a clients row').not.toBeNull()
      goalId = await ptPage.evaluate(async ({ title, cid }) => {
        const { data, error } = await db.from('goals').insert({
          client_id: cid, created_by: currentUser.id, title,
          goal_type: 'custom', priority: 1, status: 'active',
        }).select('id').single()
        if (error) throw new Error(error.message)
        return data.id
      }, { title: TAG, cid: clientId })
    } finally { await ptCtx.close().catch(() => {}) }
    expect(goalId, 'fixture goal must exist').not.toBeNull()

    try {
      await page.evaluate(() => { window._progressTab = 'Goals'; renderProgress(document.getElementById('main-content')) })
      await expect(page.locator('#progress-tab-content .card', { hasText: TAG })).toBeVisible({ timeout: 3000 })
      await page.locator('#progress-tab-content .card', { hasText: TAG }).click()
      // .back-btn "All goals" only exists in openGoal's own detail-view output — its presence proves
      // openGoal actually painted into a real element, not a dead click against a null #tab-content.
      await expect(page.locator('.back-btn', { hasText: 'All goals' })).toBeVisible({ timeout: 3000 })
    } finally {
      // Owner-side cleanup (PT context again — client cannot delete a coach-owned goal, same RLS shape
      // as the insert above), name-anchored so a failed assertion above still can't strand the fixture.
      const cleanupCtx = await browser.newContext()
      try {
        const ptPage = await cleanupCtx.newPage()
        await loginAsPT(ptPage)
        await ptPage.evaluate(async (title) => {
          // .select() + rowcount: an RLS-refused delete returns { data: [], error: null } — it looks
          // exactly like one that worked. Same convention as goal-ownership-2026-08-21.spec.js.
          const { data: gone } = await db.from('goals').delete().eq('created_by', currentUser.id).eq('title', title).select('id')
          if ((gone || []).length !== 1) console.error('CLEANUP INCOMPLETE: expected to reap 1 goal, reaped', (gone || []).length)
        }, TAG)
      } finally { await cleanupCtx.close().catch(() => {}) }
    }
  })

  test('a stale "Benchmarks" tab value lands on Personal Bests: 1RM grid mounts, Cardio-bests stays gone (removed 2026-07-19)', async ({ page }) => {
    await page.evaluate(() => { window._progressTab = 'Benchmarks'; renderProgress(document.getElementById('main-content')) })
    await page.waitForTimeout(800)
    await expect(page.locator('#pb-1rms-section')).toHaveCount(1)
    await expect(page.locator('#pb-cardio-section')).toHaveCount(0)
    await expect(page.locator('text=Cardio bests')).toHaveCount(0)
    await expect(page.locator('#client-pb-form')).toHaveCount(0)   // the records form went with the tab
  })

  test('Performance tab shows "Per exercise" / "Per session" sub-tabs (Per exercise default), not the old "1RMs" / "Progressions"', async ({ page }) => {
    await page.evaluate(() => { window._perfTab = undefined; window._progressTab = 'Performance'; renderProgress(document.getElementById('main-content')) })
    await page.waitForTimeout(800)
    await expect(page.locator('button:has-text("Per exercise")')).toBeVisible()
    await expect(page.locator('button:has-text("Per session")')).toBeVisible()
    // Scoped to #progress-tab-content, where renderPerformance draws its SUB-tabs. It was a page-wide
    // match until 2026-08-14, when 1RMs became a top-level Progress tab carrying the same label —
    // which made this fail on a button the test was never about. The claim is "the Performance
    // sub-tabs are no longer 1RMs/Progressions", so the assertion has to live inside that row.
    await expect(page.locator('#progress-tab-content button:has-text("1RMs")')).toHaveCount(0)
    await expect(page.locator('#progress-tab-content button:has-text("Progressions")')).toHaveCount(0)
  })

  test('P1-P4 (2026-09-07): range is a select on the toolbar, pill rows scroll, 1RM date/estimate collapse', async ({ page }) => {
    // renderProgress is async through its sub-renders — returning the promise makes page.evaluate
    // await the whole chain, so no fixed sleep is needed before the assertions.
    const render = () => page.evaluate(() => renderProgress(document.getElementById('main-content')))

    // P1 — the trend range is a <select> on the Performance toolbar, shown only for "Per exercise",
    //      and it drives window._trendState.range.
    await page.evaluate(() => { window._perfTab = 'Per exercise'; window._progressTab = 'Performance' })
    await render()
    await expect(page.locator('#perf-range')).toBeVisible()
    await expect(page.locator('#trend-range-row')).toHaveCount(0)     // the old pill row is gone
    await page.selectOption('#perf-range', '3M')
    expect(await page.evaluate(() => window._trendState.range)).toBe('3M')
    await page.evaluate(() => { window._perfTab = 'Per session' })
    await page.evaluate(() => renderPerformance(document.getElementById('progress-tab-content')))
    await expect(page.locator('#perf-range')).toHaveCount(0)          // not meaningful on Per session

    // P2 — the top Progress tabs are a no-wrap scroll row; the active one is scrolled into view.
    // 2026-09-19: with the Benchmarks tab gone the chips barely overflowed a 390px row, so the active
    // chip could land in view WITHOUT any scrolling and this passed vacuously (still true with the
    // Goals tab added 2026-09-29 — more chips only widens the row further). A 320px viewport restores
    // the overflow this assertion was written for; the viewport goes back to 390x844 straight after.
    await page.setViewportSize({ width: 320, height: 700 })
    await page.evaluate(() => { window._progressTab = 'Performance' })
    await render()
    const p2 = await page.evaluate(() => {
      const row = document.querySelector('.chip-row')
      const active = document.querySelector('.chip-row .chip[aria-selected="true"]')
      const r = active.getBoundingClientRect()
      return { nowrap: getComputedStyle(row).flexWrap === 'nowrap', activeText: active.textContent.trim(), scrolled: row.scrollLeft > 0, inView: r.left >= -1 && r.right <= window.innerWidth + 1 }
    })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(p2.nowrap).toBe(true)
    expect(p2.activeText).toBe('Performance')
    expect(p2.scrolled, 'the row overflows at 320px, so the active tab can only be in view if it was scrolled there').toBe(true)
    expect(p2.inView).toBe(true)

    // P4 — a 1RM row's date + estimate controls are hidden until the value input is focused.
    await page.evaluate(() => { window._progressTab = 'Personal Bests' })
    await render()
    await expect(page.locator('#orm-more-0')).toBeHidden()
    await expect(page.locator('#orm-more-1')).toBeHidden()
    await page.locator('#orm-0').focus()
    await expect(page.locator('#orm-more-0')).toBeVisible()
    await expect(page.locator('#orm-more-1')).toBeHidden()            // only the focused row expands
    // the hidden date input still carries today's default — which is what saveOneRMGrid reads
    expect(await page.locator('#orm-date-1').inputValue()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('P3 (2026-09-07): Body Weight collapses the goals editor to a one-line summary once both are set', async ({ page }) => {
    const cid = await page.evaluate(async () => {
      const { data } = await db.from('clients').select('id, starting_weight_kg, goal_weight_kg').eq('user_id', currentUser.id)
      window.__wgPrev = { s: data[0].starting_weight_kg, g: data[0].goal_weight_kg }
      await db.from('clients').update({ starting_weight_kg: 90, goal_weight_kg: 82 }).eq('id', data[0].id)
      return data[0].id
    })
    try {
      await page.evaluate(() => { window._progressTab = 'Body Weight' })
      await page.evaluate(() => renderProgress(document.getElementById('main-content')))
      await expect(page.getByText(/Start\s+90/).first()).toBeVisible()   // the summary line
      await expect(page.locator('#wg-editor')).toBeHidden()              // full editor collapsed
      await page.locator('button:has-text("Edit")').first().click()
      await expect(page.locator('#wg-editor')).toBeVisible()
      await expect(page.locator('#wg-starting')).toBeVisible()
    } finally {
      await page.evaluate(async (id) => {
        await db.from('clients').update({ starting_weight_kg: window.__wgPrev.s, goal_weight_kg: window.__wgPrev.g }).eq('id', id)
      }, cid)
    }
  })

  test('Performance > Per exercise search filters the trend-card list without a DB re-fetch (live-filter logic)', async ({ page }) => {
    const result = await page.evaluate(() => {
      window._trendCache = [
        { name: 'Back Squat', metricType: 'weight_reps', sessions: [{ date: '2026-01-01', sets: [{ weight_kg: 100, reps_achieved: 5 }] }] },
        { name: 'Bench Press', metricType: 'weight_reps', sessions: [{ date: '2026-01-01', sets: [{ weight_kg: 60, reps_achieved: 5 }] }] }
      ]
      window._trendState = { range: 'All', metricByEx: {} }
      const div = document.createElement('div')
      div.id = 'perf-ex-list'
      document.body.appendChild(div)
      _renderPerfExerciseList('bench')
      const html = document.getElementById('perf-ex-list').innerHTML
      document.body.removeChild(div)
      return html
    })
    expect(result).toContain('Bench Press')
    expect(result).not.toContain('Back Squat')
  })

  test('Workouts page no longer shows a standalone "Your 1RMs" section (moved into Personal Bests)', async ({ page }) => {
    await clickVisible(page, '[data-page="workouts"]')
    await page.waitForTimeout(1500)
    await expect(page.locator('text=Your 1RMs')).toHaveCount(0)
  })
})
