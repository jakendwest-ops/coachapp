// Deleting a programme must not strand its periodization week-clones in the reusable template library.
//
// Ledger row 2026-07-11 (HIGH, open 56 days) recorded this as "DECISION NEEDED": the phase cascade
// nulls `generated_from_phase_id`, so a "Bench Press — W2" clone loses the only column marking it a
// derivative, and it then shows up forever in the coach's reusable pool. Options offered were an FK
// CASCADE or a sweep in deleteProgram.
//
// The sweep was in fact BUILT the same day — `_deleteOwnedUnreferencedTemplates` carries a clause for
// exactly this ("those carry program_id: null, so they need this second clause or they survive as
// permanent orphans") — but nothing ever tested it end to end, so the row stayed open on a decision
// that had already been taken.
//
// This drives the whole thing for real: generate periodized weeks, delete the programme, and count
// what survives. The ordering is the subtle part — the sweep must run BEFORE the programme delete
// cascades the phases, because the cascade destroys the very column the sweep identifies clones by.

const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('Deleting a programme sweeps its week-clones (2026-09-04)', () => {
  test('no periodization clone survives deleteProgram', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      const tag = `[E2E] orphan probe ${Date.now()}`
      const out = { generated: 0, cloneIds: [], survivors: null, programGone: null }

      const origConfirm = window.confirm
      window.confirm = () => true                     // both flows are confirm-gated
      try {
        const { data: prog } = await db.from('programs')
          .insert({ coach_id: currentUser.id, name: tag }).select('id').single()
        const { data: phase } = await db.from('program_phases')
          .insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 3, order_index: 0,
                    periodization_type: 'linear',
                    periodization_config: { startPct: 70, endPct: 85 } })
          .select('id').single()
        // The Week-1 template is owned BY THE PROGRAMME (program_id set) — that is what makes its
        // generated clones ours to sweep rather than a shared library template we must spare.
        const { data: tmpl } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: tag })
          .select('id').single()
        await db.from('program_phase_workouts').insert({
          phase_id: phase.id, day_of_week: 1, day_label: 'Monday',
          session_order: 1, template_id: tmpl.id, week_number: 1
        })

        window._openProgramId = prog.id
        await generatePhasePeriodization(phase.id, prog.id)

        // The clones are the templates this phase generated. If none exist the test proves nothing,
        // so the count is asserted below before anything is deleted.
        const { data: clones } = await db.from('workout_templates')
          .select('id').eq('generated_from_phase_id', phase.id)
        out.cloneIds = (clones || []).map(c => c.id)
        out.generated = out.cloneIds.length

        await deleteProgram(prog.id)

        // Look the clones up BY ID. Searching by generated_from_phase_id would be worthless here —
        // that is precisely the column the cascade nulls, so an orphan would be invisible to it. This
        // is the whole mechanism the ledger row described.
        if (out.cloneIds.length) {
          const { data: left } = await db.from('workout_templates').select('id').in('id', out.cloneIds)
          out.survivors = (left || []).length
        }
        const { data: progLeft } = await db.from('programs').select('id').eq('id', prog.id)
        out.programGone = (progLeft || []).length === 0

        // Belt and braces: if anything did survive, remove it rather than leaving debris behind.
        if (out.survivors) {
          await db.from('workout_templates').delete().in('id', out.cloneIds).eq('coach_id', currentUser.id).select('id')
        }
        if (!out.programGone) {
          await db.from('programs').delete().eq('id', prog.id).eq('coach_id', currentUser.id).select('id')
        }
        await db.from('workout_templates').delete().eq('coach_id', currentUser.id).eq('name', tag).select('id')
      } finally {
        window.confirm = origConfirm
        window._openProgramId = null
      }
      return out
    })

    // Non-zero denominator: with no clones generated, "no survivors" would be true by absence.
    expect(r.generated, 'periodization must have generated week-clones for this test to mean anything').toBeGreaterThan(0)
    expect(r.programGone, 'the programme itself must be gone').toBe(true)
    expect(r.survivors, `${r.generated} clones were generated; none may survive the programme delete`).toBe(0)
  })
})
