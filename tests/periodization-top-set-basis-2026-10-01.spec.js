// The weekly percentage wave leaves "% of today's top set" sets alone — through the real generator (2026-10-01).
//
// Jake's call: a back-off set pointed at today's top set keeps the percentage the coach typed in every generated week;
// a set at a % of the stored 1RM still follows the wave. tests-node/periodization-basis.test.mjs pins the rule on its own;
// this runs generatePhasePeriodization against real rows and reads back what each generated week actually holds.
//
// The stored-1RM Squat is the POSITIVE CONTROL: if the generator did nothing at all, the top-set row would "stay the same"
// for the wrong reason, so the Squat must visibly step through the wave in the very same run.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

const TAG = '[E2E] PerTopSet'

// Sweep by name — see periodization-metric-type-2026-08-09.spec.js for why deleting the program alone strands the week clones.
async function sweep (page) {
  const r = await page.evaluate(async (TAG) => {
    const out = { programsFound: 0, programsRemoved: 0, exRemoved: 0, templatesFound: 0, templatesRemoved: 0 }
    const { data: progs } = await db.from('programs').select('id').eq('coach_id', currentUser.id).like('name', TAG + '%')
    out.programsFound = (progs || []).length
    for (const p of progs || []) { const { data } = await db.from('programs').delete().eq('id', p.id).select('id'); out.programsRemoved += (data || []).length }
    const { data: tmpls } = await db.from('workout_templates').select('id').eq('coach_id', currentUser.id).like('name', TAG + '%')
    const ids = (tmpls || []).map(t => t.id)
    out.templatesFound = ids.length
    if (ids.length) {
      const { data: exs } = await db.from('workout_template_exercises').delete().in('template_id', ids).select('id')
      out.exRemoved = (exs || []).length
      const { data: ts } = await db.from('workout_templates').delete().in('id', ids).select('id')
      out.templatesRemoved = (ts || []).length
    }
    return out
  }, TAG)
  // Said out loud: a refused delete returns { data: [], error: null } and would otherwise look like a clean teardown.
  if (r.programsRemoved !== r.programsFound || r.templatesRemoved !== r.templatesFound) console.warn(`[periodization-top-set] CLEANUP INCOMPLETE: ${JSON.stringify(r)}`)
}

test.describe("Periodization and '% of today's top set' (Jake, 2026-10-01)", () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await sweep(page) })
  test.afterEach(async ({ page }) => { await sweep(page) })

  test('generated weeks keep a top-set-based back-off at its own %, while a stored-1RM set follows the wave', async ({ page }) => {
    const setup = await page.evaluate(async (TAG) => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: TAG + ' Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({
        program_id: prog.id, name: 'Block 1', duration_weeks: 3, order_index: 0,
        periodization_type: 'linear', periodization_config: { startPct: 70, endPct: 90 }
      }).select('id').single()
      const { data: tmpl } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: TAG + ' Session' }).select('id').single()
      await db.from('workout_template_exercises').insert([
        { template_id: tmpl.id, exercise_name: TAG + ' Bench', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0,
          sets_json: [
            { isTopSet: true, repsMin: '3', effortType: 'rpe', effortMin: '8', intensityBasis: 'stored' },
            { repsMin: '8', intensityMin: '70', intensityMax: '70', intensityBasis: 'topSet' }
          ] },
        { template_id: tmpl.id, exercise_name: TAG + ' Squat', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 1,
          sets_json: [{ repsMin: '5', intensityMin: '70', intensityMax: '70' }] }
      ])
      await db.from('program_phase_workouts').insert({
        phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1
      })
      return { programId: prog.id, phaseId: phase.id, templateId: tmpl.id }
    }, TAG)

    await page.evaluate(async ({ phaseId, programId }) => {
      window.confirmDialog = () => Promise.resolve(true)
      await generatePhasePeriodization(phaseId, programId)
    }, setup)

    // Read back the GENERATED weeks only (2 and 3), keyed by week then by exercise.
    await expect.poll(async () => page.evaluate(async (phaseId) => {
      const { data } = await db.from('program_phase_workouts').select('week_number').eq('phase_id', phaseId).gt('week_number', 1)
      return (data || []).length
    }, setup.phaseId), { message: 'weeks 2 and 3 must be generated' }).toBe(2)

    const weeks = await page.evaluate(async ({ phaseId, templateId }) => {
      const { data: pws } = await db.from('program_phase_workouts').select('week_number, template_id').eq('phase_id', phaseId).gt('week_number', 1)
      const out = {}
      for (const pw of pws || []) {
        if (!pw.template_id || pw.template_id === templateId) continue
        const { data: exs } = await db.from('workout_template_exercises').select('exercise_name, sets_json').eq('template_id', pw.template_id)
        out[pw.week_number] = Object.fromEntries((exs || []).map(e => [e.exercise_name.split(' ').pop(), e.sets_json]))
      }
      return out
    }, setup)

    expect(Object.keys(weeks).sort(), 'both generated weeks must exist').toEqual(['2', '3'])
    // linear 70 -> 90 over 3 weeks: week 2 = 80, week 3 = 90
    const expected = { 2: 80, 3: 90 }
    for (const w of ['2', '3']) {
      // POSITIVE CONTROL — the wave really ran in this very generation
      expect(Number(weeks[w].Squat[0].intensityMin), `week ${w}: the stored-1RM Squat follows the wave`).toBe(expected[w])
      // THE POINT — the top-set-based back-off keeps the coach's own 70, and keeps its basis
      const [top, backoff] = weeks[w].Bench
      expect(backoff.intensityBasis, `week ${w}: the back-off is still pointed at the top set`).toBe('topSet')
      expect(Number(backoff.intensityMin), `week ${w}: the wave number must NOT land on a top-set-based set`).toBe(70)
      expect(Number(backoff.intensityMax)).toBe(70)
      // and the top set itself came through untouched
      expect(top.isTopSet).toBe(true)
      expect(Number(top.effortMin)).toBe(8)
    }
  })
})
