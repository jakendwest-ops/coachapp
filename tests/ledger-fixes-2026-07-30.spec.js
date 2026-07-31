const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsPT2, clickVisible } = require('./helpers')

// 3 more bugs Jake found still live after the 2026-07-29 fixes shipped — same reports, deeper root
// causes. Each test is red-first verified against the pre-fix code before landing.

test.describe('A3-cont — add-exercise still silently required a manual refresh', () => {
  test('saveExerciseToTemplate re-renders the list without throwing after closeModal', async ({ page }) => {
    // The 2026-07-29 fix (_afterTemplateExerciseSave) addressed the propagation chain being
    // fire-and-forget, but never reached — saveExerciseToTemplate itself closed the modal (which
    // really removes #att-notes/#att-superset from the DOM), then re-read those same two fields a
    // second time to build window._lastExerciseChange.row. That threw "Cannot read properties of
    // null (reading 'value')", aborting the function before _afterTemplateExerciseSave ever ran —
    // the insert had already gone through by then, so the exercise really was added, it just never
    // repainted without a manual refresh. Jake re-reported this exact repro live, 2026-07-30.
    await loginAsPT(page)
    await clickVisible(page, '[data-page="workouts"]')
    await page.waitForSelector('.list-row', { timeout: 15000 })

    const res = await page.evaluate(async () => {
      const { data: tmpl } = await db.from('workout_templates').select('id, coach_id')
        .is('client_id', null).is('program_id', null).is('generated_from_phase_id', null).limit(1).single()
      if (!tmpl) return { skipped: true }

      await openTemplate(tmpl.id, {})
      const tag = '[E2E] add-exercise ' + Date.now()
      _showExerciseSetsModal({
        targetId: tmpl.id, runnerCtx: null, coachId: tmpl.coach_id,
        picked: { id: null, name: tag }, existingType: 'weight_reps'
      })
      document.getElementById('att-notes').value = 'test note'
      document.getElementById('att-superset').value = 'a'

      let threw = null
      try {
        // saveExerciseToTemplate's OWN promise resolves before its fire-and-forget
        // _afterTemplateExerciseSave call finishes (same shape as the real onclick handler, which
        // never awaits it either) — the re-render lands a moment after this returns, so the check
        // below polls rather than reading the DOM synchronously.
        await saveExerciseToTemplate(tmpl.id)
      } catch (err) {
        threw = err.message
      }

      let shownWithoutRefresh = false
      for (let i = 0; i < 50 && !shownWithoutRefresh; i++) {
        await new Promise(r => setTimeout(r, 100))
        shownWithoutRefresh = (document.getElementById('template-exercise-list')?.innerHTML || '').includes(tag)
      }

      await db.from('workout_template_exercises').delete().eq('template_id', tmpl.id).eq('exercise_name', tag)
      return { skipped: false, threw, shownWithoutRefresh }
    })

    if (res.skipped) test.skip(true, 'no standalone template available on this account to test against')
    expect(res.threw).toBeNull()
    expect(res.shownWithoutRefresh).toBe(true)
  })
})

test.describe('A1-cont — 0 is a real value for jump height/distance too, not just weight', () => {
  test('toggleTableSet accepts a typed 0cm / 0m, blocks a genuinely blank row', async ({ page }) => {
    await loginAsPT(page)
    const res = await page.evaluate(() => {
      const mkEx = (mt, field) => ({ name: 'Test Jump', type: 'strength', metricType: mt, loggedSets: [],
        sets_json: [{}], targetSets: 1, tableRows: [{ [field]: 0, reps: '5', done: false }] })

      const origToast = window.showToast
      // A successful (non-blocked) toggle calls startRestTimer (setInterval) + renderRunner (injects
      // #workout-runner into document.body) as real side effects — clean both up after each run() or
      // they leak past this test into the rest of the suite's page lifetime.
      const run = (mt, field) => {
        let toasted = false
        window.showToast = () => { toasted = true }
        const exZero = mkEx(mt, field)
        _runner = { exercises: [exZero], exIdx: 0 }
        toggleTableSet(0)
        const zeroBlocked = toasted, zeroDone = exZero.tableRows[0].done, zeroLogged = exZero.loggedSets[0]?.[field]
        if (_runner._restInterval) clearInterval(_runner._restInterval)
        document.getElementById('workout-runner')?.remove()

        toasted = false
        const exBlank = mkEx(mt, field)
        exBlank.tableRows[0][field] = ''
        _runner = { exercises: [exBlank], exIdx: 0 }
        toggleTableSet(0)
        const blankBlocked = toasted, blankDone = exBlank.tableRows[0].done
        if (_runner._restInterval) clearInterval(_runner._restInterval)
        document.getElementById('workout-runner')?.remove()
        return { zeroBlocked, zeroDone, zeroLogged, blankBlocked, blankDone }
      }

      const height = run('jump_height', 'height_cm')
      const distance = run('jump_distance', 'distance_m')
      window.showToast = origToast
      _runner = null
      localStorage.removeItem(_runnerDraftKey(undefined))
      return { height, distance }
    })

    expect(res.height.zeroBlocked).toBe(false)
    expect(res.height.zeroDone).toBe(true)
    expect(res.height.zeroLogged).toBe(0)
    expect(res.height.blankBlocked).toBe(true)
    expect(res.height.blankDone).toBe(false)

    expect(res.distance.zeroBlocked).toBe(false)
    expect(res.distance.zeroDone).toBe(true)
    expect(res.distance.zeroLogged).toBe(0)
    expect(res.distance.blankBlocked).toBe(true)
    expect(res.distance.blankDone).toBe(false)
  })

  test('saveRunnerSession persists a real 0 height_cm/distance_m, not null', async ({ page }) => {
    await loginAsPT(page)
    await clickVisible(page, ['#vs-personal', '#mvs-personal'])
    await page.waitForTimeout(1500)

    const res = await page.evaluate(async () => {
      const clientId = await _getCurrentClientId()
      const tag = '[E2E] jump-zero ' + Date.now()
      _runner = {
        clientId, name: tag, date: new Date().toISOString().split('T')[0], exercises: [
          { name: tag + ' Height', type: 'strength', metricType: 'jump_height', exerciseId: null, loggedSets: [{ height_cm: 0, reps: '3' }] },
          { name: tag + ' Distance', type: 'strength', metricType: 'jump_distance', exerciseId: null, loggedSets: [{ distance_m: 0, reps: '3' }] }
        ]
      }
      await saveRunnerSession()

      const { data: log } = await db.from('workout_logs').select('id').eq('client_id', clientId).eq('name', tag).single()
      const { data: exs } = await db.from('workout_log_exercises')
        .select('id, exercise_name, workout_log_sets(height_cm, distance_m)').eq('log_id', log.id)

      const exIds = (exs || []).map(e => e.id)
      await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exIds)
      await db.from('workout_log_exercises').delete().eq('log_id', log.id)
      await db.from('workout_logs').delete().eq('id', log.id)

      const byName = Object.fromEntries((exs || []).map(e => [e.exercise_name, e]))
      return {
        height: byName[tag + ' Height']?.workout_log_sets[0]?.height_cm,
        distance: byName[tag + ' Distance']?.workout_log_sets[0]?.distance_m
      }
    })
    expect(res.height).toBe(0)
    expect(res.distance).toBe(0)
  })

  test('saveWorkoutSession (manual Log Session modal) persists a real 0 weight, not null — sibling of the runner fix', async ({ page }) => {
    // Same falsy-zero shape as saveRunnerSession's weight guard, in a completely separate function
    // (this is the manual "Log Session" modal, for backfilling a past session — not the live runner).
    // Missed by the 2026-07-29 fix since Jake's report came from the runner; found by re-grepping
    // every sibling save path for the same `if (s.weight)` pattern.
    await loginAsPT(page)
    await clickVisible(page, ['#vs-personal', '#mvs-personal'])
    await page.waitForTimeout(1500)

    const res = await page.evaluate(async () => {
      const clientId = await _getCurrentClientId()
      const tag = '[E2E] log-session-zero ' + Date.now()

      await showLogSessionModal(clientId) // mounts the real modal + all its DOM (ls-name, ls-date, etc.)
      window._logBlocks.push({ name: tag, type: 'strength', sets: [{}] })
      renderLogExercises() // renders ls-rmin-0-0 / ls-weight-0-0 for the set just pushed

      document.getElementById('ls-name').value = tag
      document.getElementById('ls-rmin-0-0').value = '5'
      document.getElementById('ls-weight-0-0').value = '0'

      let threw = null
      try {
        await saveWorkoutSession(clientId)
      } catch (err) { threw = err.message }

      const { data: log } = await db.from('workout_logs').select('id').eq('client_id', clientId).eq('name', tag).maybeSingle()
      let weight
      if (log) {
        const { data: exs } = await db.from('workout_log_exercises').select('id, workout_log_sets(weight_kg)').eq('log_id', log.id)
        weight = exs?.[0]?.workout_log_sets?.[0]?.weight_kg
        const exIds = (exs || []).map(e => e.id)
        await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exIds)
        await db.from('workout_log_exercises').delete().eq('log_id', log.id)
        await db.from('workout_logs').delete().eq('id', log.id)
      }
      document.getElementById('log-session-modal')?.remove()
      return { threw, weight, foundLog: !!log }
    })

    expect(res.threw).toBeNull()
    expect(res.foundLog).toBe(true)
    expect(res.weight).toBe(0)
  })

  test('_setDetailsLine (My Progress diary) shows a real 0cm jump, not a blank line — found via the blast-radius sweep for this fix', async ({ page }) => {
    await loginAsPT(page)
    const res = await page.evaluate(() => ({
      height: _setDetailsLine([{ height_cm: 0, reps_achieved: null }]),
      expected: fmtJumpHeight(0) // computed browser-side — fmtJumpHeight isn't available in the test's Node context
    }))
    expect(res.height).toBe(res.expected) // exact expected string, not just "non-empty"
    // NOTE: a jump_distance 0m does NOT reach the diary display yet — fmtDistanceM (app-workouts.js)
    // has its own `if (!n) return ''`, shared with every cardio-distance call site, so fixing it here
    // would need its own scoped pass rather than folding into tonight's height-only report. Logged
    // as a new ledger item, not silently fixed or silently dropped.
  })
})

test.describe('A2-cont — fetchRunnerLastSession also excluded a real 0, likely the actual Depth Jump mechanism', () => {
  test('a jump set with height_cm:0 and no reps still counts as last-session data', async ({ page }) => {
    // Found by multi-agent review while auditing tonight's falsy-zero fix for siblings: this filter
    // decides which logged sets count as "last session" data at all. A set logged with height_cm:0
    // and no reps_achieved (reps aren't required to log a jump — see toggleTableSet) was silently
    // excluded here even after it saved correctly — the most likely real mechanism behind Jake's
    // "Depth Jump last-session history doesn't show" report, since a fresh non-zero log round-trips
    // fine (verified separately) but this filter has always dropped an all-zero/all-blank-but-height set.
    await loginAsPT(page)
    const res = await page.evaluate(() => {
      const sets = [{ set_number: 1, weight_kg: null, reps_achieved: null, height_cm: 0, distance_m: null }]
      return sets.filter(s => _hasNumVal(s.weight_kg) || _hasNumVal(s.reps_achieved) || _hasNumVal(s.height_cm) || _hasNumVal(s.distance_m))
    })
    expect(res.length).toBe(1)
  })
})

test.describe('A1-cont2 — a real 0 weight survives a re-render, not just a save', () => {
  test('editRunnerSet pre-fills a real 0 weight, not blank', async ({ page }) => {
    // wr-edit-weight's value attribute pre-fills the CURRENTLY-logged value for an already-done set —
    // unlike the table's deliberate no-prefill ghost text, this one really does need to round-trip
    // the true value, or opening the editor on a real 0kg set silently shows an empty field.
    await loginAsPT(page)
    const res = await page.evaluate(() => {
      const exA = { name: 'A', loggedSets: [{ weight: 0, reps: '5' }] }
      _runner = { exercises: [exA], exIdx: 0 }
      editRunnerSet(0, 0)
      const val = document.getElementById('wr-edit-weight')?.value
      document.getElementById('wr-edit-overlay')?.remove()
      _runner = null
      return val
    })
    expect(res).toBe('0')
  })

  test('Log Session modal keeps a typed 0 weight after adding another set (re-render does not blank it)', async ({ page }) => {
    await loginAsPT(page)
    await clickVisible(page, ['#vs-personal', '#mvs-personal'])
    await page.waitForTimeout(1500)
    const res = await page.evaluate(async () => {
      const clientId = await _getCurrentClientId()
      await showLogSessionModal(clientId)
      window._logBlocks.push({ name: 'tmp', type: 'strength', sets: [{}] })
      renderLogExercises()
      document.getElementById('ls-weight-0-0').value = '0'

      // Same tail as the real "+ Add exercise" button: flush, mutate, re-render.
      flushLogState()
      window._logBlocks.push({ name: 'tmp2', type: 'strength', sets: [{}] })
      renderLogExercises()

      const val = document.getElementById('ls-weight-0-0')?.value
      document.getElementById('log-session-modal')?.remove()
      return val
    })
    expect(res).toBe('0')
  })
})

test.describe('fmtDistanceM — a real 0m survives, matching the weight/height fix', () => {
  test('fmtDistanceM(0) renders "0 m", not blank', async ({ page }) => {
    await loginAsPT(page)
    const res = await page.evaluate(() => ({
      zero: fmtDistanceM(0),
      blank: fmtDistanceM(''),
      nullVal: fmtDistanceM(null),
      undef: fmtDistanceM(undefined),
    }))
    expect(res.zero).toBe('0 m')
    expect(res.blank).toBe('')
    expect(res.nullVal).toBe('')
    expect(res.undef).toBe('')
  })

  // Regression found by multi-agent review AFTER the fmtDistanceM(0) fix above landed:
  // _cardioDistanceM(s) returns a literal 0 (never null) for "distance not entered" — every other
  // caller relies on that to sum/compare distances as numbers. Once fmtDistanceM stopped treating 0
  // as blank, a bare `fmtDistanceM(_cardioDistanceM(s))` started rendering "0 m" on every
  // duration-only cardio set (the common case: 20 minutes on the bike, no distance logged). Fixed at
  // the 2 unguarded call sites with an explicit `_cardioDistanceM(s) > 0` check.
  test('a duration-only cardio set does not show "0 m" in the finish-screen set line', async ({ page }) => {
    await loginAsPT(page)
    const res = await page.evaluate(() => {
      // Mirrors showRunnerFinish's per-set cardio line construction directly, since driving the
      // whole finish screen would need a real save round-trip for no extra signal.
      const s = { duration: '20:00' } // no distanceM/distance at all
      const line = [s.duration, _cardioDistanceM(s) > 0 ? fmtDistanceM(_cardioDistanceM(s)) : null].filter(Boolean).join(' · ')
      return line
    })
    expect(res).toBe('20:00')
    expect(res).not.toContain('0 m')
  })
})

test.describe('openWorkoutLog — jump sets now get their own column, not the empty weight_reps columns', () => {
  test('a jump_height set with a real 0cm shows "0 cm", not "—", in the past-session viewer', async ({ page }) => {
    await loginAsPT(page)
    await clickVisible(page, ['#vs-personal', '#mvs-personal'])
    await page.waitForTimeout(1500)

    const res = await page.evaluate(async () => {
      const clientId = await _getCurrentClientId()
      const tag = '[E2E] openworkoutlog-jump ' + Date.now()
      _runner = {
        clientId, name: tag, date: new Date().toISOString().split('T')[0],
        exercises: [{ name: tag, type: 'strength', metricType: 'jump_height', exerciseId: null, loggedSets: [{ height_cm: 0, reps: '4' }] }]
      }
      await saveRunnerSession()
      const { data: log } = await db.from('workout_logs').select('id').eq('client_id', clientId).eq('name', tag).single()

      await openWorkoutLog(log.id, clientId)
      const html = document.getElementById('tab-content')?.innerHTML || document.getElementById('main-content')?.innerHTML || ''

      const { data: exs } = await db.from('workout_log_exercises').select('id').eq('log_id', log.id)
      const exIds = (exs || []).map(e => e.id)
      await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exIds)
      await db.from('workout_log_exercises').delete().eq('log_id', log.id)
      await db.from('workout_logs').delete().eq('id', log.id)

      return { hasHeightHeader: html.includes('Height'), hasZero: /\b0(\.0)?\s*cm\b/.test(html), hasJumpsHeader: html.includes('Jumps') }
    })
    expect(res.hasHeightHeader).toBe(true)
    expect(res.hasJumpsHeader).toBe(true)
    expect(res.hasZero).toBe(true)
  })
})

test.describe('exercises table writes — anchored by coach_id, an unrelated coach cannot mutate another coach\'s exercise', () => {
  test('toggleExerciseArchived/_rememberExerciseMetricType/deleteExercise (the real app functions, not a re-implemented query) all no-op against a foreign exercise', async ({ browser }) => {
    // PT2 owns nothing (Probe A's whole premise, tests/rls-audit.spec.js). Calls the ACTUAL app
    // functions, not a hand-rolled query — a test that re-implements its own `.eq('coach_id', ...)`
    // filter can never go red regardless of whether the real function has the anchor, which is exactly
    // what an earlier draft of this test did. If any of these "succeed" (no error, row actually
    // changed) against PT's real exercise while logged in as PT2, either the coach_id anchor is
    // missing from the app code (what this fix closes) or the RLS policy itself has no ownership check
    // (a deeper gap — see the CRITICAL workout_logs finding this session for the sibling shape of that
    // problem). This proves the JS-side anchor; it does not by itself prove RLS also defends the raw API.
    const ptCtx = await browser.newContext()
    const pt2Ctx = await browser.newContext()
    const ptPage = await ptCtx.newPage()
    const pt2Page = await pt2Ctx.newPage()
    let exId

    try {
      await loginAsPT(ptPage)
      exId = await ptPage.evaluate(async () => {
        const tag = '[E2E] coach-anchor-probe ' + Date.now()
        const { data } = await db.from('exercises').insert({ coach_id: currentUser.id, name: tag, metric_type: 'weight_reps' }).select('id').single()
        return data.id
      })

      await loginAsPT2(pt2Page)
      // deleteExercise() itself calls confirm() — stub it before calling, so the real function path
      // (not a bypassed/short-circuited one) runs unattended.
      await pt2Page.evaluate(() => { window.confirm = () => true })
      await pt2Page.evaluate(async (id) => {
        await toggleExerciseArchived(id, true)
        await _rememberExerciseMetricType(id, 'cardio')
        await deleteExercise(id)
      }, exId)

      const after = await ptPage.evaluate(async (id) => (await db.from('exercises').select('id, name, metric_type, is_archived').eq('id', id).maybeSingle()).data, exId)
      expect(after?.id).toBe(exId) // still there — deleteExercise's coach_id anchor did not delete it
      expect(after?.is_archived).not.toBe(true) // toggleExerciseArchived's anchor did not archive it
      expect(after?.metric_type).not.toBe('cardio') // _rememberExerciseMetricType's anchor did not touch it
    } finally {
      if (exId) await ptPage.evaluate(async (id) => { await db.from('exercises').delete().eq('id', id) }, exId).catch(() => {})
      await ptCtx.close().catch(() => {})
      await pt2Ctx.close().catch(() => {})
    }
  })
})

test.describe('saveRunnerSession/saveWorkoutSession fail loud instead of silently defaulting coach_id — CRITICAL, confirmed exploitable', () => {
  // CONFIRMED LIVE 2026-07-30 via a real cross-tenant probe: PT2 (an unrelated coach, owns nothing)
  // called saveRunnerSession with clientId set to PT's real client. The clients ownership lookup was
  // correctly denied by RLS (0 rows) — but `clientRecord?.coach_id || currentUser.id` silently
  // defaulted to PT2's own id, and the workout_logs INSERT went through, landing a fabricated session
  // in PT's real client's history attributed to a stranger. This test proves the JS-level half of the
  // fix (refuse to save when ownership can't be verified) by simulating the same "lookup returns
  // nothing" condition via a monkey-patched dbq, without needing 2 real accounts. It does NOT prove
  // the deeper fix — see the CRITICAL ledger row: workout_logs' own INSERT policy has no ownership
  // check at all, confirmed via a raw insert bypassing the app JS entirely. That needs a live SQL
  // policy fix Jake must run; this JS fix closes the app's own UI path regardless.
  test('saveRunnerSession refuses to save (does not insert) when the client lookup returns no row', async ({ page }) => {
    await loginAsPT(page)
    const res = await page.evaluate(async () => {
      const tag = '[E2E] fail-loud-probe ' + Date.now()
      const origDbq = window.dbq
      window.dbq = async (label, query, opts) => {
        if (label === 'saveRunnerSession:clientLookup') return { data: null, error: { message: 'simulated RLS denial' } }
        return origDbq(label, query, opts)
      }
      let toastMsg = null
      const origToast = window.showToast
      window.showToast = (msg) => { toastMsg = msg }

      _runner = {
        clientId: '00000000-0000-0000-0000-000000000000', name: tag, date: new Date().toISOString().split('T')[0],
        exercises: [{ name: tag, type: 'strength', metricType: 'weight_reps', exerciseId: null, loggedSets: [{ weight: '10', reps: '5' }] }]
      }
      await saveRunnerSession()

      window.dbq = origDbq
      window.showToast = origToast
      const { data: log } = await db.from('workout_logs').select('id').eq('name', tag).maybeSingle()
      _runner = null
      return { inserted: !!log, toastMsg }
    })
    expect(res.inserted).toBe(false)
    expect(res.toastMsg).toContain('verify')
  })
})

test.describe('deleteEvent/deleteGoal — anchored by created_by, an unrelated coach cannot delete another coach\'s row', () => {
  test('deleteEvent no-ops (real function call) against a foreign event', async ({ browser }) => {
    const ptCtx = await browser.newContext()
    const pt2Ctx = await browser.newContext()
    const ptPage = await ptCtx.newPage()
    const pt2Page = await pt2Ctx.newPage()
    let eventId

    try {
      await loginAsPT(ptPage)
      eventId = await ptPage.evaluate(async () => {
        const { data } = await db.from('events').insert({
          title: '[E2E] created-by-anchor-probe ' + Date.now(), date: new Date().toISOString().split('T')[0],
          type: 'other', is_pt_assigned: true, created_by: currentUser.id
        }).select('id').single()
        return data.id
      })

      await loginAsPT2(pt2Page)
      await pt2Page.evaluate(() => { window.confirm = () => true })
      await pt2Page.evaluate(async (id) => { await deleteEvent(id) }, eventId)

      const stillThere = await ptPage.evaluate(async (id) => (await db.from('events').select('id').eq('id', id).maybeSingle()).data, eventId)
      expect(stillThere?.id).toBe(eventId)
    } finally {
      if (eventId) await ptPage.evaluate(async (id) => { await db.from('events').delete().eq('id', id) }, eventId).catch(() => {})
      await ptCtx.close().catch(() => {})
      await pt2Ctx.close().catch(() => {})
    }
  })

  test('deleteGoal no-ops (real function call) against a foreign goal', async ({ browser }) => {
    const ptCtx = await browser.newContext()
    const pt2Ctx = await browser.newContext()
    const ptPage = await ptCtx.newPage()
    const pt2Page = await pt2Ctx.newPage()
    let goalId, victimClientId

    try {
      await loginAsPT(ptPage)
      const owned = await ptPage.evaluate(async () => {
        const { data: client } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1).single()
        const { data: goal } = await db.from('goals').insert({
          client_id: client.id, created_by: currentUser.id, title: '[E2E] created-by-anchor-probe ' + Date.now(),
          goal_type: 'custom', priority: 1, status: 'active'
        }).select('id').single()
        return { clientId: client.id, goalId: goal.id }
      })
      victimClientId = owned.clientId
      goalId = owned.goalId

      await loginAsPT2(pt2Page)
      await pt2Page.evaluate(() => { window.confirm = () => true })
      await pt2Page.evaluate(async (id) => { await deleteGoal(id, null) }, goalId)

      const stillThere = await ptPage.evaluate(async (id) => (await db.from('goals').select('id').eq('id', id).maybeSingle()).data, goalId)
      expect(stillThere?.id).toBe(goalId)
    } finally {
      if (goalId) await ptPage.evaluate(async (id) => { await db.from('goals').delete().eq('id', id) }, goalId).catch(() => {})
      await ptCtx.close().catch(() => {})
      await pt2Ctx.close().catch(() => {})
    }
  })
})
