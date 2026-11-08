const { test, expect } = require('./fixtures')
const { loginAsClient, soloReady } = require('./helpers')
const { installCappedApi, restoreCappedApi } = require('./capped-api')

// ─── End of a training block: the hint and the card on Today (Jake, 2026-11-07) ──────────────────────────────────────────────────
// docs/superpowers/specs/2026-11-07-end-of-block-review-design.md, plan docs/superpowers/plans/2026-11-07-end-of-block-review.md. The REAL render functions run against
// tests/capped-api.js with the clock pinned and nothing written anywhere. The rules (when a hint or a card is due, what it says) are pinned in tests-node/block-review.test.mjs;
// what is tested here is what the screen does with them. The block comparison (Blocks table engine) reads two functions that are replaced in the page, as the Blocks spec does.
// The last describe is the exception: booking the next block is a real write, so it runs against the real database on tagged fixtures. client_program_blocks is append-only (no
// DELETE policy), so those tests, like the other restart specs, leave their block rows behind on the test account's own record.
//
// The plan: 12 weeks, Mon/Wed/Fri, started Monday 10 Aug 2026, so its last Sunday is 1 Nov 2026.
test.use({ timezoneId: 'Europe/London' })

const CID = 'br-c1'
const START = '2026-08-10', END = '2026-11-01'
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
let seq = 0
const mkLog = (date) => ({ id: 'brl-' + (++seq), client_id: CID, name: 'Session', date, created_at: date + 'T07:40:00Z', workout_log_exercises: [{ id: 'x1' }] })

function tables({ weeks = 12, logCount = 34, start = START, next = false, weights, program = true } = {}) {
  // Three phases, each with the same three sessions repeating for its whole length, so a 12-week plan has 36 planned sessions.
  const pwsOf = (n) => [[1, 'Upper'], [3, 'Lower'], [5, 'Full']].map(([dow, name]) => ({ id: `pw-${n}-${dow}`, day_of_week: dow, session_order: 1, week_number: 1, notes: null, workout_templates: { id: 't-' + dow, name } }))
  const phase = (n) => ({ id: 'ph' + n, name: 'Block ' + n, duration_weeks: weeks / 3, order_index: n, program_phase_workouts: pwsOf(n) })
  const cp = (id, startDate, createdAt) => ({ id, program_id: 'prog-' + id, client_id: CID, created_at: createdAt, start_date: startDate, programs: { name: 'Operation 240', description: 'x', program_phases: program ? [phase(1), phase(2), phase(3)] : [] } })
  const rows = [cp('cpA', start, '2026-08-01T00:00:00Z')]
  if (next) rows.push(cp('cpB', addDays(END, 8), '2026-10-30T00:00:00Z'))
  // Logged sessions, oldest first: every Mon/Wed/Fri of every week, the same days as the plan.
  const dates = []
  for (let w = 0; w < weeks; w++) for (const d of [0, 2, 4]) dates.push(addDays(start, 7 * w + d))
  return {
    client_programs: rows,
    client_program_workouts: [1, 2, 3].flatMap(n => pwsOf(n).map(p => ({ id: 'cpw-' + p.id, client_program_id: 'cpA', program_phase_workout_id: p.id, workout_template_id: 'ct-' + p.id }))),
    workout_logs: dates.slice(0, logCount).map(mkLog),
    weight_logs: weights ?? [{ client_id: CID, date: addDays(start, 2), weight_kg: 82.4 }, { client_id: CID, date: addDays(END, -3), weight_kg: 81.1 }],
    goals: [], events: [], client_check_ins: [],
    clients: [{ id: CID, user_id: 'u', coach_id: null, full_name: 'Jake West' }],
  }
}

const ses = (date, kg, reps = 5) => ({ date, sets: [{ set_number: 1, weight_kg: kg, reps_achieved: reps }] })
// Two blocks of lifts: the finished block (10 Aug - 1 Nov) and the one before it (11 May - 9 Aug).
const EXERCISES = [
  { name: 'Bench Press', metricType: 'weight_reps', sessions: [ses('2026-06-01', 100), ses('2026-07-20', 102.5), ses('2026-09-14', 105), ses('2026-10-26', 110)] },
  { name: 'Deadlift', metricType: 'weight_reps', sessions: [ses('2026-06-08', 150), ses('2026-09-21', 160)] },
  { name: 'Barbell Row', metricType: 'weight_reps', sessions: [ses('2026-06-15', 80), ses('2026-10-12', 84)] },
  { name: 'Back Squat', metricType: 'weight_reps', sessions: [ses('2026-06-22', 130), ses('2026-10-05', 120)] },   // went down: never in the card
  { name: 'Overhead Press', metricType: 'weight_reps', sessions: [ses('2026-10-19', 60)] },                      // only this block: no change shown
]
const BLOCKS = (withPrevious = true) => [
  { key: 'live:cpA', progKey: 'prog-cpA', name: 'Operation 240', start: START, end: '2026-11-03', weeks: 12, open: true },
  ...(withPrevious ? [{ key: 'past:1', progKey: 'prog-old', name: 'Older plan', start: '2026-05-11', end: '2026-08-02', weeks: 12, open: false }] : []),
]

async function show(page, tbl, { today = '2026-11-03', blocks = BLOCKS(), exercises = EXERCISES, role = 'solo', readsFail = false, unit = 'kg' } = {}) {
  await page.clock.setFixedTime(new Date(today + 'T10:00:00Z'))
  await page.evaluate(({ unit }) => {
    window._unitPrefs = { ...(window._unitPrefs || {}), weight: unit }; window._weeklyTarget = null; window._soloClientId = 'br-c1'
    Object.keys(localStorage).filter(k => k.startsWith('coachapp.blockReview.')).forEach(k => localStorage.removeItem(k))   // only ours: clearing everything would drop the saved login
  }, { unit })
  // A coached client's page finds its own record by the logged-in user and a coach; the solo page is told its record (window._soloClientId).
  if (role !== 'solo') { const uid = await page.evaluate(() => currentUser.id); tbl = { ...tbl, clients: [{ id: CID, user_id: uid, coach_id: 'coach-x', full_name: 'Jake West' }] } }
  await restoreCappedApi(page)   // a no-op when nothing is installed; several tests show the page twice
  await installCappedApi(page, tbl)
  await page.evaluate(({ blocks, exercises, readsFail }) => {
    window._loadProgramBlocks = async () => (readsFail ? null : blocks)
    window._buildExerciseSeries = async () => (readsFail ? null : exercises)
    window.__assign = []
    window.showAssignProgramModal = (cid, opts) => window.__assign.push({ cid, opts })
  }, { blocks, exercises, readsFail })
  await page.evaluate(async (role) => { await window[role === 'solo' ? 'renderSoloDashboard' : 'renderClientDashboard'](document.getElementById('main-content')) }, role)
  await expect(page.locator('#dash-root')).toBeVisible()
}
const card = (page) => page.locator('#dash-root [data-block-card]')
const hint = (page) => page.locator('#dash-root [data-block-hint]')

test.describe('End of a block on Today (2026-11-07)', () => {
  test.beforeEach(async ({ page }) => { await loginAsClient(page) })

  test('the card: the plan has ended, nothing is booked: headline, sessions done, the three most improved lifts, body weight, the two actions', async ({ page }) => {
    await show(page, tables())
    await expect(card(page)).toBeVisible()
    await expect(card(page)).toContainText('Your 12-week block finished on Sun 1 Nov')
    await expect(card(page)).toContainText('34 of 36')
    await expect(card(page)).toContainText('94%')
    await expect(card(page).locator('[data-block-lift]')).toHaveCount(3)
    const names = await card(page).locator('[data-block-lift] [data-block-lift-name]').allTextContents()
    expect(names, 'by percent: Bench +10%, Deadlift +6.7%, Row +5%; Squat went down and Overhead Press is new').toEqual(['Bench Press', 'Deadlift', 'Barbell Row'])
    await expect(card(page)).toContainText('Body weight 82.4 kg → 81.1 kg')
    await expect(card(page).locator('[data-block-action="repeat"]')).toBeVisible()
    await expect(card(page).locator('[data-block-action="choose"]')).toBeVisible()
    await expect(card(page).locator('[data-block-action="notnow"]')).toBeVisible()
    await expect(hint(page)).toHaveCount(0)
  })

  test('the lifts and the Blocks table agree: the card uses the same engine over the same two windows', async ({ page }) => {
    await show(page, tables())
    await expect(card(page).locator('[data-block-lift]')).toHaveCount(3)
    // The numbers on the card for the top lift are the Blocks table's row for it.
    const bench = await page.evaluate(({ ex }) => {
      const w = _blockWindowsFor([{ key: 'live:cpA', progKey: 'p', name: 'x', start: '2026-08-10', end: '2026-11-01', open: true }, { key: 'past:1', progKey: 'o', name: 'y', start: '2026-05-11', end: '2026-08-02', open: false }], '2026-11-01')
      return JSON.parse(JSON.stringify(_blockLiftSummary(ex, w.a, w.b).both.find(r => r.name === 'Bench Press')))
    }, { ex: EXERCISES })
    const text = await card(page).locator('[data-block-lift]').first().innerText()
    expect(text).toContain(`${Math.round(bench.last)} kg → ${Math.round(bench.this)} kg`)
  })

  test('the hint: the last week of the plan with nothing booked after it, and not before', async ({ page }) => {
    await show(page, tables(), { today: '2026-10-28' })
    await expect(hint(page)).toBeVisible()
    await expect(hint(page)).toContainText('Last week of your block')
    await expect(card(page)).toHaveCount(0)
    await show(page, tables(), { today: '2026-10-25' })
    await expect(hint(page), 'the Sunday before the last week').toHaveCount(0)
  })

  test('boundaries: the card on the Monday after, on day 28, and gone on day 29', async ({ page }) => {
    await show(page, tables(), { today: '2026-11-02' }); await expect(card(page)).toBeVisible()
    await show(page, tables(), { today: '2026-11-29' }); await expect(card(page)).toBeVisible()
    await show(page, tables(), { today: '2026-11-30' }); await expect(card(page)).toHaveCount(0)
  })

  test('nothing when a plan is booked after this one, when it ran under 2 weeks, or with under 3 sessions logged', async ({ page }) => {
    await show(page, tables({ next: true })); await expect(card(page)).toHaveCount(0); await expect(hint(page)).toHaveCount(0)
    await show(page, tables({ weeks: 3, start: '2026-10-19' })); await expect(card(page), 'a 3-week plan that ended 1 Nov is fine; this one runs to 8 Nov').toHaveCount(0)
    await show(page, tables({ logCount: 2 })); await expect(card(page)).toHaveCount(0)
    await show(page, tables({ logCount: 3 })); await expect(card(page)).toBeVisible()
  })

  test('a coached client sees no change: the card and the hint are for Personal view only', async ({ page }) => {
    await show(page, tables(), { role: 'client' }); await expect(card(page)).toHaveCount(0)
    await show(page, tables(), { role: 'client', today: '2026-10-28' }); await expect(hint(page)).toHaveCount(0)
  })

  test('the first block: it says there is nothing to compare and shows no lift rows or invented change', async ({ page }) => {
    await show(page, tables(), { blocks: BLOCKS(false) })
    await expect(card(page)).toContainText('First block: nothing to compare yet')
    await expect(card(page).locator('[data-block-lift]')).toHaveCount(0)
    await expect(card(page)).toContainText('34 of 36')
  })

  test('every lift down, or none comparable: the card says so instead of showing nothing', async ({ page }) => {
    const down = [{ name: 'Back Squat', metricType: 'weight_reps', sessions: [ses('2026-06-22', 130), ses('2026-10-05', 120)] }]
    await show(page, tables(), { exercises: down })
    await expect(card(page).locator('[data-block-lift]')).toHaveCount(0)
    await expect(card(page)).toContainText('No lift went up this block')
  })

  test('a failed read of the lifts still shows the plain figures and says the comparison could not load, never "first block"', async ({ page }) => {
    await show(page, tables(), { readsFail: true })
    await expect(card(page)).toContainText('34 of 36')
    await expect(card(page)).toContainText("Couldn't compare with your last block")
    await expect(card(page)).not.toContainText('First block')
  })

  test('pounds: weights and changes follow the person\'s unit', async ({ page }) => {
    await show(page, tables(), { unit: 'lb' })
    const text = await card(page).locator('[data-block-lift]').first().innerText()
    expect(text, '100 kg is 220 lb and 110 kg is 243 lb').toMatch(/lb/)
    expect(text).not.toMatch(/\bkg\b/)
  })

  test('"Not now" hides the card until the next Monday, on this device', async ({ page }) => {
    await show(page, tables())
    await card(page).locator('[data-block-action="notnow"]').click()
    await expect(card(page)).toHaveCount(0)
    const key = await page.evaluate(() => Object.keys(localStorage).find(k => k.startsWith('coachapp.blockReview.')))
    expect(key).toBeTruthy()
    expect(await page.evaluate(k => localStorage.getItem(k), key), 'Tuesday 3 Nov: back on Monday 9 Nov').toBe('2026-11-09')
    await page.evaluate(async () => { await renderSoloDashboard(document.getElementById('main-content')) })
    await expect(card(page), 'still hidden after a repaint').toHaveCount(0)
    await page.clock.setFixedTime(new Date('2026-11-09T10:00:00Z'))
    await page.evaluate(async () => { await renderSoloDashboard(document.getElementById('main-content')) })
    await expect(card(page), 'back on the Monday').toBeVisible()
  })

  test('localStorage throwing does not break Today: the card still shows', async ({ page }) => {
    await show(page, tables())
    await page.evaluate(() => { Storage.prototype.getItem = () => { throw new Error('blocked') }; Storage.prototype.setItem = () => { throw new Error('blocked') } })
    await page.evaluate(async () => { await renderSoloDashboard(document.getElementById('main-content')) })
    await expect(card(page)).toBeVisible()
    await card(page).locator('[data-block-action="notnow"]').click()
    await expect(card(page), 'it hides for this view even though it cannot be remembered').toHaveCount(0)
  })

  test('Repeat this plan and Choose another open the plan sheet with the right start date; Repeat only for a plan that can still be booked', async ({ page }) => {
    await show(page, tables())
    await card(page).locator('[data-block-action="repeat"]').click()
    let calls = await page.evaluate(() => window.__assign)
    expect(calls.at(-1).opts, 'Tuesday 3 Nov: the Monday after the end (2 Nov) has gone, so the next Monday').toMatchObject({ startDate: '2026-11-09', programId: 'prog-cpA', blockReview: true })
    await card(page).locator('[data-block-action="choose"]').click()
    calls = await page.evaluate(() => window.__assign)
    expect(calls.at(-1).opts).toMatchObject({ startDate: '2026-11-09', blockReview: true })
    expect(calls.at(-1).opts.programId, 'Choose another preselects nothing').toBeUndefined()
    await show(page, tables({ program: false }))
    await expect(card(page)).toHaveCount(0)   // a plan with no sessions at all has no end to review
  })

  test('the hint offers to plan the next block starting the Monday after the end', async ({ page }) => {
    await show(page, tables(), { today: '2026-10-28' })
    await hint(page).locator('[data-block-action="plan-next"]').click()
    const calls = await page.evaluate(() => window.__assign)
    expect(calls.at(-1).opts).toMatchObject({ startDate: '2026-11-02', nextBlock: true })
  })

  for (const width of [390, 320]) {
    test(`no sideways scroll at ${width} px, and the buttons are at least 44 px tall`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await show(page, tables())
      await expect(card(page).locator('[data-block-lift]')).toHaveCount(3)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
      const heights = await card(page).locator('[data-block-action]').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)))
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(44)
    })
  }

  test('a name that looks like markup is shown as text, never run', async ({ page }) => {
    const t = tables(); t.client_programs[0].programs.name = '<img src=x onerror="window.__pwned=1">'
    await show(page, t)
    await expect(card(page)).toBeVisible()
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined()
  })

  test('See everything: the review is frozen on the finished block, its header and table agree with the card, and a normal visit to Blocks has no header', async ({ page }) => {
    // A heavy session on the Monday AFTER the block: a live run's end is today, so without the freeze it would leak into "this block".
    const late = EXERCISES.map(e => (e.name === 'Bench Press' ? { ...e, sessions: [...e.sessions, ses('2026-11-02', 150)] } : e))
    await show(page, tables(), { exercises: late })
    await expect(card(page).locator('[data-block-lift]')).toHaveCount(3)
    const cardRow = await card(page).locator('[data-block-lift]').first().innerText()
    const figures = cardRow.match(/[\d.,]+ ?\w+ → [\d.,]+ ?\w+/)[0]
    await page.evaluate(() => { currentProfile = { ...currentProfile, role: 'solo' } })   // the Progress page chooses its layout by the viewer's role
    await card(page).locator('[data-block-action="review"]').click()

    const header = page.locator('[data-block-review-header]')
    await expect(header).toContainText('Operation 240')
    await expect(header).toContainText('10 Aug 26 – 1 Nov 26')
    await expect(header).toContainText('34 of 36 planned sessions done (94%)')
    await expect(page.locator('[data-blk-row="Bench Press"]')).toContainText(figures)
    await expect(page.locator('#blk-a')).toHaveValue('live:cpA')
    await expect(page.locator('#blk-b')).toHaveValue('past:1')
    await expect(page.locator('#blk-a option:checked'), 'the finished block has an end, not "now"').toContainText('1 Nov 26')

    await page.evaluate(async () => { await renderPerformance(document.getElementById('progress-tab-content')) })
    await expect(page.locator('[data-blk-summary]')).toBeVisible()
    await expect(header, 'the review is one visit').toHaveCount(0)
    await expect(page.locator('[data-blk-row="Bench Press"]'), 'and the normal page counts up to today, so the freeze above was doing something').not.toContainText(figures)
  })
})

// ─── Booking the next block, end to end ──────────────────────────────────────────────────────────────────────────────────────────
// Real clock, real writes, tagged fixtures. Dates are worked out from today, so a plan has always just ended (or is always in its last week).
test.describe('Booking the next block from Today, on the real database', () => {
  const TAG = '[E2E] BLOCKREVIEW'

  const makePlan = (page, name) => page.evaluate(async ({ name }) => {
    const must = (step, { data, error }) => { if (error || !data) throw new Error(`fixture step "${step}" failed: ${error?.code || 'no row'}`); return data }
    const prog = must('program', await db.from('programs').insert({ coach_id: currentUser.id, is_personal: true, name }).select('id').single())
    const phase = must('phase', await db.from('program_phases').insert({ program_id: prog.id, name: 'P1', duration_weeks: 2, order_index: 0 }).select('id').single())
    const tmpl = must('template', await db.from('workout_templates').insert({ coach_id: currentUser.id, is_personal: true, name, program_id: prog.id }).select('id').single())
    must('exercise', await db.from('workout_template_exercises').insert({ template_id: tmpl.id, exercise_name: 'Bench', order_index: 0, sets: 3, metric_type: 'weight_reps' }).select('id'))
    for (const week_number of [1, 2]) must('slot', await db.from('program_phase_workouts').insert({ phase_id: phase.id, template_id: tmpl.id, day_label: 'Mon', day_of_week: 1, session_order: 1, week_number }).select('id'))
    return { programId: prog.id, templateId: tmpl.id, soloId: window._soloClientId }
  }, { name })

  // Puts the plan on the account from `start` and logs three real sessions in its first week.
  const seedRun = (page, fx, name, start) => page.evaluate(async ({ fx, name, start }) => {
    const res = await _assignProgramTx('block-review-spec', fx.soloId, fx.programId, start, false)
    if (!res.ok) throw new Error('fixture assign failed: ' + res.message)
    for (const offset of [0, 2, 4]) {
      const { data: logRow, error } = await db.from('workout_logs').insert({ coach_id: currentUser.id, client_id: fx.soloId, name, date: _dashAddDays(start, offset) }).select('id').single()
      if (error) throw new Error('fixture log failed: ' + error.code)
      const { data: ex, error: exErr } = await db.from('workout_log_exercises').insert({ log_id: logRow.id, exercise_name: name + ' Bench', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0 }).select('id').single()
      if (exErr) throw new Error('fixture exercise failed: ' + exErr.code)
      const { error: setErr } = await db.from('workout_log_sets').insert({ workout_log_exercise_id: ex.id, set_number: 1, weight_kg: 60, reps_achieved: 5 })
      if (setErr) throw new Error('fixture set failed: ' + setErr.code)
    }
  }, { fx, name, start })

  // Removes everything but the archived block rows; returns what it really removed, so the caller can assert it.
  const cleanup = (page, fxs, name) => page.evaluate(async ({ fxs, name }) => {
    const soloId = fxs[0].soloId, programIds = fxs.map(f => f.programId)
    const { data: logs } = await db.from('workout_logs').select('id').eq('client_id', soloId).eq('name', name)
    const logIds = (logs || []).map(l => l.id)
    const { data: exs } = logIds.length ? await db.from('workout_log_exercises').select('id').in('log_id', logIds) : { data: [] }
    const exIds = (exs || []).map(e => e.id)
    if (exIds.length) await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exIds).select('id')
    if (logIds.length) await db.from('workout_log_exercises').delete().in('log_id', logIds).select('id')
    const { data: goneLogs } = logIds.length ? await db.from('workout_logs').delete().in('id', logIds).select('id') : { data: [] }
    await db.from('client_programs').delete().eq('client_id', soloId).in('program_id', programIds).select('id')
    await db.from('workout_templates').delete().eq('client_id', soloId).like('name', name + '%').select('id')
    const { data: progs } = await db.from('programs').delete().in('id', programIds).select('id')
    const { data: masters } = await db.from('workout_templates').delete().in('id', fxs.map(f => f.templateId)).select('id')
    return { logs: goneLogs?.length ?? -1, progs: progs?.length ?? -1, masters: masters?.length ?? -1 }
  }, { fxs, name })

  const mondayWeeksAgo = (page, n) => page.evaluate((n) => _dashAddDays(_dashMonday(_ymdLocal(new Date())), -7 * n), n)
  const repaint = (page) => page.evaluate(async () => { await renderSoloDashboard(document.getElementById('main-content')) })
  const plansOf = (page, fx) => page.evaluate(async (fx) => (await db.from('client_programs').select('id, program_id, start_date').eq('client_id', fx.soloId).eq('program_id', fx.programId)).data, fx)
  const blocksOf = (page, id) => page.evaluate(async (id) => (await db.from('client_program_blocks').select('ended_reason, start_date').eq('source_client_program_id', id)).data, id)
  // The start the card offers: the Monday after the block, or the next Monday once that has gone.
  const offeredStart = (page) => page.evaluate(() => { const t = _ymdLocal(new Date()), m = _dashMonday(t); return m === t ? t : _dashAddDays(m, 7) })

  test('Repeat this plan: preselected, dated, one Confirm with no second prompt; the finished run is archived and the Blocks page still shows it', async ({ page }) => {
    test.setTimeout(120_000)
    await soloReady(page)
    const name = `${TAG} repeat ${Date.now()}`
    const fx = await makePlan(page, name)
    let gone
    try {
      const start = await mondayWeeksAgo(page, 2)
      await seedRun(page, fx, name, start)
      const [before] = await plansOf(page, fx)
      await repaint(page)
      await expect(card(page)).toBeVisible()
      await page.evaluate(() => { window.__prompts = []; window.confirmDialog = (m) => { window.__prompts.push(m); return Promise.resolve(false) } })
      await card(page).locator('[data-block-action="repeat"]').click()
      const expected = await offeredStart(page)
      await expect(page.locator('#ap-program')).toHaveValue(fx.programId)
      await expect(page.locator('#ap-start')).toHaveValue(expected)
      await expect(page.locator('[data-block-review-note]')).toContainText('Nothing is saved until you confirm')

      // Cancel writes nothing.
      await page.locator('#assign-program-modal .btn-secondary').click()
      expect((await plansOf(page, fx))[0].id, 'cancelling keeps the plan').toBe(before.id)
      await expect(card(page), 'and the card').toBeVisible()

      // A date behind today is refused.
      await card(page).locator('[data-block-action="repeat"]').click()
      await expect(page.locator('#ap-program')).toHaveValue(fx.programId)
      await page.locator('#ap-start').fill(start)
      await page.locator('#ap-save-btn').click()
      await expect(page.locator('#ap-error')).toContainText('Choose today or a later start date')
      expect((await plansOf(page, fx))[0].id).toBe(before.id)

      await page.locator('#ap-start').fill(expected)
      await expect(page.locator('#ap-save-btn')).toHaveText('Confirm')
      await page.locator('#ap-save-btn').click()
      await expect(page.locator('#assign-program-modal')).toHaveCount(0)
      await expect(card(page), 'Today repaints and the card has gone').toHaveCount(0)
      expect(await page.evaluate(() => window.__prompts), 'no second "Restart?" prompt').toEqual([])
      const after = await plansOf(page, fx)
      expect(after).toHaveLength(1)
      expect(after[0].id).not.toBe(before.id)
      expect(after[0].start_date).toBe(expected)
      expect(await blocksOf(page, before.id)).toEqual([{ ended_reason: 'restarted', start_date: start }])

      await page.evaluate(() => { window._progressTab = 'Performance'; window._perfTab = 'Blocks'; navigate('progress') })
      await expect(page.locator('#blk-a option').filter({ hasText: name }), 'the finished run and the new booking').toHaveCount(2)
    } finally {
      gone = await cleanup(page, [fx], name)
    }
    expect(gone).toEqual({ logs: 3, progs: 1, masters: 1 })
  })

  test('Choose another plan: an empty list to pick from; the finished plan comes off (one plan at a time) and is archived; picking the same plan still asks', async ({ page }) => {
    test.setTimeout(120_000)
    await soloReady(page)
    const name = `${TAG} choose ${Date.now()}`
    const fx = await makePlan(page, name)
    const other = await makePlan(page, name + ' other')
    let gone
    try {
      const start = await mondayWeeksAgo(page, 2)
      await seedRun(page, fx, name, start)
      const [before] = await plansOf(page, fx)
      await repaint(page)
      await expect(card(page)).toBeVisible()
      await card(page).locator('[data-block-action="choose"]').click()
      await expect(page.locator('#ap-program')).toHaveValue('')
      const expected = await offeredStart(page)
      await expect(page.locator('#ap-start')).toHaveValue(expected)

      await page.evaluate(() => { window.__prompts = []; window.confirmDialog = (m) => { window.__prompts.push(m); return Promise.resolve(false) } })
      await page.locator('#ap-program').selectOption(fx.programId)
      await page.locator('#ap-save-btn').click()
      await expect.poll(() => page.evaluate(() => window.__prompts.length)).toBe(1)
      expect((await page.evaluate(() => window.__prompts))[0]).toContain('already on this plan')
      await expect(page.locator('#ap-save-btn'), 'declined: the sheet is back to how it was').toHaveText('Confirm')
      expect((await plansOf(page, fx))[0].id).toBe(before.id)

      await page.locator('#ap-program').selectOption(other.programId)
      await page.locator('#ap-save-btn').click()
      await expect(page.locator('#assign-program-modal')).toHaveCount(0)
      await expect(card(page)).toHaveCount(0)
      const booked = await plansOf(page, other)
      expect(booked.map(b => b.start_date)).toEqual([expected])
      expect(await plansOf(page, fx), 'the finished plan came off').toEqual([])
      expect(await blocksOf(page, before.id)).toEqual([{ ended_reason: 'replaced', start_date: start }])
    } finally {
      gone = await cleanup(page, [fx, other], name)
    }
    expect(gone).toEqual({ logs: 3, progs: 2, masters: 2 })
  })

  test('a card left open while a plan was booked elsewhere: Choose another does not take that booked plan off', async ({ page }) => {
    test.setTimeout(120_000)
    await soloReady(page)
    const name = `${TAG} stale ${Date.now()}`
    const fx = await makePlan(page, name)
    const chosen = await makePlan(page, name + ' chosen')
    const bookedElsewhere = await makePlan(page, name + ' booked')
    let gone
    try {
      await seedRun(page, fx, name, await mondayWeeksAgo(page, 2))
      await repaint(page)
      await expect(card(page)).toBeVisible()
      const later = await page.evaluate(() => _dashAddDays(_dashMonday(_ymdLocal(new Date())), 28))
      await page.evaluate(async ({ f, later }) => { const r = await _assignProgramTx('block-review-spec', f.soloId, f.programId, later, false); if (!r.ok) throw new Error(r.message) }, { f: bookedElsewhere, later })
      await card(page).locator('[data-block-action="choose"]').click()
      await page.locator('#ap-program').selectOption(chosen.programId)
      await page.locator('#ap-save-btn').click()
      await expect(page.locator('#assign-program-modal')).toHaveCount(0)
      expect(await plansOf(page, fx), 'the finished plan came off').toEqual([])
      expect((await plansOf(page, bookedElsewhere)).map(b => b.start_date), 'the plan booked elsewhere stayed').toEqual([later])
    } finally {
      gone = await cleanup(page, [fx, chosen, bookedElsewhere], name)
    }
    expect(gone).toEqual({ logs: 3, progs: 3, masters: 3 })
  })

  test('Plan next block from the hint: the running plan stays on, and the new one is booked to follow it', async ({ page }) => {
    test.setTimeout(120_000)
    await soloReady(page)
    const name = `${TAG} hint ${Date.now()}`
    const fx = await makePlan(page, name)
    const other = await makePlan(page, name + ' other')
    let gone
    try {
      await seedRun(page, fx, name, await mondayWeeksAgo(page, 1))
      await repaint(page)
      await expect(hint(page)).toBeVisible()
      await hint(page).locator('[data-block-action="plan-next"]').click()
      await expect(page.locator('#assign-program-modal .modal-title')).toHaveText('Plan next block')
      await expect(page.locator('#ap-program option[value="' + fx.programId + '"]'), 'the running plan is not offered').toHaveCount(0)
      const nextMonday = await page.evaluate(() => _dashAddDays(_dashMonday(_ymdLocal(new Date())), 7))
      await expect(page.locator('#ap-start')).toHaveValue(nextMonday)
      await page.locator('#ap-program').selectOption(other.programId)
      await page.locator('#ap-save-btn').click()
      await expect(page.locator('#assign-program-modal')).toHaveCount(0)
      await expect(hint(page), 'something is booked, so the hint has gone').toHaveCount(0)
      expect(await plansOf(page, fx), 'still on the running plan').toHaveLength(1)
      expect((await plansOf(page, other)).map(b => b.start_date)).toEqual([nextMonday])
    } finally {
      gone = await cleanup(page, [fx, other], name)
    }
    expect(gone).toEqual({ logs: 3, progs: 2, masters: 2 })
  })
})
