// A client's CURRENT training plan is chosen by date, and a coach can book the next block
// (docs/bugs/2026-10-29-current-plan-is-picked-by-assignment-order-not-by-date.md).
//
// Before 2026-10-29 every screen took the newest-ASSIGNED plan: booking a next block for next Monday made it current at once, and the block the
// client was running left their dashboard and calendar. This spec builds its OWN coached client and two plans (never borrowing shared data),
// books the second through the client's Training plans tab ("Assign next block"), and checks what the coach and the client's own page read.
// The pure rule is pinned by tests-node/current-assignment.test.mjs; the view's copy of it by scripts/sql-verify/coach-client-summary-current-plan.verify.mjs.
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

const TAG = '[E2E] CurrentPlan'

// A coached client and two coaching plans of two weeks, A training Monday + Thursday and B training Tuesday, with a session copy each.
// A is assigned to start on LAST week's Monday, so it ends this Sunday. Every step is checked; anything made is tagged with `name`.
const makeFixture = (page, name) => page.evaluate(async ({ name }) => {
  const must = (step, { data, error }) => { if (error || !data) throw new Error(`fixture step "${step}" failed: ${error?.code || 'no row'}`); return data }
  const client = must('client', await db.from('clients').insert({ coach_id: currentUser.id, full_name: name, status: 'active' }).select('id').single())
  const plan = async (label, days) => {
    const prog = must(`${label} program`, await db.from('programs').insert({ coach_id: currentUser.id, is_personal: false, name: `${name} ${label}` }).select('id').single())
    const phase = must(`${label} phase`, await db.from('program_phases').insert({ program_id: prog.id, name: `${label} phase`, duration_weeks: 2, order_index: 0 }).select('id').single())
    const tmpl = must(`${label} template`, await db.from('workout_templates').insert({ coach_id: currentUser.id, is_personal: false, name: `${name} ${label} session`, program_id: prog.id }).select('id').single())
    must(`${label} exercise`, await db.from('workout_template_exercises').insert({ template_id: tmpl.id, exercise_name: 'Squat', order_index: 0, sets: 3, metric_type: 'weight_reps' }).select('id'))
    for (const d of days) must(`${label} slot`, await db.from('program_phase_workouts').insert({ phase_id: phase.id, template_id: tmpl.id, day_label: `D${d}`, day_of_week: d, week_number: 1 }).select('id'))
    return { programId: prog.id, templateId: tmpl.id, name: `${name} ${label}` }
  }
  const A = await plan('A', [1, 4]), B = await plan('B', [2])
  const today = _ymdLocal(new Date())
  const lastMonday = _dashAddDays(_dashMonday(today), -7), nextMonday = _dashAddDays(_dashMonday(today), 7)
  const res = await _assignProgramTx('spec', client.id, A.programId, lastMonday, false)
  if (!res.ok) throw new Error('fixture step "assign A" failed: ' + res.message)
  return { clientId: client.id, A, B, today, lastMonday, nextMonday }
}, { name })

// The client row cascades its assignments, session copies and client-owned templates; the programmes cascade their phases and slots; the
// masters are left with program_id NULL by the programme delete, so they go by id. Returns what was removed so the caller can assert it.
const cleanup = (page, fx) => page.evaluate(async (fx) => {
  const { data: cl } = await db.from('clients').delete().eq('id', fx.clientId).select('id')
  const { data: progs } = await db.from('programs').delete().in('id', [fx.A.programId, fx.B.programId]).select('id')
  const { data: masters } = await db.from('workout_templates').delete().in('id', [fx.A.templateId, fx.B.templateId]).select('id')
  return { client: cl?.length ?? -1, programs: progs?.length ?? -1, masters: masters?.length ?? -1 }
}, fx)

const assignmentsOf = (page, fx) => page.evaluate(async (cid) => (await db.from('client_programs').select('program_id, start_date').eq('client_id', cid)).data || [], fx.clientId)

test.describe('current plan by date, and "Assign next block"', () => {
  test('a coach books the next block: the running block stays current, and the client page draws both', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAsPT(page)
    const name = `${TAG} ${Date.now()}`
    const fx = await makeFixture(page, name)
    let gone, goneC = 0
    try {
      // ── the client's Training plans tab: A is Current, and offers "Assign next block" for the Monday after it ends ──
      await page.evaluate((cid) => openClient(cid), fx.clientId)
      await page.locator('.tab-btn', { hasText: 'Training plans' }).click()
      const cardA = page.locator('.card', { hasText: fx.A.name })
      await expect(cardA.locator('[data-plan-chip="current"]')).toBeVisible()
      const nextBtn = cardA.locator('[data-assign-next-block]')
      await expect(nextBtn).toBeVisible()
      await nextBtn.click()
      await expect(page.locator('#assign-program-modal .modal-title')).toHaveText('Assign next block')
      await expect(page.locator('#ap-start')).toHaveValue(fx.nextMonday)
      // The current plan is left out of the list: choosing it would RESTART it (one plan per client).
      await expect(page.locator(`#ap-program option[value="${fx.B.programId}"]`)).toHaveCount(1)
      await expect(page.locator(`#ap-program option[value="${fx.A.programId}"]`)).toHaveCount(0)
      // No "starts before the current plan ends" question for a block that starts after it.
      let asked = null
      await page.exposeFunction('__confirmAsked', (m) => { asked = m })
      await page.evaluate(() => { window.confirmDialog = (m) => { window.__confirmAsked(m); return Promise.resolve(false) } })
      await page.locator('#ap-program').selectOption(fx.B.programId)
      await page.locator('#ap-save-btn').click()
      await expect(page.locator('#assign-program-modal')).toHaveCount(0)
      expect(asked, 'no confirm for a block that starts after the current one ends').toBeNull()
      const held = await assignmentsOf(page, fx)
      expect(held.find(a => a.program_id === fx.B.programId)?.start_date).toBe(fx.nextMonday)

      // ── the tab now reads Current, then Next, and A no longer offers the button ──
      await expect(cardA.locator('[data-plan-chip="current"]')).toBeVisible()
      await expect(page.locator('.card', { hasText: fx.B.name }).locator('[data-plan-chip="next"]')).toBeVisible()
      await expect(cardA.locator('[data-assign-next-block]')).toHaveCount(0)
      const order = await page.locator('[data-assignment-id]').evaluateAll(els => els.map(e => e.querySelector('[data-plan-chip]')?.dataset.planChip))
      expect(order, 'current first, then next').toEqual(['current', 'next'])

      // ── THE BUG: the Overview names the RUNNING block, not the one assigned last ──
      await page.locator('.tab-btn', { hasText: 'Overview' }).click()
      await expect(page.locator('#tab-content')).toContainText(fx.A.name)
      await expect(page.locator('#tab-content')).not.toContainText(fx.B.name)

      // ── the client's own page reads (the client and solo dashboards share _dashLoadOwn): A is current, and both blocks are on dates ──
      const own = await page.evaluate(async (fx) => {
        const d = await _dashLoadOwn(fx.clientId, fx.today)
        const ids = Object.fromEntries(Object.entries(d.progByDate).map(([ds, arr]) => [ds, arr.map(pw => pw._phaseName)]))
        // The adherence tile reads the CURRENT plan only (review, 2026-10-29): on the merged map the next block's weeks counted as this plan's.
        const opts = { planStart: d.cp0?.start_date, totalWeeks: 2 }
        const tile = _dashStreakModel(d.currentByDate, [], fx.today, opts), merged = _dashStreakModel(d.progByDate, [], fx.today, opts)
        return { current: d.cp0?.programs?.name, failed: Object.entries(d.failed).filter(([, e]) => e).map(([k]) => k), ids,
          tile: { mode: tile.mode, totalWeeks: tile.totalWeeks }, mergedWeeks: merged.totalWeeks }
      }, fx)
      expect(own.failed).toEqual([])
      expect(own.mergedWeeks, 'the scenario is real: on both plans\' dates the plan would read 4 weeks').toBe(4)
      expect(own.tile, 'the adherence tile is A\'s own two weeks').toEqual({ mode: 'plan', totalWeeks: 2 })
      expect(own.current, 'the client page\'s plan is the running block').toBe(fx.A.name)
      const thisMonday = await page.evaluate((t) => _dashMonday(t), fx.today)
      const day = (base, n) => page.evaluate(([b, k]) => _dashAddDays(b, k), [base, n])
      expect(own.ids[thisMonday], 'this week is A\'s second week').toEqual(['A phase'])
      expect(own.ids[await day(fx.nextMonday, 1)], 'next Tuesday is B\'s first session').toEqual(['B phase'])
      expect(own.ids[fx.nextMonday], 'A has no third week: next Monday is empty').toBeUndefined()

      // ── assigning ANOTHER plan that starts before A ends asks first; declining changes nothing ──
      asked = null
      // A third plan for the overlap question (re-choosing B would be the RESTART question, a different one).
      const C = await page.evaluate(async ({ name }) => {
        const { data, error } = await db.from('programs').insert({ coach_id: currentUser.id, is_personal: false, name: `${name} C` }).select('id').single()
        if (error) throw new Error('fixture step "C program" failed: ' + error.code)
        await db.from('program_phases').insert({ program_id: data.id, name: 'C phase', duration_weeks: 1, order_index: 0 })
        return data.id
      }, { name })
      fx.C = C
      await page.evaluate(async ({ cid, C, today }) => {
        await showAssignProgramModal(cid)
        const sel = document.getElementById('ap-program')
        const opt = document.createElement('option'); opt.value = C; opt.textContent = 'C'; sel.appendChild(opt); sel.value = C
        document.getElementById('ap-start').value = today
        await saveAssignProgram(cid)
      }, { cid: fx.clientId, C, today: fx.today })
      expect(asked, 'starting before the current plan ends is asked about first').toMatch(/starts before .* ends/)
      expect((await assignmentsOf(page, fx)).some(a => a.program_id === C), 'declined: nothing assigned').toBe(false)
    } finally {
      await page.evaluate(() => document.getElementById('assign-program-modal')?.remove())
      if (fx.C) goneC = await page.evaluate(async (id) => (await db.from('programs').delete().eq('id', id).select('id')).data?.length ?? -1, fx.C)
      gone = await cleanup(page, fx)
    }
    expect(goneC, 'the third plan was removed').toBe(1)
    expect(gone.client).toBe(1)
    expect(gone.programs).toBe(2)
    expect(gone.masters).toBe(2)
  })
})
