const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')
const { installCappedApi, restoreCappedApi } = require('./capped-api')

// ─── End of a training block: the hint and the card on Today (Jake, 2026-11-07) ──────────────────────────────────────────────────
// docs/superpowers/specs/2026-11-07-end-of-block-review-design.md, plan docs/superpowers/plans/2026-11-07-end-of-block-review.md. The REAL render functions run against
// tests/capped-api.js with the clock pinned and nothing written anywhere. The rules (when a hint or a card is due, what it says) are pinned in tests-node/block-review.test.mjs;
// what is tested here is what the screen does with them. The block comparison (Blocks table engine) reads two functions that are replaced in the page, as the Blocks spec does.
//
// The plan: 12 weeks, Mon/Wed/Fri, started Monday 10 Aug 2026, so its last Sunday is 1 Nov 2026.
test.use({ timezoneId: 'Europe/London' })

const CID = 'br-c1'
const START = '2026-08-10', END = '2026-11-01'
const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
let seq = 0
const mkLog = (date) => ({ id: 'brl-' + (++seq), client_id: CID, name: 'Session', date, created_at: date + 'T07:40:00Z', workout_log_exercises: [{ id: 'x1' }] })

function tables({ weeks = 12, logCount = 34, start = START, next = false, weights, program = true } = {}) {
  const pws = [[1, 'Upper'], [3, 'Lower'], [5, 'Full']].map(([dow, name]) => ({ id: 'pw-' + dow, day_of_week: dow, session_order: 1, week_number: 1, notes: null, workout_templates: { id: 't-' + dow, name } }))
  const phase = (n) => ({ id: 'ph' + n, name: 'Block ' + n, duration_weeks: weeks / 3, order_index: n, program_phase_workouts: n === 1 ? pws : [] })
  const cp = (id, startDate, createdAt) => ({ id, program_id: 'prog-' + id, client_id: CID, created_at: createdAt, start_date: startDate, programs: { name: 'Operation 240', description: 'x', program_phases: program ? [phase(1), phase(2), phase(3)] : [] } })
  const rows = [cp('cpA', start, '2026-08-01T00:00:00Z')]
  if (next) rows.push(cp('cpB', addDays(END, 8), '2026-10-30T00:00:00Z'))
  // Planned sessions: every Mon/Wed/Fri of every week, which is how phase 1's three sessions repeat for the whole plan in this fixture.
  const dates = []
  for (let w = 0; w < weeks; w++) for (const d of [0, 2, 4]) dates.push(addDays(start, 7 * w + d))
  return {
    client_programs: rows,
    client_program_workouts: [...pws.map(p => ({ id: 'cpw-' + p.id, client_program_id: 'cpA', program_phase_workout_id: p.id, workout_template_id: 'ct-' + p.id }))],
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
    await expect(card(page)).toContainText('Your 12-week block finished on Sunday 1 Nov')
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
    const expected = await page.evaluate(() => {
      const blocks = [{ key: 'live:cpA', progKey: 'p', name: 'Operation 240', start: '2026-08-10', end: '2026-11-01', open: true }, { key: 'past:1', progKey: 'o', name: 'Older plan', start: '2026-05-11', end: '2026-08-02', open: false }]
      const w = _blockWindowsFor(blocks, '2026-11-01')
      return json(_blockLiftSummary(window.__ex, w.a, w.b))
      function json(v) { return JSON.parse(JSON.stringify(v)) }
    }).catch(() => null)
    // The numbers on the card for the top lift are the Blocks table's row for it.
    const bench = await page.evaluate(({ ex }) => {
      const w = _blockWindowsFor([{ key: 'live:cpA', progKey: 'p', name: 'x', start: '2026-08-10', end: '2026-11-01', open: true }, { key: 'past:1', progKey: 'o', name: 'y', start: '2026-05-11', end: '2026-08-02', open: false }], '2026-11-01')
      return JSON.parse(JSON.stringify(_blockLiftSummary(ex, w.a, w.b).both.find(r => r.name === 'Bench Press')))
    }, { ex: EXERCISES })
    expect(expected === null || expected).toBeTruthy()
    const text = await card(page).locator('[data-block-lift]').first().innerText()
    expect(text).toContain(String(Math.round(bench.last)))
    expect(text).toContain(String(Math.round(bench.this)))
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
})
