const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── THE OWNER MUST STILL GET THROUGH ─────────────────────────────────────────
//
// 14 ownership gates landed on the programme builder on 2026-08-22 (js/app-programs.js).
// Every test written that day was a REFUSAL test — and a gate that refuses EVERYONE passes
// all of them. The documented risk of a guard in this project is the opposite one: refusing
// the rightful user. `_verifyOwnClientId` broke "View as" that same month by doing exactly
// that, and it reached master.
//
// This file is the mirror. Each test drives a gated entry point with the caller's OWN,
// legitimate ids and asserts the write ACTUALLY LANDED in the database — not merely that no
// error was thrown. A silently-refusing gate returns without an error, so "it didn't throw"
// is worth nothing here; only reading the row back proves anything.
//
// It replaces a manual checklist. The closure rule has two arms — Jake confirming, or a test
// that went red before and green after — and asking him to click through fourteen flows when
// arm (b) was available was the lazier half of the rule.
//
// Fixtures: every test owns what it touches, named on a stable prefix so a dead page context
// cannot strand rows no later run can match (bugs/2026-08-20-cross-tenant-probes-not-cleanup-safe).
const PREFIX = '[E2E] BuilderHappy'
const tag = () => `${PREFIX} ${Date.now()}-${Math.floor(Math.random() * 1e4)}`

// Every gated delete path calls confirm(). Auto-accepting is what makes the happy path the
// happy path; a test that declines would be testing the confirm dialog, not the gate.
const acceptConfirms = page => page.evaluate(() => { window.confirm = () => true })

async function sweep (page) {
  await page.evaluate(async (p) => {
    const { data: progs } = await db.from('programs')
      .delete().eq('coach_id', currentUser.id).like('name', p + '%').select('id')
    await db.from('workout_templates')
      .delete().eq('coach_id', currentUser.id).like('name', p + '%').select('id')
    return (progs || []).length
  }, PREFIX).catch(() => {})
}

// Builds a programme + phase + template owned by the caller, whatever role they are in.
async function makeFixture (page, t) {
  return page.evaluate(async (t) => {
    const isSolo = currentProfile?.role === 'solo'
    const { data: prog } = await db.from('programs')
      .insert({ coach_id: currentUser.id, is_personal: isSolo, name: t + ' P' }).select('id').single()
    const { data: phase } = await db.from('program_phases')
      .insert({ program_id: prog.id, name: 'ORIGINAL', duration_weeks: 2, order_index: 0 })
      .select('id').single()
    const { data: tmpl } = await db.from('workout_templates')
      .insert({ coach_id: currentUser.id, name: t + ' T', is_personal: isSolo, program_id: prog.id })
      .select('id').single()
    window._openProgramId = prog.id
    window._openProgramPhases = [{ id: phase.id, duration_weeks: 2 }]
    return { prog: prog?.id, phase: phase?.id, tmpl: tmpl?.id }
  }, t)
}

const mkDom = page => page.evaluate(() => {
  const mk = (id, tagName = 'input') => {
    let e = document.getElementById(id)
    if (!e) { e = document.createElement(tagName); e.id = id; document.body.appendChild(e) }
    return e
  }
  ;['pf-error', 'pm-error', 'esd-error', 'pz-error', 'phase-form', 'program-modal', 'apc-error', 'ap-error']
    .forEach(id => mk(id, 'div'))
  ;['pf-name', 'pf-weeks', 'pf-phase-id', 'pm-name', 'pm-desc', 'esd-date'].forEach(id => mk(id))
})

// ─── COACH ────────────────────────────────────────────────────────────────────
test.describe('every gated builder write still lands for its rightful owner (coach)', () => {
  let t
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    await acceptConfirms(page)
    await mkDom(page)
    t = tag()
  })
  test.afterEach(async ({ page }) => { await sweep(page) })

  test('saveProgram renames my own programme', async ({ page }) => {
    const fx = await makeFixture(page, t)
    const name = await page.evaluate(async (f) => {
      document.getElementById('pm-name').value = 'RENAMED'
      document.getElementById('pm-desc').value = ''
      await saveProgram(f.prog)
      const { data } = await db.from('programs').select('name').eq('id', f.prog).maybeSingle()
      return data?.name
    }, fx)
    expect(name, 'the gate must not refuse the programme owner').toBe('RENAMED')
  })

  test('savePhase creates a phase on my own programme', async ({ page }) => {
    const fx = await makeFixture(page, t)
    const count = await page.evaluate(async (f) => {
      document.getElementById('pf-name').value = 'Block 2'
      document.getElementById('pf-weeks').value = '3'
      document.getElementById('pf-phase-id').value = ''      // create branch
      await savePhase(f.prog)
      const { data } = await db.from('program_phases').select('id').eq('program_id', f.prog)
      return (data || []).length
    }, fx)
    expect(count, 'the create branch must let the programme owner through').toBe(2)
  })

  test('savePhase renames my own phase', async ({ page }) => {
    const fx = await makeFixture(page, t)
    const name = await page.evaluate(async (f) => {
      document.getElementById('pf-name').value = 'Block RENAMED'
      document.getElementById('pf-weeks').value = '2'
      document.getElementById('pf-phase-id').value = f.phase
      await savePhase(f.prog)
      const { data } = await db.from('program_phases').select('name').eq('id', f.phase).maybeSingle()
      return data?.name
    }, fx)
    expect(name).toBe('Block RENAMED')
  })

  test('_quickAssignPhaseWorkout fills a day slot with my own template', async ({ page }) => {
    const fx = await makeFixture(page, t)
    const slot = await page.evaluate(async (f) => {
      await _quickAssignPhaseWorkout(
        { phaseId: f.phase, dayOfWeek: 2, sessionOrder: 0, weekNumber: 1 }, f.tmpl)
      const { data } = await db.from('program_phase_workouts')
        .select('id, template_id').eq('phase_id', f.phase).eq('day_of_week', 2)
      return data?.[0] || null
    }, fx)
    expect(slot, 'the slot write must land — this gate checks BOTH phase and template ownership').not.toBeNull()
    expect(slot.template_id).toBe(fx.tmpl)
  })

  test('removePhaseWorkout clears a slot I own', async ({ page }) => {
    const fx = await makeFixture(page, t)
    const gone = await page.evaluate(async (f) => {
      const { data: pw } = await db.from('program_phase_workouts')
        .insert({ phase_id: f.phase, day_of_week: 3, day_label: 'Wednesday', template_id: f.tmpl, session_order: 0, week_number: 1 })
        .select('id').single()
      await removePhaseWorkout(pw.id, f.phase)
      const { data } = await db.from('program_phase_workouts').select('id').eq('id', pw.id).maybeSingle()
      return !data
    }, fx)
    expect(gone, 'the owner must be able to remove their own slot').toBe(true)
  })

  test('duplicatePhaseWeek copies a week of my own phase', async ({ page }) => {
    const fx = await makeFixture(page, t)
    const weeks = await page.evaluate(async (f) => {
      await db.from('program_phase_workouts')
        .insert({ phase_id: f.phase, day_of_week: 1, day_label: 'Monday', template_id: f.tmpl, session_order: 0, week_number: 1 })
      await duplicatePhaseWeek(f.phase, 1)
      const { data } = await db.from('program_phase_workouts').select('week_number').eq('phase_id', f.phase)
      return [...new Set((data || []).map(r => r.week_number))].sort()
    }, fx)
    expect(weeks, 'week 2 must have been created').toContain(2)
  })

  test('deletePhaseWeek removes a week of my own phase', async ({ page }) => {
    const fx = await makeFixture(page, t)
    const left = await page.evaluate(async (f) => {
      await db.from('program_phase_workouts').insert([
        { phase_id: f.phase, day_of_week: 1, day_label: 'Monday', template_id: f.tmpl, session_order: 0, week_number: 1 },
        { phase_id: f.phase, day_of_week: 1, day_label: 'Monday', template_id: f.tmpl, session_order: 0, week_number: 2 }
      ])
      await deletePhaseWeek(f.phase, 2)
      const { data } = await db.from('program_phase_workouts').select('week_number').eq('phase_id', f.phase)
      return [...new Set((data || []).map(r => r.week_number))]
    }, fx)
    expect(left, 'week 2 must be gone and week 1 must survive').toEqual([1])
  })

  test('savePeriodizationConfig writes config to my own phase', async ({ page }) => {
    const fx = await makeFixture(page, t)
    const type = await page.evaluate(async (f) => {
      window._pzPhaseId = f.phase
      window._pzProgramId = f.prog
      window._pzType = 'linear'
      window._pzDaySlots = []
      const mk = id => { let e = document.getElementById(id); if (!e) { e = document.createElement('input'); e.id = id; document.body.appendChild(e) } return e }
      mk('pz-start').value = '70'
      mk('pz-end').value = '85'
      await savePeriodizationConfig()
      const { data } = await db.from('program_phases').select('periodization_type').eq('id', f.phase).maybeSingle()
      return data?.periodization_type
    }, fx)
    expect(type, 'the phase owner must be able to set periodization').toBe('linear')
  })

  test('deletePhase removes a phase I own', async ({ page }) => {
    const fx = await makeFixture(page, t)
    const gone = await page.evaluate(async (f) => {
      await deletePhase(f.prog, f.phase)
      const { data } = await db.from('program_phases').select('id').eq('id', f.phase).maybeSingle()
      return !data
    }, fx)
    expect(gone, 'the owner must be able to delete their own phase').toBe(true)
  })

  test('deleteProgram removes a programme I own', async ({ page }) => {
    const fx = await makeFixture(page, t)
    const gone = await page.evaluate(async (f) => {
      await deleteProgram(f.prog)
      const { data } = await db.from('programs').select('id').eq('id', f.prog).maybeSingle()
      return !data
    }, fx)
    expect(gone, 'the owner must be able to delete their own programme').toBe(true)
  })
})

// ─── PERSONAL (SOLO) ──────────────────────────────────────────────────────────
// Solo is the role this project has broken four separate times with a coach_id filter, and
// the gates test programs.coach_id — which for solo IS the auth uid, unlike its clients row.
// That reasoning is exactly the kind that has been wrong before, so it gets exercised rather
// than argued.
test.describe('the same gates still let a Personal-view owner through', () => {
  let t, soloAvailable

  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    soloAvailable = await page.evaluate(() => !!window._soloClientId)
    if (!soloAvailable) return
    await page.evaluate(() => switchView('solo'))
    await page.waitForTimeout(600)
    await acceptConfirms(page)
    await mkDom(page)
    t = tag()
  })
  test.afterEach(async ({ page }) => { if (soloAvailable) await sweep(page) })

  test('solo can rename their own programme and phase', async ({ page }) => {
    test.skip(!soloAvailable, 'requires the master account (window._soloClientId)')
    const fx = await makeFixture(page, t)
    const r = await page.evaluate(async (f) => {
      document.getElementById('pm-name').value = 'SOLO RENAMED'
      document.getElementById('pm-desc').value = ''
      await saveProgram(f.prog)
      document.getElementById('pf-name').value = 'SOLO PHASE'
      document.getElementById('pf-weeks').value = '2'
      document.getElementById('pf-phase-id').value = f.phase
      await savePhase(f.prog)
      const { data: p } = await db.from('programs').select('name, is_personal').eq('id', f.prog).maybeSingle()
      const { data: ph } = await db.from('program_phases').select('name').eq('id', f.phase).maybeSingle()
      return { prog: p?.name, personal: p?.is_personal, phase: ph?.name, role: currentProfile?.role }
    }, fx)
    expect(r.role, 'must actually be in the solo role for this to mean anything').toBe('solo')
    expect(r.personal, 'a solo-created programme is personal').toBe(true)
    expect(r.prog).toBe('SOLO RENAMED')
    expect(r.phase).toBe('SOLO PHASE')
  })

  test('solo can fill and clear a day slot in their own plan', async ({ page }) => {
    test.skip(!soloAvailable, 'requires the master account (window._soloClientId)')
    const fx = await makeFixture(page, t)
    const r = await page.evaluate(async (f) => {
      await _quickAssignPhaseWorkout({ phaseId: f.phase, dayOfWeek: 4, sessionOrder: 0, weekNumber: 1 }, f.tmpl)
      const { data: after } = await db.from('program_phase_workouts')
        .select('id').eq('phase_id', f.phase).eq('day_of_week', 4)
      const id = after?.[0]?.id || null
      if (id) await removePhaseWorkout(id, f.phase)
      const { data: gone } = await db.from('program_phase_workouts').select('id').eq('id', id).maybeSingle()
      return { assigned: !!id, removed: !gone }
    }, fx)
    expect(r.assigned, 'solo must be able to assign a workout to their own day slot').toBe(true)
    expect(r.removed, 'and remove it again').toBe(true)
  })

  test('solo can duplicate and delete a week in their own phase', async ({ page }) => {
    test.skip(!soloAvailable, 'requires the master account (window._soloClientId)')
    const fx = await makeFixture(page, t)
    const r = await page.evaluate(async (f) => {
      await db.from('program_phase_workouts')
        .insert({ phase_id: f.phase, day_of_week: 1, day_label: 'Monday', template_id: f.tmpl, session_order: 0, week_number: 1 })
      await duplicatePhaseWeek(f.phase, 1)
      const { data: dup } = await db.from('program_phase_workouts').select('week_number').eq('phase_id', f.phase)
      const weeks = [...new Set((dup || []).map(x => x.week_number))]
      await deletePhaseWeek(f.phase, 2)
      const { data: after } = await db.from('program_phase_workouts').select('week_number').eq('phase_id', f.phase)
      return { afterDup: weeks, afterDel: [...new Set((after || []).map(x => x.week_number))] }
    }, fx)
    expect(r.afterDup, 'solo must be able to duplicate a week').toContain(2)
    expect(r.afterDel, 'and delete it again').toEqual([1])
  })

  test('solo can delete their own phase and programme', async ({ page }) => {
    test.skip(!soloAvailable, 'requires the master account (window._soloClientId)')
    const fx = await makeFixture(page, t)
    const r = await page.evaluate(async (f) => {
      await deletePhase(f.prog, f.phase)
      const { data: ph } = await db.from('program_phases').select('id').eq('id', f.phase).maybeSingle()
      await deleteProgram(f.prog)
      const { data: pr } = await db.from('programs').select('id').eq('id', f.prog).maybeSingle()
      return { phaseGone: !ph, progGone: !pr }
    }, fx)
    expect(r.phaseGone, 'solo must be able to delete their own phase').toBe(true)
    expect(r.progGone, 'and their own programme').toBe(true)
  })
})
