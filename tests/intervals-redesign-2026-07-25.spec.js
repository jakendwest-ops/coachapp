const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// The block model's whole value is that it's a pure function: block in, ordered phases out.
// No DOM, no Supabase, no timers — so these run fast and pin the arithmetic exactly.
test.describe('Interval block expansion (2026-07-25)', () => {
  test('reproduces the reference app\'s 27:00 worked example exactly', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const phases = _expandIntervalBlock({
        countdownSecs: 0, warmupSecs: 120, workSecs: 240, restSecs: 120,
        sets: 4, recoverySecs: 60, cycles: 1, cooldownSecs: 0
      })
      return { phases, total: _intervalTotalSecs(phases) }
    })
    // warmup 2:00 + 4 x (4:00 work + 2:00 rest) + 1:00 recovery = 27:00
    expect(r.total.total).toBe(1620)
    expect(r.total.hasUnknown).toBe(false)
    expect(r.phases[0].phase).toBe('warmup')
    expect(r.phases.filter(p => p.phase === 'work').length).toBe(4)
    expect(r.phases.filter(p => p.phase === 'rest').length).toBe(4)
    expect(r.phases.filter(p => p.phase === 'recovery').length).toBe(1)
  })

  test('omits zero-valued phases rather than emitting 0-second ones', async ({ page }) => {
    await loginAsPT(page)
    const kinds = await page.evaluate(() => _expandIntervalBlock({
      countdownSecs: 0, warmupSecs: 0, workSecs: 30, restSecs: 0,
      sets: 3, recoverySecs: 0, cycles: 1, cooldownSecs: 0
    }).map(p => p.phase))
    expect(kinds).toEqual(['work', 'work', 'work'])
  })

  test('nests sets inside cycles and tags each work round', async ({ page }) => {
    await loginAsPT(page)
    const work = await page.evaluate(() => _expandIntervalBlock({
      workSecs: 30, restSecs: 15, sets: 2, cycles: 3, recoverySecs: 60
    }).filter(p => p.phase === 'work').map(p => `${p.cycle}.${p.set}`))
    expect(work).toEqual(['1.1', '1.2', '2.1', '2.2', '3.1', '3.2'])
  })

  test('a distance block yields work rounds with no duration, and an honest partial total', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const phases = _expandIntervalBlock({
        isDistanceBased: true, workDistanceM: 400, restSecs: 90, sets: 8, cycles: 1
      })
      return { first: phases.find(p => p.phase === 'work'), total: _intervalTotalSecs(phases) }
    })
    expect(r.first.secs).toBeNull()
    expect(r.first.distanceM).toBe(400)
    expect(r.total.hasUnknown).toBe(true)   // work time is unknowable without a sensor
    expect(r.total.total).toBe(720)          // 8 x 90s rest only
  })

  test('guards against a missing/zero sets or cycles count producing an empty block', async ({ page }) => {
    await loginAsPT(page)
    const n = await page.evaluate(() => _expandIntervalBlock({ workSecs: 30, sets: 0, cycles: 0 }).length)
    expect(n).toBe(1)   // clamped to at least 1 set x 1 cycle
  })
})

test.describe('Interval builder (2026-07-25)', () => {
  test('an 8-set block saves ONE sets_json entry, not eight', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const tag = '[E2E] interval block ' + Date.now()
      const { data: t } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: null, program_id: null, name: tag, is_personal: false })
        .select('id').single()
      window._templateCtx = {}
      const mk = (id, el = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(el); e.id = id; document.body.appendChild(e) } return e }
      mk('att-type', 'select'); mk('att-notes'); mk('att-superset'); mk('att-error'); mk('add-to-template-modal', 'div')
      document.getElementById('att-type').innerHTML = '<option value="interval">Interval</option>'
      document.getElementById('att-type').value = 'interval'
      window._exerciseDetailPicked = { id: null, name: tag + ' Row' }
      window._templateSets = [{ countdownSecs: 5, warmupSecs: 0, workSecs: 30, restSecs: 30, sets: 8, recoverySecs: 0, cycles: 1, cooldownSecs: 0 }]
      await saveExerciseToTemplate(t.id)
      const { data } = await db.from('workout_template_exercises')
        .select('exercise_type, metric_type, sets_json').eq('template_id', t.id).single()
      await db.from('workout_template_exercises').delete().eq('template_id', t.id)
      await db.from('workout_templates').delete().eq('id', t.id)
      return data
    })
    // The entire point of the redesign: rounds are a number, not N cloned rows.
    expect(r.sets_json.length).toBe(1)
    expect(r.sets_json[0].sets).toBe(8)
    expect(r.metric_type).toBe('interval')
    // Load-bearing: runner + save gate cardio behaviour on the LEGACY exercise_type column in three
    // places. Wrong value here and logged rounds silently lose duration_seconds / distance_m.
    expect(r.exercise_type).toBe('cardio')
  })

  test('the block editor renders one screen of measures, with no per-set repeat control', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const mk = (id, el = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(el); e.id = id; document.body.appendChild(e) } return e }
      mk('att-type', 'select'); mk('att-sets-container', 'div')
      window._templateSets = [{ workSecs: 30, restSecs: 30, sets: 8, cycles: 1 }]
      renderTemplateSets('att-sets-container', 'interval')
      return {
        hasWork:     !!document.getElementById('ts-worksecs-0'),
        hasSets:     !!document.getElementById('ts-sets-0'),
        hasCycles:   !!document.getElementById('ts-cycles-0'),
        hasWarmup:   !!document.getElementById('ts-warmup-0'),
        hasCooldown: !!document.getElementById('ts-cooldown-0'),
        hasTotal:    !!document.getElementById('ts-interval-total'),
        repeatBoxes: document.querySelectorAll('[id^="ts-repeatn-"]').length,
        addSetBtns:  Array.from(document.querySelectorAll('button')).filter(b => /Add set/i.test(b.textContent)).length,
      }
    })
    expect(r.hasWork && r.hasSets && r.hasCycles && r.hasWarmup && r.hasCooldown).toBe(true)
    expect(r.hasTotal).toBe(true)
    expect(r.repeatBoxes).toBe(0)   // the control Jake called out — gone for intervals
    expect(r.addSetBtns).toBe(0)    // a block is one thing; there are no sets to add
  })

  test('flushTemplateSets round-trips every block field', async ({ page }) => {
    await loginAsPT(page)
    const b = await page.evaluate(() => {
      const mk = (id, el = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(el); e.id = id; document.body.appendChild(e) } return e }
      mk('att-type', 'select'); mk('att-sets-container', 'div')
      window._templateSets = [{}]
      renderTemplateSets('att-sets-container', 'interval')
      document.getElementById('ts-countdown-0').value = '5'
      document.getElementById('ts-warmup-0').value    = '2:00'
      document.getElementById('ts-worksecs-0').value  = '0:30'
      document.getElementById('ts-restsecs-0').value  = '0:45'
      document.getElementById('ts-sets-0').value      = '6'
      document.getElementById('ts-recovery-0').value  = '1:00'
      document.getElementById('ts-cycles-0').value    = '3'
      document.getElementById('ts-cooldown-0').value  = '3:00'
      flushTemplateSets('att-sets-container')
      return window._templateSets[0]
    })
    expect(b.countdownSecs).toBe(5)
    expect(b.warmupSecs).toBe(120)
    expect(b.workSecs).toBe(30)
    expect(b.restSecs).toBe(45)
    expect(b.sets).toBe(6)
    expect(b.recoverySecs).toBe(60)
    expect(b.cycles).toBe(3)
    expect(b.cooldownSecs).toBe(180)
  })

  test('+ More targets survive a flush on an interval block (les-036 shape)', async ({ page }) => {
    await loginAsPT(page)
    const b = await page.evaluate(() => {
      const mk = (id, el = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(el); e.id = id; document.body.appendChild(e) } return e }
      mk('att-type', 'select'); mk('att-sets-container', 'div')
      window._templateSets = [{}]
      renderTemplateSets('att-sets-container', 'interval')
      document.getElementById('ts-worksecs-0').value = '0:30'
      document.getElementById('ts-p500min-0').value  = '1:50'
      document.getElementById('ts-wattsmin-0').value = '240'
      document.getElementById('ts-hrzmin-0').value   = '150'
      flushTemplateSets('att-sets-container')
      return window._templateSets[0]
    })
    expect(b.workSecs).toBe(30)     // the block field still round-trips
    expect(b.pace500Min).toBe('1:50')
    expect(b.wattsMin).toBe('240')
    expect(b.hrZoneMin).toBe('150')
  })

  test('switching a multi-row exercise to Intervals collapses it to a single block', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const mk = (id, el = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(el); e.id = id; document.body.appendChild(e) } return e }
      mk('att-type', 'select'); mk('att-sets-container', 'div')
      // Three cardio rows, as a real type-switch would arrive.
      window._templateSets = [{ duration: '1:00' }, { duration: '2:00' }, { duration: '3:00' }]
      renderTemplateSets('att-sets-container', 'interval')
      return {
        n: window._templateSets.length,
        repeatBoxes: document.querySelectorAll('[id^="ts-repeatn-"]').length,
      }
    })
    expect(r.n).toBe(1)
    expect(r.repeatBoxes).toBe(0)
  })

  test('a deliberate 0 for warmup/recovery/cooldown survives the save allowlist (?? not ||)', async ({ page }) => {
    await loginAsPT(page)
    const s = await page.evaluate(() => _cleanTemplateSets(
      [{ countdownSecs: 5, warmupSecs: 0, workSecs: 30, restSecs: 30, sets: 8, recoverySecs: 0, cycles: 1, cooldownSecs: 0 }],
      { exercise_type: 'cardio', unilateral: false, timed: false }
    )[0])
    expect(s.warmupSecs).toBe(0)
    expect(s.recoverySecs).toBe(0)
    expect(s.cooldownSecs).toBe(0)
    expect(s.workSecs).toBe(30)
  })
})

test.describe('Interval prescription display (2026-07-25)', () => {
  test('day rows describe an interval block, not a bare set count', async ({ page }) => {
    await loginAsPT(page)
    const s = await page.evaluate(() => [
      _fmtSetDetail({ workSecs: 30, restSecs: 30, sets: 8, cycles: 1 }, { isInterval: true }),
      _fmtSetDetail({ isDistanceBased: true, workDistanceM: 400, restSecs: 90, sets: 8, cycles: 1 }, { isInterval: true }),
      _fmtSetDetail({ workSecs: 60, restSecs: 30, sets: 4, cycles: 3, recoverySecs: 120 }, { isInterval: true }),
    ])
    expect(s[0]).toContain('8 × 0:30 / 0:30')
    expect(s[1]).toContain('400')
    expect(s[2]).toContain('3 cycles')
  })

  test('the set-count badge reports real work rounds for an interval block, not sets_json.length', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => ({
      // A block is always ONE sets_json entry — a raw .length badge would read "1 set" for this
      // 4-set x 3-cycle session (12 work rounds), which is the regression the block model introduced.
      interval: _prescribedSetCount([{ workSecs: 60, restSecs: 30, sets: 4, cycles: 3, recoverySecs: 120 }], true),
      // Non-interval passthrough must be untouched — still the plain row count.
      plain: _prescribedSetCount([{}, {}, {}], false),
    }))
    expect(r.interval).toBe(12)
    expect(r.plain).toBe(3)
  })
})

test.describe('Interval runner phase walk (2026-07-25)', () => {
  test('an interval exercise carries an expanded phase list and starts at phase 0', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ warmupSecs: 60, workSecs: 30, restSecs: 30, sets: 4, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      return { n: _runner.exercises[0].phases.length, first: _runner.exercises[0].phases[0].phase }
    })
    expect(r.n).toBe(9)          // warmup + 4 x (work + rest)
    expect(r.first).toBe('warmup')
  })

  test('advancing walks phases in order and stops at the end', async ({ page }) => {
    await loginAsPT(page)
    const seq = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ workSecs: 10, restSecs: 5, sets: 2, cycles: 1, cooldownSecs: 20 }]
      }], exIdx: 0, startTime: Date.now() }
      const ex = _runner.exercises[0]
      _initIntervalPhases(ex)
      return ex.phases.map(p => p.phase)
    })
    expect(seq).toEqual(['work', 'rest', 'work', 'rest', 'cooldown'])
  })

  test('a distance work round is marked as needing a manual advance', async ({ page }) => {
    await loginAsPT(page)
    const p = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Run', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ isDistanceBased: true, workDistanceM: 400, restSecs: 60, sets: 3, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      return _runner.exercises[0].phases.find(x => x.phase === 'work')
    })
    // secs:null is the runner's signal to show Done instead of auto-advancing — and is why distance
    // rounds no longer dead-end the way they did before this redesign.
    expect(p.secs).toBeNull()
  })
})

// Fix round 1/5: Task 5 built the phase-walk engine but nothing actually started it — the runner's
// "Start timer" button called startCardioTimer(), which always ran the legacy count-in/timer chain,
// for every metric type including 'interval'. These tests pin the wiring itself, not just the pure
// phase-expansion functions above.
test.describe('Interval runner Start-trigger wiring (2026-07-26 fix round 1)', () => {
  test('starting an interval exercise enters the phase walk, not the legacy count-in/timer', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Run', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ isDistanceBased: true, workDistanceM: 400, restSecs: 60, sets: 1, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now() }
      // Deliberately no _initIntervalPhases call here — startCardioTimer must build phases itself,
      // the same way it has to for an exercise that reached the runner without going through
      // launchRunner's mapping (e.g. added/swapped in mid-session).
      startCardioTimer()
      const out = {
        phaseIdx: _runner._phaseIdx,
        phaseCount: (_runner.exercises[0].phases || []).length,
        firstPhase: _runner.exercises[0].phases?.[0]?.phase,
        tookLegacyPath: !!_runner._countInInterval,   // startRunnerCountIn is the legacy entry point
      }
      stopIntervalTimer()
      document.getElementById('wr-interval-overlay')?.remove()
      return out
    })
    expect(r.phaseIdx).toBe(0)
    expect(r.phaseCount).toBeGreaterThan(0)
    expect(r.firstPhase).toBe('work')
    expect(r.tookLegacyPath).toBe(false)
  })

  test('a plain (non-interval) cardio exercise still takes the legacy count-in/timer path, untouched', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Bike', type: 'cardio', metricType: 'cardio', loggedSets: [],
        sets_json: [{ duration: '5:00' }]
      }], exIdx: 0, startTime: Date.now() }
      startCardioTimer()
      const out = { tookLegacyPath: !!_runner._countInInterval, hasPhases: !!_runner.exercises[0].phases }
      stopRunnerCountIn()
      return out
    })
    expect(r.tookLegacyPath).toBe(true)
    expect(r.hasPhases).toBe(false)
  })

  test("launchRunner's mapping builds phases and a real work-round targetSets, not sets_json.length", async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      window._runnerTemplates = [{
        id: 'fake-tmpl-2026-07-26', description: null,
        workout_template_exercises: [{
          order_index: 0, exercise_name: 'Row', exercise_id: null, exercise_type: 'cardio', metric_type: 'interval',
          sets_json: [{ workSecs: 30, restSecs: 30, sets: 4, cycles: 2 }],   // 8 real work rounds
          reps: '', weight_kg: null, rest_seconds: null, notes: null, superset_group: null
        }]
      }]
      window._fakeRsTemplate = 'fake-tmpl-2026-07-26'
      window._fakeRsName = 'Fix-round test workout'
      await _startFreshRunner('fake-client-2026-07-26')
      const ex = _runner.exercises[0]
      const out = { hasPhases: !!ex.phases, targetSets: ex.targetSets, rawSetsJsonLength: ex.sets_json.length }
      discardRunner()
      return out
    })
    expect(r.hasPhases).toBe(true)
    expect(r.targetSets).toBe(8)          // 4 sets x 2 cycles of work — not sets_json.length (always 1)
    expect(r.rawSetsJsonLength).toBe(1)
  })

  // Fix round 2/5: the idle (pre-Start) card's LOG button ran the plain single-round cardio log path,
  // which bypasses the phase walk entirely — a bogus, non-phase-tagged set with no warning. A block has
  // one sensible entry point (Start); LOG is hidden for interval exercises, same invariant reason
  // "+ Add extra set" was hidden in fix round 1. The distance-round Done control lives on the in-progress
  // overlay (renderIntervalTimer's own "Done early — LOG" button), not on this idle card, so hiding this
  // LOG does not remove any athlete's only way to finish a round.
  test('an interval exercise hides the idle-card LOG button; steady-state cardio keeps it', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const hasLogButton = () => Array.from(document.querySelectorAll('#workout-runner button'))
        .some(b => b.textContent.trim() === 'LOG')

      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ workSecs: 30, restSecs: 30, sets: 4, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      renderRunner()
      const intervalHasLog = hasLogButton()
      discardRunner()

      _runner = { clientId: 'x', exercises: [{
        name: 'Bike', type: 'cardio', metricType: 'cardio', loggedSets: [],
        sets_json: [{ duration: '5:00' }]
      }], exIdx: 0, startTime: Date.now() }
      renderRunner()
      const cardioHasLog = hasLogButton()
      discardRunner()

      return { intervalHasLog, cardioHasLog }
    })
    expect(r.intervalHasLog).toBe(false)
    expect(r.cardioHasLog).toBe(true)
  })

  // Fix round 3/5, Critical 1: _logIntervalPhase was called by startIntervalPhaseTimer's zero-tick but
  // never defined (it was scoped to a later task) — every real work/warmup/cooldown phase threw a
  // ReferenceError AFTER stopIntervalTimer() but BEFORE _advancePhase()/renderRunner(), freezing the
  // runner on the finished phase with no way forward. None of the earlier tests caught it because none
  // let a real countdown reach zero — this one drives an actual 1-second phase to completion.
  test('a completed work phase logs the set and advances (the zero-tick path)', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ workSecs: 1, restSecs: 0, sets: 2, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      _startPhaseAt(0)   // real 1s timer — the same call startCardioTimer makes
      await new Promise(resolve => setTimeout(resolve, 1300))
      const out = {
        phaseIdx: _runner._phaseIdx,
        loggedPhases: _runner.exercises[0].loggedSets.map(s => s.phase),
      }
      stopIntervalTimer()
      document.getElementById('wr-interval-overlay')?.remove()
      document.getElementById('workout-runner')?.remove()
      return out
    })
    expect(r.phaseIdx).toBe(1)                 // advanced into the second work round
    expect(r.loggedPhases).toEqual(['work'])   // the finished phase was logged, not lost
  })

  // Fix round 3/5, Critical 2: runnerJumpTo called skipRestTimer() WITHOUT nulling _afterRest first,
  // unlike its siblings runnerGoBack/showRunnerFinish. skipRestTimer() fires the pending callback
  // immediately, while exIdx still points at the OLD exercise — so a queued `_advancePhase()` from an
  // interval rest phase runs against the wrong exercise, starting a new interval timer and mounting its
  // overlay on top of whatever the jump lands on.
  test('jumping to another exercise mid-rest does not leak a queued phase-advance onto it', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [
        { name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
          sets_json: [{ workSecs: 1, restSecs: 5, sets: 2, cycles: 1 }] },
        { name: 'Plank', type: 'strength', metricType: 'timed_hold', loggedSets: [], sets_json: [{ timed: true }] }
      ], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      _startPhaseAt(1)   // land mid-rest, as if the first work round just finished
      runnerJumpTo(1)    // tap "jump to Plank" while still resting on Row
      const out = {
        exIdx: _runner.exIdx,
        leakedIntervalTimer: !!_runner._intervalInterval,
        leakedOverlay: !!document.getElementById('wr-interval-overlay'),
      }
      stopIntervalTimer()
      document.getElementById('wr-interval-overlay')?.remove()
      document.getElementById('rest-timer-overlay')?.remove()
      document.getElementById('workout-runner')?.remove()
      return out
    })
    expect(r.exIdx).toBe(1)
    expect(r.leakedIntervalTimer).toBe(false)
    expect(r.leakedOverlay).toBe(false)
  })
})

test.describe('Interval runner overlay (2026-07-26, Task 6)', () => {
  test('the overlay names the current phase and shows set/cycle position', async ({ page }) => {
    await loginAsPT(page)
    const txt = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ workSecs: 30, restSecs: 30, sets: 4, cycles: 2 }]
      }], exIdx: 0, startTime: Date.now(), _intervalRemaining: 30, _intervalSecs: 30 }
      _initIntervalPhases(_runner.exercises[0])
      _runner._phaseIdx = 0
      renderIntervalTimer()
      const t = document.getElementById('wr-interval-overlay')?.innerText || ''
      document.getElementById('wr-interval-overlay')?.remove()
      return t
    })
    expect(txt).toMatch(/WORK/i)
    expect(txt).toMatch(/Set 1 of 4/i)
    expect(txt).toMatch(/Cycle 1 of 2/i)
  })

  test('the overlay shows a remaining-total line summing the phases still ahead', async ({ page }) => {
    await loginAsPT(page)
    const txt = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ workSecs: 30, restSecs: 30, sets: 2, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now(), _intervalRemaining: 30, _intervalSecs: 30 }
      _initIntervalPhases(_runner.exercises[0])
      _runner._phaseIdx = 0   // work+rest+work+rest still ahead = 30+30+30+30 = 2:00
      renderIntervalTimer()
      const t = document.getElementById('wr-interval-overlay')?.innerText || ''
      document.getElementById('wr-interval-overlay')?.remove()
      return t
    })
    expect(txt).toMatch(/2:00/)
  })

  test('the remaining-total line is qualified with + when a distance round lies ahead', async ({ page }) => {
    await loginAsPT(page)
    const txt = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Run', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ isDistanceBased: true, workDistanceM: 400, restSecs: 30, sets: 2, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now(), _intervalRemaining: 30, _intervalSecs: 30 }
      _initIntervalPhases(_runner.exercises[0])
      _runner._phaseIdx = 0   // both work rounds are unknowable — only the two 30s rests are countable
      renderIntervalTimer()
      const t = document.getElementById('wr-interval-overlay')?.innerText || ''
      document.getElementById('wr-interval-overlay')?.remove()
      return t
    })
    expect(txt).toMatch(/\+1:00/)
  })

  // The Task 5 carry-forward fix: the overlay's Done control used to always call the legacy
  // logRunnerSet(), which never touches the phase list — so a distance round (which has no timer and
  // relies on this tap as its ONLY way to end) froze the walk forever. It must now log the phase and
  // advance instead, and read the target distance in its own label.
  test('a distance work round shows a Done button carrying the target distance, wired to log + advance', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Run', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ isDistanceBased: true, workDistanceM: 400, restSecs: 30, sets: 2, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      _runner._phaseIdx = 0
      renderIntervalTimer()
      const btn = Array.from(document.querySelectorAll('#wr-interval-overlay button')).find(b => /^Done/.test(b.textContent.trim()))
      const label = btn?.textContent.trim()
      btn?.click()
      const out = {
        label,
        phaseIdx: _runner._phaseIdx,
        loggedPhase: _runner.exercises[0].loggedSets[0]?.phase,
        loggedDistance: _runner.exercises[0].loggedSets[0]?.distanceM,
      }
      document.getElementById('wr-interval-overlay')?.remove()
      document.getElementById('rest-timer-overlay')?.remove()
      document.getElementById('workout-runner')?.remove()
      return out
    })
    expect(r.label).toMatch(/^Done — 400/)
    expect(r.phaseIdx).toBe(1)          // advanced from the work round into the rest that follows it
    expect(r.loggedPhase).toBe('work')
    expect(r.loggedDistance).toBe('400')
  })

  // Fix round 1/5, 2026-07-26: a distance round's overlay divided undefined by undefined for its
  // countdown (_intervalRemaining/_intervalSecs are never set when there is no timer to run — see
  // _startPhaseAt's null-secs branch), rendering a literal "NaN:NaN" where the countdown ring's number
  // goes. That's the first thing an athlete sees when a distance round starts. Asserting on the
  // rendered text (not just internal state) is deliberate — a state-only assertion would have passed
  // right through this exact bug, same as the button-label test above already does without noticing it.
  test('a distance work round shows the target distance in place of the countdown, with no NaN', async ({ page }) => {
    await loginAsPT(page)
    const txt = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Run', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ isDistanceBased: true, workDistanceM: 400, restSecs: 30, sets: 2, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      _runner._phaseIdx = 0   // no _intervalRemaining/_intervalSecs seeded — matches how a real distance
                              // round actually arrives here, via _startPhaseAt, which never sets them
      renderIntervalTimer()
      const t = document.getElementById('wr-interval-overlay')?.innerText || ''
      document.getElementById('wr-interval-overlay')?.remove()
      return t
    })
    expect(txt).not.toMatch(/NaN/)
    expect(txt).toMatch(/400/)
  })

  test('a timed work round\'s Done button also logs the phase and advances, not the legacy cardio log', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ workSecs: 30, restSecs: 30, sets: 2, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now(), _intervalRemaining: 30, _intervalSecs: 30 }
      _initIntervalPhases(_runner.exercises[0])
      _runner._phaseIdx = 0
      renderIntervalTimer()
      const btn = Array.from(document.querySelectorAll('#wr-interval-overlay button')).find(b => /^Done/.test(b.textContent.trim()))
      const label = btn?.textContent.trim()
      btn?.click()
      const out = {
        label,
        phaseIdx: _runner._phaseIdx,
        loggedPhase: _runner.exercises[0].loggedSets[0]?.phase,
      }
      document.getElementById('wr-interval-overlay')?.remove()
      document.getElementById('rest-timer-overlay')?.remove()
      document.getElementById('workout-runner')?.remove()
      return out
    })
    expect(r.label).toBe('Done early — LOG')
    expect(r.phaseIdx).toBe(1)
    expect(r.loggedPhase).toBe('work')
  })

  // Steady-state cardio is explicitly out of scope for the whole redesign — its Done control must
  // still go through the untouched legacy path (no `phase` key on the logged set, no phase list built).
  test('a non-interval cardio Done button still goes through the legacy logRunnerSet path, untouched', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Bike', type: 'cardio', metricType: 'cardio', loggedSets: [],
        sets_json: [{ duration: '5:00' }]
      }], exIdx: 0, startTime: Date.now() }
      startIntervalTimer(30)   // mounts the same overlay via the legacy steady-state timer
      const btn = Array.from(document.querySelectorAll('#wr-interval-overlay button')).find(b => /^Done/.test(b.textContent.trim()))
      const label = btn?.textContent.trim()
      btn?.click()
      const out = {
        label,
        hasPhases: !!_runner.exercises[0].phases,
        loggedSet: _runner.exercises[0].loggedSets[0],
      }
      stopIntervalTimer()
      document.getElementById('wr-interval-overlay')?.remove()
      document.getElementById('rest-timer-overlay')?.remove()
      document.getElementById('workout-runner')?.remove()
      return out
    })
    expect(r.label).toBe('Done early — LOG')
    expect(r.hasPhases).toBe(false)
    expect(r.loggedSet?.phase).toBeUndefined()   // a phase-tagged set would carry this key; legacy sets never do
    expect(r.loggedSet?.duration).toBe('5:00')
  })

  // A synchronous assert right after clicking Done only proves the button's onclick was rewired —
  // it doesn't prove _doneIntervalPhase() actually stopped the REAL setInterval that startIntervalPhaseTimer
  // started for that phase. If stopIntervalTimer() were skipped/misordered, the old timer would keep
  // ticking a shared _runner._intervalRemaining in the background and fire its own zero-tick later,
  // double-logging the round and yanking exIdx around again — exactly the class of stray-timer bug
  // this phase-walk rewrite exists to avoid (see _isIntervalExercise's comment above). This test lets
  // a real 3s phase run, taps Done at 500ms, then waits past the 3s mark to prove nothing fires again.
  test('tapping Done early stops the real phase timer for good — no stray double-log/double-advance', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      _runner = { clientId: 'x', exercises: [
        { name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
          sets_json: [{ workSecs: 3, restSecs: 0, sets: 1, cycles: 1 }] },
        { name: 'Plank', type: 'strength', metricType: 'timed_hold', loggedSets: [], sets_json: [{ timed: true }] }
      ], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      _startPhaseAt(0)   // real 3s timer — the only phase in this block (restSecs:0 is omitted)
      await new Promise(resolve => setTimeout(resolve, 500))
      const btn = Array.from(document.querySelectorAll('#wr-interval-overlay button')).find(b => /^Done/.test(b.textContent.trim()))
      btn?.click()   // ends the round ~2.5s before the real 3s timer would have fired on its own
      const exIdxAfterClick = _runner.exIdx
      // Wait well past the original 3s mark — a leaked timer would fire here and bounce exIdx/log again.
      await new Promise(resolve => setTimeout(resolve, 3200))
      const out = {
        exIdxAfterClick,
        exIdxAfterWait: _runner.exIdx,
        loggedCount: _runner.exercises[0].loggedSets.length,
      }
      stopIntervalTimer()
      document.getElementById('wr-interval-overlay')?.remove()
      document.getElementById('workout-runner')?.remove()
      return out
    })
    expect(r.exIdxAfterClick).toBe(1)   // phase list exhausted immediately — straight into the next exercise
    expect(r.exIdxAfterWait).toBe(1)    // still there 3.2s later — no stray timer bounced it again
    expect(r.loggedCount).toBe(1)       // exactly one logged round, not a duplicate from a leaked interval
  })

  // Fix round 2/5, 2026-07-26: a block's "Initial countdown" (countdownSecs) expands to a TIMED phase,
  // so it renders this same overlay with this same Done button. _doneIntervalPhase originally logged
  // unconditionally (unlike the zero-tick, which only logs work/warmup/cooldown) — an impatient tap
  // during the get-ready countdown pushed a phantom {phase:'countdown'} row into loggedSets: a permanent
  // 5-second "set" in the athlete's saved history that also shifted every real set's set_number up by
  // one (set_number derives from array position). No existing test configured a countdown at all, which
  // is exactly why this slipped past review once already.
  test('tapping Done during the initial countdown advances the walk but logs nothing', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ countdownSecs: 5, workSecs: 30, restSecs: 30, sets: 1, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      const firstPhase = _runner.exercises[0].phases[0].phase
      _startPhaseAt(0)   // real 5s countdown timer — the block's first phase
      await new Promise(resolve => setTimeout(resolve, 300))
      const btn = Array.from(document.querySelectorAll('#wr-interval-overlay button')).find(b => /^Done/.test(b.textContent.trim()))
      btn?.click()   // an impatient tap, well before the countdown would finish on its own
      const out = {
        firstPhase,
        phaseIdxAfterClick: _runner._phaseIdx,
        loggedSets: _runner.exercises[0].loggedSets,
      }
      stopIntervalTimer()
      document.getElementById('wr-interval-overlay')?.remove()
      document.getElementById('workout-runner')?.remove()
      return out
    })
    expect(r.firstPhase).toBe('countdown')
    expect(r.phaseIdxAfterClick).toBe(1)   // the walk still advanced, straight into the work phase
    expect(r.loggedSets).toEqual([])       // but nothing was logged for the skipped countdown
  })
})
