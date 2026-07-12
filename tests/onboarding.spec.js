const { test, expect } = require('./fixtures')
const { loginAsPT2 } = require('./helpers')

// PT2 owns nothing by design (the RLS audit depends on that). This test borrows it as a
// "brand-new coach" fixture: force its flag false, run the seed, assert the full starter set
// appears, prove idempotency, then delete everything and restore PT2 to owning nothing.
test.describe('New-coach starter content', () => {
  test('first-login seed creates the library, sample workout, and sample program, once', async ({ page }) => {
    await loginAsPT2(page)

    // Arrange: pretend PT2 has never been seeded and owns nothing.
    await page.evaluate(async () => {
      await db.from('profiles').update({ starter_seeded: false }).eq('id', currentUser.id)
      currentProfile.starter_seeded = false
    })

    // Act
    const first = await page.evaluate(async () => { await _seedStarterContent(); return true })
    expect(first).toBe(true)

    // Assert: content exists and the flag flipped.
    const state = await page.evaluate(async () => {
      const ex = await db.from('exercises').select('id, name').eq('coach_id', currentUser.id)
      const tmpl = await db.from('workout_templates').select('id, name').eq('coach_id', currentUser.id).is('program_id', null).is('client_id', null)
      const wte = tmpl.data?.length ? await db.from('workout_template_exercises').select('exercise_name, exercise_id').eq('template_id', tmpl.data[0].id) : { data: [] }
      const prog = await db.from('programs').select('id, name').eq('coach_id', currentUser.id)
      const phases = prog.data?.length ? await db.from('program_phases').select('id').eq('program_id', prog.data[0].id) : { data: [] }
      const ppw = phases.data?.length ? await db.from('program_phase_workouts').select('id, day_of_week, template_id').eq('phase_id', phases.data[0].id) : { data: [] }
      const prof = await db.from('profiles').select('starter_seeded').eq('id', currentUser.id).single()
      return {
        exerciseCount: ex.data?.length || 0,
        templateName: tmpl.data?.[0]?.name || null,
        templateExerciseCount: wte.data?.length || 0,
        templateExercisesLinked: (wte.data || []).every(r => r.exercise_id != null),
        programName: prog.data?.[0]?.name || null,
        phaseWorkoutDays: (ppw.data || []).map(r => r.day_of_week).sort(),
        seededFlag: prof.data?.starter_seeded,
      }
    })

    expect(state.exerciseCount).toBe(40)
    expect(state.templateName).toBe('Example — Full Body A')
    expect(state.templateExerciseCount).toBe(6)
    expect(state.templateExercisesLinked).toBe(true) // every template exercise resolved to a library exercise id
    expect(state.programName).toBe('Example — 4-Week Foundation')
    expect(state.phaseWorkoutDays).toEqual([1, 4]) // Mon + Thu
    expect(state.seededFlag).toBe(true)

    // Idempotency: running again seeds nothing new.
    const second = await page.evaluate(async () => {
      await _seedStarterContent()
      const ex = await db.from('exercises').select('id').eq('coach_id', currentUser.id)
      const prog = await db.from('programs').select('id').eq('coach_id', currentUser.id)
      return { exerciseCount: ex.data?.length || 0, programCount: prog.data?.length || 0 }
    })
    expect(second.exerciseCount).toBe(40) // not 80
    expect(second.programCount).toBe(1)   // not 2

    // Cleanup: restore PT2 to owning nothing (children first), flag back to true.
    await page.evaluate(async () => {
      const prog = await db.from('programs').select('id').eq('coach_id', currentUser.id)
      for (const p of prog.data || []) {
        const ph = await db.from('program_phases').select('id').eq('program_id', p.id)
        for (const phase of ph.data || []) await db.from('program_phase_workouts').delete().eq('phase_id', phase.id)
        await db.from('program_phases').delete().eq('program_id', p.id)
      }
      await db.from('programs').delete().eq('coach_id', currentUser.id)
      const tmpl = await db.from('workout_templates').select('id').eq('coach_id', currentUser.id)
      for (const t of tmpl.data || []) await db.from('workout_template_exercises').delete().eq('template_id', t.id)
      await db.from('workout_templates').delete().eq('coach_id', currentUser.id)
      await db.from('exercises').delete().eq('coach_id', currentUser.id)
      await db.from('profiles').update({ starter_seeded: true }).eq('id', currentUser.id)
    })
    const leftover = await page.evaluate(async () => {
      const ex = await db.from('exercises').select('id').eq('coach_id', currentUser.id)
      return ex.data?.length || 0
    })
    expect(leftover).toBe(0) // PT2 owns nothing again — RLS audit premise preserved
  })
})
