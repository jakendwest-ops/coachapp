// Jake, 2026-08-14, on the Add-workout picker: "threshold intervals is being used (2 x 20 minute
// intervals) however when I try to add this session into the Thursday workout slot it does not appear to
// be in use, and therefore I cannot select it." His screenshot showed FOUR identical rows, all "Not used
// yet".
//
// Three independent causes, all fixed here. The fourth — four same-named rows needing to be GROUPED —
// needs the family_id migration and is deliberately not in this file.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('Add-workout picker — pool, usage and failure states', () => {
  // CAUSE 1, and the literal "I cannot select it". A workout built via "+ Create new workout (this day
  // only)" is stamped with program_id (app-workouts.js:1131) and the pool used to filter
  // `.is('program_id', null)`, so it was PERMANENTLY invisible to the picker. Now: offerable inside its
  // OWN programme, still hidden from every other one.
  test('a workout built inside this programme is offerable here, and nowhere else', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      const r = await page.evaluate(async () => {
        const tag = `[E2E] picker ${Date.now()}`
        const mk = async (name, programId) => (await db.from('workout_templates').insert({
          coach_id: currentUser.id, name, program_id: programId, is_personal: false
        }).select('id').single()).data.id
        const { data: pA } = await db.from('programs')
          .insert({ coach_id: currentUser.id, name: tag + ' progA' }).select('id').single()
        const { data: pB } = await db.from('programs')
          .insert({ coach_id: currentUser.id, name: tag + ' progB' }).select('id').single()

        const libId = await mk(tag + ' library', null)      // ordinary library workout
        const inAId = await mk(tag + ' inA', pA.id)         // built inside programme A
        const inBId = await mk(tag + ' inB', pB.id)         // built inside programme B

        // Open programme A, rebuild the pool, and see what it offers.
        window._openProgramId = pA.id
        window._programTemplates = null
        await _refreshProgramTemplates()
        const pool = (window._programTemplates || []).map(t => ({ id: t.id, inProg: t._inThisProgram }))

        return {
          ids: { pA: pA.id, pB: pB.id, libId, inAId, inBId },
          hasLibrary: pool.some(p => p.id === libId),
          hasOwnProgramme: pool.some(p => p.id === inAId),
          hasOtherProgramme: pool.some(p => p.id === inBId),
          ownFlagged: pool.find(p => p.id === inAId)?.inProg,
          libraryFlagged: pool.find(p => p.id === libId)?.inProg,
        }
      })
      ids = r.ids
      expect(r.hasLibrary, 'ordinary library workouts still appear').toBe(true)
      expect(r.hasOwnProgramme, "THE BUG: a workout built in this programme must be selectable in it").toBe(true)
      expect(r.hasOtherProgramme, "another programme's workout stays hidden — that exclusion was correct").toBe(false)
      expect(r.ownFlagged, 'flagged so the row can say BUILT IN THIS PROGRAMME').toBe(true)
      expect(r.libraryFlagged, 'a plain library workout is not flagged').toBe(false)
    } finally {
      if (ids) await page.evaluate(async i => {
        await db.from('workout_templates').delete().in('id', [i.libId, i.inAId, i.inBId])
        await db.from('programs').delete().in('id', [i.pA, i.pB])
      }, ids)
    }
  })

  // NOT-A-CAUSE, pinned so it does not get "fixed" again. It looks obvious that the usage lookup should
  // ALSO read client_program_workouts — a template used only in an assigned plan would otherwise read
  // "Not used yet". I built that, then checked the only writer of that table and removed it: the state
  // is unreachable. _cloneProgramForClient inserts a cpw row ONLY with the id returned by
  // _cloneTemplateForClient, which always stamps client_id; on clone failure it skips the row entirely.
  // So every cpw row points at a client-owned clone, and the pool excludes those. This test asserts the
  // structural fact, not the rendering — if it ever goes red, the premise changed and the extra query
  // becomes correct.
  test('every client_program_workouts row points at a client-owned clone, never a pooled template', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const { data: rows, error } = await db.from('client_program_workouts')
        .select('workout_template_id, workout_templates(client_id)').limit(200)
      if (error) return { error: error.message }
      const withTmpl = (rows || []).filter(r => r.workout_templates)
      return {
        checked: withTmpl.length,
        masters: withTmpl.filter(r => r.workout_templates.client_id === null).length,
        // The writer itself, read from source — the structural guarantee, independent of current data.
        writerAlwaysClones: /client_id:\s*clientId/.test(_cloneTemplateForClient.toString()),
        writerSkipsOnFailure: /if \(!newTemplateId\)/.test(_cloneProgramForClient.toString()),
      }
    })
    expect(r.error).toBeUndefined()
    expect(r.writerAlwaysClones, '_cloneTemplateForClient must always stamp client_id').toBe(true)
    expect(r.writerSkipsOnFailure, 'a failed clone must skip the cpw row, never fall back to the master').toBe(true)
    if (r.checked > 0) {
      expect(r.masters, 'no cpw row may point at a master template — that is what would make the extra query necessary').toBe(0)
    }
  })

  // CAUSE 4 — what Jake actually SAW. Four indistinguishable "SkiErg - Threshold Intervals" rows. His
  // real library holds 23 copies of that one session (10 of them standalone library rows), every one
  // manufactured by fork-on-edit. One row per SESSION now, not per copy.
  test('copies of one session collapse to a single row carrying the whole family\'s usage', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      const r = await page.evaluate(async () => {
        const tag = `[E2E] fam pool ${Date.now()}`
        const mkT = async (name, famId) => (await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, name, is_personal: false, ...(famId ? { family_id: famId } : {}) })
          .select('id, family_id').single()).data
        const a = await mkT(tag + ' Threshold')            // its own family
        const b = await mkT(tag + ' Threshold', a.family_id)  // same session, forked copy
        const c = await mkT(tag + ' Threshold', a.family_id)  // and another
        const solo = await mkT(tag + ' Unrelated')            // different session entirely

        const rows = [a, b, c, solo].map(t => ({ id: t.id, name: tag, description: '', family_id: t.family_id, workout_template_exercises: [] }))
        const pool = await _buildProgramTemplatePool(rows)
        return {
          ids: [a.id, b.id, c.id, solo.id],
          poolSize: pool.length,
          copiesOnFamily: pool.find(p => p._familyId === a.family_id)?._copies,
          copiesOnSolo: pool.find(p => p._familyId === solo.family_id)?._copies,
          repIsAMember: [a.id, b.id, c.id].includes(pool.find(p => p._familyId === a.family_id)?.id),
        }
      })
      ids = r.ids
      expect(r.poolSize, 'three copies of one session plus one other = TWO rows, not four').toBe(2)
      expect(r.copiesOnFamily).toBe(3)
      expect(r.copiesOnSolo, 'a session with no copies must not gain a misleading count').toBe(1)
      expect(r.repIsAMember, 'the collapsed row must still point at a real template').toBe(true)
    } finally {
      if (ids) await page.evaluate(async i => { await db.from('workout_templates').delete().in('id', i) }, ids)
    }
  })

  // CAUSE 3. The usage lookup failed OPEN: on any query error it returned the pool with every `_usage`
  // still null, so EVERY row rendered "Not used yet" — indistinguishable from a genuinely unused library
  // and an exact inversion of the answer. "Not used yet" is a claim; it must not be asserted on no data.
  test('a failed usage lookup says so instead of claiming everything is unused', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const host = document.createElement('div'); host.id = 'wkp-results'; document.body.appendChild(host)
      _workoutPickerState = { phaseId: 'p', dayOfWeek: 1, sessionOrder: 1, weekNumber: 1 }
      const base = { id: 'x', name: 'Threshold Intervals', description: '', _exPreview: 'SkiErg', _exCount: 1 }

      window._programTemplates = [{ ...base, _usage: null, _usageFailed: true }]
      _renderWorkoutPickerResults('')
      const failed = host.innerText

      window._programTemplates = [{ ...base, _usage: null, _usageFailed: false }]
      _renderWorkoutPickerResults('')
      const genuinelyUnused = host.innerText

      window._programTemplates = [{ ...base, _usage: 'Phase 1 · Wk 3 · TUE', _usageFailed: false }]
      _renderWorkoutPickerResults('')
      const used = host.innerText

      host.remove(); _workoutPickerState = null
      return { failed, genuinelyUnused, used }
    })
    expect(r.failed, 'a failed lookup must NOT assert "Not used yet"').not.toContain('Not used yet')
    expect(r.failed).toContain('Usage unavailable')
    expect(r.genuinelyUnused, 'a real empty result still says so').toContain('Not used yet')
    expect(r.used).toContain('Used in Phase 1 · Wk 3 · TUE')
  })
})
