const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsPT2, loginAsClient, clickVisible } = require('./helpers')

// ─── Diary shows 0/0/0 tiles for real sessions with no logged sets (2026-07-19 finding) ───────────
test.describe('diary shows a "No sets logged" note instead of 0/0/0 tiles', () => {
  test('a session with an exercise but zero logged sets renders the note, not the tile row', async ({ page }) => {
    // renderProgressPerSession (the "Recent sessions" diary this fix touches) is the client/solo
    // SELF-view -- "your" own My Progress page, not the coach's client-profile screen (a different
    // function, renderClientPerformance). Must reach it via the client role.
    await loginAsClient(page)
    const fixture = await page.evaluate(async () => {
      const clientId = await _getCurrentClientId()
      const { data: clientRow } = await db.from('clients').select('coach_id').eq('id', clientId).single()
      const { data: log } = await db.from('workout_logs').insert({ coach_id: clientRow.coach_id, client_id: clientId, name: '[E2E] Zero-Set Session', date: '2026-01-01' }).select('id').single()
      const { data: ex } = await db.from('workout_log_exercises').insert({ log_id: log.id, exercise_name: '[E2E] Zero-Set Exercise', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0 }).select('id').single()
      return { logId: log.id, exId: ex.id }
    })

    try {
      // Real button clicks, with a settle wait before each -- clicking Performance/Recent-sessions
      // before the previous render has fully finished (its own _getCurrentClientId/DB-fetch awaits)
      // races renderProgressStrength's `el` reference against a subsequent re-render replacing the
      // same container, which throws "Cannot set properties of null" -- a test-timing issue, not a
      // bug in this fix, confirmed by reproducing it both with and without adequate waits.
      await clickVisible(page, '[data-page="progress"]')
      await page.waitForSelector('h1:has-text("My Progress")', { timeout: 8000 })
      await page.waitForTimeout(1500)
      await page.click('button:has-text("Performance")')
      await page.waitForTimeout(1500)
      await page.click('button:has-text("Recent sessions")')
      await page.waitForTimeout(1000)

      const html = await page.evaluate(() => document.getElementById('progress-tab-content')?.innerHTML || '')
      expect(html).toContain('No sets logged')
    } finally {
      await page.evaluate(async (logId) => { await db.from('workout_logs').delete().eq('id', logId) }, fixture.logId).catch(() => {})
    }
  })
})

// ─── Client notes typed in the runner are write-only (2026-07-23 finding) ─────────────────────────
test.describe('client-authored per-exercise notes now render in the coach\'s session-detail view', () => {
  test('openWorkoutLog shows ex.client_notes, escaped, where it was previously never rendered', async ({ page }) => {
    await loginAsPT(page)
    const tag = '<b>[E2E] client note ' + Date.now() + '</b>'
    const fixture = await page.evaluate(async (noteText) => {
      const { data: clientRow } = await db.from('clients').select('id, coach_id').eq('coach_id', currentUser.id).limit(1).single()
      const { data: log } = await db.from('workout_logs').insert({ coach_id: clientRow.coach_id, client_id: clientRow.id, name: '[E2E] Client-Note Session', date: '2026-01-01' }).select('id').single()
      const { data: ex } = await db.from('workout_log_exercises').insert({ log_id: log.id, exercise_name: '[E2E] Client-Note Exercise', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0, client_notes: noteText }).select('id').single()
      await db.from('workout_log_sets').insert({ workout_log_exercise_id: ex.id, set_number: 1, weight_kg: 40, reps_achieved: 10 })
      return { logId: log.id, clientId: clientRow.id }
    }, tag)

    try {
      await page.evaluate(async ({ logId, clientId }) => { await openWorkoutLog(logId, clientId) }, fixture)
      await page.waitForTimeout(500)
      const html = await page.evaluate(() => document.getElementById('tab-content')?.innerHTML || document.getElementById('main-content')?.innerHTML || '')
      expect(html).toContain('Client note')
      expect(html).not.toContain(tag) // raw payload must never appear -- proves it was escaped
      expect(html).toContain('&lt;b&gt;[E2E] client note')
    } finally {
      await page.evaluate(async (logId) => { await db.from('workout_logs').delete().eq('id', logId) }, fixture.logId).catch(() => {})
    }
  })
})

// ─── PT/Personal boundary audit — weight_logs (2026-07-13 finding) ─────────────────────────────────
test.describe('weight_logs INSERT — an unrelated coach cannot write a weight entry for a client they do not own (2026-07-13 finding)', () => {
  test('a live 2-account probe confirms the write is rejected', async ({ browser }) => {
    const ptCtx = await browser.newContext()
    const pt2Ctx = await browser.newContext()
    const ptPage = await ptCtx.newPage()
    const pt2Page = await pt2Ctx.newPage()
    let plantedId = null

    try {
      await loginAsPT(ptPage)
      const realClientId = await ptPage.evaluate(async () => {
        const { data } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1).single()
        return data.id
      })

      await loginAsPT2(pt2Page)
      const attempt = await pt2Page.evaluate(async (clientId) => {
        const { data, error } = await db.from('weight_logs').insert({ client_id: clientId, date: '2026-01-01', weight_kg: 999 }).select('id').single()
        return { insertedId: data?.id || null, errorMessage: error?.message || null }
      }, realClientId)
      plantedId = attempt.insertedId

      // Don't trust the client-side result alone -- independently confirm from PT's own session
      // (which definitely owns and can see this client's data) whether the row actually landed.
      const actualFromPT = await ptPage.evaluate(async (clientId) => {
        const { data } = await db.from('weight_logs').select('id').eq('client_id', clientId).eq('weight_kg', 999)
        return data?.length || 0
      }, realClientId)

      expect(attempt.insertedId, 'an unrelated coach must not be able to insert a weight_logs row for a client they do not own').toBeNull()
      expect(actualFromPT, 'no row should have actually been written, regardless of what the inserting session saw').toBe(0)
    } finally {
      if (plantedId) await ptPage.evaluate(async (id) => { await db.from('weight_logs').delete().eq('id', id) }, plantedId).catch(() => {})
      await ptCtx.close().catch(() => {})
      await pt2Ctx.close().catch(() => {})
    }
  })
})

// ─── PT/Personal boundary audit — workout_template_exercises client-write (2026-08-01 finding) ────
test.describe('workout_template_exercises UPDATE — a client cannot write to their own plan clone (2026-08-01 finding)', () => {
  test('a live probe confirms a client-authored update to their own clone\'s exercise is rejected', async ({ browser }) => {
    const ptCtx = await browser.newContext()
    const clientCtx = await browser.newContext()
    const ptPage = await ptCtx.newPage()
    const clientPage = await clientCtx.newPage()
    let cleanup = {}

    try {
      await loginAsPT(ptPage)
      cleanup = await ptPage.evaluate(async () => {
        const { data: clientRow } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1).single()
        const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, is_personal: false, name: '[E2E] WTE-Probe Program' }).select('id').single()
        const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single()
        const { data: masterTmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: '[E2E] WTE-Probe Session' }).select('id').single()
        const { data: pw } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: masterTmpl.id, week_number: 1 }).select('id').single()
        const { data: cloneTmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: clientRow.id, name: '[E2E] WTE-Probe Session' }).select('id').single()
        const { data: wte } = await db.from('workout_template_exercises').insert({ template_id: cloneTmpl.id, exercise_name: '[E2E] WTE-Probe Exercise', exercise_type: 'strength', order_index: 0 }).select('id').single()
        const { data: cp } = await db.from('client_programs').insert({ client_id: clientRow.id, program_id: prog.id }).select('id').single()
        await db.from('client_program_workouts').insert({ client_program_id: cp.id, program_phase_workout_id: pw.id, workout_template_id: cloneTmpl.id, week_number: 1 })
        return { programId: prog.id, phaseId: phase.id, masterTmplId: masterTmpl.id, pwId: pw.id, cloneTmplId: cloneTmpl.id, wteId: wte.id, cpId: cp.id }
      })

      await loginAsClient(clientPage)
      const payload = '<img src=x onerror=alert(1)>XSS-PROBE'
      await clientPage.evaluate(async ({ wteId, payload }) => {
        await db.from('workout_template_exercises').update({ exercise_name: payload }).eq('id', wteId)
      }, { wteId: cleanup.wteId, payload })

      const actualFromPT = await ptPage.evaluate(async (wteId) => {
        const { data } = await db.from('workout_template_exercises').select('exercise_name').eq('id', wteId).single()
        return data?.exercise_name
      }, cleanup.wteId)

      expect(actualFromPT, 'a client must not be able to write to their own plan clone\'s workout_template_exercises').toBe('[E2E] WTE-Probe Exercise')
    } finally {
      if (cleanup.cpId) await ptPage.evaluate(async (id) => { await db.from('client_program_workouts').delete().eq('client_program_id', id); await db.from('client_programs').delete().eq('id', id) }, cleanup.cpId).catch(() => {})
      if (cleanup.cloneTmplId) await ptPage.evaluate(async (id) => { await db.from('workout_template_exercises').delete().eq('template_id', id); await db.from('workout_templates').delete().eq('id', id) }, cleanup.cloneTmplId).catch(() => {})
      if (cleanup.pwId) await ptPage.evaluate(async (id) => { await db.from('program_phase_workouts').delete().eq('id', id) }, cleanup.pwId).catch(() => {})
      if (cleanup.masterTmplId) await ptPage.evaluate(async (id) => { await db.from('workout_template_exercises').delete().eq('template_id', id); await db.from('workout_templates').delete().eq('id', id) }, cleanup.masterTmplId).catch(() => {})
      if (cleanup.phaseId) await ptPage.evaluate(async (id) => { await db.from('program_phases').delete().eq('id', id) }, cleanup.phaseId).catch(() => {})
      if (cleanup.programId) await ptPage.evaluate(async (id) => { await db.from('programs').delete().eq('id', id) }, cleanup.programId).catch(() => {})
      await ptCtx.close().catch(() => {})
      await clientCtx.close().catch(() => {})
    }
  })
})

// ─── workout_template_exercises writes now anchor by template ownership (2026-08-02 hardening) ────
test.describe('saveEditTemplateExercise/deleteTemplateExercise — an unrelated coach cannot mutate another coach\'s template exercise', () => {
  test('both real app functions no-op against a foreign workout_template_exercises row', async ({ browser }) => {
    const ptCtx = await browser.newContext()
    const pt2Ctx = await browser.newContext()
    const ptPage = await ptCtx.newPage()
    const pt2Page = await pt2Ctx.newPage()
    let setup = {}

    try {
      await loginAsPT(ptPage)
      setup = await ptPage.evaluate(async () => {
        const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Anchor-Probe Template' }).select('id').single()
        const { data: wte } = await db.from('workout_template_exercises').insert({ template_id: tmpl.id, exercise_name: '[E2E] Anchor-Probe Exercise', exercise_type: 'strength', order_index: 0 }).select('id').single()
        return { templateId: tmpl.id, wteId: wte.id }
      })

      await loginAsPT2(pt2Page)
      // saveEditTemplateExercise(texId, templateId) reads its payload from injected modal DOM/globals,
      // not from function args -- same minimal-DOM pattern as tests/builder-metric-type.spec.js. Must be
      // set up so the call actually reaches _verifyTemplateOwnership instead of throwing/bailing earlier
      // (an earlier draft of this test passed the ids in swapped positions and never exercised the anchor).
      await pt2Page.evaluate(async ({ templateId, wteId }) => {
        window._templateCtx = {} // _resolveEditableTemplateId becomes a passthrough
        const mk = (id, tag2 = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(tag2); e.id = id; document.body.appendChild(e) } return e }
        mk('att-type'); mk('att-notes'); mk('att-superset'); mk('att-error')
        document.getElementById('att-type').value = 'weight_reps'
        document.getElementById('att-notes').value = ''
        document.getElementById('att-superset').value = ''
        window._exerciseDetailPicked = { id: null, name: '[E2E] Renamed By PT2' }
        window._templateSets = []
        await saveEditTemplateExercise(wteId, templateId)
      }, setup).catch(() => {})
      await pt2Page.evaluate(async ({ templateId, wteId }) => {
        window._templateCtx = {}
        await deleteTemplateExercise(wteId, templateId)
      }, setup).catch(() => {})

      const after = await ptPage.evaluate(async (id) => (await db.from('workout_template_exercises').select('id, exercise_name').eq('id', id).maybeSingle()).data, setup.wteId)
      expect(after?.id, 'deleteTemplateExercise must not have deleted a foreign exercise row').toBe(setup.wteId)
      expect(after?.exercise_name, 'saveEditTemplateExercise must not have renamed a foreign exercise row').toBe('[E2E] Anchor-Probe Exercise')
    } finally {
      if (setup.wteId) await ptPage.evaluate(async (id) => { await db.from('workout_template_exercises').delete().eq('id', id) }, setup.wteId).catch(() => {})
      if (setup.templateId) await ptPage.evaluate(async (id) => { await db.from('workout_templates').delete().eq('id', id) }, setup.templateId).catch(() => {})
      await ptCtx.close().catch(() => {})
      await pt2Ctx.close().catch(() => {})
    }
  })
})

// ─── Jump reps only took a single value, not a range (2026-08-02 finding) ─────────────────────────
// Jake, live, on Full Body A > Box Jump: switching an exercise to Jump height turned a 3-5 rep range
// into a single "3" on screen (the DB value survived -- flushTemplateSets preserves an un-rendered
// field). Root cause was one 2026-07-22 design choice shared by 3 sites: the builder only rendered one
// reps box for jumps, and the runner target bar + day-row formatter both deliberately special-cased
// jump reps to a single value BECAUSE the builder never offered a range. All 3 fixed together.
test.describe('Jump height/distance reps render as a range, matching every other set type', () => {
  test('builder renders TWO reps boxes for a jump exercise, not one', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      window._templateSets = [{ repsMin: '3', repsMax: '5', targetHeightCm: '40', effortType: 'rpe' }]
      const mk = (id, tag2 = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(tag2); e.id = id; document.body.appendChild(e) } return e }
      mk('att-type'); mk('att-sets-container', 'div')
      renderTemplateSets('att-sets-container', 'jump_height')
      return {
        min: document.getElementById('ts-rmin-0')?.value,
        max: document.getElementById('ts-rmax-0')?.value,
      }
    })
    expect(r.min).toBe('3')
    expect(r.max, 'jump branch must render a second reps box (ts-rmax) like every other set type').toBe('5')
  })

  test('runner target bar shows a JUMPS range, not just the minimum', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const tgt = { repsMin: '3', repsMax: '5', targetHeightCm: '40' }
      const { cols } = _buildTargetCols(tgt, { name: 'x', metricType: 'jump_height', oneRM: null })
      return cols.find(c => c.label === 'JUMPS')?.val
    })
    expect(r).toBe('3–5')
  })

  test('runner target bar shows a single value (no dash) when only one end is prescribed', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const tgt = { repsMin: '3', targetHeightCm: '40' }
      const { cols } = _buildTargetCols(tgt, { name: 'x', metricType: 'jump_height', oneRM: null })
      return cols.find(c => c.label === 'JUMPS')?.val
    })
    expect(r).toBe('3')
  })

  test('day-row prescription text shows a jumps range', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => _fmtSetDetail({ targetHeightCm: '40', repsMin: '3', repsMax: '5', effortType: 'rpe' }))
    expect(r).toContain('3–5 jumps')
  })

  test('day-row prescription text falls back to a single value when only one end is prescribed', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => _fmtSetDetail({ targetHeightCm: '40', repsMin: '3', effortType: 'rpe' }))
    expect(r).toContain('3 jumps')
    expect(r).not.toContain('undefined')
  })
})

// ─── Builder set-editor decluttered: BW/Assist/Repeat removed (2026-08-02 finding) ────────────────
// Jake, live: "delete 'BW', 'Assist', 'Repeat' and the blank box next to the set number." Repeat (the
// number input + button) is a pure UI action with nothing persisted, so it and its only test coverage
// (intervals-2026-07-24.spec.js) are removed outright, not just hidden. BW/Assist are stored per-set
// flags (bodyweight/assisted) that drive other rendering (weight row visibility, runner BW badge) --
// removing their toggle entirely would strand any set that already has the flag set with no way to see
// or undo it (les-043 shape), so they render only when the set already carries the flag: a legacy
// escape hatch, same pattern this file already uses for the "Pace / km (legacy)" row.
//
// UPDATED 2026-08-11 — the decluttering finished. Jake called AMRAP too, so the set-editor toggle row
// now holds NOTHING for a new set. Two different removals, deliberately not the same shape:
//   * AMRAP is gone outright (flag, both render sites, toggle). It was display-only with zero live
//     usage, so there is no legacy set to strand and no escape hatch to preserve.
//   * `assisted` is also gone outright, but for the opposite reason -- it was never reachable AND it
//     corrupted weight_kg. See assisted-lift-removed-2026-08-11.spec.js.
//   * `bodyweight` KEEPS its conditional escape hatch. Unlike the other two it does real work in the
//     runner (BW badge, no weight input, skips the "Enter weight first" guard), so a set carrying it
//     must stay visible and undoable.
test.describe('Builder set-editor decluttered: BW/Assist/Repeat/AMRAP removed', () => {
  test('a NEW set shows NO toggles at all -- no AMRAP, BW, Assist, or Repeat controls', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      window._templateSets = [{ effortType: 'rpe', repsMin: '8' }]
      const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) } return e }
      mk('att-type', 'select'); mk('att-sets-container', 'div')
      renderTemplateSets('att-sets-container', 'weight_reps')
      const html = document.getElementById('att-sets-container').innerHTML
      return {
        hasAmrap: />AMRAP</.test(html),
        hasBw: />BW</.test(html),
        hasAssist: />Assist</.test(html),
        hasRepeatBox: !!document.getElementById('ts-repeatn-0'),
        hasRepeatBtn: /Repeat ×/.test(html),
        repeatFnGone: typeof repeatTemplateSet === 'undefined',
      }
    })
    expect(r.hasAmrap, 'AMRAP was removed 2026-08-11 -- the toggle row is now empty for a new set').toBe(false)
    expect(r.hasBw, 'BW must not show for a set that was never bodyweight').toBe(false)
    expect(r.hasAssist, 'Assist must not show for a set that was never assisted').toBe(false)
    expect(r.hasRepeatBox, 'the blank round-count box next to the set number must be gone').toBe(false)
    expect(r.hasRepeatBtn, 'the Repeat button must be gone').toBe(false)
    expect(r.repeatFnGone, 'repeatTemplateSet had only one caller (this button) -- removed as dead code').toBe(true)
  })

  // UPDATED 2026-08-11 — the escape hatch now applies to `bodyweight` ONLY. `assisted` was deleted
  // outright rather than preserved, because the live count found ZERO sets carrying it: there is no
  // legacy set to strand, so the les-043 argument for keeping an undo path simply does not apply.
  // A legacy assisted set (none exist) would now render as an ordinary weighted set.
  test('a set already carrying bodyweight keeps its toggle visible, as an edit/undo path for legacy data', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      window._templateSets = [{ effortType: 'rpe', repsMin: '8', bodyweight: true }, { effortType: 'rpe', repsMin: '8', assisted: true, assistWeight: '20' }]
      const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) } return e }
      mk('att-type', 'select'); mk('att-sets-container', 'div')
      renderTemplateSets('att-sets-container', 'weight_reps')
      const html = document.getElementById('att-sets-container').innerHTML
      return { hasBw: />BW</.test(html), hasAssist: />Assist</.test(html) }
    })
    expect(r.hasBw, 'a legacy bodyweight set must still show BW so it can be un-toggled').toBe(true)
    expect(r.hasAssist, 'Assist was removed 2026-08-11 and must not render even for a legacy set').toBe(false)
  })
})

// ─── Box Jump height not recorded, live (2026-08-02 finding) ──────────────────────────────────────
// Jake, live: "on live after my session this morning. the box jump height was not recorded." Traced:
// jump_height/jump_distance always route to renderStrengthTable in normal use (_isPlainStrengthExercise),
// where height/distance capture already worked -- but the WIZARD path (logRunnerSet + its render branch)
// predates the metric_type system entirely and had NO jump case at all: it dispatched on legacy
// tgt.timed/tgt.unilateral flags + a name regex, so a jump exercise reaching the wizard fell into the
// plain weight/reps branch with no height field anywhere. Root cause of exactly this shape, whether or
// not it's confirmed as THIS morning's specific trigger -- fixed regardless, since it's a real hole.
test.describe('Wizard-mode jump logging (box jump height was not recorded)', () => {
  test('logRunnerSet reads the jump height/distance input, not just weight/reps', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const mkEx = (mt) => ({ name: 'Box Jump', type: 'strength', metricType: mt, loggedSets: [], targetSets: 3, sets_json: [{ targetHeightCm: '40' }] })
      const mk = (id) => { document.getElementById(id)?.remove(); const e = document.createElement('input'); e.id = id; document.body.appendChild(e); return e }

      const exHeight = mkEx('jump_height')
      _runner = { exercises: [exHeight], exIdx: 0, startTime: Date.now() }
      mk('wr-jump-measure-input').value = '42'
      mk('wr-jump-reps-input').value = '5'
      logRunnerSet()
      const heightLogged = { ...exHeight.loggedSets[0] }

      const exDist = mkEx('jump_distance')
      _runner = { exercises: [exDist], exIdx: 0, startTime: Date.now() }
      mk('wr-jump-measure-input').value = '2.4'
      mk('wr-jump-reps-input').value = '3'
      logRunnerSet()
      const distLogged = { ...exDist.loggedSets[0] }

      document.getElementById('wr-jump-measure-input')?.remove()
      document.getElementById('wr-jump-reps-input')?.remove()
      _runner = null
      return { heightLogged, distLogged }
    })
    expect(r.heightLogged.height_cm, 'jump_height must persist the typed height, not silently drop it').toBe(42)
    expect(r.heightLogged.reps).toBe('5')
    expect(r.distLogged.distance_m, 'jump_distance must persist the typed distance').toBe('2.4')
    expect(r.distLogged.reps).toBe('3')
  })

  test('logRunnerSet refuses to log a jump set with no height/distance entered, same as the table guard', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const ex = { name: 'Box Jump', type: 'strength', metricType: 'jump_height', loggedSets: [], targetSets: 3, sets_json: [{}] }
      _runner = { exercises: [ex], exIdx: 0, startTime: Date.now() }
      document.getElementById('wr-jump-measure-input')?.remove()
      document.getElementById('wr-jump-reps-input')?.remove()
      const measureEl = document.createElement('input'); measureEl.id = 'wr-jump-measure-input'; document.body.appendChild(measureEl)
      const before = ex.loggedSets.length
      logRunnerSet()
      const after = ex.loggedSets.length
      measureEl.remove()
      _runner = null
      return { before, after }
    })
    expect(r.after, 'a blank height must not silently log a set with no measurement').toBe(r.before)
  })

  test('the wizard render branch shows height + jumps inputs for a jump exercise, if that path is ever reached', async ({ page }) => {
    await loginAsPT(page)
    const html = await page.evaluate(() => {
      const orig = _isPlainStrengthExercise
      _isPlainStrengthExercise = () => false // force the wizard branch to render, matching the one condition under which this gap was reachable
      const ex = { name: 'Box Jump', type: 'strength', metricType: 'jump_height', loggedSets: [], targetSets: 3, sets_json: [{ targetHeightCm: '40' }] }
      _runner = { exercises: [ex], exIdx: 0, startTime: Date.now() }
      renderRunner()
      const out = document.getElementById('workout-runner')?.innerHTML || ''
      document.getElementById('workout-runner')?.remove()
      _runner = null
      _isPlainStrengthExercise = orig
      return out
    })
    expect(html, 'the wizard must render a height input for a jump_height exercise').toContain('wr-jump-measure-input')
    expect(html, 'the wizard must render a jumps-count input for a jump_height exercise').toContain('wr-jump-reps-input')
  })
})

// ─── PT/Personal boundary audit — remaining tables: client_1rms, goals, events (2026-07-13 ask) ───
// weight_logs and workout_template_exercises were probed 2026-08-01/02 (see above); these 4 probes
// close out the rest of the original "audit EVERY remaining table" list.
test.describe('PT/Personal boundary audit — client_1rms, goals, events', () => {
  test('client_1rms INSERT — an unrelated coach cannot write a 1RM for a client they do not own', async ({ browser }) => {
    const ptCtx = await browser.newContext()
    const pt2Ctx = await browser.newContext()
    const ptPage = await ptCtx.newPage()
    const pt2Page = await pt2Ctx.newPage()
    let plantedId = null
    try {
      await loginAsPT(ptPage)
      const realClientId = await ptPage.evaluate(async () => {
        const { data } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1).single()
        return data.id
      })
      await loginAsPT2(pt2Page)
      const attempt = await pt2Page.evaluate(async (clientId) => {
        const { data, error } = await db.from('client_1rms').insert({ client_id: clientId, exercise_name: '[E2E] Boundary Probe', one_rm_kg: 999, recorded_at: '2026-01-01' }).select('id').single()
        return { insertedId: data?.id || null, errorMessage: error?.message || null }
      }, realClientId)
      plantedId = attempt.insertedId
      const actualFromPT = await ptPage.evaluate(async (clientId) => {
        const { data } = await db.from('client_1rms').select('id').eq('client_id', clientId).eq('exercise_name', '[E2E] Boundary Probe')
        return data?.length || 0
      }, realClientId)
      expect(attempt.insertedId, 'an unrelated coach must not be able to insert a client_1rms row for a client they do not own').toBeNull()
      expect(actualFromPT, 'no row should have actually been written').toBe(0)
    } finally {
      if (plantedId) await ptPage.evaluate(async (id) => { await db.from('client_1rms').delete().eq('id', id) }, plantedId).catch(() => {})
      await ptCtx.close().catch(() => {})
      await pt2Ctx.close().catch(() => {})
    }
  })

  test('client_1rms DELETE — an unrelated coach cannot delete another client\'s 1RM by id (delete1RM has no client_id anchor of its own)', async ({ browser }) => {
    const ptCtx = await browser.newContext()
    const pt2Ctx = await browser.newContext()
    const ptPage = await ptCtx.newPage()
    const pt2Page = await pt2Ctx.newPage()
    let rowId = null
    try {
      await loginAsPT(ptPage)
      const setup = await ptPage.evaluate(async () => {
        const { data: clientRow } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1).single()
        const { data } = await db.from('client_1rms').insert({ client_id: clientRow.id, exercise_name: '[E2E] Delete-Probe 1RM', one_rm_kg: 100, recorded_at: '2026-01-01' }).select('id').single()
        return data.id
      })
      rowId = setup
      await loginAsPT2(pt2Page)
      await pt2Page.evaluate(async (id) => { await db.from('client_1rms').delete().eq('id', id) }, rowId).catch(() => {})
      const stillThere = await ptPage.evaluate(async (id) => (await db.from('client_1rms').select('id').eq('id', id).maybeSingle()).data, rowId)
      expect(stillThere?.id, 'an unrelated coach must not be able to delete another coach\'s client_1rms row by id').toBe(rowId)
    } finally {
      if (rowId) await ptPage.evaluate(async (id) => { await db.from('client_1rms').delete().eq('id', id) }, rowId).catch(() => {})
      await ptCtx.close().catch(() => {})
      await pt2Ctx.close().catch(() => {})
    }
  })

  test('goals INSERT — an unrelated coach cannot create a goal for a client they do not own', async ({ browser }) => {
    const ptCtx = await browser.newContext()
    const pt2Ctx = await browser.newContext()
    const ptPage = await ptCtx.newPage()
    const pt2Page = await pt2Ctx.newPage()
    let plantedId = null
    try {
      await loginAsPT(ptPage)
      const realClientId = await ptPage.evaluate(async () => {
        const { data } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1).single()
        return data.id
      })
      await loginAsPT2(pt2Page)
      const attempt = await pt2Page.evaluate(async (clientId) => {
        const { data, error } = await db.from('goals').insert({ client_id: clientId, created_by: currentUser.id, title: '[E2E] Boundary Probe Goal', goal_type: 'custom', priority: 1, status: 'active' }).select('id').single()
        return { insertedId: data?.id || null, errorMessage: error?.message || null }
      }, realClientId)
      plantedId = attempt.insertedId
      const actualFromPT = await ptPage.evaluate(async (clientId) => {
        const { data } = await db.from('goals').select('id').eq('client_id', clientId).eq('title', '[E2E] Boundary Probe Goal')
        return data?.length || 0
      }, realClientId)
      expect(attempt.insertedId, 'an unrelated coach must not be able to insert a goal for a client they do not own').toBeNull()
      expect(actualFromPT, 'no row should have actually been written').toBe(0)
    } finally {
      if (plantedId) await ptPage.evaluate(async (id) => { await db.from('goals').delete().eq('id', id) }, plantedId).catch(() => {})
      await ptCtx.close().catch(() => {})
      await pt2Ctx.close().catch(() => {})
    }
  })

  test('events INSERT — an unrelated coach cannot create a calendar event for a client they do not own', async ({ browser }) => {
    const ptCtx = await browser.newContext()
    const pt2Ctx = await browser.newContext()
    const ptPage = await ptCtx.newPage()
    const pt2Page = await pt2Ctx.newPage()
    let plantedId = null
    try {
      await loginAsPT(ptPage)
      const realClientId = await ptPage.evaluate(async () => {
        const { data } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1).single()
        return data.id
      })
      await loginAsPT2(pt2Page)
      const attempt = await pt2Page.evaluate(async (clientId) => {
        const { data, error } = await db.from('events').insert({ client_id: clientId, created_by: currentUser.id, title: '[E2E] Boundary Probe Event', date: '2026-01-01', type: 'session', is_pt_assigned: true }).select('id').single()
        return { insertedId: data?.id || null, errorMessage: error?.message || null }
      }, realClientId)
      plantedId = attempt.insertedId
      const actualFromPT = await ptPage.evaluate(async (clientId) => {
        const { data } = await db.from('events').select('id').eq('client_id', clientId).eq('title', '[E2E] Boundary Probe Event')
        return data?.length || 0
      }, realClientId)
      expect(attempt.insertedId, 'an unrelated coach must not be able to insert an event for a client they do not own').toBeNull()
      expect(actualFromPT, 'no row should have actually been written').toBe(0)
    } finally {
      if (plantedId) await ptPage.evaluate(async (id) => { await db.from('events').delete().eq('id', id) }, plantedId).catch(() => {})
      await ptCtx.close().catch(() => {})
      await pt2Ctx.close().catch(() => {})
    }
  })
})

// ─── Mobile calendar view overspilling (2026-07-13 finding) ───────────────────────────────────────
// Roadmap Area 3 #12: "zero calendar CSS classes exist anywhere (all inline styles); grid cells lack
// min-width:0, text is white-space:nowrap -- classic CSS Grid overflow." Confirmed live: injecting a
// long workout name into a day cell blew out that column's grid track, misaligning every other column
// and running text off the visible page -- even though the text itself already had
// overflow:hidden/text-overflow:ellipsis, because a CSS Grid item's default min-width is `auto`
// (content-based), not 0, so the ellipsis never got the chance to apply within the track's own space.
test.describe('Mobile calendar grid no longer blows out on a long workout name', () => {
  test('every day cell has min-width:0 + overflow:hidden, so a long name can\'t widen its grid column', async ({ page }) => {
    await loginAsClient(page)
    await clickVisible(page, '[data-page="calendar"]')
    await page.waitForTimeout(1500)
    const html = await page.evaluate(() => document.querySelector('[style*="grid-template-columns:repeat(7"]')?.outerHTML || '')
    const dayCellStyleMatch = html.match(/<div onclick="showDayEvents\([^)]*\)" style="([^"]*)"/)
    expect(dayCellStyleMatch, 'expected at least one day cell to exist in the rendered calendar').not.toBeNull()
    expect(dayCellStyleMatch[1]).toContain('min-width:0')
    expect(dayCellStyleMatch[1]).toContain('overflow:hidden')
  })

  test('a long workout name truncates within its cell instead of breaking the grid layout', async ({ page }) => {
    await loginAsClient(page)
    await clickVisible(page, '[data-page="calendar"]')
    await page.waitForTimeout(1500)
    const result = await page.evaluate(() => {
      const grid = document.querySelector('[style*="grid-template-columns:repeat(7"]')
      const dayCells = Array.from(grid.querySelectorAll('div[onclick^="showDayEvents"]'))
      const target = dayCells[0]
      const workoutDiv = document.createElement('div')
      workoutDiv.innerHTML = `<div style="font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">A Very Long Workout Name That Should Overflow The Cell Badly</div>`
      target.appendChild(workoutDiv)
      const widths = dayCells.map(c => c.getBoundingClientRect().width)
      return {
        docOverflowsX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        columnsRoughlyEqual: (Math.max(...widths) - Math.min(...widths)) < 2,
      }
    })
    expect(result.docOverflowsX, 'a long workout name must not push the page into horizontal scroll').toBe(false)
    expect(result.columnsRoughlyEqual, 'every grid column must stay the same width regardless of cell content length').toBe(true)
  })
})
