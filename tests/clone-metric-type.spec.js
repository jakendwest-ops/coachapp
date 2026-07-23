const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Regression, 2026-07-22 — found by the pre-push multi-agent review (Agent B).
//
// `metric_type` (2026-07-19) is what routes an exercise's whole shape in the runner: fast table vs
// wizard, unilateral L/R rows, timed-hold duration, jump height/distance columns, and the target bar's
// jump branch. It lives on workout_template_exercises.
//
// BOTH clone paths copied sets_json but silently DROPPED metric_type:
//   _cloneTemplateForClient    (app-programs.js)  — runs on every program assignment, incl. solo self-assign
//   _cloneSharedMasterTemplate (app-workouts.js)  — runs on fork-on-edit when a template is in >1 slot
// So the master template was correct, but every ASSIGNED copy fell back to 'weight_reps' via
// _exMetricType's default — meaning a client's plan lost jump/timed/unilateral routing entirely while
// the coach's own view looked right. Silent at every layer: a dropped key is not an error in JS, in the
// insert, or in Postgres.
//
// This is the les-036 embed-allowlist class inverted: the SELECTs were fine (all use
// `workout_template_exercises(*)`), it was the INSERTs that omitted the column.
test.describe('metric_type survives cloning', () => {
  test('_cloneTemplateForClient carries metric_type onto the assigned copy', async ({ page }) => {
    await loginAsPT(page)
    await page.click('text=Personal')
    await page.waitForTimeout(1500)

    const r = await page.evaluate(async () => {
      const clientId = await _getCurrentClientId()
      const tag = '[E2E] clone-mt ' + Date.now()

      // A master template holding one exercise of each shape-critical metric_type.
      const { data: master } = await db.from('workout_templates').insert({
        coach_id: currentUser.id, client_id: null, program_id: null, name: tag, is_personal: true
      }).select('id').single()

      const shapes = ['jump_height', 'timed_hold', 'unilateral', 'cardio']
      await db.from('workout_template_exercises').insert(shapes.map((mt, i) => ({
        template_id: master.id, exercise_name: `${tag} ${mt}`, exercise_type: mt === 'cardio' ? 'cardio' : 'strength',
        metric_type: mt, order_index: i, sets: 1, sets_json: [{ effortType: 'rpe' }]
      })))

      // Re-read through the SAME embed the real clone callers use — if this projection ever stops
      // including metric_type, the clone silently regresses to the old behaviour.
      const { data: src } = await db.from('workout_templates')
        .select('*, workout_template_exercises(*)').eq('id', master.id).single()

      let cloneId = null
      try {
        cloneId = await _cloneTemplateForClient(src, clientId)
        const { data: clonedExs } = await db.from('workout_template_exercises')
          .select('exercise_name, metric_type').eq('template_id', cloneId)
        return {
          sourceHadMetricType: src.workout_template_exercises.every(e => !!e.metric_type),
          cloned: Object.fromEntries(clonedExs.map(e => [e.exercise_name.split(' ').pop(), e.metric_type])),
        }
      } finally {
        if (cloneId) {
          await db.from('workout_template_exercises').delete().eq('template_id', cloneId)
          await db.from('workout_templates').delete().eq('id', cloneId)
        }
        await db.from('workout_template_exercises').delete().eq('template_id', master.id)
        await db.from('workout_templates').delete().eq('id', master.id)
      }
    })

    // Guards the SELECT side (les-036): if the embed stops projecting metric_type this fails first,
    // pointing at the real cause instead of looking like a clone bug.
    expect(r.sourceHadMetricType).toBe(true)

    // The actual regression: pre-fix every one of these came back null.
    expect(r.cloned.jump_height).toBe('jump_height')
    expect(r.cloned.timed_hold).toBe('timed_hold')
    expect(r.cloned.unilateral).toBe('unilateral')
    expect(r.cloned.cardio).toBe('cardio')
  })
})
