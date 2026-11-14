// "Update all copies" overwrote each copy instead of applying only the changes
// (docs/bugs/2026-11-14-update-all-copies-overwrites-each-copy-instead-of-applying-only-the-changes.md).
//
// Jake, on his Personal plan: changed one exercise and one rest in Week 1's Monday, Save, "Update all
// copies" — and Week 2+ came out matching Week 1, their own progressed loads gone. Saving sent each touched
// exercise WHOLE (every set's reps/weight/RPE/rest) to the copies. Now the dialogue offers two choices:
// "Only my changes" (field level, the default) and "Whole workout" (an explicit exact copy).
//
// Drives the real Save on a real Personal program: week 1 and week 2 are separate, linked (same family)
// workouts; week 2 carries its own heavier loads. Edit week 1's rest on Bench and swap Row for Pendlay Row.
const { test, expect } = require('./fixtures')
const { soloReady } = require('./helpers')

const P = '[E2E] CopyChoice'

async function setup(page) {
  return page.evaluate(async (P) => {
    const one = async (q) => { const { data, error } = await q; if (error) throw new Error(error.message); return data }
    const uid = currentUser.id
    const sets = (w, rest) => [1, 2, 3].map(() => ({ repsMin: 5, weight: w, restMin: rest }))
    const prog = await one(db.from('programs').insert({ coach_id: uid, is_personal: true, name: P + ' Plan' }).select('id').single())
    const phase = await one(db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 2, order_index: 0 }).select('id').single())
    const w1 = await one(db.from('workout_templates').insert({ coach_id: uid, program_id: prog.id, is_personal: true, name: P + ' Monday' }).select('id, family_id').single())
    const w2 = await one(db.from('workout_templates').insert({ coach_id: uid, program_id: prog.id, is_personal: true, name: P + ' Monday — W2', family_id: w1.family_id || w1.id }).select('id').single())
    const ex = (tid, name, i, w, rest) => ({ template_id: tid, exercise_name: '[E2E] ' + name, exercise_type: 'strength', metric_type: 'weight_reps', order_index: i, sets: 3, sets_json: sets(w, rest) })
    await one(db.from('workout_template_exercises').insert([
      ex(w1.id, 'Bench', 0, 100, 90), ex(w1.id, 'Row', 1, 60, 60),
      ex(w2.id, 'Bench', 0, 110, 90), ex(w2.id, 'Row', 1, 70, 60), ex(w2.id, 'Week2 Extra', 2, 20, 30),
    ]).select('id'))
    const pw1 = await one(db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: w1.id, week_number: 1 }).select('id').single())
    await one(db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: w2.id, week_number: 2 }).select('id').single())
    return { progId: prog.id, phaseId: phase.id, w1: w1.id, w2: w2.id, pw1: pw1.id }
  }, P)
}

async function editWeek1AndSave(page, S) {
  await page.evaluate(async ({ w1, progId, pw1 }) => {
    await openTemplate(w1, { programId: progId, phaseWorkoutId: pw1 })
    const d = window._templateDraft
    const bench = d.exercises.find(e => e.exercise_name === '[E2E] Bench')
    bench.sets_json = bench.sets_json.map(s => ({ ...s, restMin: 120 }))            // one rest change, every set
    const row = d.exercises.find(e => e.exercise_name === '[E2E] Row')
    row.exercise_name = '[E2E] Pendlay Row'                                          // the swap
    await saveTemplateDraft()
  }, S)
  await expect(page.locator('#propagate-modal'), 'week 2 must be offered the change').toBeAttached()
  // The saved week-1 id can be a fork of the original; the dialogue's own button carries the right one.
  return page.evaluate(async (pw1) => (await db.from('program_phase_workouts').select('template_id').eq('id', pw1).single()).data.template_id, S.pw1)
}

const dump = (page, tid) => page.evaluate(async (tid) => {
  const { data } = await db.from('workout_template_exercises').select('exercise_name, sets_json').eq('template_id', tid).order('order_index')
  return data.map(r => `${r.exercise_name.replace('[E2E] ', '')} ${r.sets_json.map(s => s.weight + 'kg/' + s.restMin + 's').join(' ')}`)
}, tid)

async function cleanup(page, S) {
  const left = await page.evaluate(async ({ progId, phaseId, P }) => {
    const uid = currentUser.id
    const { data: tmpls } = await db.from('workout_templates').select('id').eq('coach_id', uid).like('name', P + '%')
    const ids = (tmpls || []).map(t => t.id)
    await db.from('program_phase_workouts').delete().eq('phase_id', phaseId).select('id')
    await db.from('program_phases').delete().eq('id', phaseId).select('id')
    await db.from('programs').delete().eq('id', progId).select('id')
    if (ids.length) await db.from('workout_template_exercises').delete().in('template_id', ids).select('id')
    if (ids.length) await db.from('workout_templates').delete().in('id', ids).eq('coach_id', uid).select('id')
    return ((await db.from('workout_templates').select('id').eq('coach_id', uid).like('name', P + '%')).data || []).length
  }, { ...S, P })
  expect(left, 'cleanup left [E2E] CopyChoice templates behind').toBe(0)
}

test.describe('"Update all copies" gives a choice (2026-11-14)', () => {
  test.beforeEach(async ({ page }) => {
    await soloReady(page)
    await expect.poll(() => page.evaluate(() => currentProfile?.role)).toBe('solo')
  })

  test('the dialogue offers "Only my changes" (picked) and "Whole workout", and names what changed', async ({ page }) => {
    const S = await setup(page)
    try {
      await editWeek1AndSave(page, S)
      const modal = page.locator('#propagate-modal')
      await expect(modal.locator('input[value=changes]')).toBeChecked()
      await expect(modal.locator('input[value=whole]')).not.toBeChecked()
      await expect(modal).toContainText('Bench: rest')
      await expect(modal).toContainText('Row → [E2E] Pendlay Row')
    } finally { await page.evaluate(() => closeModal('propagate-modal')); await cleanup(page, S) }
  })

  test('ONLY MY CHANGES: week 2 gets the new rest and the swap, and keeps its own loads and its extra exercise', async ({ page }) => {
    const S = await setup(page)
    try {
      const saved = await editWeek1AndSave(page, S)
      await page.evaluate((id) => _applyToAllSessions(id, document.querySelector('#propagate-modal input[name=propagate-mode]:checked')?.value), saved)
      expect(await dump(page, S.w2)).toEqual([
        'Bench 110kg/120s 110kg/120s 110kg/120s',
        'Pendlay Row 70kg/60s 70kg/60s 70kg/60s',
        'Week2 Extra 20kg/30s 20kg/30s 20kg/30s',
      ])
    } finally { await cleanup(page, S) }
  })

  test('WHOLE WORKOUT: week 2 becomes an exact copy of week 1, keeping its own week marker', async ({ page }) => {
    const S = await setup(page)
    try {
      const saved = await editWeek1AndSave(page, S)
      await page.locator('#propagate-modal input[value=whole]').check()
      await page.evaluate((id) => _applyToAllSessions(id, document.querySelector('#propagate-modal input[name=propagate-mode]:checked')?.value), saved)
      expect(await dump(page, S.w2)).toEqual([
        'Bench 100kg/120s 100kg/120s 100kg/120s',
        'Pendlay Row 60kg/60s 60kg/60s 60kg/60s',
      ])
      const name = await page.evaluate(async (w2) => (await db.from('workout_templates').select('name').eq('id', w2).single()).data.name, S.w2)
      expect(name).toBe('[E2E] CopyChoice Monday — W2')
    } finally { await cleanup(page, S) }
  })
})

// Jake, 2026-11-14: "only that week and the weeks after it". Editing Week 2 must never reach Week 1 (already
// trained, or about to be), but must reach every later copy — including one in a LATER PHASE whose own
// week_number restarts at 1 (phase order first, then week). Phase 1: W1, W2 (edited). Phase 2: week 1.
async function setupTwoPhases(page) {
  return page.evaluate(async (P) => {
    const one = async (q) => { const { data, error } = await q; if (error) throw new Error(error.message); return data }
    const uid = currentUser.id
    const sets = (w) => [1, 2].map(() => ({ repsMin: 5, weight: w, restMin: 90 }))
    const prog = await one(db.from('programs').insert({ coach_id: uid, is_personal: true, name: P + ' Plan' }).select('id').single())
    const ph1 = await one(db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 2, order_index: 0 }).select('id').single())
    const ph2 = await one(db.from('program_phases').insert({ program_id: prog.id, name: 'Block 2', duration_weeks: 1, order_index: 1 }).select('id').single())
    const mk = async (name, fam) => one(db.from('workout_templates').insert({ coach_id: uid, program_id: prog.id, is_personal: true, name: P + name, ...(fam ? { family_id: fam } : {}) }).select('id, family_id').single())
    const a = await mk(' Monday')
    const fam = a.family_id || a.id
    const b = await mk(' Monday — W2', fam)
    const c = await mk(' Monday — B2W1', fam)
    await one(db.from('workout_template_exercises').insert([[a, 100], [b, 105], [c, 110]].map(([t, w]) =>
      ({ template_id: t.id, exercise_name: '[E2E] Bench', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0, sets: 2, sets_json: sets(w) }))).select('id'))
    const slot = (phase, t, week) => one(db.from('program_phase_workouts').insert({ phase_id: phase, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: t, week_number: week }).select('id').single())
    const pwA = await slot(ph1.id, a.id, 1)
    const pwB = await slot(ph1.id, b.id, 2)
    const pwC = await slot(ph2.id, c.id, 1)
    return { progId: prog.id, phaseIds: [ph1.id, ph2.id], a: a.id, b: b.id, c: c.id, pwA: pwA.id, pwB: pwB.id, pwC: pwC.id }
  }, P)
}

async function cleanupTwoPhases(page, S) {
  await page.evaluate(async ({ progId, phaseIds, P }) => {
    const uid = currentUser.id
    const ids = ((await db.from('workout_templates').select('id').eq('coach_id', uid).like('name', P + '%')).data || []).map(t => t.id)
    const cps = ((await db.from('client_programs').select('id').eq('program_id', progId)).data || []).map(r => r.id)
    if (cps.length) await db.from('client_program_workouts').delete().in('client_program_id', cps).select('id')
    if (cps.length) await db.from('client_programs').delete().in('id', cps).select('id')
    await db.from('program_phase_workouts').delete().in('phase_id', phaseIds).select('id')
    await db.from('program_phases').delete().in('id', phaseIds).select('id')
    await db.from('programs').delete().eq('id', progId).select('id')
    if (ids.length) await db.from('workout_template_exercises').delete().in('template_id', ids).select('id')
    if (ids.length) await db.from('workout_templates').delete().in('id', ids).eq('coach_id', uid).select('id')
  }, { ...S, P })
  const left = await page.evaluate(async (P) => ((await db.from('workout_templates').select('id').eq('coach_id', currentUser.id).like('name', P + '%')).data || []).length, P)
  expect(left, 'cleanup left [E2E] CopyChoice templates behind').toBe(0)
}

const editRestTo150 = (page) => page.evaluate(async () => {
  const bench = window._templateDraft.exercises.find(e => e.exercise_name === '[E2E] Bench')
  bench.sets_json = bench.sets_json.map(s => ({ ...s, restMin: 150 }))
  await saveTemplateDraft()
})

test.describe('"Update all copies" reaches only this week and later ones (2026-11-14)', () => {
  test.beforeEach(async ({ page }) => {
    await soloReady(page)
    await expect.poll(() => page.evaluate(() => currentProfile?.role)).toBe('solo')
  })

  test('programme: editing Week 2 updates the later-phase copy and leaves Week 1 alone, and the dialogue says so', async ({ page }) => {
    const S = await setupTwoPhases(page)
    try {
      await page.evaluate(({ b, progId, pwB }) => openTemplate(b, { programId: progId, phaseWorkoutId: pwB }), S)
      await editRestTo150(page)
      const modal = page.locator('#propagate-modal')
      await expect(modal, 'the later-phase copy must be offered the change').toBeAttached()
      await expect(modal).toContainText('There is 1 other copy')
      await expect(modal).toContainText('Earlier weeks are not changed (1 earlier copy)')
      const saved = await page.evaluate(async (pwB) => (await db.from('program_phase_workouts').select('template_id').eq('id', pwB).single()).data.template_id, S.pwB)
      await page.evaluate((id) => _applyToAllSessions(id, 'changes'), saved)
      expect(await dump(page, S.a), 'Week 1 is before the edited week: untouched').toEqual(['Bench 100kg/90s 100kg/90s'])
      expect(await dump(page, S.c), 'the later phase gets only the rest').toEqual(['Bench 110kg/150s 110kg/150s'])
    } finally { await cleanupTwoPhases(page, S) }
  })

  // The client-plan route positions a copy by client_program_workouts.week_number plus the phase of the master
  // slot it was cloned from (an embed). Driven on the solo user's own assigned copy of the same plan.
  test('client plan: editing Week 2 of an assigned copy updates the later-phase copy and leaves Week 1 alone', async ({ page }) => {
    test.skip(!(await page.evaluate(() => !!window._soloClientId)), 'no solo client record on this account')
    const S = await setupTwoPhases(page)
    try {
      const C = await page.evaluate(async ({ progId, pwA, pwB, pwC }) => {
        const { data: cp, error } = await db.from('client_programs').insert({ client_id: window._soloClientId, program_id: progId, start_date: null }).select('id').single()
        if (error) throw new Error(error.message)
        const ok = await _cloneProgramForClient(cp.id, progId, window._soloClientId)
        const { data: cpws } = await db.from('client_program_workouts').select('program_phase_workout_id, workout_template_id').eq('client_program_id', cp.id)
        const copyOf = (pw) => (cpws || []).find(r => r.program_phase_workout_id === pw)?.workout_template_id
        return { cpId: cp.id, ok, a: copyOf(pwA), b: copyOf(pwB), c: copyOf(pwC) }
      }, S)
      expect(C.ok && C.a && C.b && C.c, 'fixture: self-assign must have cloned all three sessions').toBeTruthy()
      await page.evaluate(({ b, cpId }) => openTemplate(b, { backTo: 'client', backLabel: 'Me', clientId: window._soloClientId, clientName: 'Me', clientProgramId: cpId }), C)
      await editRestTo150(page)
      const modal = page.locator('#propagate-modal')
      await expect(modal, 'the later-phase copy must be offered the change').toBeAttached()
      await expect(modal).toContainText('There is 1 other copy')
      await expect(modal).toContainText('Earlier weeks are not changed (1 earlier copy)')
      await page.evaluate((id) => _applyToAllSessions(id, 'changes'), C.b)
      expect(await dump(page, C.a), 'Week 1 copy is before the edited week: untouched').toEqual(['Bench 100kg/90s 100kg/90s'])
      expect(await dump(page, C.c), 'the later-phase copy gets only the rest').toEqual(['Bench 110kg/150s 110kg/150s'])
    } finally { await cleanupTwoPhases(page, S) }
  })
})
