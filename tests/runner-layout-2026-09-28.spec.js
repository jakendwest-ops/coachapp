const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')

// ─── Workout runner: the "log-first" layout and the tap-for-stats sheet (Jake's 2026-09-28 walkthrough, items 7-8) ───
//
// Item 7: "The UI on this page is not user friendly." On a phone the set table — the thing you actually do on this
// screen — began below five blocks of controls (Swap/Add row, a stats card, three prescription boxes): the first set
// row sat 252px below the tabs. It now comes straight after them; Swap, Add and Units live behind a "⋯" button; the
// prescription is one line under the title; and "Next exercise" is a bar at the bottom that is always there.
// Item 8: "If user clicks into [last session] they should be able to view more stats for this exercise". The last-time
// line is a clearly tappable Stats button that opens a sheet: last session's sets, today against last time, a progress
// chart, and the heaviest lift ever.
//
// Like runner-exercise-nav-2026-09-28.spec.js, everything is IN-MEMORY runner state (a hand-built `_runner`) with the
// history reads stubbed — nothing is written to the database and there is no fixture to leak. Each test gets a fresh
// page, so the stubs cannot outlive it.
//
// The tests marked (review) pin defects a fresh-eyes review found in the first build; each fails without its fix.

const SETS = [{ repsMin: '5', repsMax: '8', effortType: 'rir', effortMin: '1', effortMax: '2', restMin: '2:00' }]
const LAST = [{ set_number: 1, weight_kg: 60, reps_achieved: 8 }, { set_number: 2, weight_kg: 62.5, reps_achieved: 8 }, { set_number: 3, weight_kg: 62.5, reps_achieved: 7 }]

// A runner with `n` weight×reps exercises. `history:false` leaves every exercise with no previous session.
// The unit preference is pinned to kg: it is stored in the database and the suite shares one account.
async function startRunner(page, { n = 4, history = true, unit = 'kg', names } = {}) {
  await loginAsClient(page)
  await page.evaluate(({ n, history, unit, names, SETS, LAST }) => {
    window._unitPrefs = { ...(window._unitPrefs || {}), weight: unit }
    const list = names || Array.from({ length: n }, (_, i) => 'Lay ' + String.fromCharCode(65 + i))
    _runner = {
      clientId: 'layout-spec', startTime: Date.now(), exIdx: 0, lastSession: {},
      exercises: list.map((name, i) => ({
        name, type: 'strength', metricType: 'weight_reps', targetSets: 3, sets_json: [SETS[0], SETS[0], SETS[0]],
        loggedSets: [], exerciseId: null, order_index: i, restSecs: 60,
      })),
    }
    list.forEach(nm => { _runner.lastSession[nm] = history ? { date: '2026-09-25', sets: LAST } : null })
    renderRunner()
  }, { n, history, unit, names, SETS, LAST })
  await expect(page.locator('#workout-runner button:text-is("End")')).toBeVisible()
}

const partial = (page, i) => page.evaluate((i) => {
  const ex = _runner.exercises[i]
  _ensureTableRows(ex)
  Object.assign(ex.tableRows[0], { weight: '20', reps: '5', done: true })
  _syncLoggedSetsFromTable(ex)
  renderRunner()
}, i)
const complete = (page, i) => page.evaluate((i) => {
  const ex = _runner.exercises[i]
  _ensureTableRows(ex)
  ex.tableRows.forEach(r => { r.weight = '20'; r.reps = '5'; r.done = true })
  _syncLoggedSetsFromTable(ex)
  renderRunner()
}, i)

// Stubs the three reads the stats sheet makes (recent logs → this exercise's rows → heaviest ever). The app asks for
// the NEWEST logs first and sorts the result itself, so the stub answers newest-first and the rows in reverse order:
// deleting the app's sort would put the chart's dates the wrong way round.
// `sessions`: [{ date, sets:[[kg, reps], ...] }] oldest first. `failLogs`: make the first read fail.
const stubHistory = (page, { sessions, heaviest = 0, failLogs = false }) => page.evaluate(({ sessions, heaviest, failLogs }) => {
  const q = (data, error = null) => { const o = { select: () => o, eq: () => o, in: () => o, order: () => o, limit: () => o, not: () => o, then: (res, rej) => Promise.resolve({ data, error }).then(res, rej) }; return o }
  const logs = sessions.map((s, i) => ({ id: 'log' + i, date: s.date })).reverse()
  const rows = sessions.map((s, i) => ({ log_id: 'log' + i, workout_log_sets: s.sets.map(([w, r], k) => ({ set_number: k + 1, weight_kg: w, reps_achieved: r })) })).reverse()
  const real = db.from.bind(db)
  db.from = (t) => t === 'workout_logs' ? (failLogs ? q(null, { message: 'boom', code: 'XX000' }) : q(logs))
    : t === 'workout_log_exercises' ? q(rows)
    : t === 'workout_log_sets' ? q(heaviest ? [{ weight_kg: heaviest }] : [])
    : real(t)
}, { sessions, heaviest, failLogs })

// Eight weekly sessions of a lift: top set climbs 50 → 62.5 kg. The last matches LAST above.
const DATES = ['2026-08-07', '2026-08-14', '2026-08-21', '2026-08-28', '2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']
const SESSIONS = DATES.map((date, k) => k === 7
  ? { date, sets: [[60, 8], [62.5, 8], [62.5, 7]] }
  : { date, sets: [[50 + k * 1.75, 8], [50 + k * 1.75, 8], [50 + k * 1.75, 7]] })

const chartState = (page) => page.evaluate(() => {
  const c = Chart.getChart(document.getElementById('rs-chart'))
  return c ? { labels: c.data.labels.slice(), sets: c.data.datasets.map(d => d.data.slice()) } : null
})
const chartCount = (page) => page.evaluate(() => typeof Chart === 'undefined' ? -1 : Object.keys(Chart.instances).length)

test.describe('Runner log-first layout (2026-09-28)', () => {
  test('Swap, Add and Units are behind a "⋯" button — not rows on the page', async ({ page }) => {
    await startRunner(page)
    await expect(page.locator('#workout-runner #wr-swap-btn'), 'Swap is no longer on the page').toHaveCount(0)
    await expect(page.locator('#workout-runner #wr-add-btn'), 'nor is Add').toHaveCount(0)
    await expect(page.locator('#workout-runner button[title="Unit preferences"]'), 'nor the Units gear').toHaveCount(0)
    const menu = page.locator('#wr-menu-btn')
    await expect(menu).toBeVisible()
    await expect(menu, 'a button with no words needs a name for screen readers').toHaveAttribute('aria-label', /options/i)
    const box = await menu.boundingBox()
    expect(Math.min(box.width, box.height), 'at least the 44px touch target the app adopted (review)').toBeGreaterThanOrEqual(44)

    await page.evaluate(() => { window.__calls = []; window.showExercisePicker = (m) => window.__calls.push('picker:' + m); window._openQuickPrefsPopover = () => window.__calls.push('prefs') })
    await menu.click()
    await expect(page.locator('#runner-menu-modal')).toBeVisible()
    await page.locator('#runner-menu-modal #wr-swap-btn').click()
    await expect(page.locator('#runner-menu-modal'), 'choosing an item closes the menu').toHaveCount(0)
    await menu.click(); await page.locator('#runner-menu-modal #wr-add-btn').click()
    await menu.click(); await page.locator('#runner-menu-modal #wr-units-btn').click()
    expect(await page.evaluate(() => window.__calls)).toEqual(['picker:swap', 'picker:add', 'prefs'])
  })

  test('the set table comes straight after the tabs — nothing sits between them', async ({ page }) => {
    await startRunner(page)
    const m = await page.evaluate(() => {
      const tabs = document.getElementById('wr-tabs').getBoundingClientRect()
      const firstRow = document.querySelector('#workout-runner input[oninput*="tableRows[0].weight"]').getBoundingClientRect()
      return { gap: firstRow.top - tabs.bottom, rowBottom: firstRow.bottom, vh: innerHeight }
    })
    // Only the SET / KG / REPS header labels belong in this gap (about 50px). It was 252px: a Swap/Add row, a stats card
    // and three prescription boxes. The lower bound stops a layout that overlaps the tabs from passing.
    expect(m.gap, 'space between the tabs and the first set row').toBeGreaterThan(10)
    expect(m.gap, 'space between the tabs and the first set row').toBeLessThan(75)
    expect(m.rowBottom, 'the first set row is on screen without scrolling').toBeLessThan(m.vh * 0.5)
  })

  test('the prescription is one line under the title — reps, RIR and rest together, not three boxes', async ({ page }) => {
    await startRunner(page)
    const rx = page.locator('#wr-rx')
    await expect(rx).toBeVisible()
    for (const part of ['5–8', 'REPS', '1–2', 'RIR', '2:00', 'REST']) await expect(rx).toContainText(part)
    const h = await rx.evaluate(el => el.getBoundingClientRect().height)
    expect(h, 'one line at 16px, not a wrapped block').toBeLessThan(30)
    // The old three-box bar is gone: every prescription label on the page lives in the one line.
    const stray = await page.evaluate(() => [...document.querySelectorAll('#workout-runner *')].filter(e => !e.children.length && ['REPS', 'RIR', 'REST'].includes(e.textContent.trim()) && !e.closest('#wr-rx')).length)
    expect(stray, 'no REPS / RIR / REST label outside the prescription line').toBe(0)
  })

  test('the "Last time" line is a clearly tappable Stats button, after the sets — and absent when there is no history', async ({ page }) => {
    await startRunner(page)
    const card = page.locator('#wr-lasttime')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Last time')
    await expect(card).toContainText('25 Sept')
    await expect(card).toContainText('Stats')
    await expect(card.locator('svg'), 'an icon, so it reads as a control and not a caption').toHaveCount(1)
    await expect(card).toHaveAttribute('aria-haspopup', 'dialog')
    expect(await card.evaluate(el => el.tagName), 'a real button').toBe('BUTTON')
    const order = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#workout-runner input[oninput*="tableRows"]')].map(e => e.getBoundingClientRect().bottom)
      return { n: rows.length, lastRowBottom: Math.max(...rows), cardTop: document.getElementById('wr-lasttime').getBoundingClientRect().top }
    })
    expect(order.n, 'there are set rows to compare against').toBeGreaterThan(0)
    expect(order.cardTop, 'it sits below the set rows').toBeGreaterThan(order.lastRowBottom)
    // The old stats card (Volume / Top / Reps / Sets) is no longer on the main page; it lives in the sheet.
    expect(await page.evaluate(() => /last session ·/i.test(document.getElementById('workout-runner').innerText))).toBe(false)

    await startRunner(page, { history: false })
    await expect(page.locator('#wr-lasttime'), 'no previous session, nothing to show').toHaveCount(0)
  })

  test('the bottom bar is always there: "Skip exercise" on an untouched one, "Next exercise" once started, "Finish" when nothing is left — and it names what comes next', async ({ page }) => {
    await startRunner(page)
    const cta = page.locator('#wr-cta')
    await expect(cta).toBeVisible()
    await expect(cta).toContainText('Skip exercise')
    await expect(cta.locator('#wr-cta-next'), 'names the exercise it goes to').toContainText('Lay B')
    await expect(page.locator('#workout-runner').getByText('Log a set to continue'), 'the dead-end placeholder is gone').toHaveCount(0)
    const atBottom = await cta.evaluate(el => Math.abs(el.getBoundingClientRect().bottom + 12 - innerHeight) < 40)
    expect(atBottom, 'pinned to the bottom of the screen').toBe(true)

    // The Skip is a real way forward — the old placeholder was not.
    await cta.click()
    expect(await page.evaluate(() => _runner.exIdx), 'skipping the untouched exercise moves on').toBe(1)
    await page.evaluate(() => runnerJumpTo(0))

    await partial(page, 0)
    await expect(cta).toContainText('Next exercise')
    for (const i of [1, 2, 3]) await complete(page, i)
    await complete(page, 0)
    await expect(cta, 'everything done').toContainText('Finish')
    await expect(cta.locator('#wr-cta-next'), 'nothing to point at').toHaveCount(0)
  })

  test('(review) an untouched LAST exercise is a neutral way out, not a big green Finish — and goes through the End flow', async ({ page }) => {
    await startRunner(page)
    for (const i of [0, 1, 2]) await complete(page, i)
    await page.evaluate(() => runnerJumpTo(3))          // the last one, still untouched: nothing else is left
    const cta = page.locator('#wr-cta')
    await expect(cta).toContainText('Finish workout')
    const s = await page.evaluate(() => {
      const resolve = (v) => { const d = document.createElement('div'); d.style.background = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c }
      return { bg: getComputedStyle(document.getElementById('wr-cta')).backgroundColor, success: resolve('--success') }
    })
    expect(s.bg, 'not the green "well done" button: a mis-tap would end the session').not.toBe(s.success)
    await expect(cta, 'the same flow the End button uses').toHaveAttribute('onclick', 'confirmEndRunner()')
    // A one-exercise workout on first paint is the same state.
    await startRunner(page, { n: 1 })
    await expect(page.locator('#wr-cta')).toContainText('Finish workout')
  })

  test('a cardio exercise gets the same "⋯" header and keeps its own controls', async ({ page }) => {
    await startRunner(page)
    await page.evaluate(() => {
      _runner.exercises[0] = { name: 'Row', type: 'cardio', metricType: 'cardio', targetSets: 1, sets_json: [{ duration: '10:00' }], loggedSets: [], exerciseId: null }
      _runner.lastSession['Row'] = null
      renderRunner()
    })
    await expect(page.locator('#wr-menu-btn')).toBeVisible()
    await expect(page.locator('#workout-runner #wr-swap-btn')).toHaveCount(0)
    await expect(page.locator('#wr-cta'), 'the fixed Next bar belongs to the set table, not the cardio controls').toHaveCount(0)
    await expect(page.locator('#workout-runner button[onclick*="startCardioTimer"], #workout-runner button[onclick*="logRunnerSet"]').first(), 'the cardio controls are still there').toBeVisible()
  })

  test('(review) an exercise name is text, never markup — in the header, the card, the bar and the sheet', async ({ page }) => {
    const evil = '<img src=x onerror="window.__xss=1">'
    await startRunner(page, { names: [evil, 'Lay B'] })
    await stubHistory(page, { sessions: SESSIONS, heaviest: 70 })
    await page.locator('#wr-lasttime').click()
    await expect(page.locator('#runner-stats-modal')).toBeVisible()
    await expect(page.locator('#runner-stats-modal .modal-title')).toHaveText(evil)
    expect(await page.evaluate(() => window.__xss), 'nothing ran').toBeUndefined()
    expect(await page.locator('#workout-runner img, #runner-stats-modal img').count(), 'no image element was created from the name').toBe(0)
  })
})

test.describe('Runner stats sheet (2026-09-28)', () => {
  test('tapping Stats opens the sheet: last session, today vs last time, a progress chart, the heaviest lift — and a running rest is untouched', async ({ page }) => {
    await startRunner(page)
    await stubHistory(page, { sessions: SESSIONS, heaviest: 70 })
    await page.evaluate(() => startRestTimer(60))
    await page.locator('#wr-lasttime').click()
    const sheet = page.locator('#runner-stats-modal')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Lay A')

    // Last session's sets, one row each.
    await expect(sheet.locator('#rs-last-sets [data-set]')).toHaveCount(3)
    await expect(sheet.locator('#rs-last-sets')).toContainText('62.5')
    // Today so far vs last time (nothing ticked yet, so it shows last session's numbers as the target).
    await expect(sheet.locator('#rs-vs')).toContainText('last 1417.5kg')

    // The chart: eight sessions, oldest first — the app sorts the newest-first answer itself.
    await expect.poll(async () => (await chartState(page))?.labels.length, { message: 'the chart draws once the history arrives' }).toBe(8)
    const top = await chartState(page)
    expect(top.labels[0], 'oldest session first').toBe('7 Aug')
    expect(top.labels[7], 'newest session last').toBe('25 Sept')
    expect(top.sets[0][7], 'top set of the last session').toBeCloseTo(62.5, 1)
    expect(top.sets[0][0], 'top set of the first session').toBeCloseTo(50, 1)
    expect(await chartCount(page), 'one chart').toBe(1)

    await sheet.locator('[data-rs-metric="e1rm"]').click()
    const e1 = await chartState(page)
    expect(e1.sets[0][7], 'estimated 1RM: 62.5 × (1 + 8/30) = 79.17').toBeCloseTo(79.2, 1)
    expect(await chartCount(page), 'switching measure replaces the chart; it must not leave the old one behind (review)').toBe(1)
    await sheet.locator('[data-rs-metric="vol"]').click()
    const vol = await chartState(page)
    expect(vol.sets[0][7], 'volume: 60×8 + 62.5×8 + 62.5×7 = 1417.5, shown to the nearest whole kg').toBe(1418)
    await sheet.locator('[data-rs-metric="top"]').click()
    expect(await chartCount(page), 'and after a third switch').toBe(1)
    await expect(sheet.locator('[data-rs-metric="top"]')).toHaveAttribute('aria-pressed', 'true')

    await expect(sheet.locator('#rs-heaviest')).toContainText('70')

    // The rest kept counting while the sheet was open; closing returns to the same runner.
    expect(await page.evaluate(() => _runner.restRemaining != null)).toBe(true)
    await sheet.locator('.modal-close').click()
    await expect(page.locator('#runner-stats-modal')).toHaveCount(0)
    await expect(page.locator('#workout-runner button:text-is("End")'), 'the runner is still there underneath').toBeVisible()
    expect(await chartCount(page), 'closing the sheet destroys its chart (review: this used to assert a lookup that could not fail)').toBe(0)
    await page.evaluate(() => { try { clearTimer(_runner._restInterval) } catch {} })
  })

  test('if the history cannot be read the sheet says so instead of hanging — and the rest of it still shows', async ({ page }) => {
    await startRunner(page)
    await stubHistory(page, { sessions: SESSIONS, failLogs: true })
    await page.locator('#wr-lasttime').click()
    const sheet = page.locator('#runner-stats-modal')
    await expect(sheet.locator('#rs-progress')).toContainText(/couldn.t load/i)
    await expect(sheet.locator('#rs-last-sets [data-set]'), 'last session is already in memory, so it still shows').toHaveCount(3)
    await expect(sheet.locator('#rs-progress button'), 'with a way to try again').toBeVisible()
  })

  test('today\'s numbers join the chart once a set is ticked', async ({ page }) => {
    await startRunner(page)
    await stubHistory(page, { sessions: SESSIONS, heaviest: 70 })
    await page.evaluate(() => {
      const ex = _runner.exercises[0]; _ensureTableRows(ex)
      Object.assign(ex.tableRows[0], { weight: '65', reps: '6', done: true }); _syncLoggedSetsFromTable(ex); renderRunner()
    })
    await page.locator('#wr-lasttime').click()
    await expect.poll(async () => (await chartState(page))?.labels.length).toBe(9)
    const s = await chartState(page)
    expect(s.labels[8], 'the ninth point is today').toBe('Today')
    expect(s.sets.length, 'a second, dashed line joins the last session to today').toBe(2)
    expect(s.sets[1][7], 'the dashed line starts at the last session (62.5)').toBeCloseTo(62.5, 1)
    expect(s.sets[1][8], 'and ends at today\'s top set (65)').toBeCloseTo(65, 1)
    expect(s.sets[0][8], 'the solid line has no point for today').toBeNull()
  })

  test('(review) the sheet works in pounds: values are converted, not concatenated', async ({ page }) => {
    await startRunner(page, { unit: 'lb' })
    await stubHistory(page, { sessions: SESSIONS, heaviest: 70 })
    await expect(page.locator('#wr-lasttime')).toContainText('lb')
    await page.locator('#wr-lasttime').click()
    await expect.poll(async () => (await chartState(page))?.labels.length).toBe(8)
    const s = await chartState(page)
    expect(s.sets[0][7], '62.5 kg in pounds').toBeCloseTo(137.8, 0)
    expect(s.sets[0].every(v => typeof v === 'number' && Number.isFinite(v)), 'every point is a real number').toBe(true)
    await expect(page.locator('#rs-heaviest')).toContainText('154.3')
    await expect(page.locator('#rs-last-sets')).toContainText('LB')
  })

  test('(review) a bodyweight exercise says why there is no chart, instead of "after a couple of workouts" for ever', async ({ page }) => {
    await startRunner(page)
    await page.evaluate(() => { _runner.lastSession['Lay A'] = { date: '2026-09-25', sets: [{ set_number: 1, weight_kg: null, reps_achieved: 10 }, { set_number: 2, weight_kg: null, reps_achieved: 9 }] } ; renderRunner() })
    await stubHistory(page, { sessions: DATES.map(date => ({ date, sets: [[0, 10], [0, 9]] })) })
    await page.locator('#wr-lasttime').click()
    await expect(page.locator('#rs-progress')).toContainText(/no logged weight/i)
    await expect(page.locator('#rs-progress canvas')).toHaveCount(0)
  })

  test('(review) if Chart.js goes missing after the chart is drawn, the ✕ still closes the sheet', async ({ page }) => {
    // The trap the review found: closing destroyed the chart BEFORE removing the sheet, so a throw there (no Chart.js)
    // left a z-index 1000 sheet over a live workout with no way out. It needs a chart to exist first, which is why the
    // test below (Chart.js absent from the start, so no chart is ever drawn) cannot reach it.
    await startRunner(page)
    await stubHistory(page, { sessions: SESSIONS, heaviest: 70 })
    await page.locator('#wr-lasttime').click()
    await expect.poll(async () => (await chartState(page))?.labels.length).toBe(8)
    await page.evaluate(() => { window.__chart = window.Chart; window.Chart = undefined })
    await page.locator('#runner-stats-modal .modal-close').click()
    await expect(page.locator('#runner-stats-modal'), 'the sheet closes even though tearing down the chart throws').toHaveCount(0)
    await page.evaluate(() => { window.Chart = window.__chart })
  })

  test('(review) if Chart.js never loaded the sheet says so, and the ✕ still closes it', async ({ page }) => {
    await startRunner(page)
    await stubHistory(page, { sessions: SESSIONS, heaviest: 70 })
    await page.evaluate(() => { window.__chart = window.Chart; window.Chart = undefined })
    await page.locator('#wr-lasttime').click()
    await expect(page.locator('#rs-progress')).toContainText(/could not load/i)
    await page.locator('#runner-stats-modal .modal-close').click()
    await expect(page.locator('#runner-stats-modal'), 'a throw while tearing down the chart must not leave the sheet stuck over the workout').toHaveCount(0)
    await page.evaluate(() => { window.Chart = window.__chart })
  })
})

// A date column is a calendar day. new Date('2026-09-25') is UTC midnight, which is the 24th anywhere west of UTC.
test.describe('Runner dates in a time zone west of UTC (2026-09-28, review)', () => {
  test.use({ timezoneId: 'America/Los_Angeles' })
  test('"Last time · 25 Sept" stays the 25th', async ({ page }) => {
    await startRunner(page)
    await expect(page.locator('#wr-lasttime')).toContainText('25 Sept')
    expect(await page.evaluate(() => _runnerShortDate('2026-09-25'))).toBe('25 Sept')
  })
})
