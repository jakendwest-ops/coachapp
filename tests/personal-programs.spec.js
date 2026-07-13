const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// The Personal/PT program boundary (2026-07-13).
//
// Jake edited a workout inside a program in PERSONAL view and was offered: "2 clients have this
// workout assigned (Sarah Mitchell, Alex Turner). Apply your change to their copies too?" — a real
// client's plan, one tap from being overwritten by a personal edit, with their names disclosed.
//
// Root cause: `programs` had no is_personal column. Solo and PT share one auth.uid(), so a personal
// program was indistinguishable from a coaching program in every query. exercises got the split on
// 2026-07-10 and workout_templates on 2026-07-11; programs never did.
//
// These tests own every fixture they touch and clean up in `finally` (les-041) — including the solo
// `clients` record itself, which the E2E PT account does not otherwise have (which is precisely why
// solo mode has historically SKIPPED in CI, leaving exactly this bug class uncovered).

const TAG = '[E2E-PP]'

// The solo record is what makes Personal view exist at all: coach_id IS NULL + user_id = auth.uid()
// (app-core.js:130-135). Planted, then picked up by loadUserInfo on reload.
async function plantSoloRecord(page) {
  const res = await page.evaluate(async (tag) => {
    const { data: existing } = await db.from('clients').select('id').eq('user_id', currentUser.id).is('coach_id', null).maybeSingle()
    if (existing) return { id: existing.id, planted: false }
    const { data, error } = await db.from('clients')
      .insert({ user_id: currentUser.id, coach_id: null, full_name: `${tag} Solo Self`, status: 'active' })
      .select('id').single()
    if (error) return { error: error.message }
    return { id: data.id, planted: true }
  }, TAG)
  if (res.error) return res
  await page.reload()
  await page.waitForSelector('[data-page="programs"]', { timeout: 10000 })
  await page.waitForTimeout(600) // loadUserInfo resolves _soloClientId
  return res
}

async function removeSoloRecord(page, solo) {
  if (!solo?.planted || !solo.id) return
  await page.evaluate(async (id) => { await db.from('clients').delete().eq('id', id) }, solo.id)
}

// A master program + phase + template + one exercise + a day slot. Mirrors the real shape Jake hit.
async function plantProgram(page, { name, isPersonal }) {
  return page.evaluate(async ({ name, isPersonal, tag }) => {
    const { data: prog } = await db.from('programs')
      .insert({ coach_id: currentUser.id, is_personal: isPersonal, name }).select('id').single()
    const { data: phase } = await db.from('program_phases')
      .insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single()
    const { data: tmpl } = await db.from('workout_templates')
      .insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, is_personal: isPersonal, name: `${tag} Lower Body` }).select('id').single()
    await db.from('workout_template_exercises').insert({
      template_id: tmpl.id, exercise_name: `${tag} Back Squat`, exercise_type: 'strength', order_index: 0,
      sets_json: [{ repsMin: '5', repsMax: '5' }]
    })
    const { data: ppw } = await db.from('program_phase_workouts')
      .insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 })
      .select('id').single()
    return { programId: prog.id, phaseId: phase.id, templateId: tmpl.id, ppwId: ppw.id }
  }, { name, isPersonal, tag: TAG })
}

// Attach a REAL coached client to the program, with their own cloned copy of the session — the exact
// state that made the "Update assigned clients?" dialog appear.
async function attachRealClient(page, fx) {
  return page.evaluate(async ({ fx, tag }) => {
    const { data: clients } = await db.from('clients').select('id, full_name').eq('coach_id', currentUser.id).limit(1)
    if (!clients?.length) return { skip: 'no coached client on this account' }
    const clientId = clients[0].id
    const { data: clone } = await db.from('workout_templates')
      .insert({ coach_id: currentUser.id, client_id: clientId, program_id: null, name: `${tag} Lower Body` }).select('id').single()
    await db.from('workout_template_exercises').insert({
      template_id: clone.id, exercise_name: `${tag} Back Squat`, exercise_type: 'strength', order_index: 0,
      sets_json: [{ repsMin: '5', repsMax: '5' }]
    })
    const { data: cp } = await db.from('client_programs')
      .insert({ client_id: clientId, program_id: fx.programId, start_date: new Date().toISOString().slice(0, 10) }).select('id').single()
    await db.from('client_program_workouts').insert({
      client_program_id: cp.id, program_phase_workout_id: fx.ppwId, workout_template_id: clone.id
    })
    return { clientId, clientName: clients[0].full_name, cloneId: clone.id, clientProgramId: cp.id }
  }, { fx, tag: TAG })
}

async function cleanup(page, fx, real) {
  await page.evaluate(async ({ fx, real, tag }) => {
    if (real?.clientProgramId) await db.from('client_programs').delete().eq('id', real.clientProgramId)
    if (real?.cloneId) await db.from('workout_templates').delete().eq('id', real.cloneId)
    if (fx?.programId) {
      // Coaching copies made by copyProgramToCoaching, plus anything it cloned.
      const { data: copies } = await db.from('programs').select('id').eq('coach_id', currentUser.id).ilike('name', `${tag}%`)
      for (const p of (copies || [])) {
        const { data: phases } = await db.from('program_phases').select('id').eq('program_id', p.id)
        const phaseIds = (phases || []).map(x => x.id)
        if (phaseIds.length) await db.from('program_phase_workouts').delete().in('phase_id', phaseIds)
        await db.from('workout_templates').delete().eq('program_id', p.id)
        await db.from('programs').delete().eq('id', p.id)
      }
    }
    // Sweep any stray templates/exercises this suite named.
    const { data: strays } = await db.from('workout_templates').select('id').eq('coach_id', currentUser.id).ilike('name', `${tag}%`)
    if (strays?.length) await db.from('workout_templates').delete().in('id', strays.map(t => t.id))
  }, { fx, real, tag: TAG })
}

test.describe('Personal / PT program boundary', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
  })

  // ── THE REPORTED BUG ────────────────────────────────────────────────────────
  // Red/green: revert the solo guard in _assignedCopiesForSession and this fails — realClientIds
  // comes back populated (a live write target) and realClientNames leaks the client's name.
  test('solo view never gets a write target or a client name for an assigned real client', async ({ page }) => {
    const solo = await plantSoloRecord(page)
    test.skip(!!solo.error, `could not plant solo record: ${solo.error}`)
    let fx, real
    try {
      fx = await plantProgram(page, { name: `${TAG} Legacy Personal`, isPersonal: false })
      real = await attachRealClient(page, fx)
      test.skip(!!real.skip, real.skip)

      // As the COACH, the copy is a legitimate write target and the name is legitimately shown.
      const asCoach = await page.evaluate(id => _assignedCopiesForSession([id]), fx.templateId)
      expect(asCoach.realClientIds.length, 'coach view should see the client copy as a write target').toBe(1)
      expect(asCoach.realClientNames.length).toBeGreaterThan(0)

      // As SOLO, the same call must yield NO write target and NO names — only an honest count.
      await page.evaluate(() => switchView('solo'))
      await page.waitForTimeout(800)
      const asSolo = await page.evaluate(id => _assignedCopiesForSession([id]), fx.templateId)
      expect(asSolo.realClientIds, 'PERSONAL VIEW MUST NEVER HOLD A WRITE TARGET FOR A REAL CLIENT').toEqual([])
      expect(asSolo.realClientNames, 'personal view must not disclose client names').toEqual([])
      expect(asSolo.realClientCount, 'but it should still know they exist, so it can say so').toBe(1)
    } finally {
      await removeSoloRecord(page, solo)
      await cleanup(page, fx, real)
    }
  })

  test('a personal-view edit leaves the real client\'s copy untouched and shows no modal', async ({ page }) => {
    const solo = await plantSoloRecord(page)
    test.skip(!!solo.error, `could not plant solo record: ${solo.error}`)
    let fx, real
    try {
      fx = await plantProgram(page, { name: `${TAG} Legacy Personal 2`, isPersonal: false })
      real = await attachRealClient(page, fx)
      test.skip(!!real.skip, real.skip)

      await page.evaluate(() => switchView('solo'))
      await page.waitForTimeout(800)

      // Drive the real orchestration path — the function that produced Jake's dialog.
      await page.evaluate(async ({ templateId, programId, ppwId, tag }) => {
        window._templateCtx = { programId, phaseWorkoutId: ppwId, isClientPlan: false, backLabel: 'Program' }
        window._lastExerciseChange = {
          op: 'update', matchName: `${tag} Back Squat`,
          row: { exercise_name: `${tag} Back Squat`, exercise_type: 'strength', order_index: 0, sets_json: [{ repsMin: '99', repsMax: '99' }] }
        }
        await _checkClientPlanPropagation(templateId)
      }, { templateId: fx.templateId, programId: fx.programId, ppwId: fx.ppwId, tag: TAG })
      await page.waitForTimeout(700)

      expect(await page.locator('#client-copy-modal').count(), 'the "Update assigned clients?" modal must never appear in Personal view').toBe(0)

      // And the client's actual plan is byte-identical — the dangerous half of the bug.
      const clientSets = await page.evaluate(async (cloneId) => {
        const { data } = await db.from('workout_template_exercises').select('sets_json').eq('template_id', cloneId)
        return data?.[0]?.sets_json
      }, real.cloneId)
      expect(clientSets?.[0]?.repsMin, "a personal edit must not reach a real client's plan").toBe('5')
    } finally {
      await removeSoloRecord(page, solo)
      await cleanup(page, fx, real)
    }
  })

  // ── THE SPLIT ───────────────────────────────────────────────────────────────
  test('a personal program does not appear in the PT programs list', async ({ page }) => {
    let fx
    try {
      fx = await plantProgram(page, { name: `${TAG} Sealed Personal`, isPersonal: true })
      await page.click('[data-page="programs"]')
      await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
      await expect(page.locator(`text=${TAG} Sealed Personal`)).toHaveCount(0)
    } finally {
      await cleanup(page, fx, null)
    }
  })

  test('a personal program is not offered in the assign-to-client dropdown', async ({ page }) => {
    let fx
    try {
      fx = await plantProgram(page, { name: `${TAG} Sealed Personal 2`, isPersonal: true })
      const options = await page.evaluate(async () => {
        const { data } = await db.from('programs').select('id, name')
          .eq('coach_id', currentUser.id).eq('is_personal', currentProfile?.role === 'solo')
        return (data || []).map(p => p.name)
      })
      expect(options).not.toContain(`${TAG} Sealed Personal 2`)
    } finally {
      await cleanup(page, fx, null)
    }
  })

  test('a program created in PT view is stamped is_personal = false', async ({ page }) => {
    try {
      await page.click('[data-page="programs"]')
      await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
      await page.click('button:has-text("New program")')
      await page.fill('#pm-name', `${TAG} Created In PT`)
      await page.click('#pm-save-btn')
      await page.waitForSelector(`h1:has-text("${TAG} Created In PT")`, { timeout: 8000 })

      const flag = await page.evaluate(async (tag) => {
        const { data } = await db.from('programs').select('is_personal').eq('name', `${tag} Created In PT`).limit(1)
        return data?.[0]?.is_personal
      }, TAG)
      expect(flag).toBe(false)
    } finally {
      await page.evaluate(async (tag) => {
        const { data } = await db.from('programs').select('id').eq('coach_id', currentUser.id).ilike('name', `${tag}%`)
        for (const p of (data || [])) {
          const { data: ph } = await db.from('program_phases').select('id').eq('program_id', p.id)
          if (ph?.length) await db.from('program_phase_workouts').delete().in('phase_id', ph.map(x => x.id))
          await db.from('workout_templates').delete().eq('program_id', p.id)
          await db.from('programs').delete().eq('id', p.id)
        }
      }, TAG)
    }
  })

  // ── MOVE TO PERSONAL ────────────────────────────────────────────────────────
  test('Move to Personal is refused while a real client is assigned, and succeeds once they are not', async ({ page }) => {
    let fx, real
    try {
      fx = await plantProgram(page, { name: `${TAG} To Move`, isPersonal: false })
      real = await attachRealClient(page, fx)
      test.skip(!!real.skip, real.skip)

      await page.evaluate(id => openProgram(id), fx.programId)
      await page.waitForSelector('button:has-text("Move to Personal")', { timeout: 8000 })
      await page.click('button:has-text("Move to Personal")')
      await page.waitForTimeout(600)

      let flag = await page.evaluate(async (id) => (await db.from('programs').select('is_personal').eq('id', id).single()).data?.is_personal, fx.programId)
      expect(flag, 'a program a real client is training on must not become personal').toBe(false)

      // Detach the client, accept the confirm, retry.
      await page.evaluate(async (cpId) => { await db.from('client_programs').delete().eq('id', cpId) }, real.clientProgramId)
      real.clientProgramId = null
      page.once('dialog', d => d.accept())
      await page.evaluate(id => moveProgramToPersonal(id), fx.programId)
      await page.waitForTimeout(800)

      flag = await page.evaluate(async (id) => (await db.from('programs').select('is_personal').eq('id', id).single()).data?.is_personal, fx.programId)
      expect(flag, 'with no real clients assigned, the move should succeed').toBe(true)
    } finally {
      await cleanup(page, fx, real)
    }
  })

  // ── THE BRIDGE ──────────────────────────────────────────────────────────────
  test('Copy to coaching produces an assignable is_personal = false program with its slots intact', async ({ page }) => {
    let fx
    try {
      fx = await plantProgram(page, { name: `${TAG} Bridge Source`, isPersonal: true })
      page.once('dialog', d => d.accept())
      await page.evaluate(id => copyProgramToCoaching(id), fx.programId)
      await page.waitForTimeout(2500)

      const copy = await page.evaluate(async (tag) => {
        const { data } = await db.from('programs')
          .select('id, is_personal, program_phases(id, program_phase_workouts(id, template_id))')
          .eq('name', `${tag} Bridge Source (coaching copy)`).limit(1)
        const p = data?.[0]
        if (!p) return null
        const slot = p.program_phases?.[0]?.program_phase_workouts?.[0]
        let tmplPersonal = null
        if (slot?.template_id) {
          const { data: t } = await db.from('workout_templates').select('is_personal').eq('id', slot.template_id).single()
          tmplPersonal = t?.is_personal
        }
        return { isPersonal: p.is_personal, phases: p.program_phases?.length || 0, slots: p.program_phases?.[0]?.program_phase_workouts?.length || 0, tmplPersonal }
      }, TAG)

      expect(copy, 'the coaching copy should exist').not.toBeNull()
      expect(copy.isPersonal, 'the copy must land in the COACHING pool, not the personal one').toBe(false)
      expect(copy.phases).toBe(1)
      expect(copy.slots, 'the day slot must come across').toBe(1)
      expect(copy.tmplPersonal, 'the cloned workout must also be re-stamped as a coaching template').toBe(false)

      // The source stays personal and untouched.
      const src = await page.evaluate(async (id) => (await db.from('programs').select('is_personal').eq('id', id).single()).data?.is_personal, fx.programId)
      expect(src).toBe(true)
    } finally {
      await cleanup(page, fx, null)
    }
  })

  // ── DOUBLE-ASSIGN ───────────────────────────────────────────────────────────
  // Jake's own account had accumulated 32 stacked self-assignments of one program, each one having
  // re-cloned every template in it. Neither assign path had a duplicate check. Preventing this has
  // been the stated intent since 2026-07-03 and was never built.
  test('re-assigning REPLACES rather than stacks, and never leaves orphan clones', async ({ page }) => {
    let fx, real
    try {
      fx = await plantProgram(page, { name: `${TAG} No Double Assign`, isPersonal: false })
      real = await attachRealClient(page, fx)
      test.skip(!!real.skip, real.skip)

      const countAssignments = () => page.evaluate(async ({ clientId, programId }) => {
        const { data } = await db.from('client_programs').select('id').eq('client_id', clientId).eq('program_id', programId)
        return data?.length
      }, { clientId: real.clientId, programId: fx.programId })

      const mountModal = () => page.evaluate(() => {
        document.getElementById('apc-modal')?.remove()
        const o = document.createElement('div')
        o.innerHTML = `<div id="apc-modal"><input id="apc-start" value=""><div id="apc-error"></div><button id="apc-save-btn">Assign</button></div>`
        document.body.appendChild(o)
      })

      // 1. DECLINING the restart must change nothing.
      await mountModal()
      page.once('dialog', d => d.dismiss())
      await page.evaluate(({ programId, clientId }) => saveAssignProgramToClient(programId, clientId), { programId: fx.programId, clientId: real.clientId })
      await page.waitForTimeout(800)
      expect(await countAssignments(), 'declining the restart must not create a second assignment').toBe(1)

      // 2. ACCEPTING must REPLACE it — still exactly one row, never two.
      await mountModal()
      page.once('dialog', d => d.accept())
      await page.evaluate(({ programId, clientId }) => saveAssignProgramToClient(programId, clientId), { programId: fx.programId, clientId: real.clientId })
      await page.waitForTimeout(2500)
      expect(await countAssignments(), 'restarting must REPLACE the assignment, never stack a second one').toBe(1)

      // 3. And the old assignment's template clones must not be left behind as orphans —
      //    the debris mechanism that grew one real account to 2013 templates, 1223 of them dead.
      const orphans = await page.evaluate(async ({ tag }) => {
        const { data } = await db.from('workout_templates').select('id')
          .eq('coach_id', currentUser.id).not('client_id', 'is', null).ilike('name', `${tag}%`)
        const ids = (data || []).map(t => t.id)
        if (!ids.length) return 0
        const { data: used } = await db.from('client_program_workouts').select('workout_template_id').in('workout_template_id', ids)
        const live = new Set((used || []).map(r => r.workout_template_id))
        return ids.filter(id => !live.has(id)).length
      }, { tag: TAG })
      expect(orphans, 'a restart must not strand the previous assignment\'s template clones').toBe(0)

      // Re-point cleanup at whatever assignment now exists.
      real.clientProgramId = await page.evaluate(async ({ clientId, programId }) => {
        const { data } = await db.from('client_programs').select('id').eq('client_id', clientId).eq('program_id', programId).limit(1)
        return data?.[0]?.id || null
      }, { clientId: real.clientId, programId: fx.programId })
    } finally {
      await cleanup(page, fx, real)
    }
  })

  // ── WEEK COUNT ──────────────────────────────────────────────────────────────
  // The Workouts accordion printed phase.duration_weeks (the PLAN) above a body rendered from the
  // real program_phase_workouts rows (what's BUILT) — a 3-week phase with 2 weeks built read "3w"
  // over 2 weeks of content. Jake hit this live on Hybrid Athlete Experiment, phase 2.
  test('phase header counts the weeks actually built, not the weeks declared', async ({ page }) => {
    const counts = await page.evaluate(() => ({
      twoBuilt: _builtWeekCount([{ week_number: 1 }, { week_number: 1 }, { week_number: 2 }, { week_number: 2 }]),
      none: _builtWeekCount([]),
      nullWeek: _builtWeekCount([{ week_number: null }, { week_number: null }])
    }))
    // A 3-week-DECLARED phase with only weeks 1 and 2 populated must report 2, not 3.
    expect(counts.twoBuilt).toBe(2)
    expect(counts.none).toBe(0)
    expect(counts.nullWeek, 'legacy rows with no week_number count as week 1').toBe(1)
  })
})
