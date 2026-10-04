// The program page rework (Jake, 2026-10-04: "UI of this page needs to be improved (much like we have just done with the dashboard)").
//
// An overview first - phases, weeks, sessions a week, one bar with a block per phase - then each phase a fold-up card; inside an open
// phase the week is a row of tabs and the days are slim rows; Edit / Remove a phase and Duplicate / Delete a week sit behind ⋯ sheets.
// The builder underneath (week tabs, .pwk-* slots, handlers) is unchanged and is covered by the existing builder specs; this file pins
// what is NEW: what is on screen when, what is NOT in the DOM while a phase is folded, where the occasional controls went, and that
// nothing a coach types ever becomes markup. The phone is the default viewport of this suite (390 px); the desktop week grid is
// checked at 1280 px so the 7-column week is shown to be unchanged.
const { test, expect } = require('./fixtures')
const { loginAsPT, acceptConfirm, declineConfirm } = require('./helpers')

const TAG = '[E2E] PgmPage'

// Sweep by name - deleting the program alone strands its templates (periodization-metric-type-2026-08-09.spec.js explains why).
async function sweep (page) {
  const r = await page.evaluate(async (TAG) => {
    const out = { programsFound: 0, programsRemoved: 0, exRemoved: 0, templatesFound: 0, templatesRemoved: 0 }
    const { data: progs } = await db.from('programs').select('id').eq('coach_id', currentUser.id).like('name', TAG + '%')
    out.programsFound = (progs || []).length
    for (const p of progs || []) {
      await db.from('client_programs').delete().eq('program_id', p.id).select('id')
      const { data } = await db.from('programs').delete().eq('id', p.id).select('id'); out.programsRemoved += (data || []).length
    }
    const { data: tmpls } = await db.from('workout_templates').select('id').eq('coach_id', currentUser.id).like('name', TAG + '%')
    const ids = (tmpls || []).map(t => t.id)
    out.templatesFound = ids.length
    if (ids.length) {
      const { data: exs } = await db.from('workout_template_exercises').delete().in('template_id', ids).select('id')
      out.exRemoved = (exs || []).length
      const { data: ts } = await db.from('workout_templates').delete().in('id', ids).select('id')
      out.templatesRemoved = (ts || []).length
    }
    return out
  }, TAG)
  if (r.programsRemoved !== r.programsFound || r.templatesRemoved !== r.templatesFound) console.warn(`[program-page] CLEANUP INCOMPLETE: ${JSON.stringify(r)}`)
}

// phases: [{ name, weeks, type?, config?, rowsForWeeks?, week1: [{ name, day, label, order? }] }] - a session's row is written for
// every week up to rowsForWeeks (default 1), all pointing at the one template, as "Duplicate week" leaves them.
const seed = (page, { name = TAG + ' Program', description = null, isPersonal = false, assignWeeksAgo = null, phases }) => page.evaluate(async ({ TAG, name, description, isPersonal, assignWeeksAgo, phases }) => {
  const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name, description, is_personal: isPersonal }).select('id').single()
  const out = { programId: prog.id, phases: [] }
  let order = 0
  for (const ph of phases) {
    const { data: phase } = await db.from('program_phases').insert({
      program_id: prog.id, name: ph.name, duration_weeks: ph.weeks, order_index: order++,
      periodization_type: ph.type ?? null, periodization_config: ph.config ?? null
    }).select('id').single()
    const rows = []
    for (const slot of ph.week1 || []) {
      const { data: t } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: `${TAG} ${slot.name}` }).select('id').single()
      await db.from('workout_template_exercises').insert([{
        template_id: t.id, exercise_name: `${TAG} Bench`, exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0, sets_json: [{ repsMin: '5' }, { repsMin: '5' }]
      }])
      for (let w = 1; w <= (ph.rowsForWeeks ?? 1); w++) {
        rows.push({ phase_id: phase.id, day_of_week: slot.day, day_label: slot.label, session_order: slot.order ?? 1, template_id: t.id, week_number: w })
      }
    }
    if (rows.length) await db.from('program_phase_workouts').insert(rows)
    out.phases.push({ id: phase.id, name: ph.name })
  }
  // The viewer's OWN plan (their solo record) started this many Monday-to-Sunday weeks ago (negative: that many weeks from now).
  if (assignWeeksAgo !== null) {
    const monday = _mondayOfWeek(_ymdLocal(new Date()))
    monday.setDate(monday.getDate() - assignWeeksAgo * 7)
    const { error } = await db.from('client_programs').insert({ client_id: window._soloClientId, program_id: prog.id, start_date: _ymdLocal(monday) })
    if (error) throw new Error('assignment: ' + error.message)
  }
  return out
}, { TAG, name, description, isPersonal, assignWeeksAgo, phases })

const MON = { name: 'Upper', day: 1, label: 'Monday' }, WED = { name: 'Lower', day: 3, label: 'Wednesday' }
const THU = { name: 'Legs', day: 4, label: 'Thursday' }, FRI = { name: 'Full', day: 5, label: 'Friday' }

// The main fixture: four phases of different shapes.
const MAIN = {
  description: 'Twelve weeks of building, then a peak.',
  phases: [
    { name: 'Accumulation', weeks: 4, type: 'linear', config: { startPct: 65, endPct: 85 }, rowsForWeeks: 4, week1: [MON, WED, FRI] },
    { name: 'Intensification', weeks: 3, type: 'linear', config: { basis: 'rpe', startRpe: 7, endRpe: 9 }, rowsForWeeks: 3, week1: [MON, THU] },
    { name: 'Peak', weeks: 2, week1: [MON] },
    { name: 'Test maxes', weeks: 1 }
  ]
}

const open = async (page, s) => {
  await page.evaluate(id => openProgram(id), s.programId)
  await page.waitForSelector(`#ph-${s.phases[0].id}`, { timeout: 10000 })
}
const card = (s, i) => `#ph-${s.phases[i].id}`
const header = (s, i) => `${card(s, i)} .pgm-ph-h`

test.describe('Program page - the overview and the fold-up phases', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await sweep(page) })
  test.afterEach(async ({ page }) => { await sweep(page) })

  test('the top says what the program is: phases, weeks, sessions a week, and a bar with a block per phase', async ({ page }) => {
    const s = await seed(page, MAIN)
    await open(page, s)
    await expect(page.locator('h1')).toHaveText(TAG + ' Program')
    // sessions a week is read after the page paints: Accumulation has 3, Intensification 2, Peak 1, Test maxes none
    await expect(page.locator('.pgm-facts')).toHaveText('4 phases · 10 weeks · 1–3 sessions a week', { timeout: 8000 })

    const segs = page.locator('.pgm-seg')
    await expect(segs).toHaveCount(4)
    await expect(segs.nth(0)).toHaveClass(/\bpct\b/)
    await expect(segs.nth(1)).toHaveClass(/\brpe\b/)
    await expect(segs.nth(2)).toHaveClass(/\bnone\b/)
    expect(await segs.evaluateAll(els => els.map(e => getComputedStyle(e).flexGrow)), 'each block is as wide as its weeks').toEqual(['4', '3', '2', '1'])
    expect(await segs.allInnerTexts(), 'numbered like the cards').toEqual(['1', '2', '3', '4'])
    await expect(page.locator('.pgm-legend')).toContainText('RPE')
    expect(await page.evaluate(() => document.body.scrollWidth), 'nothing forces a sideways scroll on a phone').toBeLessThanOrEqual(390)
  })

  test('phases fold up: only the first is open, a folded phase has nothing in the DOM, and unfolding paints it from the cache', async ({ page }) => {
    const s = await seed(page, MAIN)
    await open(page, s)
    await expect(page.locator(header(s, 0))).toHaveAttribute('aria-expanded', 'true')
    for (const i of [1, 2, 3]) await expect(page.locator(header(s, i)), `phase ${i + 1} starts folded`).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#pgm-open-count')).toHaveText('1 open')

    // a folded card is one line: number, name, weeks, sessions a week, method chip - and NOTHING of the builder
    const second = page.locator(card(s, 1))
    await expect(second).toContainText('Intensification')
    await expect(second).toContainText('3 weeks')
    await expect(second).toContainText('2 sessions a week')
    await expect(second.locator('.pgm-chip')).toHaveText('Linear RPE 7→9')
    await expect(page.locator(`${card(s, 1)} .pwk-day`)).toHaveCount(0)
    await expect(page.locator(`#phase-workouts-${s.phases[1].id}`)).toHaveCount(0)
    await expect(page.locator(card(s, 3))).toContainText('no sessions yet')

    // unfold it: the week tabs and the seven days appear
    await page.click(header(s, 1))
    await expect(page.locator(header(s, 1))).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator(`${card(s, 1)} .week-tab`)).toHaveCount(3)
    await expect(page.locator(`${card(s, 1)} .pwk-day`)).toHaveCount(7)
    await expect(page.locator('#pgm-open-count')).toHaveText('2 open')
    await expect(page.locator('.pgm-seg').nth(1), 'its block in the bar is marked').toHaveAttribute('aria-pressed', 'true')

    // the choice survives the repaint every add / remove / generate triggers, on THIS program
    await page.evaluate(id => openProgram(id), s.programId)
    await expect(page.locator(header(s, 1))).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#pgm-open-count')).toHaveText('2 open')

    // ... and folds again with nothing left behind
    await page.click(header(s, 1))
    await expect(page.locator(`${card(s, 1)} .pwk-day`)).toHaveCount(0)
    await expect(page.locator('#pgm-open-count')).toHaveText('1 open')
  })

  test('another program starts with just its first phase open', async ({ page }) => {
    const a = await seed(page, { name: TAG + ' A', phases: [{ name: 'One', weeks: 2, week1: [MON] }, { name: 'Two', weeks: 2, week1: [MON] }] })
    const b = await seed(page, { name: TAG + ' B', phases: [{ name: 'Alpha', weeks: 2, week1: [MON] }, { name: 'Beta', weeks: 2, week1: [MON] }] })
    await open(page, a)
    await page.click(header(a, 1))
    await expect(page.locator('#pgm-open-count')).toHaveText('2 open')
    await open(page, b)
    await expect(page.locator(header(b, 0))).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator(header(b, 1))).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#pgm-open-count')).toHaveText('1 open')
  })

  test('a block in the bar opens its phase and brings it into view', async ({ page }) => {
    const s = await seed(page, MAIN)
    await open(page, s)
    await page.locator('.pgm-seg').nth(2).click()
    await expect(page.locator(header(s, 2))).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.pgm-seg').nth(2)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(header(s, 2))).toBeInViewport()
    // tapping a block of an OPEN phase leaves it open
    await page.locator('.pgm-seg').nth(0).click()
    await expect(page.locator(header(s, 0))).toHaveAttribute('aria-expanded', 'true')
  })

  test('the periodization row sits inside an open phase: Edit and Generate when set, Add when not, nothing for a one-week phase', async ({ page }) => {
    const s = await seed(page, MAIN)
    await open(page, s)
    const first = page.locator(card(s, 0))
    await expect(first.getByRole('button', { name: 'Edit periodization' })).toBeVisible()
    await expect(first.getByRole('button', { name: 'Generate weeks' })).toBeVisible()
    await expect(first.locator('.pgm-chip'), 'the method is named once, in the header').toHaveCount(1)
    await page.click(header(s, 2))
    await expect(page.locator(card(s, 2)).getByRole('button', { name: 'Add periodization' })).toBeVisible()
    await expect(page.locator(card(s, 2)).getByRole('button', { name: 'Generate weeks' })).toHaveCount(0)
    await page.click(header(s, 3))
    await expect(page.locator(card(s, 3)).getByRole('button', { name: /periodization/ }), 'one week has nothing to periodize').toHaveCount(0)
  })

  test('the description is clamped to two lines with "Show more" only when it is really cut off', async ({ page }) => {
    const long = Array.from({ length: 40 }, (_, i) => `Week ${i + 1} builds on the one before it.`).join(' ')
    const a = await seed(page, { name: TAG + ' Long', description: long, phases: [{ name: 'One', weeks: 2, week1: [MON] }] })
    await open(page, a)
    const desc = page.locator('#pgm-desc')
    await expect(desc).toHaveClass(/is-clamped/)
    await expect(page.locator('#pgm-more')).toBeVisible()
    await expect(page.locator('#pgm-more')).toHaveText('Show more')
    expect(await desc.evaluate(e => e.clientHeight), 'two lines, not forty').toBeLessThan(70)
    await page.click('#pgm-more')
    await expect(desc).not.toHaveClass(/is-clamped/)
    await expect(page.locator('#pgm-more')).toHaveText('Show less')
    expect(await desc.evaluate(e => e.clientHeight), 'the whole text').toBeGreaterThan(150)
    await page.click('#pgm-more')
    await expect(desc).toHaveClass(/is-clamped/)

    await sweep(page)
    const b = await seed(page, { name: TAG + ' Short', description: 'A short note.', phases: [{ name: 'One', weeks: 2, week1: [MON] }] })
    await open(page, b)
    await expect(page.locator('#pgm-desc')).toHaveText('A short note.')
    await expect(page.locator('#pgm-more'), 'nothing to expand').toBeHidden()
    await sweep(page)
    const c = await seed(page, { name: TAG + ' None', phases: [{ name: 'One', weeks: 2, week1: [MON] }] })
    await open(page, c)
    await expect(page.locator('#pgm-desc')).toHaveCount(0)
  })
})

test.describe('Program page - the days, the weeks and the ⋯ sheets', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await sweep(page) })
  test.afterEach(async ({ page }) => { await sweep(page) })

  test('the week is seven slim rows: a rest day is one thin line with + Add, a day with a workout opens its panel', async ({ page }) => {
    const s = await seed(page, MAIN)
    await open(page, s)
    const days = page.locator(`${card(s, 0)} .pwk-day`)
    await expect(days).toHaveCount(7)
    expect(await days.evaluateAll(els => els.map(e => e.classList.contains('is-empty'))), 'Mon Wed Fri have a workout').toEqual([false, true, false, true, false, true, true])

    const heights = await days.evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)))
    for (const [i, h] of heights.entries()) {
      const rest = [1, 3, 5, 6].includes(i)
      expect(h, `day ${i + 1} (${rest ? 'rest' : 'workout'}) is a slim row`).toBeLessThanOrEqual(rest ? 44 : 60)
    }
    // a rest day says so and offers + Add with the data the picker needs
    const restRow = days.nth(1)
    await expect(restRow.locator('.pwk-rest')).toHaveText('Rest')
    const add = restRow.locator('button.pwg-add')
    await expect(add).toHaveAttribute('data-day', '2')
    await expect(add).toHaveAttribute('data-session', '1')
    await expect(add).toHaveAttribute('data-week', '1')
    await expect(add).toHaveAttribute('data-phase', s.phases[0].id)
    // a day with a workout has no always-visible add button
    await expect(days.nth(0).locator('button.pwg-add')).toHaveCount(0)

    // tapping the workout opens its panel: exercises, Edit / Remove, Save to Library, and a way to add a second workout that day
    await days.nth(0).locator('.pwk-slot-head').click()
    const detail = page.locator(`${card(s, 0)} .pwk-detail`)
    await expect(detail).toBeVisible()
    await expect(detail.locator('.pwk-ex').first()).toBeVisible()
    await expect(detail.locator('.pwk-act.edit')).toBeVisible()
    await expect(detail.locator('.pwk-act.remove')).toBeVisible()
    await expect(detail.getByRole('button', { name: 'Save to Library' })).toBeVisible()
    const second = detail.locator('button.pwg-add')
    await expect(second).toHaveText('+ Add a second workout on this day')
    await expect(second).toHaveAttribute('data-day', '1')
    await expect(second).toHaveAttribute('data-session', '2')
    // and it really opens the picker for the second slot
    await second.click()
    await expect(page.locator('#workout-picker-modal')).toBeVisible({ timeout: 5000 })
    await page.click('#workout-picker-modal .modal-close')
    expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(390)
  })

  test('a day that already has two workouts offers no third', async ({ page }) => {
    const s = await seed(page, { phases: [{ name: 'Two a day', weeks: 2, week1: [MON, { name: 'Evening', day: 1, label: 'Monday', order: 2 }] }] })
    await open(page, s)
    await expect(page.locator(`${card(s, 0)} .pwk-slot`)).toHaveCount(2)
    const [a, b] = await page.locator(`${card(s, 0)} .pwk-slot`).evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { y: r.top, w: r.width } }))
    expect(b.y, 'the second workout sits under the first, not squeezed beside it').toBeGreaterThan(a.y + 10)
    expect(Math.min(a.w, b.w), 'and both have room for a name on a phone').toBeGreaterThan(150)
    await page.locator(`${card(s, 0)} .pwk-slot-head`).first().click()
    await expect(page.locator(`${card(s, 0)} .pwk-detail`)).toBeVisible()
    await expect(page.locator(`${card(s, 0)} .pwk-detail button.pwg-add`)).toHaveCount(0)
  })

  test('on a desktop the week keeps its seven columns', async ({ page }) => {
    const s = await seed(page, MAIN)
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page, s)
    await expect(page.locator(`${card(s, 0)} .pwk-day`)).toHaveCount(7)
    const cols = await page.locator(`${card(s, 0)} .pwk-days`).evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length)
    expect(cols).toBe(7)
    expect(await page.locator(`${card(s, 0)} .pwk-day`).first().evaluate(e => getComputedStyle(e).display), 'a day is a column cell, not a phone row').not.toBe('flex')
    await expect(page.locator(`${card(s, 0)} .pwk-rest`).first(), 'the phone-only "Rest" label stays hidden').toBeHidden()
  })

  test('the phase ⋯ holds Edit and Remove; Edit fills the form, Remove asks first and Cancel leaves it', async ({ page }) => {
    const s = await seed(page, MAIN)
    await open(page, s)
    await page.locator(`${card(s, 0)} .pgm-ph-menu`).click()
    const sheet = page.locator('#pgm-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet.locator('.modal-title')).toHaveText('Accumulation')
    await expect(sheet.getByRole('button', { name: 'Edit phase' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Remove phase' })).toBeVisible()

    await sheet.getByRole('button', { name: 'Edit phase' }).click()
    await expect(sheet).toHaveCount(0)
    await expect(page.locator('#phase-form')).toBeVisible()
    await expect(page.locator('#phase-form-title')).toHaveText('Edit phase')
    await expect(page.locator('#pf-name')).toHaveValue('Accumulation')
    await expect(page.locator('#pf-weeks')).toHaveValue('4')
    await page.click('#phase-form button:has-text("Cancel")')

    await page.locator(`${card(s, 0)} .pgm-ph-menu`).click()
    await page.locator('#pgm-sheet').getByRole('button', { name: 'Remove phase' }).click()
    await expect(page.locator('#confirm-dialog')).toBeVisible()
    await declineConfirm(page)
    await expect(page.locator('.pgm-ph')).toHaveCount(4)

    // tapping outside the sheet closes it without doing anything
    await page.locator(`${card(s, 0)} .pgm-ph-menu`).click()
    await expect(page.locator('#pgm-sheet')).toBeVisible()
    await page.locator('#pgm-sheet').click({ position: { x: 5, y: 5 } })
    await expect(page.locator('#pgm-sheet')).toHaveCount(0)
    await expect(page.locator('.pgm-ph')).toHaveCount(4)
  })

  test('Remove phase, once confirmed, removes it', async ({ page }) => {
    const s = await seed(page, MAIN)
    await open(page, s)
    await page.locator(`${card(s, 2)} .pgm-ph-menu`).click()
    await page.locator('#pgm-sheet').getByRole('button', { name: 'Remove phase' }).click()
    await acceptConfirm(page)
    await expect(page.locator('.pgm-ph')).toHaveCount(3, { timeout: 8000 })
    await expect(page.locator('.pgm-facts')).toContainText('3 phases · 8 weeks')
  })

  test('the week ⋯ holds Duplicate week and Delete week for the week on screen; Delete asks first', async ({ page }) => {
    const s = await seed(page, MAIN)
    await open(page, s)
    // the sheet is about the week the tab row has selected
    await page.locator(`${card(s, 0)} .week-tab[data-week="3"]`).click()
    await page.locator(`${card(s, 0)} button[aria-label="Week actions"]`).click()
    const sheet = page.locator('#pgm-sheet')
    await expect(sheet.locator('.modal-title')).toHaveText('Week 3')
    await expect(sheet.getByRole('button', { name: 'Duplicate week' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Delete week' })).toBeVisible()

    await sheet.getByRole('button', { name: 'Duplicate week' }).click()
    await expect(page.locator('#dup-week-modal .modal-title')).toHaveText('Duplicate Week 3')
    await page.click('#dup-week-modal .modal-close')

    await page.locator(`${card(s, 0)} button[aria-label="Week actions"]`).click()
    await page.locator('#pgm-sheet').getByRole('button', { name: 'Delete week' }).click()
    await expect(page.locator('#confirm-dialog')).toBeVisible()
    await declineConfirm(page)
    await expect(page.locator(`${card(s, 0)} .week-tab`)).toHaveCount(4)
  })

  test('deleting a week updates the week count everywhere on the page, not just the grid', async ({ page }) => {
    const s = await seed(page, { phases: [{ name: 'Block', weeks: 3, rowsForWeeks: 3, week1: [MON, WED] }] })
    await open(page, s)
    await expect(page.locator('.pgm-facts')).toContainText('1 phase · 3 weeks')
    await expect(page.locator(card(s, 0))).toContainText('3 weeks')
    expect(await page.locator('.pgm-seg').evaluate(e => getComputedStyle(e).flexGrow), 'its block is three weeks wide').toBe('3')
    await page.locator(`${card(s, 0)} .week-tab[data-week="2"]`).click()
    await page.locator(`${card(s, 0)} button[aria-label="Week actions"]`).click()
    await page.locator('#pgm-sheet').getByRole('button', { name: 'Delete week' }).click()
    await acceptConfirm(page)
    await expect(page.locator(`${card(s, 0)} .week-tab`)).toHaveCount(2, { timeout: 15000 })
    await expect(page.locator('.pgm-facts'), 'the overview line').toContainText('1 phase · 2 weeks')
    await expect(page.locator(card(s, 0)), 'the card header').toContainText('2 weeks')
    expect(await page.locator('.pgm-seg').evaluate(e => getComputedStyle(e).flexGrow), 'and the bar').toBe('2')
  })

  test('a sheet row whose phase is no longer on the page does nothing', async ({ page }) => {
    const s = await seed(page, { phases: [{ name: 'One', weeks: 2, rowsForWeeks: 2, week1: [MON] }] })
    await open(page, s)
    // record the calls instead of waiting for something not to happen
    const calls = await page.evaluate((realPhaseId) => {
      const log = []
      window.showDuplicateWeekModal = (...a) => log.push(['dup', ...a])
      window.deletePhaseWeek = (...a) => log.push(['del', ...a])
      window.deletePhase = (...a) => log.push(['remove', ...a])
      window.showEditPhaseForm = (...a) => log.push(['edit', ...a])
      const unknown = crypto.randomUUID()
      for (const kind of ['dup-week', 'del-week', 'remove-phase', 'edit-phase']) {
        window._pgmMenu = { programId: window._openProgramId, phaseId: unknown, week: 1 }
        pgmMenuDo(kind)
      }
      const none = log.length
      for (const kind of ['dup-week', 'del-week', 'remove-phase', 'edit-phase']) {
        window._pgmMenu = { programId: window._openProgramId, phaseId: realPhaseId, week: 1 }
        pgmMenuDo(kind)
      }
      return { none, all: log.map(c => c[0]) }
    }, s.phases[0].id)
    expect(calls.none, 'a phase that is not on the page: nothing is called').toBe(0)
    expect(calls.all, 'and for the phase that is, each row calls its own handler').toEqual(['dup', 'del', 'remove', 'edit'])
  })

  test('Duplicate week from the sheet adds the copy and the new tab', async ({ page }) => {
    const s = await seed(page, { phases: [{ name: 'Block', weeks: 3, rowsForWeeks: 1, week1: [MON, WED] }] })
    await open(page, s)
    await expect(page.locator(`${card(s, 0)} .pwk-slot`).first(), 'the sessions have loaded').toBeVisible()
    await expect(page.locator(`${card(s, 0)} .week-tab`), 'one week of sessions, so no tab row yet').toHaveCount(0)
    await page.locator(`${card(s, 0)} button[aria-label="Week actions"]`).click()
    await page.locator('#pgm-sheet').getByRole('button', { name: 'Duplicate week' }).click()
    await page.locator('#dup-week-modal button:text-is("1×")').click()
    await expect(page.locator(`${card(s, 0)} .week-tab[data-week="2"]`)).toBeVisible({ timeout: 15000 })
  })

  test('a week with no workouts says why there is nothing to duplicate or delete', async ({ page }) => {
    const s = await seed(page, { phases: [{ name: 'Empty block', weeks: 2 }] })
    await open(page, s)
    await page.locator(`${card(s, 0)} button[aria-label="Week actions"]`).click()
    const sheet = page.locator('#pgm-sheet')
    await expect(sheet).toContainText('no workouts yet')
    await expect(sheet.getByRole('button', { name: 'Duplicate week' })).toHaveCount(0)
    await expect(sheet.getByRole('button', { name: 'Delete week' })).toHaveCount(0)
    await page.click('#pgm-sheet .modal-close')
    // a phase with a single week has no tabs: its week menu still sits at the right edge, not alone at the left
    const [btn, body] = [await page.locator(`${card(s, 0)} button[aria-label="Week actions"]`).boundingBox(), await page.locator(`${card(s, 0)} .pgm-ph-body`).boundingBox()]
    expect(body.x + body.width - (btn.x + btn.width), 'the week menu hugs the right edge').toBeLessThan(20)
  })

  test('a personal program has no Assign button, and no empty strip where it would be', async ({ page }) => {
    const personal = await seed(page, { name: TAG + ' Personal', isPersonal: true, phases: [{ name: 'One', weeks: 2, week1: [MON] }] })
    await open(page, personal)
    await expect(page.locator('.pgm-cta'), 'nothing to reserve room for').toHaveCount(0)
    await expect(page.getByRole('button', { name: /Assign to client|Add to my plan/ })).toHaveCount(0)
    await sweep(page)
    const coaching = await seed(page, { name: TAG + ' Coaching', phases: [{ name: 'One', weeks: 2, week1: [MON] }] })
    await open(page, coaching)
    await expect(page.locator('.pgm-cta .btn')).toHaveCount(1)
  })

  test('a block in the bar keeps keyboard focus after it opens its phase', async ({ page }) => {
    const s = await seed(page, MAIN)
    await open(page, s)
    await page.locator('.pgm-seg').nth(2).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator(header(s, 2))).toHaveAttribute('aria-expanded', 'true')
    expect(await page.evaluate(() => [...document.querySelectorAll('#pgm-tl .pgm-seg')].indexOf(document.activeElement)), 'focus is still on block 3').toBe(2)
  })

  test('a new visit starts with no cached sessions, and an open dialog describes Week 1 only once it has been read', async ({ page }) => {
    const s = await seed(page, { phases: [{ name: 'Block', weeks: 3, type: 'linear', config: { basis: 'rpe', startRpe: 7, endRpe: 9 }, rowsForWeeks: 1, week1: [MON] }] })
    await open(page, s)
    await expect(page.locator('#pgm-sess-' + s.phases[0].id)).toContainText('1 session a week')
    // (1) the cache is emptied the moment a visit starts - the previous visit's Week 1 is never described again
    const during = await page.evaluate(async (id) => { const p = openProgram(id); const n = Object.keys(window._builderWeekData).length; await p; return n }, s.programId)
    expect(during, 'no cached sessions at the start of a visit').toBe(0)
    await expect(page.locator('#pgm-sess-' + s.phases[0].id)).toContainText('1 session a week')
    // (2) hold the sessions back, open the dialog from the card that has already painted, and watch the heads-up arrive by itself
    await page.route(/\/rest\/v1\/program_phase_workouts\?/, async route => { await new Promise(r => setTimeout(r, 2500)); await route.continue() })
    await page.evaluate(id => { openProgram(id) }, s.programId)
    await page.click(`${card(s, 0)} button:has-text("Edit periodization")`)
    await expect(page.locator('#periodization-modal')).toBeVisible()
    await expect(page.locator('#pz-check .pz-note'), 'nothing is claimed about a Week 1 that has not been read').toHaveCount(0)
    await expect(page.locator('#pz-check .pz-note'), 'and the heads-up appears by itself when the sessions land').toBeVisible({ timeout: 15000 })
  })

  test('a program with no phases says so, has no bar and no count, and + Add phase still works', async ({ page }) => {
    const s = await seed(page, { phases: [] })
    await page.evaluate(id => openProgram(id), s.programId)
    await page.waitForSelector('.pgm-addph', { timeout: 10000 })
    await expect(page.locator('#phases-list')).toContainText('No phases yet')
    await expect(page.locator('.pgm-seg')).toHaveCount(0)
    await expect(page.locator('#pgm-open-count'), 'no "0 open"').toHaveText('')
    await expect(page.locator('.pgm-facts')).toHaveText('0 phases · 0 weeks')
    await page.click('.pgm-addph')
    await page.fill('#pf-name', TAG + ' First')
    await page.fill('#pf-weeks', '2')
    await page.click('#pf-save-btn')
    await expect(page.locator('.pgm-ph')).toHaveCount(1, { timeout: 8000 })
    await expect(page.locator('.pgm-ph-h'), 'the first phase of an empty program opens').toHaveAttribute('aria-expanded', 'true')
  })

  test('+ Add phase is the last thing in the list and opens the form under it', async ({ page }) => {
    const s = await seed(page, MAIN)
    await open(page, s)
    const addBtn = page.locator('.pgm-addph')
    await expect(addBtn).toHaveText('+ Add phase')
    const [listBox, btnBox] = [await page.locator('#phases-list').boundingBox(), await addBtn.boundingBox()]
    expect(btnBox.y, 'below the last phase card').toBeGreaterThan(listBox.y + listBox.height - 1)
    await addBtn.click()
    await expect(page.locator('#phase-form')).toBeVisible()
    await expect(page.locator('#phase-form-title')).toHaveText('Add phase')
    await page.fill('#pf-name', TAG + ' Added')
    await page.fill('#pf-weeks', '2')
    await page.click('#pf-save-btn')
    await expect(page.locator('.pgm-ph')).toHaveCount(5, { timeout: 8000 })
    await expect(page.locator('.pgm-facts')).toContainText('5 phases · 12 weeks')
    // the new phase is folded; the one you had open stays open
    await expect(page.locator('.pgm-ph-h').last()).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.pgm-ph-h').first()).toHaveAttribute('aria-expanded', 'true')
  })

  test('Manage keeps its actions and gains Units and preferences', async ({ page }) => {
    const s = await seed(page, MAIN)
    await open(page, s)
    await page.click('button:has-text("Manage")')
    const manage = page.locator('#program-manage-modal')
    await expect(manage).toBeVisible()
    for (const label of ['Edit name and description', 'Copy workouts to Library', 'Delete program']) {
      await expect(manage.locator(`button:text-is("${label}")`)).toBeVisible()
    }
    await manage.getByRole('button', { name: /Units and preferences/ }).click()
    await expect(manage).toBeHidden()
    await expect(page.locator('#quick-prefs-modal')).toBeVisible({ timeout: 4000 })
  })
})

test.describe('Program page - the phase your plan is in', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await sweep(page) })
  test.afterEach(async ({ page }) => { await sweep(page) })

  // Three phases of 2, 3 and 2 weeks: weeks 1-2, 3-5 and 6-7 of the plan.
  const THREE = [{ name: 'One', weeks: 2, week1: [MON] }, { name: 'Two', weeks: 3, week1: [MON] }, { name: 'Three', weeks: 2, week1: [MON] }]
  const folded = async (page, s, i) => expect(page.locator(header(s, i))).toHaveAttribute('aria-expanded', 'false')
  const opened = async (page, s, i) => expect(page.locator(header(s, i))).toHaveAttribute('aria-expanded', 'true')

  test('a plan that is running opens ITS phase, marks it Now, and leaves the others folded', async ({ page }) => {
    const s = await seed(page, { assignWeeksAgo: 3, phases: THREE })   // week 4 of 7, so phase Two
    expect(await page.evaluate(() => !!window._soloClientId), 'this account has a solo record to follow plans with').toBe(true)
    await open(page, s)
    await opened(page, s, 1)
    await folded(page, s, 0)
    await folded(page, s, 2)
    await expect(page.locator(`${card(s, 1)} .pgm-now`)).toHaveText('Now')
    await expect(page.locator('.pgm-now'), 'only one phase is Now').toHaveCount(1)
    await expect(page.locator('.pgm-seg').nth(1), 'its block in the bar is the pressed one').toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#pgm-open-count')).toHaveText('1 open')
    await expect(page.locator(`${card(s, 1)} .pwk-day`), 'and it is painted, not just flagged').toHaveCount(7)
  })

  // Whole-week offsets from today (the Monday-to-Sunday edge itself - the Sunday that ends a phase, the Monday that starts the next - is the
  // node tests' job: tests-node/program-page.test.mjs, "_programPhaseAt").
  test('the boundaries: the first week of a phase is in the new phase, the last week of the one before it is not', async ({ page }) => {
    for (const [weeksAgo, expected] of [[0, 0], [1, 0], [2, 1], [4, 1], [5, 2], [6, 2]]) {
      const s = await seed(page, { assignWeeksAgo: weeksAgo, phases: THREE })
      await open(page, s)
      await opened(page, s, expected)
      await expect(page.locator(`${card(s, expected)} .pgm-now`), `${weeksAgo} weeks in`).toHaveText('Now')
      await sweep(page)
    }
  })

  test('not following the program, a plan that has not started, and one that has finished: the first phase opens, nothing says Now', async ({ page }) => {
    for (const assignWeeksAgo of [null, -2, 12]) {
      const s = await seed(page, { assignWeeksAgo, phases: THREE })
      await open(page, s)
      await opened(page, s, 0)
      await folded(page, s, 1)
      await expect(page.locator('.pgm-now'), `assigned ${assignWeeksAgo} weeks ago`).toHaveCount(0)
      await sweep(page)
    }
  })

  test('what you open or fold afterwards is kept, and Now stays on its phase', async ({ page }) => {
    const s = await seed(page, { assignWeeksAgo: 3, phases: THREE })
    await open(page, s)
    await page.click(header(s, 1))   // fold the current phase
    await page.click(header(s, 2))   // open another
    await page.evaluate(id => openProgram(id), s.programId)
    await page.waitForSelector(`#ph-${s.phases[0].id}`)
    await folded(page, s, 1)
    await opened(page, s, 2)
    await expect(page.locator(`${card(s, 1)} .pgm-now`), 'folded, but still marked').toHaveText('Now')
  })

  test('the dashboard tile and the program page name the same phase', async ({ page }) => {
    const s = await seed(page, { assignWeeksAgo: 3, phases: THREE })
    await open(page, s)
    const tile = await page.evaluate(async (id) => {
      const { data } = await db.from('client_programs').select('id, start_date, programs(name, program_phases(id, name, duration_weeks, order_index))').eq('client_id', window._soloClientId).eq('program_id', id).single()
      return _dashProgramInfo(data, _ymdLocal(new Date())).phase
    }, s.programId)
    expect(tile).toBe('Two')
    await expect(page.locator(`${card(s, 1)} .pgm-now`)).toHaveText('Now')
  })
})

test.describe('Program page - what a coach types is data, not markup', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await sweep(page) })
  test.afterEach(async ({ page }) => { await sweep(page) })

  test('program, phase and description text with markup and quotes render as text everywhere on the page', async ({ page }) => {
    const evil = `<img src=x onerror="window.__xss=1"> " ' & </script>`
    const s = await seed(page, {
      name: TAG + ' ' + evil, description: evil,
      phases: [{ name: evil, weeks: 2, type: 'linear', config: { startPct: '65', endPct: '85' }, rowsForWeeks: 2, week1: [MON] }, { name: `x" onmouseover="window.__xss=2`, weeks: 2 }]
    })
    await open(page, s)
    // every place the name is shown: title, card, timeline label, the ⋯ label
    await page.click(header(s, 1))
    await page.locator(`${card(s, 1)} .pgm-ph-menu`).click()
    await expect(page.locator('#pgm-sheet .modal-title')).toHaveText(`x" onmouseover="window.__xss=2`)
    await page.click('#pgm-sheet .modal-close')
    await page.locator(`${card(s, 0)} .pgm-ph-menu`).click()
    await expect(page.locator('#pgm-sheet .modal-title')).toHaveText(evil)
    await page.click('#pgm-sheet .modal-close')

    const r = await page.evaluate(() => {
      for (const el of document.querySelectorAll('.pgm *')) { el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); el.dispatchEvent(new MouseEvent('mouseenter')) }
      const root = document.querySelector('.pgm')
      return {
        injected: root.querySelectorAll('img, script').length, xss: window.__xss ?? null,
        title: document.querySelector('h1').textContent, desc: document.getElementById('pgm-desc').textContent,
        segLabel: document.querySelectorAll('.pgm-seg')[0].getAttribute('aria-label'),
        cardName: document.querySelector('.pgm-ph-t b').textContent,
        menuLabel: document.querySelector('.pgm-ph-menu').getAttribute('aria-label')
      }
    })
    expect(r.injected, 'no element was injected').toBe(0)
    expect(r.xss, 'and nothing executed').toBeNull()
    expect(r.title).toBe(TAG + ' ' + evil)
    expect(r.desc).toBe(evil)
    expect(r.cardName).toBe(evil)
    expect(r.segLabel).toBe(`Phase 1, ${evil}, 2 weeks`)
    expect(r.menuLabel).toBe(`Actions for ${evil}`)
  })
})
