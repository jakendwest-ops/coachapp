// Real clients' copies of the LATER weeks never got an "Update all copies" change, and nothing said so
// (docs/bugs/2026-11-15-update-all-copies-skips-clients-later-weeks.md).
//
// PT view, a 3-week master programme assigned to a real client. Editing Week 2 and choosing "Update all copies"
// updated the coach's Week 3 but left the client's Week 3 copy as it was: _applyToAllSessions collected the
// client copies and wrote only the user's own. Now ONE client question comes after the copies choice and covers
// the client's copy of this week AND of the later weeks; the client's Week 1 copy is never touched.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

const P = '[E2E] ClientLater'

async function setup(page) {
  return page.evaluate(async (P) => {
    const one = async (q) => { const { data, error } = await q; if (error) throw new Error(error.message); return data }
    const uid = currentUser.id
    const { data: cl } = await db.from('clients').select('id').eq('coach_id', uid).not('user_id', 'is', null).order('created_at').limit(1)
    if (!cl?.[0]) return { skip: 'the E2E coach has no client to assign to' }
    const sets = (w) => [1, 2].map(() => ({ repsMin: 5, weight: w, restMin: 90 }))
    const prog = await one(db.from('programs').insert({ coach_id: uid, is_personal: false, name: P + ' Plan' }).select('id').single())
    const phase = await one(db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 3, order_index: 0 }).select('id').single())
    const mk = async (name, fam) => one(db.from('workout_templates').insert({ coach_id: uid, program_id: prog.id, name: P + name, ...(fam ? { family_id: fam } : {}) }).select('id, family_id').single())
    const w1 = await mk(' Monday')
    const fam = w1.family_id || w1.id
    const w2 = await mk(' Monday — W2', fam)
    const w3 = await mk(' Monday — W3', fam)
    await one(db.from('workout_template_exercises').insert([[w1, 100], [w2, 105], [w3, 110]].map(([t, w]) =>
      ({ template_id: t.id, exercise_name: '[E2E] Bench', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0, sets: 2, sets_json: sets(w) }))).select('id'))
    const slot = (t, week) => one(db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: t, week_number: week }).select('id').single())
    const pw1 = await slot(w1.id, 1), pw2 = await slot(w2.id, 2), pw3 = await slot(w3.id, 3)
    const cp = await one(db.from('client_programs').insert({ client_id: cl[0].id, program_id: prog.id, start_date: null }).select('id').single())
    const ok = await _cloneProgramForClient(cp.id, prog.id, cl[0].id)
    const cpws = await one(db.from('client_program_workouts').select('program_phase_workout_id, workout_template_id').eq('client_program_id', cp.id))
    const copyOf = (pw) => cpws.find(r => r.program_phase_workout_id === pw.id)?.workout_template_id
    return { progId: prog.id, phaseId: phase.id, cpId: cp.id, ok, w2: w2.id, pw2: pw2.id, c1: copyOf(pw1), c2: copyOf(pw2), c3: copyOf(pw3), w3: w3.id }
  }, P)
}

async function cleanup(page, S) {
  await page.evaluate(async ({ progId, phaseId, cpId, P }) => {
    const uid = currentUser.id
    if (cpId) await db.from('client_program_workouts').delete().eq('client_program_id', cpId).select('id')
    if (cpId) await db.from('client_programs').delete().eq('id', cpId).select('id')
    await db.from('program_phase_workouts').delete().eq('phase_id', phaseId).select('id')
    await db.from('program_phases').delete().eq('id', phaseId).select('id')
    await db.from('programs').delete().eq('id', progId).select('id')
    const ids = ((await db.from('workout_templates').select('id').eq('coach_id', uid).like('name', P + '%')).data || []).map(t => t.id)
    if (ids.length) await db.from('workout_template_exercises').delete().in('template_id', ids).select('id')
    if (ids.length) await db.from('workout_templates').delete().in('id', ids).eq('coach_id', uid).select('id')
  }, { ...S, P })
  const left = await page.evaluate(async (P) => ((await db.from('workout_templates').select('id').eq('coach_id', currentUser.id).like('name', P + '%')).data || []).length, P)
  expect(left, 'cleanup left [E2E] ClientLater templates behind').toBe(0)
}

const rests = (page, tid) => page.evaluate(async (tid) => {
  const { data } = await db.from('workout_template_exercises').select('sets_json').eq('template_id', tid)
  return data.map(r => r.sets_json.map(s => `${s.weight}kg/${s.restMin}s`).join(' '))
}, tid)

async function editWeek2Rest(page, S) {
  await page.evaluate(async ({ w2, progId, pw2 }) => {
    await openTemplate(w2, { programId: progId, phaseWorkoutId: pw2 })
    const bench = window._templateDraft.exercises.find(e => e.exercise_name === '[E2E] Bench')
    bench.sets_json = bench.sets_json.map(s => ({ ...s, restMin: 150 }))
    await saveTemplateDraft()
  }, S)
}

test.describe('"Update all copies" also offers the client\'s later-week copies, once, last (2026-11-15)', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page) })

  test('Update all copies, then Update their copies: the client gets Week 2 and Week 3, never Week 1', async ({ page }) => {
    const S = await setup(page)
    test.skip(!!S.skip, S.skip)
    try {
      expect(S.ok && S.c1 && S.c2 && S.c3, 'fixture: the client must have a copy of every week').toBeTruthy()
      await editWeek2Rest(page, S)
      await expect(page.locator('#propagate-modal'), 'the copies question comes first').toBeAttached()
      await expect(page.locator('#client-copy-modal'), 'the client question must not come before the copies choice').toHaveCount(0)
      await expect(page.locator('#propagate-modal')).toContainText('Each copy keeps its own weights, reps and effort.')
      const saved = await page.evaluate(async (pw2) => (await db.from('program_phase_workouts').select('template_id').eq('id', pw2).single()).data.template_id, S.pw2)
      await page.evaluate((id) => _applyToAllSessions(id, 'changes'), saved)
      const ask = page.locator('#client-copy-modal')
      await expect(ask, 'one client question, after the copies choice').toBeAttached()
      await expect(ask).toContainText('the later weeks you just updated')
      await page.evaluate((id) => _continueAfterClientCopy(id, true), saved)
      expect(await rests(page, S.w3), 'the coach\'s own Week 3 got the rest').toEqual(['110kg/150s 110kg/150s'])
      expect(await rests(page, S.c2), 'the client\'s Week 2 copy got the rest').toEqual(['105kg/150s 105kg/150s'])
      expect(await rests(page, S.c3), 'the client\'s Week 3 copy got the rest and kept its load').toEqual(['110kg/150s 110kg/150s'])
      expect(await rests(page, S.c1), 'the client\'s Week 1 copy is before the edited week: untouched').toEqual(['100kg/90s 100kg/90s'])
    } finally { await cleanup(page, S) }
  })

  // Review finding (2026-11-15): "Update all copies" closes its dialogue, writes, and only then asks the clients
  // question. A view switch waits on _waitForPropagationModalsToClear; with no modal open in that gap it went
  // ahead, and the clients question (real names) appeared over Personal view. The wait must hold until settled.
  test('a view switch waits while "Update all copies" is still writing, then goes ahead', async ({ page }) => {
    const r = await page.evaluate(async () => {
      window._propagationInFlight = true
      let resolved = false
      const p = _waitForPropagationModalsToClear(5000).then(() => { resolved = true })
      await new Promise(res => setTimeout(res, 300))
      const heldWhileWriting = !resolved
      _settlePropagation()
      await p
      return { heldWhileWriting, resolvedAfter: resolved, flag: window._propagationInFlight }
    })
    expect(r).toEqual({ heldWhileWriting: true, resolvedAfter: true, flag: false })
  })

  test('Just this session, then Update their copies: only the client\'s Week 2 copy changes', async ({ page }) => {
    const S = await setup(page)
    test.skip(!!S.skip, S.skip)
    try {
      await editWeek2Rest(page, S)
      await expect(page.locator('#propagate-modal')).toBeAttached()
      await page.locator('#propagate-modal button', { hasText: /^Just this session$/ }).click()
      const ask = page.locator('#client-copy-modal')
      await expect(ask, 'the client is still asked about this week\'s copy').toBeAttached()
      await expect(ask).not.toContainText('later weeks')
      await ask.locator('button', { hasText: /^Update their copies$/ }).click()
      await expect.poll(() => rests(page, S.c2), { message: 'the client\'s Week 2 copy got the rest' }).toEqual(['105kg/150s 105kg/150s'])
      expect(await rests(page, S.c3), 'Week 3 was not chosen: the client\'s copy stays').toEqual(['110kg/90s 110kg/90s'])
      expect(await rests(page, S.w3), 'and so does the coach\'s').toEqual(['110kg/90s 110kg/90s'])
    } finally { await cleanup(page, S) }
  })
})
