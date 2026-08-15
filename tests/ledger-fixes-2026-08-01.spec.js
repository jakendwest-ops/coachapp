const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsPT2, loginAsClient, clickVisible } = require('./helpers')

// ─── #18 — navigate('programs') has no role re-guard for a client ────────────────────────────────
test.describe('navigate role re-guard (2026-07-18 finding)', () => {
  test('a client calling navigate(\'programs\') directly does not reach the builder', async ({ page }) => {
    await loginAsClient(page)
    await page.evaluate(() => navigate('programs'))
    await page.waitForTimeout(300)
    // Before the fix: renderPrograms() ran (RLS returned 0 rows, so "No programs yet" — no leak, but
    // the builder chrome itself, e.g. the "New program" button, still rendered for a client).
    await expect(page.locator('button:has-text("New program")')).not.toBeVisible()
  })
})

// ─── #20 — viewport blocks pinch-to-zoom ──────────────────────────────────────────────────────────
test.describe('viewport allows pinch-to-zoom (2026-07-17 accessibility finding)', () => {
  test('the viewport meta tag does not set maximum-scale', async ({ page }) => {
    await page.goto('/')
    const content = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(content).not.toContain('maximum-scale')
    expect(content).not.toContain('user-scalable=no')
  })
})

// ─── #15 — week-tab labels show a sequential 1..N, not the raw (possibly non-contiguous) week_number ──
test.describe('week-tab labels are sequential, not raw week_number (2026-07-19 finding)', () => {
  test('Programs builder: a phase with week_number 2,3 (skipping 1) shows WEEK 1 / WEEK 2', async ({ page }) => {
    await loginAsPT(page)
    // Fixture setup lives INSIDE try/finally, not before it -- if any insert here throws (schema
    // drift, a transient hiccup), cleanup below still runs instead of leaving orphaned [E2E] rows.
    let setup = {}
    try {
      setup = await page.evaluate(async () => {
        const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, is_personal: false, name: '[E2E] Week-Label Program' }).select('id').single()
        const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 2, order_index: 0 }).select('id').single()
        const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: '[E2E] Week-Label Session' }).select('id').single()
        // Non-contiguous by design -- this is the exact real-world shape reported (a phase whose rows
        // carry week_number 2 and 3, skipping 1), not a synthetic edge case.
        await db.from('program_phase_workouts').insert([
          { phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 2 },
          { phase_id: phase.id, day_of_week: 2, day_label: 'Tuesday', session_order: 1, template_id: tmpl.id, week_number: 3 },
        ])
        return { programId: prog.id, phaseId: phase.id, templateId: tmpl.id }
      })

      await clickVisible(page, '[data-page="programs"]')
      await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
      await page.evaluate((programId) => openProgram(programId), setup.programId)
      await page.waitForSelector(`.week-tab[data-phase="${setup.phaseId}"][data-week="3"]`, { timeout: 8000 })

      const firstTabText = await page.locator(`.week-tab[data-phase="${setup.phaseId}"][data-week="2"]`).innerText()
      const secondTabText = await page.locator(`.week-tab[data-phase="${setup.phaseId}"][data-week="3"]`).innerText()
      expect(firstTabText.replace(/\s+/g, '')).toBe('WEEK1')
      expect(secondTabText.replace(/\s+/g, '')).toBe('WEEK2')
    } finally {
      // FK-safe order (program_phase_workouts -> program_phases -> workout_templates -> programs),
      // matching tests/helpers.js's sweepPT2 convention -- relying on a cascade-via-parent-delete is
      // not this project's established pattern, and isn't assumed here either.
      if (setup.phaseId) await page.evaluate(async (phaseId) => { await db.from('program_phase_workouts').delete().eq('phase_id', phaseId) }, setup.phaseId).catch(() => {})
      if (setup.phaseId) await page.evaluate(async (phaseId) => { await db.from('program_phases').delete().eq('id', phaseId) }, setup.phaseId).catch(() => {})
      if (setup.templateId) await page.evaluate(async (templateId) => { await db.from('workout_templates').delete().eq('id', templateId) }, setup.templateId).catch(() => {})
      if (setup.programId) await page.evaluate(async (programId) => { await db.from('programs').delete().eq('id', programId) }, setup.programId).catch(() => {})
    }
  })

  test('client Workouts read page: an assigned phase with week_number 2,3 shows WEEK 1 / WEEK 2', async ({ page }) => {
    await loginAsPT(page)
    const soloAvailable = await page.waitForFunction(() => !!window._soloClientId, null, { timeout: 5000 }).then(() => true).catch(() => false)
    test.skip(!soloAvailable, 'No solo client record for this PT account')

    let setup = {}
    try {
      await page.evaluate(() => switchView('solo'))
      await page.waitForTimeout(500)

      setup = await page.evaluate(async () => {
        const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, is_personal: true, name: '[E2E] Read-Week-Label Program' }).select('id').single()
        const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 2, order_index: 0 }).select('id').single()
        const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, is_personal: true, name: '[E2E] Read-Week-Label Session' }).select('id').single()
        const { data: pw1 } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 2 }).select('id').single()
        const { data: pw2 } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 2, day_label: 'Tuesday', session_order: 1, template_id: tmpl.id, week_number: 3 }).select('id').single()

        const { data: clone1 } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: window._soloClientId, is_personal: true, name: '[E2E] Read-Week-Label Session' }).select('id').single()
        const { data: clone2 } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: window._soloClientId, is_personal: true, name: '[E2E] Read-Week-Label Session' }).select('id').single()
        const { data: cp } = await db.from('client_programs').insert({ client_id: window._soloClientId, program_id: prog.id }).select('id').single()
        await db.from('client_program_workouts').insert([
          { client_program_id: cp.id, program_phase_workout_id: pw1.id, workout_template_id: clone1.id, week_number: 2 },
          { client_program_id: cp.id, program_phase_workout_id: pw2.id, workout_template_id: clone2.id, week_number: 3 },
        ])
        return { programId: prog.id, phaseId: phase.id, templateId: tmpl.id, clientProgramId: cp.id, cloneIds: [clone1.id, clone2.id] }
      })

      await clickVisible(page, '[data-page="workouts"]')
      await page.waitForSelector('.week-tab[data-week="3"]', { timeout: 8000 })

      const firstTabText = await page.locator('.week-tab[data-week="2"]').first().innerText()
      const secondTabText = await page.locator('.week-tab[data-week="3"]').first().innerText()
      expect(firstTabText.replace(/\s+/g, '')).toBe('WEEK1')
      expect(secondTabText.replace(/\s+/g, '')).toBe('WEEK2')
    } finally {
      // FK-safe order, same convention as the sibling test above: client_program_workouts ->
      // client_programs -> the two clone templates, then program_phase_workouts -> program_phases ->
      // the master template -> programs. Every step guarded so a partial setup failure still cleans
      // up whatever DID get created, and the role switch back to 'coach' always runs last.
      if (setup.clientProgramId) await page.evaluate(async (id) => { await db.from('client_program_workouts').delete().eq('client_program_id', id) }, setup.clientProgramId).catch(() => {})
      if (setup.clientProgramId) await page.evaluate(async (id) => { await db.from('client_programs').delete().eq('id', id) }, setup.clientProgramId).catch(() => {})
      for (const id of (setup.cloneIds || [])) await page.evaluate(async (cloneId) => { await db.from('workout_templates').delete().eq('id', cloneId) }, id).catch(() => {})
      if (setup.phaseId) await page.evaluate(async (phaseId) => { await db.from('program_phase_workouts').delete().eq('phase_id', phaseId) }, setup.phaseId).catch(() => {})
      if (setup.phaseId) await page.evaluate(async (phaseId) => { await db.from('program_phases').delete().eq('id', phaseId) }, setup.phaseId).catch(() => {})
      if (setup.templateId) await page.evaluate(async (templateId) => { await db.from('workout_templates').delete().eq('id', templateId) }, setup.templateId).catch(() => {})
      if (setup.programId) await page.evaluate(async (programId) => { await db.from('programs').delete().eq('id', programId) }, setup.programId).catch(() => {})
      await page.evaluate(() => switchView('coach')).catch(() => {})
    }
  })
})

// ─── #8 — Chart.js instances leak when switching Progress top-level tabs / Performance sub-tabs ──
test.describe('Chart.js instances are destroyed on tab switch, not just on same-view re-render (2026-07-23 finding)', () => {
  test('renderProgress destroys every live Chart instance before a top-level tab switch', async ({ page }) => {
    // 'progress' ("My Progress") is a client/solo-only page -- a bare coach role has no nav entry for
    // it at all (not in coachPages, js/app-core.js), so this must log in as the client role.
    await loginAsClient(page)
    await clickVisible(page, '[data-page="progress"]')
    await page.waitForSelector('h1:has-text("My Progress")', { timeout: 8000 })

    // Push a REAL Chart.js instance into each array directly, on a synthetic canvas, rather than
    // depending on the full metrics/aggregation pipeline (metric_type filters, the `agg.length < 2`
    // guard, the active date range) just to get a chart to exist -- this isolates exactly what the
    // finding is about: does a container-level tab switch call .destroy() on whatever was active,
    // not whether a particular exercise's data happens to be chartable today.
    // REWRITTEN 2026-08-15. This asserted on `_perfExerciseCharts` / `_perfSessionCharts`, two of the
    // THREE chart registries that existed before the charts were unified behind _renderMetricChart.
    // Those arrays are gone, so the old version threw ReferenceError — it was testing the BOOKKEEPING
    // rather than the invariant. The invariant is unchanged and is what this now asserts: switching
    // top-level Progress tab must DESTROY whatever charts were live, because renderProgress replaces
    // the container with innerHTML and a detached canvas whose Chart was never destroyed keeps its
    // listeners and animation loop. Asserting via Chart.getChart(canvas) is registry-agnostic, so the
    // next refactor of the teardown mechanism cannot make this test lie.
    const before = await page.evaluate(() => {
      const mk = id => {
        const canvas = document.createElement('canvas')
        canvas.id = id
        document.body.appendChild(canvas)
        // Through the real helper, so this exercises whatever tracking the app actually uses.
        _renderMetricChart(canvas, { labels: ['a', 'b'], series: [{ data: [1, 2] }] })
        return id
      }
      const ids = [mk('zz-teardown-a'), mk('zz-teardown-b')]
      return { ids, alive: ids.filter(i => !!Chart.getChart(document.getElementById(i))).length }
    })
    expect(before.alive, 'both fixtures must actually be live before the switch').toBe(2)

    // Switch to a different top-level Progress tab -- this used to blow #main-content away with
    // innerHTML without ever calling .destroy() on whichever chart array was active for the
    // sub-view the user was just on.
    await page.evaluate(() => { window._progressTab = 'Body Weight'; renderProgress(document.getElementById('main-content')) })
    await page.waitForTimeout(500)

    const after = await page.evaluate(ids => {
      const alive = ids.filter(i => !!Chart.getChart(document.getElementById(i))).length
      ids.forEach(i => document.getElementById(i)?.remove())
      return { alive }
    }, before.ids)
    expect(after.alive, 'a tab switch must destroy every chart that was live, not just empty a list').toBe(0)
  })
})

// ─── #19 — behaviourally probe the exercises INSERT policy as a client, not a different coach ──────
test.describe('exercises INSERT policy — a client cannot plant an exercise under an unrelated coach (2026-07-13 finding)', () => {
  test('a client-authored exercises insert stamped with an unrelated coach_id is rejected', async ({ browser }) => {
    const pt2Ctx = await browser.newContext()
    const clientCtx = await browser.newContext()
    const pt2Page = await pt2Ctx.newPage()
    const clientPage = await clientCtx.newPage()

    try {
      await loginAsPT2(pt2Page)
      const pt2Id = await pt2Page.evaluate(() => currentUser.id)

      await loginAsClient(clientPage)
      const tag = '[E2E] client-exercises-insert-probe ' + Date.now()
      const result = await clientPage.evaluate(async ({ unrelatedCoachId, name }) => {
        const { data, error } = await db.from('exercises').insert({ coach_id: unrelatedCoachId, name, metric_type: 'weight_reps' }).select('id').single()
        return { insertedId: data?.id || null, errorMessage: error?.message || null }
      }, { unrelatedCoachId: pt2Id, name: tag })

      // Do NOT trust the client-side representation alone: `.insert().select()` is a write followed
      // by an RLS-gated READ of the just-written row (INSERT policy vs. SELECT policy are separate).
      // If the INSERT actually succeeded but the client's own SELECT policy can't see PT2's exercise
      // library, `data` would come back empty here too -- a false negative that looks identical to a
      // genuinely rejected insert. Independently confirm from PT2's OWN session (which legitimately
      // owns coach_id = unrelatedCoachId and can always see its own exercises) whether the row exists
      // at all, regardless of what the client's side reported.
      const plantedFromPT2 = await pt2Page.evaluate(async (name) => {
        const { data } = await db.from('exercises').select('id').eq('coach_id', currentUser.id).eq('name', name).maybeSingle()
        return data?.id || null
      }, tag)

      if (plantedFromPT2) await pt2Page.evaluate(async (id) => { await db.from('exercises').delete().eq('id', id) }, plantedFromPT2).catch(() => {})

      expect(result.insertedId, 'client-side insert should have been rejected').toBeNull()
      expect(plantedFromPT2, 'a client must not be able to plant an exercises row under an unrelated coach_id, even if it were invisible to the client\'s own reads').toBeNull()
    } finally {
      await pt2Ctx.close().catch(() => {})
      await clientCtx.close().catch(() => {})
    }
  })
})
