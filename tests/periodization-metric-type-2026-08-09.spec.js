// 2026-08-09 — periodization-generated weeks 2+ silently lost `metric_type`.
//
// generatePhasePeriodization (app-programs.js) built its clone rows with `exercise_type` but not
// `metric_type`, so every generated week downgraded cardio/interval/jump/timed exercises to plain
// weight×reps. Week 1 stayed correct, which makes it read as "the later weeks were built wrong".
//
// This is the THIRD sibling of a bug already fixed twice: _cloneTemplateForClient
// (app-programs.js:350) carries metric_type with a comment describing this exact failure
// ("Omitted here until 2026-07-22, so every ASSIGNED copy silently fell back to weight_reps"), and
// _cloneSharedMasterTemplate (app-workouts.js) carries it too. Fix-the-class-not-the-instance.
//
// Silent at every layer: the source select is workout_template_exercises(*) so the value was always
// available; a missing key is not an error in JS, in the insert, or in Postgres.
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

const TAG = '[E2E] PerMetric'

// Sweep by name. Deleting the program cascades its phases, which SET NULL the
// generated_from_phase_id on any week-clone generated below — those clones then look like genuine
// standalone templates and orphan into the reusable pool, where they sort ABOVE "Push Day A"
// ('[' < 'P') and get grabbed by the client-runner tests' "first Start button". Not sweeping here
// quietly breaks runner.spec.js (documented in programs.spec.js:886).
async function sweep (page) {
  await page.evaluate(async (TAG) => {
    const { data: progs } = await db.from('programs').select('id')
      .eq('coach_id', currentUser.id).like('name', TAG + '%')
    for (const p of progs || []) await db.from('programs').delete().eq('id', p.id)
    const { data: tmpls } = await db.from('workout_templates').select('id')
      .eq('coach_id', currentUser.id).like('name', TAG + '%')
    const ids = (tmpls || []).map(t => t.id)
    if (ids.length) {
      await db.from('workout_template_exercises').delete().in('template_id', ids)
      await db.from('workout_templates').delete().in('id', ids)
    }
  }, TAG)
}

test.describe('Periodization clones preserve metric_type (2026-08-09)', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await sweep(page) })
  test.afterEach(async ({ page }) => { await sweep(page) })

  test('generated weeks 2+ keep each exercise metric_type, not weight_reps', async ({ page }) => {
    const setup = await page.evaluate(async (TAG) => {
      const { data: prog } = await db.from('programs')
        .insert({ coach_id: currentUser.id, name: TAG + ' Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({
        program_id: prog.id, name: 'Block 1', duration_weeks: 3, order_index: 0,
        periodization_type: 'linear', periodization_config: { startPct: 70, endPct: 80 }
      }).select('id').single()
      const { data: tmpl } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: TAG + ' Session' })
        .select('id').single()
      // One exercise per non-default metric_type, plus a weight_reps control that carries an
      // intensity so the periodization rewrite actually touches this template's sets.
      await db.from('workout_template_exercises').insert([
        { template_id: tmpl.id, exercise_name: TAG + ' SkiErg', exercise_type: 'cardio', metric_type: 'interval',
          order_index: 0, sets_json: [{ workSecs: 1200, restSecs: 300, sets: 2, cycles: 1 }] },
        { template_id: tmpl.id, exercise_name: TAG + ' Box Jump', exercise_type: 'strength', metric_type: 'jump_height',
          order_index: 1, sets_json: [{ repsMin: '3', targetHeightCm: '60' }] },
        { template_id: tmpl.id, exercise_name: TAG + ' Plank', exercise_type: 'strength', metric_type: 'timed_hold',
          order_index: 2, sets_json: [{ duration: '1:00' }] },
        { template_id: tmpl.id, exercise_name: TAG + ' Squat', exercise_type: 'strength', metric_type: 'weight_reps',
          order_index: 3, sets_json: [{ repsMin: '5', intensityMin: '70' }] },
      ])
      await db.from('program_phase_workouts').insert({
        phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1,
        template_id: tmpl.id, week_number: 1
      })
      return { programId: prog.id, phaseId: phase.id, templateId: tmpl.id }
    }, TAG)

    await page.evaluate(async ({ phaseId, programId }) => {
      window.confirm = () => true
      await generatePhasePeriodization(phaseId, programId)
    }, setup)
    await page.waitForTimeout(2000)

    // Read back the GENERATED clones only (week 2+), never the week-1 source.
    const got = await page.evaluate(async ({ phaseId, templateId }) => {
      const { data: pws } = await db.from('program_phase_workouts')
        .select('week_number, template_id').eq('phase_id', phaseId).gt('week_number', 1)
      const cloneIds = (pws || []).map(p => p.template_id).filter(id => id && id !== templateId)
      if (!cloneIds.length) return { cloneCount: 0, byName: {} }
      const { data: exs } = await db.from('workout_template_exercises')
        .select('exercise_name, metric_type').in('template_id', cloneIds)
      const byName = {}
      for (const e of exs || []) {
        const short = e.exercise_name.split(' ').pop()
        ;(byName[short] = byName[short] || []).push(e.metric_type)
      }
      return { cloneCount: cloneIds.length, byName }
    }, setup)

    expect(got.cloneCount).toBeGreaterThan(0)   // guards against a vacuous pass if generation no-ops

    // Every generated copy must keep its own shape. Before the fix these all came back 'weight_reps'
    // (the column default) because the insert simply omitted the key.
    expect(got.byName.SkiErg.every(m => m === 'interval')).toBe(true)
    expect(got.byName.Jump.every(m => m === 'jump_height')).toBe(true)
    expect(got.byName.Plank.every(m => m === 'timed_hold')).toBe(true)
    expect(got.byName.Squat.every(m => m === 'weight_reps')).toBe(true)
  })
})
