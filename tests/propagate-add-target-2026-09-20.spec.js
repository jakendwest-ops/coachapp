// Adding an exercise to a program workout duplicated it once per propagation target, and the targets got
// nothing (docs/bugs/2026-09-20-adding-an-exercise-to-a-program-workout-duplicates-it-several-times.md).
//
// The break these specs catch: _propagateExerciseChangeToTemplates's `add` branch built its row as
// `{ template_id: tid, order_index: <target's next>, ...change.row }`. saveTemplateDraft puts the row it
// just inserted into the EDITED template in `changes` — template_id and order_index included — so the
// spread overrode the target's id and every propagated add landed back in the edited template. Since
// v2026.09.6 (2026-09-17). The first three specs pin the helper on its own; the last two drive the real
// Save -> propagate path for the two real consumers (a Personal-view program with copies, and a PT whose
// client has the program assigned), against literal, hand-listed row sets.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Installed into the page so every evaluate() below shares the same tiny, real-DB helpers.
const installHelpers = () => {
  const one = async (q) => { const { data, error } = await q; if (error) throw new Error(error.message); return data }
  window.__pt = {
    one,
    names: async (tid) => (await one(db.from('workout_template_exercises').select('exercise_name').eq('template_id', tid))).map(r => r.exercise_name.replace('[E2E] ', '')).sort(),
    // What saveTemplateDraft puts in changes[] for an add: the row it inserted into the EDITED template,
    // template_id and order_index included (js/app-workouts.js, `insertRow`).
    addChange: (name, fromTemplateId, orderIndex) => ({
      op: 'add', matchName: '[E2E] ' + name,
      row: { template_id: fromTemplateId, exercise_id: null, exercise_name: '[E2E] ' + name, exercise_type: 'strength', metric_type: 'weight_reps', order_index: orderIndex, sets: null, sets_json: null, notes: null, superset_group: null },
    }),
    stageAdds: (names) => {
      const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) }; return e }
      mk('att-type', 'select'); mk('att-sets-container', 'div'); mk('att-metric-pills', 'div'); mk('att-notes', 'textarea'); mk('att-superset', 'input'); mk('att-error', 'span')
      for (const n of names) {
        window._exerciseDetailPicked = { name: '[E2E] ' + n, id: null }
        document.getElementById('att-type').value = 'weight_reps'
        window._templateSets = [{ effortType: 'rpe' }]
        _stageAddExercise()
      }
    },
  }
}

// Tears down a program fixture, verifying every delete actually removed rows the same way cleanup()
// above holds workout_templates to. client_program_workouts is deleted by cascade, not directly: no app
// code anywhere deletes it (js/app-programs.js's _removeAssignmentAndClones deletes only client_programs
// and reads client_program_workouts beforehand, never after), and a direct
// `.delete().eq('client_program_id', cpId)` here left all 4 rows in place — RLS has no DELETE policy for
// this table; only the FK cascade off client_programs removes it. Deleting client_programs FIRST and
// then confirming client_program_workouts is empty pins that assumption, so a future schema change that
// drops the cascade fails this test rather than silently stranding rows again.
// program_phase_workouts/program_phases have no such cascade — matched here to how tests/programs.spec.js
// tears them down (children before parents). Does not touch workout_templates/workout_template_exercises
// — the caller's own cleanup(names) call does that, matching by name so it also reaches the forked and
// cloned copies this fixture creates.
async function cleanupProgramTree(page, { cpId, progId, phaseId }) {
  const r = await page.evaluate(async ({ cpId, progId, phaseId }) => {
    const left = async (q) => ((await q).data || []).length
    await db.from('client_programs').delete().eq('id', cpId).select('id')
    const cpLeft = await left(db.from('client_programs').select('id').eq('id', cpId))
    const cpwLeft = await left(db.from('client_program_workouts').select('id').eq('client_program_id', cpId))
    await db.from('program_phase_workouts').delete().eq('phase_id', phaseId).select('id')
    const ppwLeft = await left(db.from('program_phase_workouts').select('id').eq('phase_id', phaseId))
    await db.from('program_phases').delete().eq('id', phaseId).select('id')
    const phaseLeft = await left(db.from('program_phases').select('id').eq('id', phaseId))
    await db.from('programs').delete().eq('id', progId).select('id')
    const progLeft = await left(db.from('programs').select('id').eq('id', progId))
    return { cpLeft, cpwLeft, ppwLeft, phaseLeft, progLeft }
  }, { cpId, progId, phaseId })
  expect(r, 'program-tree cleanup left rows behind — a refused delete, or a missing cascade, would have stranded them').toEqual({ cpLeft: 0, cpwLeft: 0, ppwLeft: 0, phaseLeft: 0, progLeft: 0 })
}

// Two real templates for the helper-level specs: A is "the edited one", B is the propagation target.
async function makeAB(page) {
  await page.evaluate(installHelpers)
  return page.evaluate(async () => {
    const { one } = window.__pt
    const uid = currentUser.id
    const A = await one(db.from('workout_templates').insert({ coach_id: uid, name: '[E2E] Prop A (edited)' }).select('id').single())
    const B = await one(db.from('workout_templates').insert({ coach_id: uid, name: '[E2E] Prop B (target)' }).select('id').single())
    await one(db.from('workout_template_exercises').insert([
      { template_id: A.id, exercise_name: '[E2E] Base', exercise_type: 'strength', order_index: 0 },
      { template_id: B.id, exercise_name: '[E2E] Base', exercise_type: 'strength', order_index: 0 },
    ]).select('id'))
    return { A: A.id, B: B.id }
  })
}

// Delete AND verify, children first: no FK cascade from workout_templates to
// workout_template_exercises is documented anywhere in this repo (docs/schema.md, scripts/*.sql), and
// every other spec that owns a workout_templates row deletes its exercises explicitly (e.g.
// template-draft-save-2026-09-13.spec.js) — matched here rather than assumed. A policy-refused delete
// removes 0 rows and returns no error, so both counts are re-queried and asserted, not just called.
async function cleanup(page, names) {
  const r = await page.evaluate(async (names) => {
    const uid = currentUser.id
    const { data: tmpls } = await db.from('workout_templates').select('id').eq('coach_id', uid).in('name', names)
    const ids = (tmpls || []).map(t => t.id)
    if (ids.length) await db.from('workout_template_exercises').delete().in('template_id', ids).select('id')
    for (const n of names) await db.from('workout_templates').delete().eq('name', n).eq('coach_id', uid).select('id')
    let remainingTemplates = 0
    for (const n of names) remainingTemplates += ((await db.from('workout_templates').select('id').eq('name', n).eq('coach_id', uid)).data || []).length
    const remainingExercises = ids.length ? ((await db.from('workout_template_exercises').select('id').in('template_id', ids)).data || []).length : 0
    return { remainingTemplates, remainingExercises }
  }, names)
  expect(r.remainingTemplates, 'cleanup left [E2E] templates behind — a refused delete would have stranded rows').toBe(0)
  expect(r.remainingExercises, 'cleanup left [E2E] exercise rows behind (no documented FK cascade to rely on)').toBe(0)
}

test.describe('Propagating an added exercise (2026-09-20)', () => {
  test('a propagated add lands in the TARGET template, exactly once, and never in the edited one', async ({ page }) => {
    await loginAsPT(page)
    const ids = await makeAB(page)
    try {
      const r = await page.evaluate(async ({ A, B }) => {
        await _propagateExerciseChangeToTemplates(window.__pt.addChange('New', A, 5), [B])
        return { A: await window.__pt.names(A), B: await window.__pt.names(B) }
      }, ids)
      expect(r.B, 'the target must receive the new exercise').toEqual(['Base', 'New'])
      expect(r.A, 'the edited template must not gain a second copy of what it already has').toEqual(['Base'])
    } finally { await cleanup(page, ['[E2E] Prop A (edited)', '[E2E] Prop B (target)']) }
  })

  test('the new row takes the TARGET\'s next order_index, not the one baked into the saved row', async ({ page }) => {
    await loginAsPT(page)
    const ids = await makeAB(page)
    try {
      const rows = await page.evaluate(async ({ A, B }) => {
        // The saved row says order_index 99; B\'s last row is at 0, so its next is 1.
        await _propagateExerciseChangeToTemplates(window.__pt.addChange('New', A, 99), [B])
        const { data } = await db.from('workout_template_exercises').select('exercise_name, order_index').eq('template_id', B).order('order_index')
        return data.map(r => r.exercise_name.replace('[E2E] ', '') + '@' + r.order_index)
      }, ids)
      expect(rows).toEqual(['Base@0', 'New@1'])
    } finally { await cleanup(page, ['[E2E] Prop A (edited)', '[E2E] Prop B (target)']) }
  })

  test('propagating the same add twice adds it once: the exists-check sees the target\'s own row', async ({ page }) => {
    await loginAsPT(page)
    const ids = await makeAB(page)
    try {
      const r = await page.evaluate(async ({ A, B }) => {
        const change = window.__pt.addChange('New', A, 5)
        await _propagateExerciseChangeToTemplates(change, [B])
        await _propagateExerciseChangeToTemplates(change, [B])
        return { A: await window.__pt.names(A), B: await window.__pt.names(B) }
      }, ids)
      expect(r.B).toEqual(['Base', 'New'])
      expect(r.A).toEqual(['Base'])
    } finally { await cleanup(page, ['[E2E] Prop A (edited)', '[E2E] Prop B (target)']) }
  })

  // The sibling branch of the same function applies `change.row` to the target wholesale too. It is safe
  // today only because no producer puts a template_id in an update row; if one ever does, `.update(row)`
  // would MOVE the target's row into the edited template. Same class, so it gets the same guard (and a
  // spec that fails first).
  test('a propagated update edits the TARGET\'s row in place and never moves it into the edited template', async ({ page }) => {
    await loginAsPT(page)
    const ids = await makeAB(page)
    try {
      const r = await page.evaluate(async ({ A, B }) => {
        const change = { op: 'update', matchName: '[E2E] Base', row: { template_id: A, order_index: 7, exercise_name: '[E2E] Base', exercise_type: 'strength', notes: 'changed' } }
        await _propagateExerciseChangeToTemplates(change, [B])
        const dump = async (tid) => (await db.from('workout_template_exercises').select('exercise_name, notes, order_index').eq('template_id', tid)).data
          .map(x => x.exercise_name.replace('[E2E] ', '') + ' notes=' + x.notes + ' order=' + x.order_index)
        return { A: await dump(A), B: await dump(B) }
      }, ids)
      expect(r.B, 'the target\'s own row is updated, keeping its own template and position').toEqual(['Base notes=changed order=0'])
      expect(r.A, 'the edited template is untouched').toEqual(['Base notes=null order=0'])
    } finally { await cleanup(page, ['[E2E] Prop A (edited)', '[E2E] Prop B (target)']) }
  })

  // The real flow Jake hit: a Personal program whose four weeks share one workout (un-forked "Duplicate
  // week"), self-assigned so each week has its own solo copy. Add two exercises in the editor, Save, then
  // accept "apply to all sessions". Every template — the fork, the shared original, the four copies —
  // must end with the three originals plus the two new ones, each exactly once.
  test('PERSONAL: adding two exercises reaches every week and every copy once, and duplicates nothing', async ({ page }) => {
    await loginAsPT(page)
    test.skip(!(await page.evaluate(() => !!window._soloClientId)), 'no solo client record on this account')
    await page.evaluate(() => switchView('solo'))
    await expect.poll(() => page.evaluate(() => currentProfile?.role)).toBe('solo')
    await page.evaluate(installHelpers)
    const S = await page.evaluate(async () => {
      const { one } = window.__pt
      const uid = currentUser.id
      const prog = await one(db.from('programs').insert({ coach_id: uid, is_personal: true, name: '[E2E] Prop Personal' }).select('id').single())
      const phase = await one(db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 4, order_index: 0 }).select('id').single())
      const t = await one(db.from('workout_templates').insert({ coach_id: uid, program_id: prog.id, is_personal: true, name: '[E2E] Prop Upper' }).select('id').single())
      await one(db.from('workout_template_exercises').insert(['Bench', 'Row', 'Press'].map((n, i) => ({ template_id: t.id, exercise_name: '[E2E] ' + n, exercise_type: 'strength', order_index: i }))).select('id'))
      const pws = []
      for (const w of [1, 2, 3, 4]) pws.push(await one(db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: t.id, week_number: w }).select('id').single()))
      const cp = await one(db.from('client_programs').insert({ client_id: window._soloClientId, program_id: prog.id, start_date: null }).select('id').single())
      const ok = await _cloneProgramForClient(cp.id, prog.id, window._soloClientId)
      return { progId: prog.id, phaseId: phase.id, tId: t.id, pw1: pws[0].id, cpId: cp.id, cloneOk: ok, cleanupIds: { cpId: cp.id, progId: prog.id, phaseId: phase.id } }
    })
    try {
      expect(S.cloneOk, 'fixture: self-assign must have cloned every week').toBe(true)
      await page.evaluate(({ tId, progId, pw1 }) => openTemplate(tId, { programId: progId, phaseWorkoutId: pw1 }), S)
      await page.evaluate(() => window.__pt.stageAdds(['Seated Cable Row Machine', 'Cable Upright Row']))
      await page.evaluate(() => saveTemplateDraft())
      const forkedId = await page.evaluate(async (pw1) => (await window.__pt.one(db.from('program_phase_workouts').select('template_id').eq('id', pw1).single())).template_id, S.pw1)
      expect(forkedId, 'fixture: week 1 must have been forked off the shared template').not.toBe(S.tId)
      await expect(page.locator('#propagate-modal'), 'the sibling weeks must be offered the change').toBeAttached()
      await page.evaluate((id) => _applyToAllSessions(id), forkedId)

      const everything = await page.evaluate(async ({ phaseId }) => {
        const { one } = window.__pt
        const ppws = await one(db.from('program_phase_workouts').select('id, week_number, template_id').eq('phase_id', phaseId).order('week_number'))
        const cpws = await one(db.from('client_program_workouts').select('program_phase_workout_id, workout_template_id').in('program_phase_workout_id', ppws.map(p => p.id)))
        const out = {}
        for (const p of ppws) out['week ' + p.week_number + ' workout'] = await window.__pt.names(p.template_id)
        for (const c of cpws) out['solo copy of week ' + ppws.find(p => p.id === c.program_phase_workout_id).week_number] = await window.__pt.names(c.workout_template_id)
        return out
      }, S)
      const want = ['Bench', 'Cable Upright Row', 'Press', 'Row', 'Seated Cable Row Machine']   // hand-listed, sorted
      expect(everything).toEqual({
        'week 1 workout': want, 'week 2 workout': want, 'week 3 workout': want, 'week 4 workout': want,
        'solo copy of week 1': want, 'solo copy of week 2': want, 'solo copy of week 3': want, 'solo copy of week 4': want,
      })
    } finally {
      await cleanupProgramTree(page, S.cleanupIds)
      await cleanup(page, ['[E2E] Prop Upper'])
    }
  })

  // The path that matters most for a coach: "Update their copies" for a client who has the program. Before
  // the fix the client's plan stayed exactly as it was while the coach was told it had been updated.
  test('PT: "Update their copies" adds the exercise to the client\'s copy once, and duplicates nothing', async ({ page }) => {
    await loginAsPT(page)
    await page.evaluate(installHelpers)
    const clientRowId = await page.evaluate(async () => {
      const { data } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
      return data?.[0]?.id || null
    })
    test.skip(!clientRowId, 'the E2E coach has no client to assign to')
    const S = await page.evaluate(async (clientId) => {
      const { one } = window.__pt
      const uid = currentUser.id
      const prog = await one(db.from('programs').insert({ coach_id: uid, name: '[E2E] Prop Coached' }).select('id').single())
      const phase = await one(db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single())
      const t = await one(db.from('workout_templates').insert({ coach_id: uid, program_id: prog.id, name: '[E2E] Prop Coached Upper' }).select('id').single())
      await one(db.from('workout_template_exercises').insert(['Bench', 'Row', 'Press'].map((n, i) => ({ template_id: t.id, exercise_name: '[E2E] ' + n, exercise_type: 'strength', order_index: i }))).select('id'))
      const pw = await one(db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: t.id, week_number: 1 }).select('id').single())
      const cp = await one(db.from('client_programs').insert({ client_id: clientId, program_id: prog.id, start_date: null }).select('id').single())
      const ok = await _cloneProgramForClient(cp.id, prog.id, clientId)
      const cpw = await one(db.from('client_program_workouts').select('workout_template_id').eq('client_program_id', cp.id))
      return { progId: prog.id, tId: t.id, pwId: pw.id, cpId: cp.id, cloneOk: ok, clientTemplateId: cpw[0]?.workout_template_id, cleanupIds: { cpId: cp.id, progId: prog.id, phaseId: phase.id } }
    }, clientRowId)
    try {
      expect(S.cloneOk && S.clientTemplateId, 'fixture: the client must have their own copy of the workout').toBeTruthy()
      await page.evaluate(({ tId, progId, pwId }) => openTemplate(tId, { programId: progId, phaseWorkoutId: pwId }), S)
      await page.evaluate(() => window.__pt.stageAdds(['Seated Cable Row Machine']))
      await page.evaluate(() => saveTemplateDraft())
      await expect(page.locator('#client-copy-modal'), 'the coach must be asked before a real client\'s plan is touched').toBeAttached()
      await page.evaluate((tId) => _continueAfterClientCopy(tId, true), S.tId)

      const r = await page.evaluate(async ({ tId, clientTemplateId }) => ({ workout: await window.__pt.names(tId), clientCopy: await window.__pt.names(clientTemplateId) }), S)
      const want = ['Bench', 'Press', 'Row', 'Seated Cable Row Machine']
      expect(r).toEqual({ workout: want, clientCopy: want })
    } finally {
      await cleanupProgramTree(page, S.cleanupIds)
      await cleanup(page, ['[E2E] Prop Coached Upper'])
    }
  })
})
