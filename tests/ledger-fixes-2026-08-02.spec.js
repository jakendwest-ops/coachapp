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
test.describe('Builder set-editor decluttered: BW/Assist/Repeat removed', () => {
  test('a NEW set (no bodyweight/assisted flags) shows AMRAP only -- no BW, Assist, or Repeat controls', async ({ page }) => {
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
    expect(r.hasAmrap, 'AMRAP was not part of this cleanup and must still render').toBe(true)
    expect(r.hasBw, 'BW must not show for a set that was never bodyweight').toBe(false)
    expect(r.hasAssist, 'Assist must not show for a set that was never assisted').toBe(false)
    expect(r.hasRepeatBox, 'the blank round-count box next to the set number must be gone').toBe(false)
    expect(r.hasRepeatBtn, 'the Repeat button must be gone').toBe(false)
    expect(r.repeatFnGone, 'repeatTemplateSet had only one caller (this button) -- removed as dead code').toBe(true)
  })

  test('a set already carrying bodyweight/assisted keeps its toggle visible, as an edit/undo path for legacy data', async ({ page }) => {
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
    expect(r.hasAssist, 'a legacy assisted set must still show Assist so it can be un-toggled').toBe(true)
  })
})
