// Personal view: the week copies of your OWN self-assigned plan can be deleted and renumbered (2026-10-31).
//
// docs/bugs/2026-10-31-personal-view-delete-of-client-copies-refused-three-times.md. client_program_workouts had no DELETE or UPDATE policy for a solo
// user: coach_manage_cpw anchors on clients.coach_id = auth.uid(), and the solo record's coach_id is NULL. Both writes returned 0 rows with no error.
// Deletes were rescued by the clone cascade; renumbering was not, so deleting a week in Personal view left the plan's later copies on their old
// week numbers. Fixed by scripts/fix-solo-week-copies-delete-update-2026-10-31.sql (verified locally by scripts/sql-verify/solo-week-copies.verify.mjs)
// and by checking the renumber's row count in deletePhaseWeek.
//
// RED until that SQL is applied on the live project: run it first, then commit this spec (docs/decisions.md - a spec red by design blocks the release gate).
const { test, expect } = require('./fixtures')
const { soloReady } = require('./helpers')
const TAG = '[E2E-SOLOWEEK]'

// A personal programme with one session in each of weeks 1-3, self-assigned to the solo record, with one week copy (and its own clone) per week, as the
// app's assign writes them.
async function buildPlan (page) {
  return page.evaluate(async ({ tag, stamp }) => {
    const me = currentUser.id, solo = window._soloClientId
    const one = async (table, row) => {
      const { data, error } = await db.from(table).insert(row).select('id').single()
      if (error) throw new Error(`${table}: ${error.code} ${error.message}`)
      return data.id
    }
    const programId = await one('programs', { coach_id: me, name: `${tag} programme ${stamp}`, is_personal: true })
    const phaseId = await one('program_phases', { program_id: programId, name: `${tag} phase`, duration_weeks: 3, order_index: 0 })
    const tmplId = await one('workout_templates', { coach_id: me, name: `${tag} master ${stamp}`, is_personal: true, program_id: programId })
    const cpId = await one('client_programs', { client_id: solo, program_id: programId, start_date: new Date().toLocaleDateString('en-CA') })
    const weeks = {}
    for (const w of [1, 2, 3]) {
      const pw = await one('program_phase_workouts', { phase_id: phaseId, template_id: tmplId, day_of_week: 1, day_label: 'Monday', week_number: w })
      const clone = await one('workout_templates', { coach_id: me, name: `${tag} clone w${w} ${stamp}`, is_personal: true, client_id: solo })
      const cpw = await one('client_program_workouts', { client_program_id: cpId, program_phase_workout_id: pw, workout_template_id: clone, week_number: w })
      weeks[w] = { pw, clone, cpw }
    }
    return { programId, phaseId, tmplId, cpId, weeks }
  }, { tag: TAG, stamp: Date.now() })
}

async function removePlan (page, fx) {
  const reaped = await page.evaluate(async ({ fx, tag }) => {
    const n = r => (r.data || []).length
    const program = n(await db.from('programs').delete().eq('id', fx.programId).eq('coach_id', currentUser.id).select('id'))
    await db.from('workout_templates').delete().eq('coach_id', currentUser.id).like('name', tag + '%').select('id')
    const left = {
      templates: ((await db.from('workout_templates').select('id').eq('coach_id', currentUser.id).like('name', tag + '%')).data || []).length,
      assignment: ((await db.from('client_programs').select('id').eq('id', fx.cpId)).data || []).length,
    }
    return { program, ...left }
  }, { fx, tag: TAG })
  expect(reaped, 'cleanup removes the programme, its assignment and every tagged template').toEqual({ program: 1, templates: 0, assignment: 0 })
}

// A buildPlan that threw part-way returns nothing to clean up by id: remove whatever it managed to write, by its tag.
async function sweepTagged (page) {
  await page.evaluate(async (tag) => {
    await db.from('programs').delete().eq('coach_id', currentUser.id).like('name', tag + '%')
    await db.from('workout_templates').delete().eq('coach_id', currentUser.id).like('name', tag + '%')
  }, TAG)
}

test.describe('Personal view: the week copies of your own plan', () => {
  test('a week copy of your own plan can be deleted and renumbered', async ({ page }) => {
    await soloReady(page)
    expect(await page.evaluate(() => currentProfile?.role), 'control: the Personal view').toBe('solo')
    let fx = null
    try {
      fx = await buildPlan(page)
      const r = await page.evaluate(async (fx) => {
        const upd = await db.from('client_program_workouts').update({ week_number: 5 }).eq('id', fx.weeks[3].cpw).select('id')
        const del = await db.from('client_program_workouts').delete().eq('id', fx.weeks[2].cpw).select('id')
        const rows = (await db.from('client_program_workouts').select('id, week_number').eq('client_program_id', fx.cpId)).data || []
        return { updated: (upd.data || []).length, updErr: upd.error?.code || null, deleted: (del.data || []).length, delErr: del.error?.code || null,
                 week3Now: rows.find(x => x.id === fx.weeks[3].cpw)?.week_number ?? null, week2Left: rows.some(x => x.id === fx.weeks[2].cpw) }
      }, fx)
      expect(r.updErr).toBeNull()
      expect(r.updated, 'the renumber changed the row (before the fix: 0 rows, no error)').toBe(1)
      expect(r.week3Now).toBe(5)
      expect(r.delErr).toBeNull()
      expect(r.deleted, 'the delete removed the row (before the fix: 0 rows, no error)').toBe(1)
      expect(r.week2Left).toBe(false)
    } finally {
      if (fx) await removePlan(page, fx)
      else await sweepTagged(page)
    }
  })

  test('deleting a week in Personal view keeps your plan\'s week copies in step with the programme, and reports nothing', async ({ page }) => {
    await soloReady(page)
    let fx = null
    try {
      fx = await buildPlan(page)
      const r = await page.evaluate(async (fx) => {
        await openProgram(fx.programId)
        const logged = []
        const origErr = log.error
        log.error = (tag, msg, ...rest) => { logged.push(`${tag}: ${msg}`); return origErr(tag, msg, ...rest) }
        const origConfirm = window.confirmDialog
        window.confirmDialog = async () => true
        try { await deletePhaseWeek(fx.phaseId, 2) } finally { window.confirmDialog = origConfirm; log.error = origErr }
        const toast = document.getElementById('app-toast')?.textContent || ''
        const master = ((await db.from('program_phase_workouts').select('id, week_number').eq('phase_id', fx.phaseId)).data || [])
        const copies = ((await db.from('client_program_workouts').select('id, program_phase_workout_id, week_number').eq('client_program_id', fx.cpId)).data || [])
        return { logged, toast, master, copies }
      }, fx)
      expect(r.toast, 'the app says the week was deleted, not "only partly deleted"').toBe('Week 2 deleted')
      expect(r.logged, 'no error is reported (before the fix: "client copy delete removed no rows")').toEqual([])
      expect(r.master.map(m => m.week_number).sort(), 'the programme now has weeks 1 and 2').toEqual([1, 2])
      expect(r.copies.some(c => c.id === fx.weeks[2].cpw), "the deleted week's copy is gone").toBe(false)
      // The point of the row: every copy carries the SAME week number as the programme slot it points at.
      for (const c of r.copies) {
        const m = r.master.find(x => x.id === c.program_phase_workout_id)
        expect(c.week_number, `the copy of the programme's week ${m?.week_number} says the same week (before the fix: the old week 3)`).toBe(m?.week_number)
      }
      expect(r.copies, 'two copies remain, for weeks 1 and 2').toHaveLength(2)
    } finally {
      if (fx) await removePlan(page, fx)
      else await sweepTagged(page)
    }
  })
})
