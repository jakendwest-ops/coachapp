const { test, expect } = require('./fixtures')
const { loginAsPT2 } = require('./helpers')

// PT2 owns nothing by design (the RLS audit depends on that). These tests borrow it as a
// "brand-new coach" fixture: sweep it clean, force its flag false, seed, and assert. Every test
// sweeps at the START (self-healing — a prior strand can never compound into a wrong count) and
// afterEach restores PT2 to owning nothing even if the body throws, so the RLS audit's premise holds.
test.describe('New-coach starter content', () => {

  async function sweepPT2(page) {
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
  }

  test('_seedStarterContent creates the library, sample workout, and sample program, once', async ({ page }) => {
    await loginAsPT2(page)
    try {
      await sweepPT2(page) // self-heal any prior strand
      await page.evaluate(async () => {
        await db.from('profiles').update({ starter_seeded: false }).eq('id', currentUser.id)
        currentProfile.starter_seeded = false
      })

      const first = await page.evaluate(async () => { await _seedStarterContent(); return true })
      expect(first).toBe(true)

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
    } finally {
      await sweepPT2(page) // always restore PT2 to owning nothing, even if an assert above failed
    }
  })

  test('loadUserInfo triggers the seed for a fresh coach (wiring, not just the function)', async ({ page }) => {
    // PT2 is a coach who owns nothing — the same shape as a brand-new signup. Setting its flag false
    // and re-running the real bootstrap (loadUserInfo) proves the wiring actually fires the seed, not
    // just that _seedStarterContent works in isolation.
    await loginAsPT2(page)
    try {
      await sweepPT2(page)
      await page.evaluate(async () => {
        await db.from('profiles').update({ starter_seeded: false }).eq('id', currentUser.id)
      })

      const result = await page.evaluate(async () => {
        await loadUserInfo() // re-reads the profile (now flag=false) and should seed before returning
        const ex = await db.from('exercises').select('id').eq('coach_id', currentUser.id)
        const prof = await db.from('profiles').select('starter_seeded').eq('id', currentUser.id).single()
        return { exerciseCount: ex.data?.length || 0, seededFlag: prof.data?.starter_seeded, roleAfter: currentProfile?.role }
      })

      expect(result.roleAfter).toBe('coach') // PT2 has no client rows, so bootstrap keeps role=coach
      expect(result.exerciseCount).toBe(40)  // the wiring fired the seed
      expect(result.seededFlag).toBe(true)
    } finally {
      await sweepPT2(page)
    }
  })

  test('a partial seed RESUMES on the next run — completes what is missing, never duplicates', async ({ page }) => {
    // Simulates a first attempt that died after the exercises + workout but before the program (flag
    // never flipped). The re-run must recreate ONLY the missing program (not a second set of 40
    // exercises) and then flip the flag. This is the failure the review flagged: the old guard would
    // have seen exercises>0 and stopped, stranding the coach with no sample program forever.
    await loginAsPT2(page)
    try {
      await sweepPT2(page)
      // First full seed, then knock it back to a partial state: flag false, program removed.
      const partial = await page.evaluate(async () => {
        await db.from('profiles').update({ starter_seeded: false }).eq('id', currentUser.id)
        currentProfile.starter_seeded = false
        await _seedStarterContent()
        // now fully seeded — simulate a partial by deleting the program and clearing the flag
        const prog = await db.from('programs').select('id').eq('coach_id', currentUser.id)
        for (const p of prog.data || []) {
          const ph = await db.from('program_phases').select('id').eq('program_id', p.id)
          for (const phase of ph.data || []) await db.from('program_phase_workouts').delete().eq('phase_id', phase.id)
          await db.from('program_phases').delete().eq('program_id', p.id)
        }
        await db.from('programs').delete().eq('coach_id', currentUser.id)
        await db.from('profiles').update({ starter_seeded: false }).eq('id', currentUser.id)
        currentProfile.starter_seeded = false
        const ex = await db.from('exercises').select('id').eq('coach_id', currentUser.id)
        const prg = await db.from('programs').select('id').eq('coach_id', currentUser.id)
        return { exercisesBefore: ex.data?.length || 0, programsBefore: prg.data?.length || 0 }
      })
      expect(partial.exercisesBefore).toBe(40) // exercises + workout still present
      expect(partial.programsBefore).toBe(0)   // program was lost

      // Resume
      const after = await page.evaluate(async () => {
        await _seedStarterContent()
        const ex = await db.from('exercises').select('id').eq('coach_id', currentUser.id)
        const prog = await db.from('programs').select('id, name').eq('coach_id', currentUser.id)
        const phases = prog.data?.length ? await db.from('program_phases').select('id').eq('program_id', prog.data[0].id) : { data: [] }
        const ppw = phases.data?.length ? await db.from('program_phase_workouts').select('day_of_week').eq('phase_id', phases.data[0].id) : { data: [] }
        const prof = await db.from('profiles').select('starter_seeded').eq('id', currentUser.id).single()
        return {
          exerciseCount: ex.data?.length || 0,
          programName: prog.data?.[0]?.name || null,
          phaseWorkoutDays: (ppw.data || []).map(r => r.day_of_week).sort(),
          seededFlag: prof.data?.starter_seeded,
        }
      })

      expect(after.exerciseCount).toBe(40) // NOT 80 — exercises were not re-inserted
      expect(after.programName).toBe('Example — 4-Week Foundation') // the missing program was recreated
      expect(after.phaseWorkoutDays).toEqual([1, 4])
      expect(after.seededFlag).toBe(true) // flag flips only now that everything is present
    } finally {
      await sweepPT2(page)
    }
  })
})
