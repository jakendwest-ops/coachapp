const { test, expect } = require('@playwright/test')
const { loginAsPT, clickVisible } = require('./helpers')

// 2026-08-09 — Jake: "having cardio and intervals as 2 separate categories is redundant and intervals
// should be the only 1." Confirmed live: he's never prescribed varied-length rounds (a plain steady effort
// or a uniform repeated work/rest pattern covers every real use), and he wants to keep manual/no-timer
// logging for the simple case. Fix: 'cardio' is no longer a selectable metric_type in the builder — a
// "Steady effort / Repeating" toggle on the interval block editor (derived from sets:1&cycles:1, not a new
// sets_json key) keeps the simple case as easy to prescribe as plain Cardio used to be, and the runner's
// manual LOG path (previously gated to non-interval only) now also covers a steady-effort interval block.
// See tests/builder-metric-type.spec.js for the still-valid legacy-cardio-shape rendering coverage
// (renderTemplateSets keeps its isCardio branch for historical/unmigrated rows) and
// tests/clone-metric-type.spec.js for clone-path fidelity (unaffected — a verbatim value copy).

test.describe('Cardio/Interval merge — builder', () => {
  test('cardio is no longer a selectable metric_type; a legacy cardio row lands on Intervals, not Weight & reps', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      document.getElementById('edit-tex-modal')?.remove()
      document.getElementById('add-to-template-modal')?.remove()
      _showExerciseSetsModal({
        targetId: 'fake-template-id', runnerCtx: null, coachId: 'fake-coach-id',
        picked: { name: 'Test Ex', id: null }, editingTexId: null,
        existingSets: [{}], existingType: 'weight_reps', existingNotes: '', existingSuperset: ''
      })
      const values = [...document.getElementById('att-type').options].map(o => o.value)
      document.getElementById('add-to-template-modal')?.remove()

      // A legacy row still carrying metric_type='cardio' (not yet migrated) must select Intervals on
      // open, not silently fall through to Weight & reps and get reclassified on the next save.
      _showExerciseSetsModal({
        targetId: 'fake-template-id', runnerCtx: null, coachId: 'fake-coach-id',
        picked: { name: 'Legacy Cardio Ex', id: null }, editingTexId: 'fake-tex-id',
        existingSets: [{}], existingType: 'cardio', existingNotes: '', existingSuperset: ''
      })
      const legacySelected = document.getElementById('att-type').value
      document.getElementById('edit-tex-modal')?.remove()
      return { values, legacySelected }
    })
    expect(r.values).not.toContain('cardio')
    expect(r.values).toContain('interval')
    expect(r.legacySelected).toBe('interval')
  })

  // Found by multi-agent-review (Agent B, 2026-08-09): the Type <select> correctly showed "Intervals"
  // selected for a legacy row, but the initial renderTemplateSets call still passed the literal
  // existingType ('cardio') straight through — a label/fields mismatch, the dropdown said Intervals
  // while the OLD per-set cardio editor (Duration/Distance rows) rendered underneath it.
  test('reopening a legacy cardio row renders the interval block editor, not the old per-set cardio editor', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      document.getElementById('edit-tex-modal')?.remove()
      _showExerciseSetsModal({
        targetId: 'fake-template-id', runnerCtx: null, coachId: 'fake-coach-id',
        picked: { name: 'Legacy Cardio Ex', id: null }, editingTexId: 'fake-tex-id',
        existingSets: [{ duration: '20:00', restMin: '1:00' }], existingType: 'cardio',
        existingNotes: '', existingSuperset: ''
      })
      const out = {
        hasIntervalWorkField: !!document.getElementById('ts-worksecs-0'),
        hasOldCardioDurationField: !!document.getElementById('ts-duration-0'),
        hasEffortToggle: document.body.innerText.includes('Steady effort'),
      }
      document.getElementById('edit-tex-modal')?.remove()
      return out
    })
    expect(r.hasIntervalWorkField).toBe(true)
    expect(r.hasOldCardioDurationField).toBe(false)
    expect(r.hasEffortToggle).toBe(true)
  })

  test('a fresh interval block defaults to Steady effort (sets:1/cycles:1/restSecs:0)', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) } return e }
      mk('att-type', 'select'); mk('att-sets-container', 'div')
      window._templateSets = [{}]
      renderTemplateSets('att-sets-container', 'interval')
      return {
        sets: document.getElementById('ts-sets-0').value,
        cycles: document.getElementById('ts-cycles-0').value,
        rest: document.getElementById('ts-restsecs-0').value,
        // hidden (Steady active) but still present, so flushTemplateSets keeps reading it unchanged
        setsRowHidden: document.getElementById('ts-sets-0').closest('div[style*="display:none"]') !== null,
        steadyChipActive: document.body.innerText.includes('Steady effort'),
      }
    })
    expect(r.sets).toBe('1')
    expect(r.cycles).toBe('1')
    expect(r.rest).toBe('0:00')
    expect(r.setsRowHidden).toBe(true)
  })

  test('Steady/Repeating toggle round-trips through flushTemplateSets without losing the typed work value', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) } return e }
      mk('att-type', 'select'); mk('att-sets-container', 'div')
      window._templateSets = [{}]
      renderTemplateSets('att-sets-container', 'interval')
      document.getElementById('ts-worksecs-0').value = '20:00'

      // Flip to Repeating — Sets/Cycles/Rest rows must appear, with a sensible non-trivial default.
      toggleTsSteady('att-sets-container')
      const afterRepeating = {
        setsRowVisible: document.getElementById('ts-sets-0').closest('div[style*="display:none"]') === null,
        sets: document.getElementById('ts-sets-0').value,
        rest: document.getElementById('ts-restsecs-0').value,
        work: document.getElementById('ts-worksecs-0').value,   // must survive the toggle
      }

      // Flip back to Steady.
      toggleTsSteady('att-sets-container')
      flushTemplateSets('att-sets-container')
      const afterSteady = { sets: window._templateSets[0].sets, cycles: window._templateSets[0].cycles, restSecs: window._templateSets[0].restSecs }
      return { afterRepeating, afterSteady }
    })
    expect(r.afterRepeating.setsRowVisible).toBe(true)
    expect(r.afterRepeating.sets).toBe('8')
    expect(r.afterRepeating.rest).toBe('0:30')
    expect(r.afterRepeating.work).toBe('20:00')
    expect(r.afterSteady).toEqual({ sets: 1, cycles: 1, restSecs: 0 })
  })
})

test.describe('Cardio/Interval merge — runner manual LOG gate', () => {
  test('manual LOG + Add extra set are available for a steady-effort interval block', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ workSecs: 1200, restSecs: 0, sets: 1, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      renderRunner()
      return {
        hasLog: !!document.querySelector('button[onclick^="event.stopPropagation();logRunnerSet()"]'),
        hasAddExtra: !!document.querySelector('button[onclick^="event.stopPropagation();addExtraCardioSet()"]'),
        hasStartTimer: !!document.querySelector('button[onclick^="event.stopPropagation();startCardioTimer()"]'),
        isSteady: _isSteadyEffortBlock(_runner.exercises[0]),
      }
    })
    expect(r.isSteady).toBe(true)
    expect(r.hasLog).toBe(true)
    expect(r.hasAddExtra).toBe(true)
    expect(r.hasStartTimer).toBe(true)   // steady effort can still be timed live if wanted
  })

  test('manual LOG + Add extra set are NOT available for a genuine multi-round interval — timer only', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'HIIT Bike', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ workSecs: 30, restSecs: 30, sets: 8, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      renderRunner()
      return {
        hasLog: !!document.querySelector('button[onclick^="event.stopPropagation();logRunnerSet()"]'),
        hasAddExtra: !!document.querySelector('button[onclick^="event.stopPropagation();addExtraCardioSet()"]'),
        hasStartTimer: !!document.querySelector('button[onclick^="event.stopPropagation();startCardioTimer()"]'),
        isSteady: _isSteadyEffortBlock(_runner.exercises[0]),
      }
    })
    expect(r.isSteady).toBe(false)
    expect(r.hasLog).toBe(false)
    expect(r.hasAddExtra).toBe(false)
    expect(r.hasStartTimer).toBe(true)
  })

  // 3 fixes below found by multi-agent-review (Agent C, 2026-08-09) — each confirmed reachable through
  // the new manual-LOG/+Add-extra-set gate this feature opened up for interval-shaped blocks.

  test('a block with leftover nonzero warmup/rest/recovery/cooldown is NOT treated as steady, even at sets:1/cycles:1', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      // Simulates a hand-edit that set Sets/Cycles back to 1 without going through toggleTsSteady
      // (which would have zeroed these) — _expandIntervalBlock still builds warmup->work->rest->cooldown.
      const ex = { name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ workSecs: 1200, restSecs: 30, sets: 1, cycles: 1, warmupSecs: 20, cooldownSecs: 15 }] }
      return { isSteady: _isSteadyEffortBlock(ex), phaseCount: _expandIntervalBlock(ex.sets_json[0]).length }
    })
    expect(r.isSteady).toBe(false)
    expect(r.phaseCount).toBeGreaterThan(1)   // warmup + work + rest + cooldown — genuinely not "one round"
  })

  test('+Add extra set on a steady interval block extends the SAME block (sets_json stays one entry) and refreshes phases, so Start timer honors the extra round', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ workSecs: 300, restSecs: 0, sets: 1, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      addExtraCardioSet()
      const ex = _runner.exercises[0]
      return {
        setsJsonLength: ex.sets_json.length,
        blockSets: ex.sets_json[0].sets,
        targetSets: ex.targetSets,
        workPhaseCount: ex.phases.filter(p => p.phase === 'work').length,
      }
    })
    expect(r.setsJsonLength).toBe(1)          // extended in place, not a duplicate array entry
    expect(r.blockSets).toBe(2)
    expect(r.targetSets).toBe(2)              // re-derived from the refreshed phase list
    expect(r.workPhaseCount).toBe(2)          // Start timer's phase-walk now knows about both rounds
  })

  test("startIntervalTimer's own next-round scheduling reads workSecs, not the cardio-only duration field, for an interval-shaped block", async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
        // restSecs:5 (not 0) so the rest timer is still pending when we check — isolates the
        // _afterRest closure's captured duration from the separate rest-timer-completion question.
        sets_json: [{ workSecs: 245, restSecs: 5, sets: 1, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      addExtraCardioSet()   // targetSets:2, block sets:2 — this is round 1 of 2
      renderRunner()
      startIntervalTimer(1)   // 1s work timer so the zero-tick fires fast, not the real 245s work duration
      await new Promise(res => setTimeout(res, 1300))
      // Zero-tick fired: round 1 logged, hitTarget false (1 of 2 done) -> _afterRest scheduled for round 2.
      const afterRestIsFn = typeof _runner._afterRest === 'function'
      _runner._afterRest()   // simulate "rest just finished" without waiting the real 5s out
      return { afterRestIsFn, scheduledSecs: _runner._intervalSecs }
    })
    expect(r.afterRestIsFn).toBe(true)
    expect(r.scheduledSecs).toBe(245)   // read from workSecs correctly, not a fallback 300
  })
})
