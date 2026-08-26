// Jake, 2026-08-14: "When adding amending/updating a session within a program (this includes changing
// an exercise or chaning the session name) when I click 'Save' or 'Save edits' I should be asked whether
// I want to update all duplicated sessions with the same edits. Currently I am not asked and I have to
// go and make these edits 1 by 1."
//
// Root cause was that the app had no concept of "these template rows are the same session" — it inferred
// it from an exact name string, which fails in BOTH directions:
//   * a periodization clone is named `${name} — W2`, so "X" never equalled "X — W2" and the prompt was
//     STRUCTURALLY IMPOSSIBLE for any generated phase;
//   * two genuinely different sessions sharing a name (Jake's 6- and 9-exercise "Upper Body STR") would
//     have been offered as one.
// Fixed with a real `family_id` column (migration 2026-08-14, backfilled on identical content only).
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('Session identity — family_id', () => {
  // The DB trigger is the structural guarantee: five code paths insert templates today, and this
  // codebase's most-repeated failure is a rule landing in one function while its siblings drift.
  test('every inserted template gets an identity, even when the code forgets to set one', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      const r = await page.evaluate(async () => {
        const tag = `[E2E] fam ${Date.now()}`
        // Deliberately omits family_id — the trigger must fill it.
        const { data: bare } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, name: tag + ' bare', is_personal: false })
          .select('id, family_id').single()
        // An explicit family_id must be respected, not overwritten.
        const { data: child } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, name: tag + ' child', is_personal: false, family_id: bare.family_id })
          .select('id, family_id').single()
        return {
          ids: [bare.id, child.id],
          bareSelfReferential: bare.family_id === bare.id,
          childInherited: child.family_id === bare.family_id,
          childIsNotOwnFamily: child.family_id !== child.id,
        }
      })
      ids = r.ids
      expect(r.bareSelfReferential, 'a new standalone template becomes its own family').toBe(true)
      expect(r.childInherited, 'an explicit family_id must survive the trigger').toBe(true)
      expect(r.childIsNotOwnFamily).toBe(true)
    } finally {
      if (ids) await page.evaluate(async i => { await db.from('workout_templates').delete().in('id', i) }, ids)
    }
  })

  // THE reported bug. A rename had no propagation path at all — saveEditTemplate ended at a bare
  // openTemplate. This drives the real function and asserts the prompt is offered AND that applying it
  // renames the sibling while preserving its week marker.
  test('renaming a session offers to rename its copies, and keeps each week marker', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      const setup = await page.evaluate(async () => {
        const tag = `[E2E] rn ${Date.now()}`
        const { data: prog } = await db.from('programs')
          .insert({ coach_id: currentUser.id, name: tag + ' prog', is_personal: false }).select('id').single()
        const { data: phase } = await db.from('program_phases')
          .insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 2, order_index: 0 }).select('id').single()
        // Two copies of ONE session: a base and a week-2 clone with a DIFFERENT name but the same family.
        const { data: base } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, name: tag + ' Session', is_personal: false }).select('id, family_id').single()
        const { data: wk2 } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, name: tag + ' Session — W2', is_personal: false, family_id: base.family_id })
          .select('id').single()
        await db.from('program_phase_workouts').insert([
          { phase_id: phase.id, template_id: base.id, day_of_week: 1, day_label: 'Monday', session_order: 1, week_number: 1 },
          { phase_id: phase.id, template_id: wk2.id, day_of_week: 1, day_label: 'Monday', session_order: 1, week_number: 2 },
        ])
        return { progId: prog.id, phaseId: phase.id, baseId: base.id, wk2Id: wk2.id, tag }
      })
      ids = setup

      // Drive the REAL save path, with the real modal DOM the function reads.
      const prompted = await page.evaluate(async s => {
        window._templateCtx = { programId: s.progId }
        const mk = (id, tag2 = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(tag2); e.id = id; document.body.appendChild(e) } return e }
        mk('et-name').value = s.tag + ' Renamed'
        mk('et-desc').value = 'new desc'
        mk('et-error', 'p'); mk('edit-template-modal', 'div')
        await saveEditTemplate(s.baseId)
        // Give the propagation chain (which awaits openTemplate) time to land.
        await new Promise(r => setTimeout(r, 1200))
        return {
          modalShown: !!document.getElementById('propagate-modal'),
          modalText: document.getElementById('propagate-modal')?.innerText || '',
          targets: (window._propagateTargets || []).slice(),
        }
      }, setup)

      expect(prompted.modalShown, 'THE BUG: renaming never offered to update the other copies').toBe(true)
      expect(prompted.targets, 'the week-2 clone is the sibling, matched by family not by name').toEqual([setup.wk2Id])
      expect(prompted.modalText, 'wording must describe a rename, not an exercise change').toContain('name and description')

      // Apply it, then read the sibling straight from the DB.
      const after = await page.evaluate(async s => {
        await _applyToAllSessions(s.baseId)
        await new Promise(r => setTimeout(r, 1200))
        const { data } = await db.from('workout_templates').select('id, name').in('id', [s.baseId, s.wk2Id])
        return Object.fromEntries((data || []).map(t => [t.id, t.name]))
      }, setup)

      expect(after[setup.baseId]).toBe(setup.tag + ' Renamed')
      expect(after[setup.wk2Id], 'the week marker must survive — otherwise 8 weeks all share one name')
        .toBe(setup.tag + ' Renamed — W2')
    } finally {
      if (ids) await page.evaluate(async i => {
        await db.from('program_phase_workouts').delete().eq('phase_id', i.phaseId)
        await db.from('program_phases').delete().eq('id', i.phaseId)
        await db.from('workout_templates').delete().in('id', [i.baseId, i.wk2Id])
        await db.from('programs').delete().eq('id', i.progId)
      }, ids)
    }
  })

  // The input shape the test above CANNOT catch, found by pre-push review. The edit box is prefilled
  // with the source's CURRENT name, so what the user types normally still carries its own week marker.
  // Appending the target's marker to that produced "Lower Strength - week 1 - week 2" — wrong names
  // written to real rows, while the modal promised the marker would be kept. Note the "- week N" form:
  // that is how Jake's real data is named, not the "— WN" the code generates.
  test('renaming FROM a week copy does not double up the marker', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      const setup = await page.evaluate(async () => {
        const tag = `[E2E] dbl ${Date.now()}`
        const { data: prog } = await db.from('programs')
          .insert({ coach_id: currentUser.id, name: tag + ' prog', is_personal: false }).select('id').single()
        const { data: phase } = await db.from('program_phases')
          .insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 3, order_index: 0 }).select('id').single()
        const { data: w1 } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, name: tag + ' Body - week 1', is_personal: false }).select('id, family_id').single()
        const { data: w2 } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, name: tag + ' Body - week 2', is_personal: false, family_id: w1.family_id })
          .select('id').single()
        await db.from('program_phase_workouts').insert([
          { phase_id: phase.id, template_id: w1.id, day_of_week: 1, day_label: 'Monday', session_order: 1, week_number: 1 },
          { phase_id: phase.id, template_id: w2.id, day_of_week: 1, day_label: 'Monday', session_order: 1, week_number: 2 },
        ])
        return { progId: prog.id, phaseId: phase.id, w1Id: w1.id, w2Id: w2.id, tag }
      })
      ids = setup

      const after = await page.evaluate(async s => {
        window._templateCtx = { programId: s.progId }
        const mk = (id, t2 = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t2); e.id = id; document.body.appendChild(e) } return e }
        // Exactly what the prefilled box gives you: the CURRENT name, edited in place.
        mk('et-name').value = s.tag + ' Strength - week 1'
        mk('et-desc').value = ''
        mk('et-error', 'p'); mk('edit-template-modal', 'div')
        await saveEditTemplate(s.w1Id)
        await new Promise(r => setTimeout(r, 1200))
        await _applyToAllSessions(s.w1Id)
        await new Promise(r => setTimeout(r, 1200))
        const { data } = await db.from('workout_templates').select('id, name').in('id', [s.w1Id, s.w2Id])
        return Object.fromEntries((data || []).map(t => [t.id, t.name]))
      }, setup)

      expect(after[setup.w2Id], 'must not become "... - week 1 - week 2"')
        .toBe(setup.tag + ' Strength - week 2')
      expect(after[setup.w2Id]).not.toContain('week 1')
    } finally {
      if (ids) await page.evaluate(async i => {
        await db.from('program_phase_workouts').delete().eq('phase_id', i.phaseId)
        await db.from('program_phases').delete().eq('id', i.phaseId)
        await db.from('workout_templates').delete().in('id', [i.baseId, i.wk2Id])
        await db.from('programs').delete().eq('id', i.progId)
      }, ids)
    }
  })

  // Highest-risk, previously uncovered part of the change: family_id travels through the CLONE paths.
  // Four separate embeds feed those paths, each an explicit column list — an ALLOWLIST — and a column
  // omitted from one comes back `undefined`, gets dropped from the insert payload, and the clone
  // silently becomes its own orphaned family. Invisible at every layer (les-036), and one of the four
  // was only found because an assertion counted them. This drives the REAL generator end to end.
  test('generated week clones inherit the base session\'s family_id', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      const r = await page.evaluate(async () => {
        const tag = `[E2E] gen ${Date.now()}`
        const { data: prog } = await db.from('programs')
          .insert({ coach_id: currentUser.id, name: tag + ' prog', is_personal: false }).select('id').single()
        // periodization_type is required by generatePhasePeriodization (:1570) and the phase must be
        // >= 2 weeks (:1571). Without both, it toasts and returns without generating anything.
        const { data: phase } = await db.from('program_phases')
          .insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 3, order_index: 0, periodization_type: 'linear' }).select('id').single()
        const { data: base } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, name: tag + ' Base', is_personal: false }).select('id, family_id').single()
        await db.from('workout_template_exercises').insert({
          template_id: base.id, exercise_name: 'Back Squat', exercise_type: 'strength',
          metric_type: 'weight_reps', order_index: 0, sets_json: [{ effortType: 'rpe', repsMin: '5' }]
        })
        await db.from('program_phase_workouts').insert({
          phase_id: phase.id, template_id: base.id, day_of_week: 1, day_label: 'Monday',
          session_order: 1, week_number: 1
        })

        window._openProgramId = prog.id
        // The generator asks for confirmation before rebuilding weeks 2+. Stubbed rather than driven
        // through Playwright's dialog handler because the confirm fires inside this evaluate.
        const realConfirm = window.confirm
        window.confirm = () => true
        try { await generatePhasePeriodization(phase.id, prog.id) } finally { window.confirm = realConfirm }
        await new Promise(r2 => setTimeout(r2, 2000))

        // Every template now attached to this phase's slots, weeks 2+.
        const { data: pws } = await db.from('program_phase_workouts')
          .select('week_number, template_id, workout_templates(id, name, family_id)').eq('phase_id', phase.id)
        const generated = (pws || []).filter(p => (p.week_number || 1) > 1)
        return {
          ids: { progId: prog.id, phaseId: phase.id, baseId: base.id },
          baseFamily: base.family_id,
          generatedCount: generated.length,
          allInherited: generated.length > 0 && generated.every(p => p.workout_templates?.family_id === base.family_id),
          // A clone that fell back to its own id is the exact silent-orphan signature.
          orphans: generated.filter(p => p.workout_templates && p.workout_templates.family_id === p.workout_templates.id).length,
          names: generated.map(p => p.workout_templates?.name),
        }
      })
      ids = r.ids
      expect(r.generatedCount, 'the generator must actually have produced week clones').toBeGreaterThan(0)
      expect(r.orphans, 'a clone whose family_id equals its own id was orphaned from its family').toBe(0)
      expect(r.allInherited, 'every generated week must belong to the base session\'s family').toBe(true)
      // And the names genuinely differ — which is why name-matching could never have worked.
      expect(r.names.some(n => /— W\d+$/.test(n || '')), 'clones are renamed, so identity cannot come from the name').toBe(true)
    } finally {
      if (ids) await page.evaluate(async i => {
        const { data: pws } = await db.from('program_phase_workouts').select('template_id').eq('phase_id', i.phaseId)
        const tids = [...new Set((pws || []).map(p => p.template_id).filter(Boolean))]
        await db.from('program_phase_workouts').delete().eq('phase_id', i.phaseId)
        await db.from('program_phases').delete().eq('id', i.phaseId)
        if (tids.length) await db.from('workout_template_exercises').delete().in('template_id', tids)
        if (tids.length) await db.from('workout_templates').delete().in('id', tids)
        await db.from('programs').delete().eq('id', i.progId)
      }, ids)
    }
  })

  // The other direction of the old name-matching bug, and the reason the backfill grouped on content
  // rather than on name: two genuinely different sessions that share a name must NOT be offered as copies.
  test('two different sessions sharing a name are not treated as copies', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      const setup = await page.evaluate(async () => {
        const tag = `[E2E] samename ${Date.now()}`
        const { data: prog } = await db.from('programs')
          .insert({ coach_id: currentUser.id, name: tag + ' prog', is_personal: false }).select('id').single()
        const { data: phase } = await db.from('program_phases')
          .insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 2, order_index: 0 }).select('id').single()
        // Same name, deliberately SEPARATE families — what the content-based backfill produces for
        // Jake's real 6-exercise and 9-exercise "Upper Body STR".
        const mk = async n => (await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, name: n, is_personal: false }).select('id, family_id').single()).data
        const a = await mk(tag + ' Upper Body STR')
        const b = await mk(tag + ' Upper Body STR')
        await db.from('program_phase_workouts').insert([
          { phase_id: phase.id, template_id: a.id, day_of_week: 1, day_label: 'Monday', session_order: 1, week_number: 1 },
          { phase_id: phase.id, template_id: b.id, day_of_week: 2, day_label: 'Tuesday', session_order: 1, week_number: 1 },
        ])
        return { progId: prog.id, phaseId: phase.id, aId: a.id, bId: b.id, differentFamilies: a.family_id !== b.family_id }
      })
      ids = setup
      expect(setup.differentFamilies, 'each got its own identity').toBe(true)

      const r = await page.evaluate(async s => {
        window._templateCtx = { programId: s.progId }
        window._lastExerciseChange = { op: 'update', exerciseName: 'X' }
        window._propagateTargets = null
        await _checkSiblingPropagation(s.aId, { programId: s.progId }, { op: 'update', exerciseName: 'X' })
        await new Promise(r2 => setTimeout(r2, 800))
        return { modalShown: !!document.getElementById('propagate-modal'), targets: window._propagateTargets }
      }, setup)

      expect(r.modalShown, 'same NAME must not imply same session — that is the whole point of family_id').toBe(false)
      expect(r.targets == null || r.targets.length === 0).toBe(true)
    } finally {
      if (ids) await page.evaluate(async i => {
        await db.from('program_phase_workouts').delete().eq('phase_id', i.phaseId)
        await db.from('program_phases').delete().eq('id', i.phaseId)
        await db.from('workout_templates').delete().in('id', [i.aId, i.bId])
        await db.from('programs').delete().eq('id', i.progId)
      }, ids)
    }
  })

  // ── THE JOIN. Added 2026-08-26, after Jake said "you need to test this". ────────────────────────
  //
  // The two tests above each cover HALF of his scenario, and nothing joined them:
  //   * 'generated week clones inherit ...' runs the REAL generator, but never renames anything.
  //   * 'renaming a session offers ...' renames, but HAND-SETS family_id on its fixture and calls
  //     saveEditTemplate() against stubbed DOM (mk('et-name'), mk('edit-template-modal')).
  // So "the real generator produces the clones, THEN renaming the base offers the prompt" — which is
  // literally what Jake does — was never asserted end to end. Two green halves are not a green whole:
  // that is exactly the 'adjacent flow' the closure rule refuses as evidence, and I had started to
  // offer those two halves to Jake as proof before he pushed back.
  //
  // NO STUBS HERE. Real generatePhasePeriodization, real openTemplate (which is what sets
  // _templateCtx in production — app-programs.js:2150 calls it exactly this way), real
  // showEditTemplateModal DOM, and real Playwright clicks on the real Save and Apply buttons.
  test('END TO END: real generated weeks, then a real rename click, offers the real prompt', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      const setup = await page.evaluate(async () => {
        const tag = '[E2E] join ' + Date.now()
        const { data: prog } = await db.from('programs')
          .insert({ coach_id: currentUser.id, name: tag + ' prog', is_personal: false }).select('id').single()
        const { data: phase } = await db.from('program_phases')
          .insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 3, order_index: 0, periodization_type: 'linear' })
          .select('id').single()
        const { data: base } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, name: tag + ' Session', is_personal: false }).select('id, family_id').single()
        await db.from('workout_template_exercises').insert({
          template_id: base.id, exercise_name: 'Back Squat', exercise_type: 'strength',
          metric_type: 'weight_reps', order_index: 0, sets_json: [{ effortType: 'rpe', repsMin: '5' }]
        })
        await db.from('program_phase_workouts').insert({
          phase_id: phase.id, template_id: base.id, day_of_week: 1, day_label: 'Monday',
          session_order: 1, week_number: 1
        })
        // REAL periodization — the clones and their family_id come from shipped code, not from the test.
        window._openProgramId = prog.id
        const realConfirm = window.confirm
        window.confirm = () => true
        try { await generatePhasePeriodization(phase.id, prog.id) } finally { window.confirm = realConfirm }
        await new Promise(r => setTimeout(r, 2000))
        const { data: pws } = await db.from('program_phase_workouts')
          .select('week_number, template_id, workout_templates(id, name)').eq('phase_id', phase.id)
        const gen = (pws || []).filter(p => (p.week_number || 1) > 1)
        return {
          progId: prog.id, phaseId: phase.id, baseId: base.id, tag,
          generatedIds: gen.map(p => p.template_id),
          generatedNames: gen.map(p => p.workout_templates && p.workout_templates.name)
        }
      })
      ids = setup
      expect(setup.generatedIds.length, 'the real generator must have produced week clones to propagate to')
        .toBeGreaterThan(0)
      expect(setup.generatedNames.some(n => / — W\d+$/.test(n || '')),
        'the clones must carry the week marker — that rename is what used to break the match').toBe(true)

      // Real navigation into the editor, the way the Programs page does it.
      await page.evaluate(async s => {
        await openTemplate(s.baseId, { backLabel: 'Back to program', programId: s.progId })
        await showEditTemplateModal(s.baseId)
      }, setup)
      await page.waitForSelector('#edit-template-modal #et-name', { timeout: 10000 })

      // Real user actions on the real modal.
      await page.fill('#edit-template-modal #et-name', setup.tag + ' Renamed')
      await page.click('#edit-template-modal .modal-footer .btn-primary')

      // THE ASSERTION: the prompt actually appears for a REAL periodized phase.
      await page.waitForSelector('#propagate-modal', { timeout: 15000 })
      const shown = await page.evaluate(() => ({
        text: (document.getElementById('propagate-modal') || {}).innerText || '',
        targets: (window._propagateTargets || []).slice()
      }))
      expect(shown.targets.slice().sort(), 'the prompt must target exactly the REAL generated week clones')
        .toEqual(setup.generatedIds.slice().sort())
      expect(shown.text, 'wording must describe a rename, not an exercise change').toContain('name and description')

      // Taking it must rename every copy while keeping each week marker.
      await page.click('#propagate-modal .modal-footer .btn-primary')
      await page.waitForTimeout(2500)
      const after = await page.evaluate(async s => {
        const { data } = await db.from('workout_templates').select('id, name')
          .in('id', [s.baseId].concat(s.generatedIds))
        return Object.fromEntries((data || []).map(t2 => [t2.id, t2.name]))
      }, setup)
      expect(after[setup.baseId]).toBe(setup.tag + ' Renamed')
      for (let n = 0; n < setup.generatedIds.length; n++) {
        const gid = setup.generatedIds[n]
        // Take the marker from the name the GENERATOR produced, so a two-digit week (— W10) works too.
        const marker = (setup.generatedNames[n] || '').match(/ — W\d+$/)
        expect(marker, 'the generated clone must have had a week marker to preserve').not.toBeNull()
        expect(after[gid], 'every generated week keeps its own marker after the rename')
          .toBe(setup.tag + ' Renamed' + marker[0])
      }
    } finally {
      if (ids) await page.evaluate(async i => {
        const { data: pws } = await db.from('program_phase_workouts').select('template_id').eq('phase_id', i.phaseId)
        const tids = [...new Set((pws || []).map(p => p.template_id).filter(Boolean))]
        await db.from('program_phase_workouts').delete().eq('phase_id', i.phaseId)
        await db.from('program_phases').delete().eq('id', i.phaseId)
        if (tids.length) await db.from('workout_template_exercises').delete().in('template_id', tids)
        if (tids.length) await db.from('workout_templates').delete().in('id', tids)
        await db.from('programs').delete().eq('id', i.progId)
      }, ids)
    }
  })
})
