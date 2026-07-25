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
})
