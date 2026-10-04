const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')
const { installCappedApi } = require('./capped-api')

// ─── Workout runner: the "log-first" layout and the tap-for-stats sheet (Jake's 2026-09-28 walkthrough, items 7-8) ───
//
// Item 7: "The UI on this page is not user friendly." On a phone the set table — the thing you actually do on this
// screen — began below five blocks of controls (Swap/Add row, a stats card, three prescription boxes): the first set
// row sat 252px below the tabs. It now comes straight after them; Swap, Add and Units live behind a "⋯" button; the
// prescription is one line under the title; and "Next exercise" is a bar at the bottom that is always there.
// Item 8: "If user clicks into [last session] they should be able to view more stats for this exercise". The last-time
// line is a clearly tappable Stats button that opens a sheet. Since 2026-10-03 the sheet is the exercise stats card shared
// with My progress (its figures are pinned in tests/exercise-stats-shared-2026-10-03.spec.js); the tests here keep what is the
// RUNNER's own: the sheet opens over a live workout, leaves it alone, and treats an exercise name as text.
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

// Stubs the ONE read the stats sheet makes: this exercise's whole history - the same read My progress groups its cards from
// (_fetchExerciseSessions). It goes through tests/capped-api.js, so the API's 200-row cap, the `!inner` rule and the client /
// exercise filters are real rather than assumed. `sessions`: [{ date, sets:[[kg, reps], ...] }] oldest first. The ids run
// NEWEST-first (the oldest session gets the largest id), so the read hands the history back newest-first and only an explicit
// sort by date puts the chart the right way round: deleting the app's sort fails the test that reads the chart.
const stubHistory = async (page, { sessions }) => {
  const { name, clientId } = await page.evaluate(() => ({ name: _runner.exercises[_runner.exIdx].name, clientId: _runner.clientId }))
  const rows = sessions.map((s, i) => ({
    id: 'row-' + String(sessions.length - i).padStart(4, '0'), exercise_name: name, metric_type: 'weight_reps',
    workout_logs: { date: s.date, client_id: clientId },
    workout_log_sets: s.sets.map(([w, r], k) => ({ set_number: k + 1, weight_kg: w, reps_achieved: r })),
  }))
  await installCappedApi(page, { workout_log_exercises: rows })
}

// Eight weekly sessions of a lift: top set climbs 50 → 62.5 kg. The last matches LAST above.
const DATES = ['2026-08-07', '2026-08-14', '2026-08-21', '2026-08-28', '2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']
const SESSIONS = DATES.map((date, k) => k === 7
  ? { date, sets: [[60, 8], [62.5, 8], [62.5, 7]] }
  : { date, sets: [[50 + k * 1.75, 8], [50 + k * 1.75, 8], [50 + k * 1.75, 7]] })

const chartState = (page) => page.evaluate(() => {
  const c = Chart.getChart(document.getElementById('rs-chart'))
  return c ? { labels: c.data.labels.slice(), sets: c.data.datasets.map(d => d.data.slice()) } : null
})
// Counts the charts of the sheet, not of the page behind it: a client with weigh-ins has a sparkline on the dashboard (#dash-root).
const chartCount = (page) => page.evaluate(() => (typeof Chart === 'undefined' ? -1 : Object.values(Chart.instances).filter(c => !c.canvas.closest('#dash-root')).length))

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

  // UPDATED 2026-09-30 (Jake, round 3: "these boxes should move below the exercise number boxes, and
  // again use the width of the page" — see js/app-runner.js's #wr-tabs comment for the full move).
  // #wr-rx now deliberately sits in the gap this test polices; what it still guards is that NOTHING
  // ELSE does (no Swap/Add row, no stats card — the things it was originally written to catch), that
  // the boxes immediately follow the tabs rather than living back up in the title column, that they
  // span the tabs' own full width rather than being squeezed into that column, and that the table is
  // still reachable without scrolling.
  test('the set table comes straight after the tabs, with only the full-width prescription boxes between them', async ({ page }) => {
    await startRunner(page)
    const m = await page.evaluate(() => {
      const tabs = document.getElementById('wr-tabs').getBoundingClientRect()
      const rx = document.getElementById('wr-rx').getBoundingClientRect()
      const firstRow = document.querySelector('#workout-runner input[oninput*="tableRows[0].weight"]').getBoundingClientRect()
      return { rxGap: rx.top - tabs.bottom, afterRxGap: firstRow.top - rx.bottom, rowBottom: firstRow.bottom, vh: innerHeight, rxWidth: rx.width, tabsWidth: tabs.width }
    })
    // #wr-rx follows the tabs immediately — just its own 8px top margin, not a Swap/Add row or a stats card.
    expect(m.rxGap, 'the prescription boxes sit right under the tabs').toBeGreaterThanOrEqual(0)
    expect(m.rxGap, 'the prescription boxes sit right under the tabs').toBeLessThan(20)
    // Only the SET / KG / REPS header labels belong in the gap after the boxes (about 50px). It was 252px before
    // 2026-09-28: a Swap/Add row, a stats card and three prescription boxes. The lower bound stops an overlap from passing.
    expect(m.afterRxGap, 'space between the prescription boxes and the first set row').toBeGreaterThan(10)
    expect(m.afterRxGap, 'space between the prescription boxes and the first set row').toBeLessThan(75)
    expect(m.rowBottom, 'the first set row is on screen without scrolling').toBeLessThan(m.vh * 0.5)
    // "Use the width of the page" (Jake) — the same full width as the tabs strip, not the narrow title column it used to live in.
    expect(Math.abs(m.rxWidth - m.tabsWidth), 'the prescription boxes span the same width as the tabs strip').toBeLessThan(2)
  })

  // RESTORED TO BOXES 2026-09-30 (Jake, on the merged RPE-autoregulation feature: "these used to be
  // in clear larger boxes... made more clear again"). Was a single inline-flowing line since the
  // 2026-09-28 redesign this file is named for; that redesign's OWN stated reason (killing the old
  // three-box bar's real estate, not the boxes themselves being wrong) no longer outweighs the
  // legibility Jake asked back — see js/app-runner.js's _renderTargetBarHtml for the fuller history.
  // What this test still guards, unchanged: every prescription value lives in ONE element (#wr-rx),
  // not scattered as stray read-only labels elsewhere on the page.
  test('the prescription sits under the title as bordered boxes — reps, RIR and rest together, with no stray label elsewhere', async ({ page }) => {
    await startRunner(page)
    const rx = page.locator('#wr-rx')
    await expect(rx).toBeVisible()
    for (const part of ['5–8', 'REPS', '1–2', 'RIR', '2:00', 'REST']) await expect(rx).toContainText(part)
    const h = await rx.evaluate(el => el.getBoundingClientRect().height)
    // A boxed cell (8px vertical padding + an 18px value line + a 9px label line) runs ~45-55px —
    // clearly more than one 16px text line (~20px), clearly less than it wrapping onto a second ROW
    // of cells (which would roughly double it). Bounds a real box, not a guess: measured live at ~51px.
    expect(h, 'a single row of boxes, not a single text line or a wrapped second row').toBeGreaterThan(35)
    expect(h, 'a single row of boxes, not a single text line or a wrapped second row').toBeLessThan(80)
    // Every prescription value still lives in ONE place: no stray read-only REPS/RIR/REST label
    // anywhere else on the page (the table's own Reps/RIR column HEADERS are a different, exempted
    // thing — see the check below).
    // EXEMPTION (2026-09-29, runner effort capture — Task 2 fix round 1): #wr-table-header, the fast
    // table's own column-header row, is deliberately excluded. That rule was written to kill the old
    // three-box bar, which DUPLICATED read-only prescription text already shown in #wr-rx. A table
    // column header is a different thing — it labels an INPUT the lifter fills in (Set/Kg/Reps/RIR or
    // RPE), and this check already tolerated 'Set'/'Kg'/'Reps' there (it only matches the exact
    // uppercase acronyms REPS/RIR/REST, and those headers render mixed-case). The effort column is the
    // one new header that DOES hit an exact acronym match ('RIR'/'RPE'), and it must stay: RIR and RPE
    // are opposite scales, so an unlabelled effort column would recreate the exact inversion hazard
    // this whole task exists to prevent. Scoped to the one real header element by id, not by text, so
    // a genuine stray prescription box anywhere else in the runner is still caught.
    const stray = await page.evaluate(() => [...document.querySelectorAll('#workout-runner *')].filter(e => !e.children.length && ['REPS', 'RIR', 'REST'].includes(e.textContent.trim()) && !e.closest('#wr-rx') && !e.closest('#wr-table-header')).length)
    expect(stray, 'no REPS / RIR / REST label outside the prescription line or the table header').toBe(0)
  })

  // (review, Task 2 fix round 1, 2026-09-29): the feature's actual primary use case — a prescribed
  // top set followed by plain backoff sets — is a MIXED exercise: only SOME rows render the effort
  // cell. The header still grows the RIR/RPE column (it renders when ANY row prescribes one), but a
  // non-prescribing row used to render one fewer cell than a prescribing row, so its Kg/Reps cells
  // (both flex:1) stretched to fill the gap and drifted out of alignment with the header above them —
  // the exact "column headers not centre aligned" bug class from 2026-09-11. Fixed by giving a
  // non-prescribing row an empty flex:1 placeholder wherever the exercise as a whole shows the effort
  // column. Pinned here by cell COUNT rather than by pixel position: a non-prescribing row must render
  // the same number of direct children as a prescribing row in the same exercise, or the columns
  // cannot possibly line up regardless of exact widths.
  test('(review) a mixed-prescription exercise keeps row cell counts aligned — a prescribed top set followed by a plain backoff set', async ({ page }) => {
    await loginAsClient(page)
    await page.evaluate(() => {
      window._unitPrefs = { ...(window._unitPrefs || {}), weight: 'kg' }
      _runner = {
        clientId: 'layout-spec-mixed', startTime: Date.now(), exIdx: 0, lastSession: { 'Mixed Rx': null },
        exercises: [{
          name: 'Mixed Rx', type: 'strength', metricType: 'weight_reps', targetSets: 2,
          sets_json: [
            { repsMin: '3', effortType: 'rpe', effortMin: '8' }, // top set: prescribes effort
            { repsMin: '8' }                                      // backoff set: no effort prescribed
          ],
          loggedSets: [], exerciseId: null, order_index: 0, restSecs: 60,
        }],
      }
      renderRunner()
    })
    await expect(page.locator('#workout-runner button:text-is("End")')).toBeVisible()

    // Sanity: the header DID grow the effort column (proves this test exercises the mixed case at
    // all, not a header that stayed 3-wide because nothing prescribed effort).
    await expect(page.locator('#wr-table-header')).toContainText('RPE')
    await expect(page.locator('#set-0-effort'), 'the prescribing row renders the effort input').toBeVisible()
    await expect(page.locator('#set-1-effort'), 'the non-prescribing row must NOT get a real effort input — only a same-width placeholder').toHaveCount(0)

    const counts = await page.evaluate(() => ({
      row0: document.getElementById('set-0-weight').parentElement.children.length,
      row1: document.getElementById('set-1-weight').parentElement.children.length,
    }))
    expect(counts.row1, 'a non-prescribing row must render the same cell count as a prescribing row in the same exercise, or its Kg/Reps columns stretch and drift out of alignment with the header').toBe(counts.row0)
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
    await stubHistory(page, { sessions: SESSIONS })
    await page.locator('#wr-lasttime').click()
    await expect(page.locator('#runner-stats-modal')).toBeVisible()
    await expect(page.locator('#runner-stats-modal .modal-title')).toHaveText(evil)
    expect(await page.evaluate(() => window.__xss), 'nothing ran').toBeUndefined()
    expect(await page.locator('#workout-runner img, #runner-stats-modal img').count(), 'no image element was created from the name').toBe(0)
  })
})

// Jake's fourth walkthrough round (2026-09-30), items 1 and 4. Items 2-3 (full-width, moved-below-tabs
// boxes) are pinned above and in "the prescription sits under the title as bordered boxes...".
test.describe('Runner header cleanup (2026-09-30)', () => {
  test('"Exercise N of M" is gone — the numbered tabs already say it — but the timer stays', async ({ page }) => {
    await startRunner(page)
    await expect(page.locator('#workout-runner').getByText(/Exercise \d+ of \d+/), 'redundant now the tabs show it').toHaveCount(0)
    await expect(page.locator('#wr-timer'), 'the timer is not swept away with it').toBeVisible()
  })

  // (review) FIXED 2026-09-30 (Jake: "there shouldn't be ghost text here unless a previous entry has
  // been logged" — selected the Effort field specifically). The old placeholder was the scale's own
  // static range ('1–10' / '0–5'), not real data; scoped to the Effort field only, per Jake's own
  // answer narrowing this item (the reps/weight ghosts from the prior round are unchanged).
  test('the effort ghost shows a real previous rating only when the scale matches — never a bare range hint', async ({ page }) => {
    await loginAsClient(page)
    await page.evaluate(() => {
      window._unitPrefs = { ...(window._unitPrefs || {}), weight: 'kg' }
      const rx = { repsMin: '8', effortType: 'rpe', effortMin: '7', effortMax: '8' }
      _runner = {
        clientId: 'layout-spec-effort', startTime: Date.now(), exIdx: 0,
        lastSession: {
          'No History': null,
          'RPE Match': { date: '2026-09-25', sets: [{ set_number: 1, weight_kg: 60, reps_achieved: 8, effort_value: 7, effort_type: 'rpe' }] },
          'Scale Mismatch': { date: '2026-09-25', sets: [{ set_number: 1, weight_kg: 60, reps_achieved: 8, effort_value: 2, effort_type: 'rir' }] },
        },
        exercises: ['No History', 'RPE Match', 'Scale Mismatch'].map((name, i) => ({
          name, type: 'strength', metricType: 'weight_reps', targetSets: 1, sets_json: [rx],
          loggedSets: [], exerciseId: null, order_index: i, restSecs: 60,
        })),
      }
      renderRunner()
    })
    await expect(page.locator('#workout-runner button:text-is("End")')).toBeVisible()

    // No prior entry at all -- nothing to ghost.
    await expect(page.locator('#set-0-effort')).toHaveAttribute('placeholder', '')

    // A matching RPE from last time -- the real number, not the old static '1–10' range hint.
    await page.evaluate(() => runnerJumpTo(1))
    await expect(page.locator('#set-0-effort')).toHaveAttribute('placeholder', '7')

    // A prior entry exists but was logged in RIR while today prescribes RPE -- showing that "2" as an
    // RPE would invert its meaning (RIR and RPE run in opposite directions), so it must stay blank.
    await page.evaluate(() => runnerJumpTo(2))
    await expect(page.locator('#set-0-effort')).toHaveAttribute('placeholder', '')
  })
})

test.describe('Runner stats sheet (2026-09-28)', () => {
  test('tapping Stats opens the sheet over a live workout: a running rest is untouched, and closing returns to the same runner', async ({ page }) => {
    await startRunner(page)
    await stubHistory(page, { sessions: SESSIONS })
    await page.evaluate(() => startRestTimer(60))
    await page.locator('#wr-lasttime').click()
    const sheet = page.locator('#runner-stats-modal')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Lay A')
    await expect(sheet.locator('[data-xs-tile]').first(), 'the shared exercise card, not a runner-only copy').toBeVisible()

    // The chart: eight sessions, oldest first - the read comes back newest-first (see stubHistory), so this proves the sort.
    await expect.poll(async () => (await chartState(page))?.labels.length, { message: 'the chart draws once the history arrives' }).toBe(8)
    const top = await chartState(page)
    expect(top.labels[0], 'oldest session first').toBe('7 Aug')
    expect(top.labels[7], 'newest session last').toBe('25 Sept')
    expect(top.sets[0][7], 'top set of the last session').toBeCloseTo(62.5, 1)
    expect(top.sets[0][0], 'top set of the first session').toBeCloseTo(50, 1)
    expect(await chartCount(page), 'one chart').toBe(1)

    // The rest kept counting while the sheet was open; closing returns to the same runner.
    expect(await page.evaluate(() => _runner.restRemaining != null)).toBe(true)
    await sheet.locator('.modal-close').click()
    await expect(page.locator('#runner-stats-modal')).toHaveCount(0)
    await expect(page.locator('#workout-runner button:text-is("End")'), 'the runner is still there underneath').toBeVisible()
    expect(await chartCount(page), 'closing the sheet destroys its chart').toBe(0)
    await page.evaluate(() => { try { clearTimer(_runner._restInterval) } catch {} })
  })

  test('the backdrop closes the sheet too', async ({ page }) => {
    await startRunner(page)
    await stubHistory(page, { sessions: SESSIONS })
    await page.locator('#wr-lasttime').click()
    await expect(page.locator('#runner-stats-modal')).toBeVisible()
    await page.locator('#runner-stats-modal').click({ position: { x: 4, y: 4 } })
    await expect(page.locator('#runner-stats-modal')).toHaveCount(0)
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
