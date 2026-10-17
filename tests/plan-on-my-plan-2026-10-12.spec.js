const { test, expect } = require('./fixtures')
const { loginAsPT, acceptConfirm, declineConfirm } = require('./helpers')

// ─── Jake, 2026-10-12: "There should be a 'add to my calendar/plan' and a 'remove from current plan' on this page. A user may want to create a plan but not assign it
// to themself. At the moment they can only delete." (docs/bugs/2026-10-12-programs-page-has-no-add-to-my-plan-or-remove-from-my-plan.md)
//
// A solo account's Programs list shows an "On my plan" chip on the plan it is on; the program page shows the chip and "Remove from my plan" (otherwise "Add to my
// plan"). Remove keeps every logged session and takes the plan's upcoming sessions off the calendar; the plan itself stays. Adding a plan takes the others off
// ("one plan at a time"), assign first and remove second. A coach's Remove on a client's plan says what stays.
//
// NOTE: assigning a plan to the test account's solo record takes its other plans off ("one plan at a time"), so a run leaves that record on no plan. Specs that
// need one build their own, and the ones that skip when there is none already cope.
// The fixtures are this file's own: personal programmes tagged "[E2E] OnPlan", each with one phase, one session and one exercise, removed in a finally together with
// every copy and the logged session. The history rows the removals write (client_program_blocks) cannot be deleted by the app: the table is append-only, so a run
// leaves a few "[E2E] OnPlan" rows there, as tests/assign-program-transaction-2026-09-27.spec.js does with its 'restarted' rows.

const TAG = '[E2E] OnPlan'

async function soloView(page) {
  await loginAsPT(page)
  await page.evaluate(() => localStorage.setItem('_activeView', 'solo'))
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => !!window._soloClientId), { timeout: 15000 }).toBe(true)
  await expect(page.locator('#dash-goals')).toBeVisible({ timeout: 20000 })      // the app's start-up navigation has landed (it closes every open modal; a test that opens one first loses it)
}

const makeFixture = (page, name) => page.evaluate(async ({ name }) => {
  const must = (step, { data, error }) => { if (error || !data) throw new Error(`fixture step "${step}" failed: ${error?.code || 'no row'}`); return data }
  const prog = must('program', await db.from('programs').insert({ coach_id: currentUser.id, is_personal: true, name }).select('id').single())
  const phase = must('phase', await db.from('program_phases').insert({ program_id: prog.id, name: 'P1', duration_weeks: 2, order_index: 0 }).select('id').single())
  const tmpl = must('template', await db.from('workout_templates').insert({ coach_id: currentUser.id, is_personal: true, name, program_id: prog.id }).select('id').single())
  must('exercise', await db.from('workout_template_exercises').insert({ template_id: tmpl.id, exercise_name: 'Bench', order_index: 0, sets: 3, metric_type: 'weight_reps' }).select('id'))
  must('slot', await db.from('program_phase_workouts').insert({ phase_id: phase.id, template_id: tmpl.id, day_label: 'Mon', week_number: 1 }).select('id'))
  return { programId: prog.id, templateId: tmpl.id, name, soloId: window._soloClientId }
}, { name })

// Removes a fixture, every copy made from it, the history rows its removals wrote, and the logs; returns what it removed so the caller can assert it AFTER the finally.
const cleanup = (page, fx) => page.evaluate(async (fx) => {
  const { data: logs } = await db.from('workout_logs').delete().eq('client_id', fx.soloId).eq('name', fx.name).select('id')
  const { data: clones } = await db.from('workout_templates').delete().eq('client_id', fx.soloId).eq('name', fx.name).select('id')
  const { data: prog } = await db.from('programs').delete().eq('id', fx.programId).select('id')
  const { data: master } = await db.from('workout_templates').delete().eq('id', fx.templateId).select('id')
  return { logs: logs?.length ?? 0, clones: clones?.length ?? -1, prog: prog?.length ?? -1, master: master?.length ?? -1 }
}, fx)

// saveAssignProgramToClient ends with navigate(currentPage, 'replace'), a repaint that can land over the page a test has just opened. It is held off while the
// assign runs, so every test below starts from the page it opened itself.
const assign = (page, fx, start = '2026-10-12') => page.evaluate(async ({ fx, start }) => {
  const realNavigate = window.navigate
  window.navigate = () => {}
  try {
    await showAssignProgramToClientModal(fx.programId)
    document.getElementById('apc-start').value = start
    await saveAssignProgramToClient(fx.programId, fx.soloId)
  } finally { window.navigate = realNavigate }
}, { fx, start })

const assignments = (page, fx) => page.evaluate(async (fx) => (await db.from('client_programs').select('id, start_date').eq('client_id', fx.soloId).eq('program_id', fx.programId)).data || [], fx)
const openPage = async (page, fx) => { await page.evaluate(id => openProgram(id), fx.programId); await expect(page.locator('.pgm-titlerow')).toBeVisible({ timeout: 15000 }) }

test.describe('Solo: add a plan to my plan and take it off again (2026-10-12)', () => {
  test('the Programs list and the program page show "On my plan" once it is added, and offer Remove', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const fx = await makeFixture(page, `${TAG} chip ${Date.now()}`)
    let gone
    try {
      await openPage(page, fx)
      await expect(page.getByRole('button', { name: 'Add to my plan' }), 'not on the plan yet: Add').toBeVisible()
      await expect(page.locator('[data-onplan]')).toHaveCount(0)
      await page.evaluate(() => navigate('programs'))
      await expect(page.locator('.list-row', { hasText: fx.name })).toBeVisible({ timeout: 15000 })
      await expect(page.locator('.list-row', { hasText: fx.name }).locator('[data-onplan]'), 'no chip on a plan that is not on my plan').toHaveCount(0)

      await assign(page, fx)
      await page.evaluate(() => navigate('programs'))
      await expect(page.locator('.list-row', { hasText: fx.name }).locator('[data-onplan]'), 'the list shows the chip').toHaveText('On my plan')
      await openPage(page, fx)
      await expect(page.locator('.pgm-onplan [data-onplan]'), 'the page shows the chip').toHaveText('On my plan')
      await expect(page.locator('[data-remove-from-plan]')).toHaveText('Remove from my plan')
      await expect(page.getByRole('button', { name: 'Add to my plan' }), 'and no Add').toHaveCount(0)
    } finally { await page.evaluate(() => document.getElementById('apc-modal')?.remove()); gone = await cleanup(page, fx) }
    expect(gone.prog).toBe(1)
    expect(gone.master).toBe(1)
  })

  test('Remove from my plan keeps the logged session and the plan, drops the assignment and its copies, and files the block', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const fx = await makeFixture(page, `${TAG} remove ${Date.now()}`)
    let gone
    try {
      await assign(page, fx)
      const log = await page.evaluate(async (fx) => (await db.from('workout_logs').insert({ coach_id: currentUser.id, client_id: fx.soloId, name: fx.name, date: '2026-10-05' }).select('id').single()), fx)
      expect(log.error, 'the fixture log was written').toBeNull()
      await openPage(page, fx)
      await page.locator('[data-remove-from-plan]').click()
      await expect(page.locator('#confirm-dialog'), 'asks first, in the agreed words').toContainText('Sessions you have logged stay in your history')
      await expect(page.locator('#confirm-dialog')).toContainText('The plan stays in Training plans')
      await acceptConfirm(page)
      await expect(page.getByRole('button', { name: 'Add to my plan' }), 'the page now offers Add again').toBeVisible({ timeout: 15000 })
      await expect(page.locator('[data-onplan]')).toHaveCount(0)

      expect(await assignments(page, fx), 'the assignment is gone').toEqual([])
      const after = await page.evaluate(async (fx) => ({
        log: (await db.from('workout_logs').select('id').eq('client_id', fx.soloId).eq('name', fx.name)).data?.length,
        program: (await db.from('programs').select('id').eq('id', fx.programId)).data?.length,
        copies: (await db.from('workout_templates').select('id').eq('client_id', fx.soloId).eq('name', fx.name)).data?.length,
        blocks: (await db.from('client_program_blocks').select('ended_reason').eq('client_id', fx.soloId).eq('program_name', fx.name)).data
      }), fx)
      expect(after.log, 'the logged session is untouched').toBe(1)
      expect(after.program, 'the plan stays in the library').toBe(1)
      expect(after.copies, 'the unused copy of its session is gone').toBe(0)
      expect(after.blocks, 'the block is filed in the history first').toEqual([{ ended_reason: 'removed' }])
    } finally { gone = await cleanup(page, fx) }
    expect(gone.prog).toBe(1)
    expect(gone.master).toBe(1)
  })

  test('"Keep it" changes nothing', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const fx = await makeFixture(page, `${TAG} keep ${Date.now()}`)
    let gone
    try {
      await assign(page, fx)
      const before = await assignments(page, fx)
      await openPage(page, fx)
      await page.locator('[data-remove-from-plan]').click()
      await declineConfirm(page)
      await expect(page.locator('#confirm-dialog')).toHaveCount(0)
      expect(await assignments(page, fx), 'the same assignment is still there').toEqual(before)
      await expect(page.locator('[data-onplan]')).toHaveCount(1)
    } finally { gone = await cleanup(page, fx) }
    expect(gone.prog).toBe(1)
  })

  test('a removal the database refuses says so and changes nothing (no "Removed" claimed)', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const fx = await makeFixture(page, `${TAG} refuse ${Date.now()}`)
    let gone
    try {
      await assign(page, fx)
      const before = await assignments(page, fx)
      await openPage(page, fx)
      const toasts = await page.evaluate(() => {
        window.__toasts = []
        const real = window.showToast
        window.showToast = (m, k) => { window.__toasts.push([m, k]); return real(m, k) }
        window._removeAssignmentAndClones = async () => false      // what the helper returns when the delete is refused
        return true
      })
      expect(toasts).toBe(true)
      await page.locator('[data-remove-from-plan]').click()
      await acceptConfirm(page)
      await expect.poll(() => page.evaluate(() => window.__toasts.map(t => t[0]).join('|'))).toContain('Could not remove it from your plan')
      expect(await page.evaluate(() => window.__toasts.some(t => /Removed from your plan/.test(t[0]))), 'no success is claimed').toBe(false)
      expect(await assignments(page, fx), 'nothing changed').toEqual(before)
    } finally { gone = await cleanup(page, fx) }
    expect(gone.prog).toBe(1)
  })

  test('one plan at a time: the add dialog names the plan it replaces, and adding takes the other off', async ({ page }) => {
    test.setTimeout(180_000)
    await soloView(page)
    const a = await makeFixture(page, `${TAG} first ${Date.now()}`)
    const b = await makeFixture(page, `${TAG} second ${Date.now()}`)
    let goneA, goneB
    try {
      await assign(page, a)
      await page.evaluate(id => showAssignProgramToClientModal(id), b.programId)
      await expect(page.locator('#apc-replaces'), 'the dialog says what comes off').toContainText(`${a.name} comes off your plan`)
      await page.evaluate(async (b) => { const n = window.navigate; window.navigate = () => {}; try { await saveAssignProgramToClient(b.programId, b.soloId) } finally { window.navigate = n } }, b)
      await expect.poll(async () => (await assignments(page, b)).length, { message: 'the new plan is on' }).toBe(1)
      expect(await assignments(page, a), 'the other plan came off').toEqual([])
      const stays = await page.evaluate(async (a) => (await db.from('programs').select('id').eq('id', a.programId)).data?.length, a)
      expect(stays, 'and it stays in the library').toBe(1)
    } finally {
      await page.evaluate(() => document.getElementById('apc-modal')?.remove())
      goneA = await cleanup(page, a); goneB = await cleanup(page, b)
    }
    expect(goneA.prog).toBe(1)
    expect(goneB.prog).toBe(1)
  })

  test('if the old plan cannot be taken off, the new one is still added and the person is told', async ({ page }) => {
    test.setTimeout(180_000)
    await soloView(page)
    const a = await makeFixture(page, `${TAG} stuck ${Date.now()}`)
    const b = await makeFixture(page, `${TAG} added ${Date.now()}`)
    let goneA, goneB
    try {
      await assign(page, a)
      const seen = await page.evaluate(async (b) => {
        const toasts = []
        const real = window.showToast
        window.showToast = (m, k) => { toasts.push(m); return real(m, k) }
        window._removeAssignmentAndClones = async () => false
        const n = window.navigate; window.navigate = () => {}
        try { await showAssignProgramToClientModal(b.programId); await saveAssignProgramToClient(b.programId, b.soloId) } finally { window.navigate = n }
        return toasts
      }, b)
      expect(seen.some(t => /could not be taken off your plan/.test(t)), 'the warning is shown').toBe(true)
      expect(seen.some(t => /^Added to your plan/.test(t)), 'and no plain success on top of it').toBe(false)
      expect((await assignments(page, b)).length, 'the new plan is on').toBe(1)
      expect((await assignments(page, a)).length, 'the old one is still there (two plans, never none)').toBe(1)
    } finally {
      await page.evaluate(() => document.getElementById('apc-modal')?.remove())
      goneA = await cleanup(page, a); goneB = await cleanup(page, b)
    }
    expect(goneA.prog).toBe(1)
    expect(goneB.prog).toBe(1)
  })

  test('a coach\'s Remove on a client\'s plan names what stays', async ({ page }) => {
    await loginAsPT(page)
    const seen = await page.evaluate(async () => {
      let asked = null
      window.confirmDialog = async (msg, opts) => { asked = { msg, title: opts?.title, ok: opts?.confirmLabel }; return false }
      await unassignProgram('no-client', 'no-assignment')
      return asked
    })
    expect(seen.title).toBe("Remove from this client's plan?")
    expect(seen.msg).toContain('Their logged sessions stay in their history')
    expect(seen.ok).toBe('Remove from plan')
    const src = await page.evaluate(async () => (await fetch('/js/app-programs.js')).text())
    expect(src, 'the button on the client\'s Programs tab says it too').toContain(">Remove from plan</button>")
  })
})
