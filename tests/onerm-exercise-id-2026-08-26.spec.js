// Refactor phase 1 (Jake, 2026-08-26): every client_1rms writer must persist exercise_id.
//
// A row without it survives only on the exercise NAME, and breaks the moment the lift is renamed —
// the precise failure exercise_id was added to prevent (bug 2026-08-17).
//
// That row said "two of the three writers". Re-enumerating from scratch found THREE offenders out of
// FOUR writers — it missed _saveMissingOneRMEntries, the quick-entry that fires during programme
// assignment, whose own source comment records that app-programs.js was absent from the app-core
// inventory and so escaped the 2026-08-21 sweep. It escaped the ledger row too.
//
// All three already HAD the id and discarded it building an intermediate list, so this is a pure
// refactor: no name lookup, no migration, and no risk of auto-creating library `exercises` rows.
//
// NOT doing the migration half: exercise_name STAYS. Exercises can be deleted
// (js/app-workouts.js:1083), so the name is a historical snapshot, not a redundant copy — dropping it
// would orphan every max recorded against a since-deleted lift.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('client_1rms writers must persist exercise_id', () => {

  // The class guard, and the reason this is more than three one-line edits. A fourth writer added
  // later without exercise_id would silently rejoin the broken set — which is exactly how offender 3
  // survived both a sweep and a ledger row. Tonight the equivalent guard on the weight round-trip
  // caught my own incomplete fix, so it has already earned its place once.
  test('every client_1rms insert in js/ carries exercise_id', async ({ page }) => {
    await loginAsPT(page)
    const scan = await page.evaluate(async () => {
      // Modules ENUMERATED from index.html, never a hardcoded list. A hardcoded inventory is exactly
      // how offender 3 escaped the 2026-08-21 sweep and then escaped the ledger row written to catch
      // that sweep; the first version of THIS test repeated the mistake, omitting app-core,
      // app-calendar-goals and starter-content. Same reasoning as checks.sh rule 3.
      const html = await fetch('/index.html')
      if (!html.ok) return { fatal: 'index.html fetch failed: ' + html.status }
      const names = [...(await html.text()).matchAll(/src="(js\/[a-z-]+\.js)\?/g)].map(m => m[1])
      const out = {}
      for (const n of names) {
        const r = await fetch('/' + n)
        // A 404 must FAIL, not silently contribute zero offenders and read as green.
        if (!r.ok) return { fatal: n + ' fetch failed: ' + r.status }
        out[n] = await r.text()
      }
      return { srcs: out, moduleCount: names.length }
    })
    expect(scan.fatal, 'the scan must not pass over an unreadable source').toBeUndefined()
    expect(scan.moduleCount, 'index.html must have yielded the real module list').toBeGreaterThanOrEqual(9)

    const offenders = []
    let inserts = 0
    for (const [file, src] of Object.entries(scan.srcs)) {
      const lines = src.split('\n')
      lines.forEach((l, i) => {
        if (!/from\(['"]client_1rms['"]\)/.test(l)) return
        if (!/insert|upsert/.test(l) && !/insert|upsert/.test(lines.slice(i, i + 4).join('\n'))) return
        inserts++
        // The payload can be on the same line or the next few — read a window, same as a human would.
        const win = lines.slice(Math.max(0, i - 8), i + 6).join('\n')
        if (!/exercise_id/.test(win)) offenders.push(`${file}:${i + 1}`)
      })
    }
    // "all 0 inserts are clean" is a switched-off checker, not a pass. Four writers exist today.
    expect(inserts, 'the scan found NO client_1rms inserts — it is inspecting nothing').toBeGreaterThanOrEqual(4)
    expect(offenders, 'a client_1rms insert with no exercise_id breaks on the next rename').toEqual([])
  })

  // Offender 3 — the one the ledger row never named. Drives the REAL state variable the render sets
  // and the REAL quick-entry inputs the function reads.
  test('_saveMissingOneRMEntries writes exercise_id (offender the ledger row missed)', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      // Fixtures created in their OWN evaluate so `ids` is assigned BEFORE anything can throw.
      // Creating and using them in one evaluate means a throw after the inserts skips the finally
      // with nothing to delete — the exact failure path that most needs cleanup, and the reason
      // there are already stranded [E2E] rows on the live account (see the 2026-08-26 ledger row).
      ids = await page.evaluate(async () => {
        const tag = '[E2E] mor ' + Date.now()
        const { data: c } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: tag + ' client' }).select('id').single()
        const { data: ex } = await db.from('exercises')
          .insert({ coach_id: currentUser.id, name: tag + ' Lift', muscle_group: 'legs', category: 'compound' })
          .select('id').single()
        return { clientId: c.id, exId: ex.id, tag }
      })
      const out = await page.evaluate(async ({ clientId, exId, tag }) => {
        const c = { id: clientId }, ex = { id: exId }
        // Exactly what _refreshMissingOneRMs assigns, in the new shape.
        window._missingOneRMExercises = [{ name: tag + ' Lift', exerciseId: ex.id }]
        const inp = document.createElement('input')
        inp.id = 'mor-0-weight'
        inp.value = '100'
        document.body.appendChild(inp)

        await _saveMissingOneRMEntries(c.id)
        await new Promise(r => setTimeout(r, 1200))
        const { data: rows } = await db.from('client_1rms')
          .select('exercise_id, exercise_name, one_rm_kg').eq('client_id', c.id)
        inp.remove()
        return { exId: ex.id, rows: rows || [] }
      }, ids)
      expect(out.rows.length, 'the quick entry must have saved a 1RM').toBe(1)
      expect(out.rows[0].exercise_id, 'THE BUG: saved with no exercise_id, so a rename orphans it')
        .toBe(out.exId)
    } finally {
      if (ids) await page.evaluate(async i => {
        await db.from('client_1rms').delete().eq('client_id', i.clientId)
        await db.from('clients').delete().eq('id', i.clientId)
        await db.from('exercises').delete().eq('id', i.exId)
      }, ids)
    }
  })

  // Offender 2 — the post-session estimate prompt. The id now rides on the candidate object and
  // through the call signature; before, only the name was passed.
  test('_savePostSessionOneRM writes exercise_id', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      ids = await page.evaluate(async () => {
        const tag = '[E2E] psorm ' + Date.now()
        const { data: c } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: tag + ' client' }).select('id').single()
        const { data: ex } = await db.from('exercises')
          .insert({ coach_id: currentUser.id, name: tag + ' Lift', muscle_group: 'chest', category: 'compound' })
          .select('id').single()
        return { clientId: c.id, exId: ex.id, tag }
      })
      const out = await page.evaluate(async ({ clientId, exId, tag }) => {
        await _savePostSessionOneRM(0, clientId, tag + ' Lift', 123.5, exId)
        await new Promise(r => setTimeout(r, 1200))
        const { data: rows } = await db.from('client_1rms')
          .select('exercise_id, exercise_name').eq('client_id', clientId)
        return { exId, rows: rows || [] }
      }, ids)
      expect(out.rows.length).toBe(1)
      expect(out.rows[0].exercise_id, 'THE BUG: the post-session estimate saved name-only').toBe(out.exId)
    } finally {
      if (ids) await page.evaluate(async i => {
        await db.from('client_1rms').delete().eq('client_id', i.clientId)
        await db.from('clients').delete().eq('id', i.clientId)
        await db.from('exercises').delete().eq('id', i.exId)
      }, ids)
    }
  })

  // Offender 1 — the runner's inline 1RM prompt. Drives the real function through _runner state and
  // the real rorm-* inputs it reads.
  test('saveRunnerOneRM writes exercise_id', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      ids = await page.evaluate(async () => {
        const tag = '[E2E] rorm ' + Date.now()
        const { data: c } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: tag + ' client' }).select('id').single()
        const { data: ex } = await db.from('exercises')
          .insert({ coach_id: currentUser.id, name: tag + ' Lift', muscle_group: 'back', category: 'compound' })
          .select('id').single()
        return { clientId: c.id, exId: ex.id, tag }
      })
      const out = await page.evaluate(async ({ clientId, exId, tag }) => {
        const c = { id: clientId }, ex = { id: exId }
        // `_runner` is a top-level `let` (js/app-workouts.js:3089), i.e. a global LEXICAL binding —
        // NOT a window property. `window._runner = …` creates a separate property the shipped code
        // never reads, so the first version of this test could not drive the real path at all.
        // Assign the binding itself, and put it back afterwards.
        const prevRunner = typeof _runner !== 'undefined' ? _runner : null
        _runner = {
          clientId: c.id, name: tag + ' session', date: new Date().toISOString().split('T')[0],
          exIdx: 0, startTime: Date.now(),
          exercises: [{
            name: tag + ' Lift', exerciseId: ex.id, type: 'strength', metricType: 'weight_reps',
            sets: [], loggedSets: [], targetSets: 1
          }]
        }
        const mk = (id, tag2 = 'input') => {
          let e = document.getElementById(id)
          if (!e) { e = document.createElement(tag2); e.id = id; document.body.appendChild(e) }
          return e
        }
        mk('rorm-error', 'p')
        mk('rorm-epley-fields', 'div').style.display = 'none'   // direct mode
        mk('rorm-weight').value = '140'
        mk('modal-runner-1rm', 'div')

        // saveRunnerOneRM ends with renderRunner(), which needs far more runner state than this test
        // constructs. The DB write happens BEFORE that, so a render throw is captured and REPORTED
        // rather than swallowed — and the row assertion below still has to pass on its own.
        let renderErr = ''
        try { await saveRunnerOneRM(0) } catch (e) { renderErr = String(e && e.message || e) }
        await new Promise(r => setTimeout(r, 1200))
        const { data: rows } = await db.from('client_1rms')
          .select('exercise_id, exercise_name, one_rm_kg').eq('client_id', c.id)
        const err = (document.getElementById('rorm-error') || {}).textContent || ''
        _runner = prevRunner
        return { exId: ex.id, rows: rows || [], err, renderErr }
      }, ids)
      expect(out.err, 'the save must not have errored').toBe('')
      expect(out.renderErr, 'the DB write is under test, but a render throw is reported not hidden').toBe('')
      expect(out.rows.length).toBe(1)
      expect(out.rows[0].exercise_id, 'THE BUG: the runner prompt saved name-only').toBe(out.exId)
    } finally {
      if (ids) await page.evaluate(async i => {
        await db.from('client_1rms').delete().eq('client_id', i.clientId)
        await db.from('clients').delete().eq('id', i.clientId)
        await db.from('exercises').delete().eq('id', i.exId)
      }, ids)
    }
  })

  // Found by review OF this change, and load-bearing only because of it.
  // _getProgramOneRMStatus built neededByName with an unconditional Map.set, so when one exercise
  // NAME appears twice across week-1 slots and the LATER row carries a null exercise_id, the real id
  // was overwritten with null. Harmless while `missing` held bare names — the id was discarded anyway
  // and matching fell through to the name. The moment _saveMissingOneRMEntries started WRITING the
  // id, a loss here puts back exactly the name-only row this whole change exists to remove.
  // Reachable: starter-content.js:130 and app-workouts.js:2113/2180 all insert `exerciseId || null`.
  test('a duplicate exercise name with a null id must not wipe the real one', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      ids = await page.evaluate(async () => {
        const tag = '[E2E] dup ' + Date.now()
        const { data: c } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: tag + ' client' }).select('id').single()
        const { data: ex } = await db.from('exercises')
          .insert({ coach_id: currentUser.id, name: tag + ' Lift', muscle_group: 'legs', category: 'compound' })
          .select('id').single()
        const { data: prog } = await db.from('programs')
          .insert({ coach_id: currentUser.id, name: tag + ' prog', is_personal: false }).select('id').single()
        const { data: phase } = await db.from('program_phases')
          .insert({ program_id: prog.id, name: 'B1', duration_weeks: 1, order_index: 0 }).select('id').single()
        const { data: tmpl } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, name: tag + ' Session', is_personal: false }).select('id').single()
        // The SAME name twice, id-bearing row FIRST and the null one SECOND — the losing order.
        const pct = [{ intensityMin: 70, repsMin: '5' }]
        await db.from('workout_template_exercises').insert([
          { template_id: tmpl.id, exercise_id: ex.id, exercise_name: tag + ' Lift', order_index: 0, sets_json: pct },
          { template_id: tmpl.id, exercise_id: null, exercise_name: tag + ' Lift', order_index: 1, sets_json: pct }
        ])
        await db.from('program_phase_workouts').insert({
          phase_id: phase.id, template_id: tmpl.id, day_of_week: 1, day_label: 'Monday',
          session_order: 1, week_number: 1
        })
        return { clientId: c.id, exId: ex.id, progId: prog.id, phaseId: phase.id, tmplId: tmpl.id }
      })
      const out = await page.evaluate(async i => {
        const status = await _getProgramOneRMStatus(i.progId, i.clientId)
        return { missing: status.missing }
      }, ids)
      expect(out.missing.length, 'the lift has no 1RM on file, so it must be reported missing').toBe(1)
      expect(out.missing[0].exerciseId, 'THE BUG: a later null id overwrote the real one, so the quick entry saves name-only')
        .toBe(ids.exId)
    } finally {
      if (ids) await page.evaluate(async i => {
        await db.from('program_phase_workouts').delete().eq('phase_id', i.phaseId)
        await db.from('program_phases').delete().eq('id', i.phaseId)
        await db.from('workout_template_exercises').delete().eq('template_id', i.tmplId)
        await db.from('workout_templates').delete().eq('id', i.tmplId)
        await db.from('programs').delete().eq('id', i.progId)
        await db.from('clients').delete().eq('id', i.clientId)
        await db.from('exercises').delete().eq('id', i.exId)
      }, ids)
    }
  })
})
