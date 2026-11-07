const { test, expect } = require('./fixtures')
const { loginAsClient, loginAsPT } = require('./helpers')
const { installCappedApi, restoreCappedApi } = require('./capped-api')

// ─── Sessions: vs last time, set by set, and weekly volume (Jake, approved 2026-11-07) ────────────────────────────────────────────
// docs/superpowers/specs/2026-10-31-performance-charts-design.md, goal 3. The REAL render functions over tests/capped-api.js, with the clock pinned and nothing written. The rules
// (which session is last time, what a mark means, what the bars count) are pinned in tests-node/session-compare.test.mjs; this is what the screen does with them.
test.use({ timezoneId: 'Europe/London' })

const CID = 'sc-c1'
const set = (set_number, weight_kg, reps_achieved, extra = {}) => ({ set_number, weight_kg, reps_achieved, ...extra })
const ex = (exercise_name, sets, extra = {}) => ({ exercise_name, exercise_type: 'strength', metric_type: 'weight_reps', workout_log_sets: sets, ...extra })
const log = (id, date, name, family, exercises) => ({ id, client_id: CID, name, date, created_at: date + 'T07:00:00Z', workout_templates: family ? { family_id: family } : null, workout_log_exercises: exercises })

const THIS_TIME = log('l3', '2026-11-05', 'Upper wk6', 'F', [ex('Bench', [set(1, 105, 5), set(2, 100, 5)]), ex('Row', [set(1, 80, 8)]), ex('Curl', [set(1, 20, 10)])])
const OTHER = log('l2', '2026-11-03', 'Lower', 'G', [ex('Squat', [set(1, 120, 5)])])
const LAST_TIME = log('l1', '2026-10-29', 'Upper wk5', 'F', [ex('Bench', [set(1, 100, 5), set(2, 100, 5), set(3, 100, 5)]), ex('Row', [set(1, 80, 8)]), ex('Press', [set(1, 50, 5)])])

async function show(page, logs, { unit = 'kg', fail = false } = {}) {
  await page.clock.setFixedTime(new Date('2026-11-05T10:00:00Z'))
  await page.evaluate((unit) => { window._unitPrefs = { ...(window._unitPrefs || {}), weight: unit } }, unit)
  await restoreCappedApi(page)
  await installCappedApi(page, { workout_logs: fail ? { error: { code: 'XX000', message: 'simulated' } } : logs })
  await page.evaluate(async (cid) => {
    const el = document.getElementById('main-content'); el.innerHTML = '<div id="sc-host"></div>'
    await renderProgressPerSession(cid, document.getElementById('sc-host'))
  }, CID)
}
const vsLines = (page) => page.locator('#sc-host [data-vs-last]')
const open = (page, i) => page.evaluate((i) => _togglePerfSession(i), i)
const exRow = (page, name) => page.locator(`#sc-host [data-sc-ex="${name}"]`)

test.describe('Sessions: vs last time', () => {
  test.beforeEach(async ({ page }) => { await loginAsClient(page) })

  test('the card keeps its four tiles and adds the change against the last time of that workout, skipping a different workout in between', async ({ page }) => {
    await show(page, [THIS_TIME, OTHER, LAST_TIME])
    await expect(vsLines(page).first()).toHaveText('vs Thu 29 Oct: −525 kg · 0 of 2 exercises up')
    await expect(page.locator('#sc-host button').filter({ hasText: 'Upper wk6' }).getByText('Volume')).toBeVisible()
    await expect(vsLines(page).nth(1), 'Lower has never been done before').toHaveText('First time doing this workout')
  })

  test('tapping a session compares it set by set: marks, verdicts, totals, and what was not done', async ({ page }) => {
    await show(page, [THIS_TIME, OTHER, LAST_TIME])
    await open(page, 0)
    const bench = exRow(page, 'Bench')
    await expect(bench.locator('[data-sc-mark]')).toHaveCount(3)
    expect(await bench.locator('[data-sc-mark]').evaluateAll(els => els.map(e => e.dataset.scMark))).toEqual(['up', 'same', 'missing'])
    await expect(bench.locator('[data-sc-verdict]')).toHaveText('Fewer sets')
    await expect(bench.locator('[data-sc-total]')).toHaveText('Total 1,500 kg → 1,025 kg')
    await expect(bench.locator('[data-sc-set]').first()).toContainText('100×5')
    await expect(bench.locator('[data-sc-set]').first()).toContainText('105×5')
    await expect(exRow(page, 'Row').locator('[data-sc-verdict]')).toHaveText('Same as last time')
    await expect(exRow(page, 'Curl').locator('[data-sc-verdict]')).toHaveText('New this time')
    await expect(exRow(page, 'Press').locator('[data-sc-verdict]')).toHaveText('Not done this time')
    await expect(exRow(page, 'Curl').locator('[data-sc-total]'), 'nothing to compare a new lift with').toHaveCount(0)
  })

  test('the card and the panel agree on "up": one exercise improved, one of the two in both', async ({ page }) => {
    const better = log('l9', '2026-11-05', 'Upper wk6', 'F', [ex('Bench', [set(1, 105, 5), set(2, 100, 5), set(3, 100, 5)]), ex('Row', [set(1, 80, 8)])])
    await show(page, [better, LAST_TIME])
    await expect(vsLines(page).first()).toContainText('1 of 2 exercises up')
    await open(page, 0)
    await expect(page.locator('#sc-host [data-sc-verdict="improved"]')).toHaveCount(1)
  })

  test('with no last time, the panel stays the diary it was', async ({ page }) => {
    await show(page, [OTHER])
    await open(page, 0)
    await expect(page.locator('#perf-sess-0')).toContainText('120×5')
    await expect(page.locator('#perf-sess-0 [data-sc-ex]')).toHaveCount(0)
  })

  test('a session with no sets says so, and claims no comparison', async ({ page }) => {
    await show(page, [log('l5', '2026-11-05', 'Upper wk6', 'F', [ex('Bench', [])]), LAST_TIME])
    await expect(page.locator('#sc-host').getByText('No sets logged')).toBeVisible()
    await expect(page.locator('#sc-host button').first().locator('[data-vs-last]')).toHaveCount(0)
  })

  test('last time is found past the ten cards and past the 200-row cap, and the bars see every session', async ({ page }) => {
    const filler = Array.from({ length: 205 }, (_, n) => log('f' + String(n).padStart(3, '0'), '2026-10-' + String(1 + (n % 28)).padStart(2, '0'), 'Filler ' + n, 'X' + n, [ex('Row', [set(1, 50, 5)])]))
    await show(page, [THIS_TIME, ...filler, log('l0', '2026-01-05', 'Upper wk1', 'F', [ex('Bench', [set(1, 90, 5)])])])
    await expect(vsLines(page).first()).toContainText('vs Mon 5 Jan')
    await expect(page.locator('[data-sv-week="2026-10-05"] .sv-val'), 'every filler session counts, not just the ten on cards').toHaveText('54')
    await expect(page.locator('#sc-host').locator('[data-vs-last]')).toHaveCount(10)
  })

  test('a failed read says so, and never "No sessions logged yet"', async ({ page }) => {
    await show(page, [], { fail: true })
    await expect(page.locator('#sc-host')).toContainText("Couldn't load the sessions")
    await expect(page.locator('#sc-host')).not.toContainText('No sessions logged yet')
  })

  test('one failed page of a long history still shows the latest sessions, without comparisons or a false "first time"', async ({ page }) => {
    const body = JSON.stringify([THIS_TIME, OTHER, LAST_TIME])
    await page.route('**/rest/v1/workout_logs*', route => (Number(new URL(route.request().url()).searchParams.get('offset')) > 0
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"simulated"}' })
      : route.fulfill({ status: 200, contentType: 'application/json', body })))
    await page.clock.setFixedTime(new Date('2026-11-05T10:00:00Z'))
    await page.evaluate(async (cid) => {
      const el = document.getElementById('main-content'); el.innerHTML = '<div id="sc-host"></div>'
      await renderProgressPerSession(cid, document.getElementById('sc-host'))
    }, CID)
    await expect(page.locator('#sc-host [data-sessions-partial]')).toBeVisible()
    await expect(page.locator('#sc-host').getByText('Upper wk6')).toBeVisible()
    await expect(vsLines(page), 'no comparison, and no "First time", from a partial history').toHaveCount(0)
    await expect(page.locator('[data-session-volume]')).toHaveCount(0)
  })

  test('a hold that got longer reads "Changed", never "Same as last time"', async ({ page }) => {
    const plank = (s) => ex('Plank', [set(1, null, null, { duration_seconds: s })], { metric_type: 'timed' })
    await show(page, [log('a', '2026-11-05', 'Core', 'F', [plank(60)]), log('b', '2026-10-29', 'Core', 'F', [plank(45)])])
    await open(page, 0)
    await expect(exRow(page, 'Plank').locator('[data-sc-verdict]')).toHaveText('Changed')
    await expect(vsLines(page).first()).toHaveText('vs Thu 29 Oct')
  })

  test('a name that looks like markup is shown as text, never run', async ({ page }) => {
    const bad = '<img src=x onerror="window.__pwned=1">'
    await show(page, [log('a', '2026-11-05', bad, 'F', [ex(bad, [set(1, 100, 5)])]), log('b', '2026-10-29', bad, 'F', [ex(bad, [set(1, 100, 5)])])])
    await open(page, 0)
    await expect(page.locator('#perf-sess-0 .sc-head')).toContainText('<img')
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined()
    expect(await page.locator('#sc-host img').count()).toBe(0)
  })
})

test.describe('Sessions: weekly volume', () => {
  test.beforeEach(async ({ page }) => { await loginAsClient(page) })

  test('sets per week for eight weeks, this week highlighted, with a switch to total kg', async ({ page }) => {
    await show(page, [THIS_TIME, OTHER, LAST_TIME])
    const weeks = page.locator('[data-sv-week]')
    await expect(weeks).toHaveCount(8)
    await expect(weeks.last()).toHaveClass(/sv-now/)
    await expect(weeks.last().locator('.sv-val'), 'this week: 4 sets of Upper and 1 of Lower').toHaveText('5')
    await expect(page.locator('[data-session-volume]')).toContainText('Sets per week')
    await page.locator('[data-sv-mode="kg"]').click()
    await expect(page.locator('[data-session-volume]')).toContainText('Total kg per week')
    await expect(weeks.last().locator('.sv-val'), '525 + 500 + 640 + 200 + 600 = 2,465 kg').toHaveText('2.5k')
    await expect(page.locator('[data-sv-mode="kg"]')).toHaveAttribute('aria-pressed', 'true')
  })

  test('pounds: the bars, the line and the totals all follow the person\'s unit', async ({ page }) => {
    await show(page, [THIS_TIME, OTHER, LAST_TIME], { unit: 'lb' })
    await expect(vsLines(page).first()).toContainText('lb')
    await expect(vsLines(page).first()).not.toContainText('kg')
    await expect(page.locator('[data-sv-mode="kg"]')).toHaveText('lb')
    await open(page, 0)
    await expect(exRow(page, 'Bench').locator('[data-sc-total]')).toContainText('lb')
  })

  test('no training in eight weeks: empty bars and no division by zero', async ({ page }) => {
    await show(page, [log('old', '2026-01-05', 'Upper', 'F', [ex('Bench', [set(1, 100, 5)])])])
    await expect(page.locator('[data-sv-week]')).toHaveCount(8)
    expect(await page.locator('.sv-bar').evaluateAll(els => els.every(e => e.style.height === '0%'))).toBe(true)
  })

  for (const width of [390, 320]) {
    test(`no sideways scroll at ${width} px, and the switch is a real tap target`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      const long = 'Single Arm Dumbbell Romanian Deadlift With A Very Long Name Indeed'
      await show(page, [log('a', '2026-11-05', 'Upper wk6', 'F', [ex(long, [set(1, 102.5, 12, { effort_type: 'rpe', effort_value: 8 })])]), log('b', '2026-10-29', 'Upper wk5', 'F', [ex(long, [set(1, 100, 12, { effort_type: 'rpe', effort_value: 8 })])])])
      await open(page, 0)
      await expect(page.locator('#perf-sess-0 [data-sc-ex]')).toHaveCount(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
      const heights = await page.locator('.sv-pill').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)))
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(44)
    })
  }
})

test.describe('Sessions on the coach\'s client profile', () => {
  test('the Performance tab shows the client\'s records and their sessions, each in its own place', async ({ page }) => {
    await loginAsPT(page)
    await page.evaluate(() => { document.getElementById('main-content').innerHTML = '<button class="tab-btn" id="sc-tab"></button><div id="tab-content"></div>' })
    await page.clock.setFixedTime(new Date('2026-11-05T10:00:00Z'))
    await installCappedApi(page, { workout_logs: [THIS_TIME, LAST_TIME], performance_logs: [] })
    await page.evaluate((cid) => switchTab(document.getElementById('sc-tab'), 'tab-performance', cid), CID)
    await expect(page.locator('#client-sessions-section [data-vs-last]').first()).toContainText('vs Thu 29 Oct')
    await expect(page.locator('#client-sessions-section [data-session-volume]')).toBeVisible()
    await expect(page.locator('#pb-performance-section')).not.toContainText('Loading')
    expect((await page.locator('#pb-performance-section').innerText()).trim().length, 'the records section really drew').toBeGreaterThan(0)
    await page.evaluate((cid) => _refreshClientPerformance(cid), CID)
    await expect(page.locator('#client-sessions-section [data-vs-last]').first(), 'saving a record refreshes the records, and leaves the sessions alone').toBeVisible()
    await restoreCappedApi(page)
  })
})
