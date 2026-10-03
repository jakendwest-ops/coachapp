const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')
const { installCappedApi, restoreCappedApi, cappedApiCalls } = require('./capped-api')

// ─── ONE exercise-stats card: the runner's Stats sheet and the My progress exercise cards (Jake, 2026-10-03) ───────────────
//
// "The progress/stats page within the runner should have more data ... This amount of data should also be consistent with the
// 'my progress' page." The two screens had separate implementations and had drifted (the runner sheet projected every set with
// plain Epley, kept 12 sessions and had three measures; My progress had five measures, the app's one 1RM rule and the whole
// history). They now mount the SAME card (_mountExerciseStats, js/app-progress.js), so these tests run both screens against one
// stubbed history and require identical figures. Jake's reaction to the prototype is pinned too: records are SETS ("Heaviest set
// 117.5 kg × 3"), and the estimated 1RM names the set it came from, so a 1RM above the heaviest weight explains itself.
//
// Everything is IN-MEMORY: a hand-built `_runner` and tests/capped-api.js (a read-only stand-in that caps responses at 200, models
// `!inner`, and fails closed on anything it does not implement) — nothing is written to the database. The arithmetic itself is
// pinned in tests-node/exercise-stats.test.mjs; these prove the wiring.

const ME = 'xs-me', OTHER = 'xs-other'
const FAILING = { error: { code: 'XX000', message: 'boom' } }

// Sets are [kg, reps] or [kg, reps, scale, value]. Seven weekly sessions of "Lay A" built so every record is a DIFFERENT session:
//   heaviest set  117.5 × 3 (8 Sept — ties 117.5 × 2 on 15 Sept, and the one with more reps wins)
//   best est. 1RM 117.5 × 3 @ RPE 9 = 131.7 (higher than any weight lifted: the case Jake noticed)
//   biggest set   95 × 8 = 760 (25 Aug)          best volume 2,070 (18 Aug)
const HISTORY = [
  { date: '2026-08-18', sets: [[90, 8], [90, 8], [90, 7]] },
  { date: '2026-08-25', sets: [[95, 8], [95, 7], [95, 6]] },
  { date: '2026-09-01', sets: [[100, 5], [100, 5], [90, 8]] },
  { date: '2026-09-08', sets: [[117.5, 3, 'rpe', 9], [105, 3]] },
  { date: '2026-09-15', sets: [[117.5, 2]] },
  { date: '2026-09-22', sets: [[102.5, 6], [102.5, 6], [100, 6]] },
  { date: '2026-09-29', sets: [[105, 5], [105, 5], [105, 4]] },
]

let rowNo = 0
// One logged exercise exactly as the read returns it: the exercise row, its log (to-one embed) and its sets (to-many).
const row = (name, clientId, { date, sets }) => ({
  id: 'xs-row-' + String(++rowNo).padStart(6, '0'),
  exercise_name: name, metric_type: 'weight_reps',
  workout_logs: { date, client_id: clientId },
  workout_log_sets: sets.map(([w, r, t, v], k) => ({ set_number: k + 1, weight_kg: w, reps_achieved: r, effort_type: t ?? null, effort_value: v ?? null })),
})
// My history, plus two rows that must NEVER show: another exercise of mine, and someone else's "Lay A" with a huge lift.
// The rows are built NEWEST-first, so the newest session gets the smallest id and the read (which pages in id order) hands the
// history back newest-first: only an explicit sort by date puts the chart and the session list the right way round.
const world = (history = HISTORY) => [
  ...[...history].reverse().map(s => row('Lay A', ME, s)),
  row('Lay B', ME, { date: '2026-09-29', sets: [[40, 10]] }),
  row('Lay A', OTHER, { date: '2026-09-30', sets: [[300, 1]] }),
]
const install = (page, rows) => installCappedApi(page, { workout_log_exercises: rows })

// A runner on "Lay A" (then "Lay B") whose last session is the last of `history`.
async function openRunner(page, { unit = 'kg', history = HISTORY, name = 'Lay A' } = {}) {
  const last = history[history.length - 1]
  const lastSets = last.sets.map(([w, r], k) => ({ set_number: k + 1, weight_kg: w, reps_achieved: r }))
  await page.evaluate(({ unit, name, ME, lastSets, date }) => {
    window._unitPrefs = { ...(window._unitPrefs || {}), weight: unit }
    const rx = { repsMin: '5', repsMax: '8', effortType: 'rpe', effortMin: '7', effortMax: '9', restMin: '2:00' }
    _runner = {
      clientId: ME, startTime: Date.now(), exIdx: 0,
      lastSession: { [name]: { date, sets: lastSets }, 'Lay B': null },
      exercises: [name, 'Lay B'].map((nm, i) => ({
        name: nm, type: 'strength', metricType: 'weight_reps', targetSets: 3, sets_json: [rx, rx, rx],
        loggedSets: [], exerciseId: null, order_index: i, restSecs: 60,
      })),
    }
    renderRunner()
  }, { unit, name, ME, lastSets, date: last.date })
  await expect(page.locator('#workout-runner button:text-is("End")')).toBeVisible()
}
const openSheet = async (page) => {
  await page.locator('#wr-lasttime').click()
  await expect(page.locator('#runner-stats-modal')).toBeVisible()
}
const sheetReady = (page) => expect(page.locator('#rs-body [data-xs-tile]').first()).toBeVisible()
const closeSheet = async (page) => {
  await page.locator('#runner-stats-modal .modal-close').click()
  await expect(page.locator('#runner-stats-modal')).toHaveCount(0)
}
const tick = (page, { weight, reps, effort }) => page.evaluate(({ weight, reps, effort }) => {
  const ex = _runner.exercises[0]; _ensureTableRows(ex)
  Object.assign(ex.tableRows[0], { weight, reps, effort, done: true })
  _syncLoggedSetsFromTable(ex); renderRunner()
}, { weight, reps, effort })

// Everything the card shows, as plain data, so two cards can be compared with toEqual.
const readCard = (page, selector) => page.evaluate((sel) => {
  const host = document.querySelector(sel)
  if (!host) return null
  const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null)
  return {
    caption: txt(host.querySelector('[data-xs-caption]')),
    pills: [...host.querySelectorAll('[data-xs-metric]')].map(b => b.dataset.xsMetric + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')),
    selected: txt(host.querySelector('[data-xs-selname]')),
    tiles: Object.fromEntries([...host.querySelectorAll('[data-xs-tile]')].map(t => [t.dataset.xsTile, txt(t.querySelector('.xs-tv')) + ' | ' + txt(t.querySelector('.xs-td'))])),
    note: txt(host.querySelector('[data-xs-note]')),
    records: Object.fromEntries([...host.querySelectorAll('[data-xs-rec]')].map(r => [r.dataset.xsRec, txt(r)])),
    rows: [...host.querySelectorAll('[data-xs-row]')].map(r => txt(r)),
  }
}, selector)

const chartOf = (page, id) => page.evaluate((id) => {
  const c = Chart.getChart(document.getElementById(id))
  return c ? { labels: c.data.labels.slice(), sets: c.data.datasets.map(d => d.data.slice()), dashed: c.data.datasets.map(d => !!d.borderDash) } : null
}, id)
const chartCount = (page) => page.evaluate(() => typeof Chart === 'undefined' ? -1 : Object.keys(Chart.instances).length)

// Renders Performance ▸ Per exercise for ME into a scratch container and tags the "Lay A" card's host.
async function showMyProgress(page, name = 'Lay A') {
  await page.evaluate(async ({ me, name }) => {
    const orig = window._getCurrentClientId
    window._getCurrentClientId = async () => me
    window._trendState = { range: 'All', metricByEx: {} }
    const el = document.createElement('div'); el.id = 'perf-sub-content'; document.body.appendChild(el)
    try { await renderProgressStrength(el) } finally { window._getCurrentClientId = orig }
    const card = [...document.querySelectorAll('.xs-card')].find(c => c.querySelector('.xs-card-name').textContent === name)
    card?.querySelector('[data-xs]')?.setAttribute('data-test-host', '')
  }, { me: ME, name })
}

test.describe('The exercise stats card (2026-10-03)', () => {
  test.beforeEach(async ({ page }) => { await loginAsClient(page) })

  test('the runner sheet and the My progress card show IDENTICAL figures from the same history — and never another person\'s or exercise\'s rows', async ({ page }) => {
    await install(page, world())
    await openRunner(page)
    await openSheet(page); await sheetReady(page)
    const runner = await readCard(page, '#rs-body')
    await closeSheet(page)

    await showMyProgress(page)
    await expect(page.locator('[data-test-host] [data-xs-tile]').first()).toBeVisible()
    const progress = await readCard(page, '[data-test-host]')

    expect(progress, 'the same caption, pills, selected session, tiles, records and session list').toEqual(runner)
    // Not vacuous: both cards really are the full card.
    expect(runner.caption).toContain('7 sessions')
    expect(Object.keys(runner.records)).toEqual(['heaviest', 'e1rm', 'biggest', 'volume'])
    expect(runner.rows.length, 'the newest five, then a "show all" button').toBe(5)
    expect(runner.pills).toEqual(['topWeight*', 'e1rm', 'volume', 'intensity', 'reps'])
    expect(JSON.stringify(runner), 'someone else\'s 300 kg lift never reaches either screen').not.toContain('300')
    expect(JSON.stringify(runner), 'nor another exercise\'s 40 kg').not.toContain('40 kg')
  })

  test('records are named by SET, and the 1RM says which set it was worked out from (Jake\'s note on the prototype)', async ({ page }) => {
    await install(page, world())
    await openRunner(page)
    await openSheet(page); await sheetReady(page)
    const { records } = await readCard(page, '#rs-body')
    expect(records.heaviest, 'the weight AND its reps; a tie on weight goes to the set with more reps').toContain('117.5 kg × 3')
    expect(records.heaviest).toContain('8 Sept')
    expect(records.e1rm, 'a 1RM above the heaviest weight, and the set it came from').toContain('132 kg')
    expect(records.e1rm).toContain('from 117.5 × 3 @9')
    expect(records.biggest, 'most weight × reps in ONE set — a different thing from the heaviest').toContain('95 kg × 8')
    expect(records.volume).toContain('2,070 kg')
    expect(records.volume).toContain('18 Aug')
  })

  test('tapping a session selects it: its numbers against the one before, and the set its 1RM came from (RPE counted)', async ({ page }) => {
    await install(page, world())
    await openRunner(page)
    await openSheet(page); await sheetReady(page)
    const before = await readCard(page, '#rs-body')
    expect(before.selected, 'opens on the newest session').toContain('29 Sept')

    await page.locator('#rs-body [data-xs-row]', { hasText: '8 Sept' }).click()
    const card = await readCard(page, '#rs-body')
    expect(card.selected).toContain('8 Sept')
    expect(card.tiles.top, 'top set 117.5 × 3, 17.5 above the session before').toBe('117.5×3 | ▲ 17.5')
    expect(card.tiles.e1rm, 'est. 1RM 132, 15 above the session before').toBe('132 | ▲ 15')
    expect(card.note).toContain('117.5 × 3 @9')
    expect(card.note).toContain('RPE counted')
    await expect(page.locator('#rs-body .xs-vs')).toContainText('vs Tue 1 Sept')
    await expect(page.locator('#rs-body [data-xs-row][aria-current="true"]')).toHaveCount(1)
    await expect(page.locator('#rs-body [data-xs-row][aria-current="true"]')).toContainText('8 Sept')
    expect((await readCard(page, '#rs-body')).records, 'selecting a session never changes the records').toEqual(before.records)
  })

  test('tapping a POINT on the chart selects its session too', async ({ page }) => {
    await install(page, world())
    await openRunner(page)
    await openSheet(page); await sheetReady(page)
    await expect.poll(async () => (await chartOf(page, 'rs-chart'))?.labels.length).toBe(7)
    const at = await page.evaluate(() => {
      const c = Chart.getChart(document.getElementById('rs-chart'))
      c.options.animation = false; c.update('none')
      const p = c.getDatasetMeta(0).data[3], r = c.canvas.getBoundingClientRect()
      return { x: r.left + p.x, y: r.top + p.y }
    })
    await page.mouse.click(at.x, at.y)
    await expect(page.locator('#rs-body [data-xs-selname]')).toContainText('8 Sept')
  })

  test('the measure pills redraw ONE chart, the choice survives closing the sheet, and reopening does not read the history again', async ({ page }) => {
    await install(page, world())
    await openRunner(page)
    await openSheet(page); await sheetReady(page)
    await expect.poll(async () => (await chartOf(page, 'rs-chart'))?.labels.length).toBe(7)
    expect((await chartOf(page, 'rs-chart')).sets[0], 'top set per session, oldest first').toEqual([90, 95, 100, 117.5, 117.5, 102.5, 105])

    await page.locator('#rs-body [data-xs-metric="volume"]').click()
    expect((await chartOf(page, 'rs-chart')).sets[0].at(-1), 'volume of the last session: 105 × (5+5+4)').toBe(1470)
    await page.locator('#rs-body [data-xs-metric="reps"]').click()
    expect((await chartOf(page, 'rs-chart')).sets[0].at(-1)).toBe(14)
    expect(await chartCount(page), 'switching measure replaces the chart, it never stacks a second one').toBe(1)
    await page.locator('#rs-body [data-xs-metric="volume"]').click()

    await closeSheet(page)
    expect(await chartCount(page), 'closing destroys the chart').toBe(0)
    await openSheet(page); await sheetReady(page)
    await expect(page.locator('#rs-body [data-xs-metric="volume"]')).toHaveAttribute('aria-pressed', 'true')
    const reads = (await cappedApiCalls(page)).filter(c => c.table === 'workout_log_exercises')
    expect(reads.length, 'one read for the whole visit').toBe(1)
    expect(reads[0].desc, 'scoped to this person and this exercise').toEqual(expect.arrayContaining(['eq(workout_logs.client_id)', 'eq(exercise_name)']))
  })

  test('today\'s ticked sets join the card as a dashed Today point and a first row — and never touch the records', async ({ page }) => {
    await install(page, world())
    await openRunner(page)
    await openSheet(page); await sheetReady(page)
    const before = await readCard(page, '#rs-body')
    await closeSheet(page)

    await tick(page, { weight: '110', reps: '4', effort: '8' })
    await openSheet(page); await sheetReady(page)
    const card = await readCard(page, '#rs-body')
    expect(card.selected, 'opens on today').toBe('Today so far')
    expect(card.rows[0], 'today leads the list, with its set and effort').toContain('Today · in progress')
    expect(card.rows[0]).toContain('110×4 @8')
    expect(card.rows.length, 'the newest five history rows plus today').toBe(6)
    expect(card.records, 'a half-finished workout is not a record').toEqual(before.records)
    await expect(page.locator('#rs-body .xs-vs')).toContainText('(full session)')

    await expect.poll(async () => (await chartOf(page, 'rs-chart'))?.labels.length).toBe(8)
    const s = await chartOf(page, 'rs-chart')
    expect(s.labels.at(-1)).toBe('Today')
    expect(s.dashed, 'a second, dashed line').toEqual([false, true])
    expect(s.sets[1].at(-2), 'starts at the last session (105)').toBe(105)
    expect(s.sets[1].at(-1), 'ends at today\'s top set (110)').toBe(110)
    expect(s.sets[0].at(-1), 'the solid line has no point for today').toBeNull()
    expect(await chartCount(page)).toBe(1)
  })

  test('a history past the API\'s 200-row cap is read in pages — all of it', async ({ page }) => {
    const day = i => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
    const many = Array.from({ length: 230 }, (_, i) => ({ date: day(i), sets: [[60 + (i % 10), 5]] }))
    await install(page, world(many))
    await openRunner(page, { history: many })
    await openSheet(page); await sheetReady(page)
    expect((await readCard(page, '#rs-body')).caption, 'all 230, not the first 200').toContain('230 sessions')
    const reads = (await cappedApiCalls(page)).filter(c => c.table === 'workout_log_exercises')
    expect(reads.length, 'more than one request').toBeGreaterThan(1)
    for (const r of reads) expect(r.desc, 'every page is scoped to this person and exercise').toEqual(expect.arrayContaining(['eq(workout_logs.client_id)', 'eq(exercise_name)', 'order(id)']))
    await page.locator('#rs-body [data-xs-more]').click()
    await expect(page.locator('#rs-body [data-xs-row]')).toHaveCount(230)
    await page.locator('#rs-body [data-xs-less]').click()
    await expect(page.locator('#rs-body [data-xs-row]')).toHaveCount(5)
  })

  test('a failed read says so and shows NO numbers (half a history would pass for a whole one) — and Try again works, with no red toast', async ({ page }) => {
    await install(page, FAILING)
    await openRunner(page)
    // Every toast that is ever added is recorded: a check made later would miss one that has already faded (and
    // toHaveCount(0) cannot be used - it retries until the toast fades, so it passes with a toast on screen).
    await page.evaluate(() => {
      window.__toasts = []
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.id === 'app-toast') window.__toasts.push(n.textContent) })))
        .observe(document.body, { childList: true })
    })
    await openSheet(page)
    await expect(page.locator('#rs-body [data-rs-note]')).toContainText(/couldn.t load/i)
    await expect(page.locator('#rs-body [data-rs-retry]')).toBeVisible()
    await expect(page.locator('#rs-body [data-xs-tile], #rs-body [data-xs-rec]')).toHaveCount(0)
    expect(await page.evaluate(() => window.__toasts), 'the sheet explains it in place; log.error would also toast and report').toEqual([])

    await restoreCappedApi(page)
    await install(page, world())
    await page.locator('#rs-body [data-rs-retry]').click()
    await sheetReady(page)
    expect((await readCard(page, '#rs-body')).caption).toContain('7 sessions')
  })

  test('(review) a slow reply from a CLOSED sheet cannot paint into the one opened next', async ({ page }) => {
    await install(page, world())
    await openRunner(page)
    await page.evaluate(() => {
      const real = window._fetchExerciseSessions
      window.__releases = []
      window._fetchExerciseSessions = (...a) => new Promise(res => { window.__releases.push(() => real(...a).then(res)) })
    })
    await openSheet(page)
    await expect(page.locator('#rs-body [data-rs-note]')).toContainText(/loading/i)
    await closeSheet(page)
    await openSheet(page)
    await page.evaluate(() => window.__releases[0]())      // the FIRST (now stale) sheet's read comes back
    await page.waitForFunction(() => !!_runner.rsHistory?.['Lay A'])
    await expect(page.locator('#rs-body [data-rs-note]'), 'the open sheet is still waiting for its own read').toContainText(/loading/i)
    await expect(page.locator('#rs-body [data-xs-tile]')).toHaveCount(0)
    await page.evaluate(() => window.__releases[1]())
    await sheetReady(page)
  })

  test('the card works in pounds: values are converted, not concatenated', async ({ page }) => {
    await install(page, world())
    await openRunner(page, { unit: 'lb' })
    await openSheet(page); await sheetReady(page)
    const { records, tiles } = await readCard(page, '#rs-body')
    expect(records.heaviest, '117.5 kg is 259 lb').toContain('259 lb × 3')
    expect(tiles.top).toContain('231.5×5')
    await expect.poll(async () => (await chartOf(page, 'rs-chart'))?.labels.length).toBe(7)
    const s = await chartOf(page, 'rs-chart')
    expect(s.sets[0].every(v => typeof v === 'number' && Number.isFinite(v)), 'every point is a real number').toBe(true)
    expect(s.sets[0].at(-1), '105 kg in pounds').toBeCloseTo(231.5, 1)
  })

  test('a bodyweight exercise charts reps and offers no weight measures', async ({ page }) => {
    const bw = [
      { date: '2026-09-01', sets: [[null, 10], [null, 9]] }, { date: '2026-09-08', sets: [[null, 11], [null, 9]] },
      { date: '2026-09-15', sets: [[null, 12], [null, 10]] },
    ]
    await install(page, world(bw))
    await openRunner(page, { history: bw })
    await openSheet(page); await sheetReady(page)
    const card = await readCard(page, '#rs-body')
    expect(card.pills, 'Reps only').toEqual(['reps*'])
    expect(card.rows[0]).toContain('12 reps · 10 reps')
    expect(card.tiles.top).toContain('–')
    expect(card.records, 'no weight, so no weight records').toEqual({})
    await expect.poll(async () => (await chartOf(page, 'rs-chart'))?.sets[0]).toEqual([19, 20, 22])
  })

  test('one session so far: the numbers show and the chart says why there is no line yet — a ticked set then draws it', async ({ page }) => {
    const one = [{ date: '2026-09-29', sets: [[105, 5], [105, 5]] }]
    await install(page, world(one))
    await openRunner(page, { history: one })
    await openSheet(page); await sheetReady(page)
    await expect(page.locator('#rs-body [data-xs-chartnote]')).toContainText(/not enough sessions/i)
    await expect(page.locator('#rs-body canvas')).toHaveCount(0)
    expect((await readCard(page, '#rs-body')).rows.length).toBe(1)
    await closeSheet(page)
    await tick(page, { weight: '107.5', reps: '5', effort: '' })
    await openSheet(page); await sheetReady(page)
    await expect(page.locator('#rs-body canvas')).toHaveCount(1)
  })

  test('(review) if Chart.js never loaded the numbers still show, the chart says so, and the ✕ still closes the sheet', async ({ page }) => {
    await install(page, world())
    await openRunner(page)
    await page.evaluate(() => { window.__chart = window.Chart; window.Chart = undefined })
    await openSheet(page); await sheetReady(page)
    await expect(page.locator('#rs-body [data-xs-chartnote]')).toContainText(/could not load/i)
    expect(Object.keys((await readCard(page, '#rs-body')).records).length, 'the records are still there').toBe(4)
    await closeSheet(page)
    await page.evaluate(() => { window.Chart = window.__chart })
  })

  test('(review) if Chart.js goes missing after the chart is drawn, the ✕ still closes the sheet', async ({ page }) => {
    await install(page, world())
    await openRunner(page)
    await openSheet(page); await sheetReady(page)
    await expect.poll(async () => (await chartOf(page, 'rs-chart'))?.labels.length).toBe(7)
    await page.evaluate(() => { window.__chart = window.Chart; window.Chart = undefined })
    await closeSheet(page)
    await page.evaluate(() => { window.Chart = window.__chart })
  })

  test('(review) an exercise name is text, never markup, on the My progress card', async ({ page }) => {
    const evil = 'Lay <img src=x onerror="window.__xss=1">'
    await install(page, [row(evil, ME, HISTORY[0]), row(evil, ME, HISTORY[1])])
    await showMyProgress(page, evil)
    await expect(page.locator('.xs-card-name').first()).toHaveText(evil)
    expect(await page.evaluate(() => window.__xss), 'nothing ran').toBeUndefined()
    expect(await page.locator('#perf-ex-list img').count(), 'no image element was created from the name').toBe(0)
  })

  for (const width of [480, 320]) {
    test(`at a ${width}px phone the card fits: no sideways scroll, no clipped numbers`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      // The newest session is a heavy one (ten sets of 100 x 12 = 12,000), so the strip carries its widest realistic figures:
      // a six-character volume and an eight-character change (+10,170) in the narrowest tiles.
      const heavy = [...HISTORY.slice(0, 6), { date: '2026-09-29', sets: Array.from({ length: 10 }, () => [100, 12]) }]
      await install(page, world(heavy))
      await openRunner(page, { history: heavy })
      await openSheet(page); await sheetReady(page)
      expect((await readCard(page, '#rs-body')).tiles.volume, 'the stress figures really are on screen').toBe('12,000 | ▲ 10,170')
      const m = await page.evaluate(() => {
        const modal = document.querySelector('#runner-stats-modal .modal')
        const clipped = [...document.querySelectorAll('#rs-body .xs-tv, #rs-body .xs-td, #rs-body .xs-tl')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent)
        // The measure pills are a deliberate sideways-scrolling row, so what is INSIDE it may run past the edge; the row itself may not.
        const wide = [...document.querySelectorAll('#rs-body *')].filter(e => !e.closest('.xs-pills') || e.classList.contains('xs-pills')).filter(e => e.getBoundingClientRect().right > modal.getBoundingClientRect().right + 1).map(e => e.className || e.tagName)
        return { pageScroll: document.documentElement.scrollWidth - innerWidth, modalScroll: modal.scrollWidth - modal.clientWidth, clipped, wide }
      })
      expect(m.pageScroll, 'the page does not scroll sideways').toBeLessThanOrEqual(0)
      expect(m.modalScroll, 'nor does the sheet').toBeLessThanOrEqual(0)
      expect(m.clipped, 'no number is cut off').toEqual([])
      expect(m.wide, 'nothing sticks out of the sheet').toEqual([])
    })
  }
})
