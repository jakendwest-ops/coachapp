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
  await expect(page.locator('#dash-goals')).toBeVisible({ timeout: 20000 })      // the app's start-up navigation has landed (it closes every open modal; a test that opens one first loses it)
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

  // 2026-10-17 (scripts/fix-assign-program-restart-date-2026-10-17.sql, run by Jake the same day): a restart archives the old block ending on the CALLER's day. These two tests are the
  // live leg of scripts/sql-verify/assign-program-today.verify.mjs, reaching what a local Postgres cannot: the app really sends p_today, and the real API resolves the five-argument
  // function with it, with it far out of range (clamped to a day either side of the SERVER's date) and without it (the shape every older browser sends; the server's date).
  // client_program_blocks is append-only (no DELETE policy), so these tests, like the other restart specs, leave their block rows behind (1 + 3 per run, on the test account's own record).
  const ymdUTC = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`   // written out by hand: this is the one place that means the UTC day
  const dayNum = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5 }
  const endedOf = (page, cpId) => page.evaluate(async (id) => { const { data, error } = await db.from('client_program_blocks').select('ended_at').eq('source_client_program_id', id); return { rows: data, error: error?.message || null } }, cpId)
  const assignedCp = async (page, fx) => (await planOf(page, fx)).assignments[0].id

  test.describe('the app sends the caller\'s own day', () => {
    // Auckland is always 12-13 hours AHEAD of UTC. The browser's clock is pinned to 23:30 UTC YESTERDAY (a past moment, so a saved login still looks valid): in Auckland that is lunchtime
    // TODAY, so the caller's day (today) and the UTC day (yesterday) DISAGREE, and both are inside the server's clamp. Sending the UTC day (the old bug) or nothing then fails.
    test.use({ timezoneId: 'Pacific/Auckland' })
    test('a restart sends the day the caller is on, not the UTC day, and the archived block ends on it', async ({ page }) => {
      test.setTimeout(120_000)
      await soloView(page)
      const name = `${TAG} caller day ${Date.now()}`
      const fx = await makeFixture(page, name)
      const now = new Date()
      const pinned = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 23, 30))
      const utcDay = ymdUTC(pinned)       // the UTC day of the pinned moment: yesterday
      const callerDay = ymdUTC(now)       // the caller's (Auckland) day at that moment: the real UTC today
      expect(callerDay, 'the scenario is real: the caller\'s day and the UTC day differ').not.toBe(utcDay)
      const sent = []
      page.on('request', req => { if (req.method() === 'POST' && req.url().includes('/rest/v1/rpc/assign_program')) sent.push(JSON.parse(req.postData() || '{}')) })
      let gone
      try {
        await page.evaluate(async (fx) => {      // the first assignment, through the app
          await showAssignProgramToClientModal(fx.programId)
          document.getElementById('apc-start').value = '2026-10-01'
          await saveAssignProgramToClient(fx.programId, fx.soloId)
        }, fx)
        expect((await planOf(page, fx)).assignments, 'assigned').toHaveLength(1)
        const cp = await assignedCp(page, fx)
        await page.clock.setFixedTime(pinned)
        expect(await page.evaluate(() => _ymdLocal(new Date())), 'the page now believes it is the caller\'s day').toBe(callerDay)
        sent.length = 0
        await page.evaluate(async (fx) => {
          window.confirmDialog = () => Promise.resolve(true)
          await showAssignProgramToClientModal(fx.programId)
          document.getElementById('apc-start').value = '2026-11-01'
          await saveAssignProgramToClient(fx.programId, fx.soloId)
        }, fx)
        expect(sent, 'the app made exactly one assign_program request for the restart').toHaveLength(1)
        expect(sent[0].p_restart).toBe(true)
        expect(sent[0].p_today, 'the request carries the caller\'s day (not the UTC day, not nothing)').toBe(callerDay)
        const ended = await endedOf(page, cp)
        expect(ended.error).toBeNull()
        expect(ended.rows, 'one archive block for that restart').toHaveLength(1)
        expect(ended.rows[0].ended_at, 'ending on the caller\'s day').toBe(callerDay)
      } finally {
        page.removeAllListeners('request')
        await page.evaluate(() => document.getElementById('apc-modal')?.remove())
        gone = await cleanup(page, fx, name)
      }
      expect(gone.prog).toBe(1)
      expect(gone.master).toBe(1)
    })
  })

  test('the server clamps a wild p_today to a day either side of its own date, and still serves a call without it', async ({ page }) => {
    test.setTimeout(120_000)
    await soloView(page)
    const name = `${TAG} clamp ${Date.now()}`
    const fx = await makeFixture(page, name)
    const rpc = (p) => page.evaluate(async ({ fx, p }) => {
      const args = { p_client_id: fx.soloId, p_program_id: fx.programId, p_start_date: null, p_restart: true }
      if (p !== undefined) args.p_today = p
      const { error } = await db.rpc('assign_program', args)
      return error ? `${error.code}: ${error.message}` : null
    }, { fx, p })
    let gone
    try {
      await page.evaluate(async (fx) => {      // the first assignment, through the app
        await showAssignProgramToClientModal(fx.programId)
        await saveAssignProgramToClient(fx.programId, fx.soloId)
      }, fx)
      expect((await planOf(page, fx)).assignments, 'assigned').toHaveLength(1)
      // (b) far future -> the server's date + 1; (c) far past -> the server's date - 1; (d) no p_today at all (the older browsers' call) -> the server's date
      const cpB = await assignedCp(page, fx)
      expect(await rpc('2099-01-01'), 'a restart with a far-future p_today is accepted').toBeNull()
      const cpC = await assignedCp(page, fx)
      expect(await rpc('2020-01-01'), 'a restart with a far-past p_today is accepted').toBeNull()
      const cpD = await assignedCp(page, fx)
      expect(await rpc(undefined), 'a restart WITHOUT p_today is accepted').toBeNull()
      const [b, c, d] = [await endedOf(page, cpB), await endedOf(page, cpC), await endedOf(page, cpD)]
      for (const x of [b, c, d]) { expect(x.error).toBeNull(); expect(x.rows, 'one archive block each').toHaveLength(1) }
      const [eb, ec, ed] = [b.rows[0].ended_at, c.rows[0].ended_at, d.rows[0].ended_at]
      expect.soft(dayNum(eb) - dayNum(ec), 'far future minus far past = 2 days: the clamp is a day either side').toBe(2)
      expect.soft(dayNum(ed) - dayNum(ec), 'no p_today lands in the middle: the server\'s own date').toBe(1)
      expect.soft(dayNum(eb) - dayNum(ed), 'and the far-future one is the day after that').toBe(1)
    } finally {
      gone = await cleanup(page, fx, name)
    }
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
