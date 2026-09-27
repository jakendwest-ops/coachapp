// Both assign buttons now go through ONE database transaction, assign_program()
// (scripts/add-assign-program-rpc-2026-09-27.sql). RED until that script is applied to the live database; commit it
// after the apply, never before (a red-by-design spec blocks the release gate).
//
// What this proves end to end: an assign copies the sessions; a restart archives the old block and rebuilds; and when
// the call FAILS the client keeps the plan they had and the modal says so. The failure here is injected by aborting the
// request in the browser, so it proves the app's side of the contract (no partial writes from the browser, the error
// shown, nothing claimed). That the database rolls back a failure PART-WAY through the transaction is proven on a real
// Postgres engine by scripts/sql-verify/assign-program.verify.mjs, which a browser test cannot reach.
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

const TAG = '[E2E] AssignTx'

async function soloView(page) {
  await loginAsPT(page)
  await page.evaluate(() => localStorage.setItem('_activeView', 'solo'))
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => !!window._soloClientId), { timeout: 15000 }).toBe(true)
}

// A personal programme owned by the test account: one phase, one session, one exercise. Returns the ids.
// Every step is checked, so a failed insert names itself instead of surfacing as a TypeError on `.id` (review, 2026-09-27).
// Anything it created before failing is tagged with `name`, so the reaper can find it.
const makeFixture = (page, name) => page.evaluate(async ({ name }) => {
  const must = (step, { data, error }) => { if (error || !data) throw new Error(`fixture step "${step}" failed: ${error?.code || 'no row'}`); return data }
  const prog = must('program', await db.from('programs').insert({ coach_id: currentUser.id, is_personal: true, name }).select('id').single())
  const phase = must('phase', await db.from('program_phases').insert({ program_id: prog.id, name: 'P1', duration_weeks: 2, order_index: 0 }).select('id').single())
  const tmpl = must('template', await db.from('workout_templates').insert({ coach_id: currentUser.id, is_personal: true, name, program_id: prog.id }).select('id').single())
  must('exercise', await db.from('workout_template_exercises').insert({ template_id: tmpl.id, exercise_name: 'Bench', order_index: 0, sets: 3, metric_type: 'weight_reps' }).select('id'))
  must('slot', await db.from('program_phase_workouts').insert({ phase_id: phase.id, template_id: tmpl.id, day_label: 'Mon', week_number: 1 }).select('id'))
  return { programId: prog.id, templateId: tmpl.id, soloId: window._soloClientId }
}, { name })

// Removes the fixture and every copy made from it; returns what it actually removed so the caller can assert it.
const cleanup = (page, fx, name) => page.evaluate(async ({ fx, name }) => {
  const { data: clones } = await db.from('workout_templates').delete().eq('client_id', fx.soloId).eq('name', name).select('id')
  const { data: prog } = await db.from('programs').delete().eq('id', fx.programId).select('id')
  const { data: master } = await db.from('workout_templates').delete().eq('id', fx.templateId).select('id')
  return { clones: clones?.length ?? -1, prog: prog?.length ?? -1, master: master?.length ?? -1 }
}, { fx, name })

const planOf = (page, fx) => page.evaluate(async (fx) => {
  const { data: cps } = await db.from('client_programs').select('id, start_date').eq('client_id', fx.soloId).eq('program_id', fx.programId)
  const ids = (cps || []).map(c => c.id)
  const { data: cpws } = ids.length ? await db.from('client_program_workouts').select('id, workout_template_id, week_number').in('client_program_id', ids) : { data: [] }
  return { assignments: cps || [], sessions: cpws || [] }
}, fx)

test.describe('assign_program: one transaction for assign and restart', () => {
  test('assign copies the session; restart archives the old block and rebuilds', async ({ page }) => {
    await soloView(page)
    const name = `${TAG} restart ${Date.now()}`
    const fx = await makeFixture(page, name)
    let gone
    try {
      await page.evaluate(async (fx) => {
        await showAssignProgramToClientModal(fx.programId)
        document.getElementById('apc-start').value = '2026-10-01'
        await saveAssignProgramToClient(fx.programId, fx.soloId)
      }, fx)
      const first = await planOf(page, fx)
      expect(first.assignments).toHaveLength(1)
      expect(first.sessions).toHaveLength(1)
      expect(first.sessions[0].workout_template_id).not.toBe(fx.templateId)   // a copy, never the master

      await page.evaluate(async (fx) => {
        window.confirmDialog = () => Promise.resolve(true)   // accept "Restart program?"
        await showAssignProgramToClientModal(fx.programId)
        document.getElementById('apc-start').value = '2026-11-01'
        await saveAssignProgramToClient(fx.programId, fx.soloId)
      }, fx)
      const second = await planOf(page, fx)
      expect(second.assignments).toHaveLength(1)
      expect(second.assignments[0].id).not.toBe(first.assignments[0].id)
      expect(second.assignments[0].start_date).toBe('2026-11-01')
      expect(second.sessions).toHaveLength(1)
      const blocks = await page.evaluate(async (id) => (await db.from('client_program_blocks').select('ended_reason, start_date').eq('source_client_program_id', id)).data, first.assignments[0].id)
      expect(blocks).toEqual([{ ended_reason: 'restarted', start_date: '2026-10-01' }])
    } finally {
      gone = await cleanup(page, fx, name)
    }
    // Asserted AFTER the finally, so a cleanup problem can never mask the real failure above.
    expect(gone.prog).toBe(1)
    expect(gone.master).toBe(1)
  })

  test('when the assign call fails, the existing plan is untouched and the modal says so', async ({ page }) => {
    await soloView(page)
    const name = `${TAG} fault ${Date.now()}`
    const fx = await makeFixture(page, name)
    let gone
    try {
      await page.evaluate(async (fx) => {
        await showAssignProgramToClientModal(fx.programId)
        await saveAssignProgramToClient(fx.programId, fx.soloId)
      }, fx)
      const before = await planOf(page, fx)
      expect(before.sessions).toHaveLength(1)

      // FAULT: the restart's single request never reaches the database.
      await page.route('**/rest/v1/rpc/assign_program', route => route.abort('failed'))
      const ui = await page.evaluate(async (fx) => {
        window.confirmDialog = () => Promise.resolve(true)
        await showAssignProgramToClientModal(fx.programId)
        await saveAssignProgramToClient(fx.programId, fx.soloId)
        const btn = document.getElementById('apc-save-btn')
        return { error: document.getElementById('apc-error')?.textContent, modalOpen: !!document.getElementById('apc-modal'), btnEnabled: !!btn && !btn.disabled }
      }, fx)
      await page.unroute('**/rest/v1/rpc/assign_program')
      expect(ui.error).toMatch(/nothing was changed/)
      expect(ui.modalOpen).toBe(true)
      expect(ui.btnEnabled).toBe(true)

      const after = await planOf(page, fx)
      expect(after).toEqual(before)   // same assignment id, same session, same copy — nothing removed, nothing added
    } finally {
      await page.evaluate(() => document.getElementById('apc-modal')?.remove())
      gone = await cleanup(page, fx, name)
    }
    expect(gone.prog).toBe(1)
    expect(gone.master).toBe(1)
  })
})
