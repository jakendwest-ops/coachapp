const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// 2026-07-22 — cardio distance moves from km to METRES at the point of entry.
//
// The hazard this file exists to pin down: `workout_log_sets.distance_m` (ACHIEVED) has always been
// metres, but `sets_json.distance` (PRESCRIBED) has always been km — the runner multiplied by 1000 on
// save. Relabelling that same key to metres would silently reinterpret every existing cardio template
// (a `5` meaning 5km would start reading as 5m). Per the fix-forward rule we never rewrite history:
// the builder writes a NEW `distanceM` key, and one shared reader (_cardioDistanceM) understands both.
//
// Red before green: _cardioDistanceM does not exist yet.
test.describe('Cardio distance — metres entry, km-legacy compatibility', () => {
  test('_cardioDistanceM reads new metres key and legacy km key', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(() => ({
      legacyKm:      _cardioDistanceM({ distance: 5 }),            // 5 km  → 5000 m
      legacyKmFrac:  _cardioDistanceM({ distance: 0.5 }),          // 0.5km →  500 m
      legacyKmStr:   _cardioDistanceM({ distance: '2.5' }),        // string from a DOM read
      newMetres:     _cardioDistanceM({ distanceM: 500 }),
      newMetresStr:  _cardioDistanceM({ distanceM: '750' }),
      newWinsOverOld:_cardioDistanceM({ distance: 5, distanceM: 400 }),
      emptyObj:      _cardioDistanceM({}),
      blankString:   _cardioDistanceM({ distanceM: '' }),          // must fall through, not read as 0
      zeroMetres:    _cardioDistanceM({ distanceM: 0 }),
    }))

    expect(r.legacyKm).toBe(5000)
    expect(r.legacyKmFrac).toBe(500)
    expect(r.legacyKmStr).toBe(2500)
    expect(r.newMetres).toBe(500)
    expect(r.newMetresStr).toBe(750)
    expect(r.newWinsOverOld).toBe(400)   // an explicit metres value always beats the legacy km value
    expect(r.emptyObj).toBe(0)
    expect(r.blankString).toBe(0)
    expect(r.zeroMetres).toBe(0)
  })

  test('builder saves distanceM in metres; runner persists it to distance_m without a x1000', async ({ page }) => {
    await loginAsPT(page)
    await page.click('text=Personal')
    await page.waitForTimeout(1500)

    const out = await page.evaluate(async () => {
      const tag = '[E2E] cardio-metres ' + Date.now()
      const { data: t } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: null, program_id: null, name: tag, is_personal: true })
        .select('id').single()

      try {
        window._templateCtx = {}
        const mk = (id, tag2 = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(tag2); e.id = id; document.body.appendChild(e) } return e }
        mk('att-type'); mk('att-notes'); mk('att-superset'); mk('att-error'); mk('add-to-template-modal', 'div')

        document.getElementById('att-type').value = 'cardio'
        document.getElementById('att-notes').value = ''
        document.getElementById('att-superset').value = ''
        window._exerciseDetailPicked = { id: null, name: tag + ' Row' }
        // 500 metres, entered as metres — NOT 0.5
        window._templateSets = [{ effortType: 'rpe', isDistanceBased: true, distanceM: '500' }]
        await saveExerciseToTemplate(t.id)

        const { data } = await db.from('workout_template_exercises')
          .select('exercise_name, metric_type, sets_json').eq('template_id', t.id).single()
        return { saved: data.sets_json[0], metricType: data.metric_type }
      } finally {
        // try/finally so a failed assertion above can never strand rows (les-041)
        await db.from('workout_template_exercises').delete().eq('template_id', t.id)
        await db.from('workout_templates').delete().eq('id', t.id)
      }
    })

    expect(out.metricType).toBe('cardio')
    expect(String(out.saved.distanceM)).toBe('500')
    // The legacy km key must NOT be written any more — that is what keeps old templates readable.
    expect(out.saved.distance == null || out.saved.distance === '').toBeTruthy()
  })

  // Regression, 2026-07-22 — found by the pre-push multi-agent review (Agent A).
  //
  // saveExerciseToTemplate builds sets_json from an explicit ALLOWLIST (`cleanSets`). That allowlist
  // has NEVER contained isDistanceBased, pace500Min/Max, hrZoneMin/Max, restHrMax or strokeRateMin/Max
  // — so every cardio target except duration/distance was silently discarded on the ADD path, while
  // the EDIT path (saveEditTemplateExercise, which writes sets_json raw) kept them. Two siblings doing
  // the same job, drifted, failing silently at every layer (les-036 + les-037).
  //
  // It becomes load-bearing today: the runner reads `tgt.isDistanceBased` to decide whether to show
  // the distance branch at all, so a newly-added distance cardio exercise would render as duration and
  // the new metres target would never appear.
  test('adding a cardio exercise preserves every cardio target, not just duration/distance', async ({ page }) => {
    await loginAsPT(page)
    await page.click('text=Personal')
    await page.waitForTimeout(1500)

    const saved = await page.evaluate(async () => {
      const tag = '[E2E] cardio-allowlist ' + Date.now()
      const { data: t } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: null, program_id: null, name: tag, is_personal: true })
        .select('id').single()
      try {
        window._templateCtx = {}
        const mk = (id, tg = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(tg); e.id = id; document.body.appendChild(e) } return e }
        mk('att-type'); mk('att-notes'); mk('att-superset'); mk('att-error'); mk('add-to-template-modal', 'div')
        document.getElementById('att-type').value = 'cardio'
        document.getElementById('att-notes').value = ''
        document.getElementById('att-superset').value = ''
        window._exerciseDetailPicked = { id: null, name: tag + ' Erg' }
        window._templateSets = [{
          effortType: 'rpe', isDistanceBased: true, distanceM: '500',
          pace500Min: '1:45', pace500Max: '1:50', wattsMin: '210', wattsMax: '240',
          hrZoneMin: '150', hrZoneMax: '170', restHrMax: '120',
          strokeRateMin: '24', strokeRateMax: '28', restMin: '2:00'
        }]
        await saveExerciseToTemplate(t.id)
        const { data } = await db.from('workout_template_exercises')
          .select('sets_json').eq('template_id', t.id).single()
        return data.sets_json[0]
      } finally {
        await db.from('workout_template_exercises').delete().eq('template_id', t.id)
        await db.from('workout_templates').delete().eq('id', t.id)
      }
    })

    // The one the runner branches on — without it the whole distance UI never renders.
    expect(saved.isDistanceBased).toBe(true)
    expect(String(saved.distanceM)).toBe('500')
    expect(saved.pace500Min).toBe('1:45')
    expect(saved.pace500Max).toBe('1:50')
    expect(String(saved.wattsMin)).toBe('210')
    expect(String(saved.hrZoneMin)).toBe('150')
    expect(String(saved.restHrMax)).toBe('120')
    expect(String(saved.strokeRateMin)).toBe('24')
    expect(saved.restMin).toBe('2:00')
  })

  // Regression, 2026-07-22 (missed-check-to-test). On a DURATION-based cardio set, the runner's
  // "Distance covered — optional" field wrote setData.distanceAchieved — a key saveRunnerSession
  // never read. So the distance was captured into memory and silently discarded on save, in the one
  // place a rower/bike interval records how far you actually went. Found while converting the
  // distance-based branch to metres: the sibling branch used a different key for the same value.
  // Same silent-drop class as ②b (2026-07-19), which this exact function was rewritten to fix.
  test('duration-based cardio persists its optional distance (was silently discarded)', async ({ page }) => {
    await loginAsPT(page)
    await page.click('text=Personal')
    await page.waitForTimeout(1500)

    const r = await page.evaluate(async () => {
      const clientId = await _getCurrentClientId()
      const tag = '[E2E] cardio-dur-dist ' + Date.now()
      // `_runner` is a top-level `let` in a classic script — assign the BARE identifier, never
      // window._runner, or saveRunnerSession reads the real (still-null) binding and no-ops (les-024).
      _runner = {
        clientId, name: tag, date: new Date().toISOString().split('T')[0], exercises: [
          { name: tag + ' Row', type: 'cardio', metricType: 'cardio', exerciseId: null,
            // A duration-based interval that also recorded how far it went — the exact shape the
            // interval overlay produces. Pre-fix this key was `distanceAchieved` and never persisted.
            loggedSets: [{ duration: '20:00', distanceM: '5200', avgWatts: '210' }] }
        ]
      }
      await saveRunnerSession()

      const { data: log } = await db.from('workout_logs').select('id').eq('client_id', clientId).eq('name', tag).single()
      try {
        const { data: exs } = await db.from('workout_log_exercises')
          .select('id, workout_log_sets(duration_seconds, distance_m, avg_watts)').eq('log_id', log.id)
        return exs[0].workout_log_sets[0]
      } finally {
        const { data: exs2 } = await db.from('workout_log_exercises').select('id').eq('log_id', log.id)
        await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exs2.map(e => e.id))
        await db.from('workout_log_exercises').delete().eq('log_id', log.id)
        await db.from('workout_logs').delete().eq('id', log.id)
      }
    })

    expect(r.duration_seconds).toBe(1200)
    expect(r.distance_m).toBe(5200)   // metres straight through — no x1000, and no longer dropped
    expect(r.avg_watts).toBe(210)
  })
})
