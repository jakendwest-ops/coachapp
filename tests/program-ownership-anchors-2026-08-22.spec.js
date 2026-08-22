const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── app-programs ownership anchors: the TWO-ID PAIR ASSERTION ────────────────────────────────────
//
// Deliberately SINGLE-TENANT. Every entry point here takes two ids — (phaseId, programId) or
// (pwId, phaseId) — and the write keys on only ONE of them. A guard that verifies the other, or
// verifies one and ignores the second, reads as anchored while defending nothing. That is
// bugs/2026-08-22-guard-verifies-one-id-while-the-write-keys-on-another, and it is the specific
// defect these tests exist to keep closed.
//
// WHY NOT A CROSS-TENANT PROBE. A foreign-id refusal proves very little here: RLS already refuses a
// foreign write, so the test would pass with the guard deleted (see
// bugs/2026-08-22 "a guard's risk is refusing the LEGITIMATE user" — a refusal test over a layer that
// already refuses is decorative). These tests instead pass MY OWN mismatched ids: RLS permits both
// rows, so the ONLY thing standing between the call and the wrong row being written is the pair
// assertion in _verifyPhaseOwnership / _verifyPhaseWorkoutOwnership. Delete that assertion and these
// go red. Nothing else in the stack can save them.
//
// Cleanup is owner-anchored and by NAME, not by captured id, so a failed run cannot strand fixtures
// (bugs/2026-08-20-cross-tenant-probes-not-cleanup-safe). programs cascade to phases and slots.
test.describe('app-programs ownership anchors — mismatched-id pairs are refused', () => {
  const PREFIX = '[E2E] PairAnchor'
  const tag = PREFIX + ' ' + Date.now()

  test.afterEach(async ({ page }) => {
    await page.evaluate(async (t) => {
      // Rowcount-checked: a refused delete returns { data: [], error: null } and would report success
      // while leaving the fixtures behind.
      const { data: gone } = await db.from('programs')
        .delete().eq('coach_id', currentUser.id).like('name', p + '%').select('id')
      if (!(gone || []).length) console.error('CLEANUP: no fixture programs reaped for', p)
      await db.from('workout_templates')
        .delete().eq('coach_id', currentUser.id).like('name', p + '%').select('id')
    }, PREFIX).catch(() => {})
  })

  test('savePhase refuses a phaseId belonging to a different program of my own', async ({ page }) => {
    await loginAsPT(page)

    const fx = await page.evaluate(async (t) => {
      const mk = async (name) => (await db.from('programs')
        .insert({ coach_id: currentUser.id, is_personal: false, name }).select('id').single()).data
      const progA = await mk(t + ' A')
      const progB = await mk(t + ' B')
      const { data: phase } = await db.from('program_phases')
        .insert({ program_id: progA.id, name: 'ORIGINAL', duration_weeks: 4, order_index: 0 })
        .select('id').single()
      return { progA: progA?.id, progB: progB?.id, phase: phase?.id }
    }, tag)
    expect(fx.progA && fx.progB && fx.phase, 'fixtures must exist before the probe means anything').toBeTruthy()

    const result = await page.evaluate(async (f) => {
      const mk = (id, tagName = 'input') => {
        let e = document.getElementById(id)
        if (!e) { e = document.createElement(tagName); e.id = id; document.body.appendChild(e) }
        return e
      }
      mk('pf-error', 'div'); mk('phase-form', 'div')
      mk('pf-name').value = 'HIJACKED'
      mk('pf-weeks').value = '4'
      mk('pf-phase-id').value = f.phase          // ← a phase of program A…
      window._openProgramId = f.progB

      await savePhase(f.progB)                   // ← …while claiming program B

      const { data: after } = await db.from('program_phases').select('name').eq('id', f.phase).maybeSingle()
      return { err: document.getElementById('pf-error').textContent, name: after?.name }
    }, fx)

    // The load-bearing assertion. Without the pair check the UPDATE keys on the phaseId, RLS allows it
    // (both programs are mine), and phase A is silently renamed while the UI re-renders program B.
    expect(result.name, 'the phase must NOT have been written — it belongs to a different program')
      .toBe('ORIGINAL')
    expect(result.err, 'and the app must say so, rather than failing silently').toContain('permission denied')
  })

  test('removePhaseWorkout refuses a slot belonging to a different phase of my own', async ({ page }) => {
    await loginAsPT(page)

    const fx = await page.evaluate(async (t) => {
      const { data: prog } = await db.from('programs')
        .insert({ coach_id: currentUser.id, is_personal: false, name: t + ' C' }).select('id').single()
      const mkPhase = async (name, i) => (await db.from('program_phases')
        .insert({ program_id: prog.id, name, duration_weeks: 1, order_index: i }).select('id').single()).data
      const p1 = await mkPhase('P1', 0)
      const p2 = await mkPhase('P2', 1)
      // program_id is REQUIRED for this fixture to mean anything. _deleteOwnedUnreferencedTemplates
      // builds its ownership clause from program_id / generated_from_phase_id; with both NULL the
      // template is never a deletion candidate, so asserting its survival proved nothing whether the
      // guard existed or not. Caught by the 2026-08-22 review — a decorative assertion sitting next to
      // a load-bearing one, in a spec written specifically to avoid decorative assertions.
      const { data: tmpl } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, name: t + ' TMPL', is_personal: false, program_id: prog.id }).select('id').single()
      const { data: slot } = await db.from('program_phase_workouts')
        .insert({ phase_id: p1.id, day_of_week: 1, day_label: 'Monday', template_id: tmpl.id, session_order: 0, week_number: 1 })
        .select('id').single()
      return { prog: prog?.id, p1: p1?.id, p2: p2?.id, slot: slot?.id, tmpl: tmpl?.id }
    }, tag)
    expect(fx.slot && fx.p2, 'fixtures must exist before the probe means anything').toBeTruthy()

    const survived = await page.evaluate(async (f) => {
      window._openProgramId = f.prog
      await removePhaseWorkout(f.slot, f.p2)     // slot is in P1, phase claimed is P2
      const { data } = await db.from('program_phase_workouts').select('id').eq('id', f.slot).maybeSingle()
      const { data: tmpl } = await db.from('workout_templates').select('id').eq('id', f.tmpl).maybeSingle()
      return { slot: !!data, tmpl: !!tmpl }
    }, fx)

    // Without the pair check the DELETE keys on pwId alone and takes the slot regardless of the phase
    // claimed — and then hands the WRONG phaseId to _deleteOwnedUnreferencedTemplates, so the template
    // sweep runs against a phase that never referenced it.
    expect(survived.slot, 'the slot must NOT have been deleted — the phase claimed is not its own').toBe(true)
    expect(survived.tmpl, 'and its template must not have been swept').toBe(true)
  })

  // THE MIRROR TEST, and the one this file was missing. Every test above is a refusal test; a guard
  // that refuses everything passes all of them. The documented risk of a guard in this codebase is
  // refusing the LEGITIMATE user — that is how _verifyOwnClientId broke "View as" earlier this month.
  // This asserts the MATCHED pair still writes.
  test('a matched phaseId/programId pair is still allowed through — the gate does not refuse the rightful user', async ({ page }) => {
    await loginAsPT(page)

    const fx = await page.evaluate(async (t) => {
      const { data: prog } = await db.from('programs')
        .insert({ coach_id: currentUser.id, is_personal: false, name: t + ' D' }).select('id').single()
      const { data: phase } = await db.from('program_phases')
        .insert({ program_id: prog.id, name: 'ORIGINAL', duration_weeks: 2, order_index: 0 })
        .select('id').single()
      return { prog: prog?.id, phase: phase?.id }
    }, tag)
    expect(fx.prog && fx.phase, 'fixtures must exist before the probe means anything').toBeTruthy()

    const result = await page.evaluate(async (f) => {
      const mk = (id, tagName = 'input') => {
        let e = document.getElementById(id)
        if (!e) { e = document.createElement(tagName); e.id = id; document.body.appendChild(e) }
        return e
      }
      mk('pf-error', 'div'); mk('phase-form', 'div')
      mk('pf-name').value = 'RENAMED OK'
      mk('pf-weeks').value = '3'
      mk('pf-phase-id').value = f.phase
      window._openProgramId = f.prog

      await savePhase(f.prog)                    // the phase's REAL program — must be allowed

      const { data: after } = await db.from('program_phases')
        .select('name, duration_weeks').eq('id', f.phase).maybeSingle()
      return { err: document.getElementById('pf-error').textContent, name: after?.name, weeks: after?.duration_weeks }
    }, fx)

    expect(result.err, 'a legitimate save must not be refused').not.toContain('permission denied')
    expect(result.name, 'the rename must actually have landed').toBe('RENAMED OK')
    expect(result.weeks, 'and so must the duration change').toBe(3)
  })
})
