const { test, expect } = require('./fixtures')
const { loginAsPT, soloReady } = require('./helpers')

// ─── Jake, 2026-10-13: "the UI in this section needs a rework" - My Progress > Body Weight ─────────────────────────────────────────────────────────────────────────────
// docs/bugs/2026-10-13-progress-page-needs-a-ui-rework-starting-with-the-body-weight-section.md; prototype https://claude.ai/artifact/AvgWLiWo4ogERWiRzJJomm.
//
// One goal card (current weight, the change since you started, a bar and "x to go") instead of the start/goal line and three tiles; the log form is a slide-up sheet (a stepper
// pre-filled with the last entry, the date, body fat / resting HR / note folded away); the entries are grouped by month with the change since the one before. The chart is untouched.
//
// Every read is stubbed (the real renderer runs on rows made here) and nothing is written to the database.

test.use({ timezoneId: 'Europe/London' })

const row = (date, kg, extra = {}) => ({ date, weight_kg: kg, body_fat_pct: null, resting_hr: null, ...extra })
// Oldest first, as the page asks for them: 24 Jun 109.2 ... 12 Oct 110.3 (9 entries: three months and a half)
const LOGS = [row('2026-06-24', 109.2), row('2026-07-15', 108.4), row('2026-08-10', 107.4), row('2026-08-25', 106.8), row('2026-09-03', 107.3), row('2026-09-05', 105.2), row('2026-09-15', 108.0), row('2026-10-06', 109.7), row('2026-10-12', 110.3, { body_fat_pct: 19.5 })]

async function soloView(page) {
  await soloReady(page)
}

// Renders the real renderProgressWeight into a scratch host over stubbed reads. unit 'lb' puts the page in pounds.
async function show(page, { logs = LOGS, start = 114, goal = 100, unit = 'kg' } = {}) {
  await page.evaluate(async ({ logs, start, goal, unit }) => {
    window.__realFrom = window.__realFrom || db.from.bind(db)
    const chain = result => { const o = { select: () => o, eq: () => o, order: () => o, single: () => Promise.resolve(result), range: () => Promise.resolve(result), then: (res, rej) => Promise.resolve(result).then(res, rej) }; return o }
    db.from = t => t === 'weight_logs' ? chain({ data: logs, error: null, count: logs.length }) : t === 'clients' ? chain({ data: { starting_weight_kg: start, goal_weight_kg: goal }, error: null }) : window.__realFrom(t)
    window._unitPrefs.weight = unit
    document.getElementById('wt-host')?.remove()
    const el = document.createElement('div'); el.id = 'wt-host'; el.className = 'pw-test'; document.body.appendChild(el)
    await renderProgressWeight(el)
  }, { logs, start, goal, unit })
  await expect(page.locator('#wt-host #pw-goalcard, #wt-host .empty-state')).toBeVisible()
}
const host = page => page.locator('#wt-host')

test.describe('Body Weight: the goal card, the log sheet and the list (2026-10-13)', () => {
  test('the goal card says where you are against your goal: current weight, change since you started, a bar and what is left', async ({ page }) => {
    await soloView(page)
    await show(page)
    await expect(host(page).locator('.pw-big')).toHaveText('110.3 kg')
    await expect(host(page).locator('#pw-goalcard .pw-pill')).toHaveText('▼ 3.7 kg since you started')
    await expect(host(page).locator('#pw-goalcard .pw-pill'), 'moving towards the goal is green').toHaveClass(/is-good/)
    await expect(host(page).locator('.pw-bar')).toHaveAttribute('aria-valuenow', '26')       // (114 - 110.3) / (114 - 100)
    await expect(host(page).locator('.pw-legend')).toContainText('Start 114 kg')
    await expect(host(page).locator('.pw-legend')).toContainText('10.3 kg to go')
    await expect(host(page).locator('.pw-legend')).toContainText('Goal 100 kg')
    // the three old tiles are gone
    await expect(host(page).getByText('Starting', { exact: true }), 'the Starting / Current / Change tiles').toHaveCount(0)
    await expect(host(page).getByText('Change', { exact: true })).toHaveCount(0)
    // "Edit start and goal" reveals the editor and goes away itself
    await expect(host(page).locator('#wg-editor')).toBeHidden()
    await host(page).getByRole('button', { name: 'Edit start and goal' }).click()
    await expect(host(page).locator('#wg-editor')).toBeVisible()
  })

  test('moving away from the goal is grey, passing it says "Goal reached", and a gain goal reads the other way round', async ({ page }) => {
    await soloView(page)
    await show(page, { logs: [row('2026-09-01', 100), row('2026-10-01', 104)], start: 100, goal: 90 })
    await expect(host(page).locator('#pw-goalcard .pw-pill'), 'up 4 kg against a loss goal').not.toHaveClass(/is-good/)
    await expect(host(page).locator('.pw-bar')).toHaveAttribute('aria-valuenow', '0')       // never negative
    await show(page, { logs: [row('2026-09-01', 100), row('2026-10-01', 89)], start: 100, goal: 90 })
    await expect(host(page).locator('.pw-legend')).toContainText('Goal reached')
    await expect(host(page).locator('.pw-bar')).toHaveAttribute('aria-valuenow', '100')     // never over
    await show(page, { logs: [row('2026-09-01', 60), row('2026-10-01', 63)], start: 60, goal: 70 })
    await expect(host(page).locator('#pw-goalcard .pw-pill'), 'up 3 kg towards a gain goal').toHaveClass(/is-good/)
    await expect(host(page).locator('.pw-legend')).toContainText('7.0 kg to go')
  })

  test('with no goal set there is no bar, the setup card stays, and the change is grey', async ({ page }) => {
    await soloView(page)
    await show(page, { start: null, goal: null })
    await expect(host(page).locator('.pw-bar')).toHaveCount(0)
    await expect(host(page).getByRole('button', { name: 'Edit start and goal' })).toHaveCount(0)
    await expect(host(page).locator('#wg-starting')).toBeVisible()      // the setup card, not folded away
    await expect(host(page).locator('#pw-goalcard .pw-pill')).not.toHaveClass(/is-good/)
    await expect(host(page).locator('#pw-goalcard .pw-pill')).toContainText('since you started')
  })

  test('the entries are grouped by month, newest first, each with the change since the one before; six show and Show all opens the rest', async ({ page }) => {
    await soloView(page)
    await show(page)
    await expect(host(page).locator('.pw-group:visible')).toHaveText(['October 2026', 'September 2026', 'August 2026'])
    const first = host(page).locator('.pw-item').first()
    await expect(first.locator('.pw-item-date')).toHaveText('12 Oct 2026')
    await expect(first.locator('.pw-item-w')).toHaveText('110.3 kg')
    await expect(first.locator('.pw-pill'), 'up 0.6 kg since 6 Oct, and up is away from a loss goal: grey').toHaveText('▲ 0.6 kg')
    await expect(first.locator('.pw-pill')).not.toHaveClass(/is-good/)
    await expect(first.locator('.pw-item-bf')).toHaveText('19.5% BF')
    await expect(host(page).locator('.pw-item:has(.pw-item-date:text-is("5 Sep 2026"))').locator('.pw-pill'), 'down 2.1 kg: green').toHaveClass(/is-good/)
    await expect(host(page).locator('.pw-item:visible')).toHaveCount(6)
    await expect(host(page).locator('.pw-item', { hasText: '24 Jun 2026' }).locator('.pw-pill'), 'the oldest entry has nothing before it').toHaveCount(0)
    await host(page).getByRole('button', { name: 'Show all 9 entries' }).dispatchEvent('click')      // dispatched: the floating PT / Personal switch can sit over the button at the foot of the page
    await expect(host(page).locator('.pw-item:visible')).toHaveCount(9)
    await expect(host(page).locator('.pw-group:visible')).toHaveText(['October 2026', 'September 2026', 'August 2026', 'July 2026', 'June 2026'])
    await host(page).getByRole('button', { name: 'Show fewer' }).dispatchEvent('click')
    await expect(host(page).locator('.pw-item:visible')).toHaveCount(6)
  })

  test('a date is a calendar day: 1 Oct shows as 1 Oct for a viewer west of UTC too', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/Los_Angeles' })
    const page = await ctx.newPage()
    try {
      await soloView(page)
      await show(page, { logs: [row('2026-09-30', 100), row('2026-10-01', 101)] })
      await expect(host(page).locator('.pw-item').first().locator('.pw-item-date')).toHaveText('1 Oct 2026')
      await expect(host(page).locator('.pw-group').first()).toHaveText('October 2026')
    } finally { await ctx.close() }
  })

  test('the log sheet: hidden until + Log weight, pre-filled with the last entry, nudged by the - / + buttons, extras folded away, Cancel closes it', async ({ page }) => {
    await soloView(page)
    await show(page)
    const sheet = host(page).locator('#client-weight-form')
    await expect(sheet).toBeHidden()
    await host(page).getByRole('button', { name: '+ Log weight' }).click()
    await expect(sheet).toBeVisible()
    await expect(host(page).locator('#cwf-weight')).toHaveValue('110.3')
    await expect(host(page).locator('.pw-unit')).toHaveText('kg · last time 110.3 kg')
    await host(page).getByRole('button', { name: 'Up 0.1' }).click()
    await expect(host(page).locator('#cwf-weight')).toHaveValue('110.4')
    await host(page).getByRole('button', { name: 'Down 0.1' }).click()
    await host(page).getByRole('button', { name: 'Down 0.1' }).click()
    await expect(host(page).locator('#cwf-weight')).toHaveValue('110.2')
    await expect(host(page).locator('#cwf-more'), 'body fat, resting HR and the note are folded away').toBeHidden()
    await host(page).getByRole('button', { name: /Add body fat, resting HR or a note/ }).click()
    await expect(host(page).locator('#cwf-bf')).toBeVisible()
    await expect(host(page).locator('#cwf-resting-hr')).toBeVisible()
    await expect(host(page).locator('#cwf-notes')).toBeVisible()
    await host(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(sheet).toBeHidden()
  })

  test('the date defaults to the LOCAL day: 00:30 in London in the summer is the 13th, not the UTC 12th', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-12T23:30:00Z'))      // 00:30 on 13 Oct in London (BST)
    await soloView(page)
    await show(page)
    await expect(host(page).locator('#cwf-date')).toHaveValue('2026-10-13')
  })

  test('saving the pre-filled box untouched stores the exact last kg again, in pounds too (no 110.3 -> 110.29 drift)', async ({ page }) => {
    await soloView(page)
    await show(page, { unit: 'lb' })
    await expect(host(page).locator('#cwf-weight')).toHaveValue('243.2')      // 110.3 kg shown in lb
    const saved = await page.evaluate(async () => {
      window._verifyClientAccess = async () => true
      let payload = null
      const real = db.from
      db.from = t => t === 'weight_logs' ? { insert: async row => { payload = row; return { error: null } } } : real(t)
      window.renderProgressWeight = async () => {}      // the save repaints the page; not under test
      window._renderOwnDashboard = async () => {}      // a scratch host has no #progress-tab-content, so the save would repaint the dashboard instead
      await saveClientWeight('cid')
      return payload
    })
    expect(saved.weight_kg, 'the stored kg, verbatim').toBe(110.3)
    expect(saved.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('a weight typed over the pre-filled one is converted from the display unit as before', async ({ page }) => {
    await soloView(page)
    await show(page, { unit: 'lb' })
    await host(page).getByRole('button', { name: '+ Log weight' }).click()
    await host(page).locator('#cwf-weight').fill('220')
    const saved = await page.evaluate(async () => {
      window._verifyClientAccess = async () => true
      let payload = null
      const real = db.from
      db.from = t => t === 'weight_logs' ? { insert: async row => { payload = row; return { error: null } } } : real(t)
      window.renderProgressWeight = async () => {}
      await saveClientWeight('cid')
      return payload
    })
    expect(saved.weight_kg).toBeCloseTo(220 / 2.20462, 3)
  })

  test('both goals set and nothing logged yet: the goals editor is open, not hidden behind a button that is not there', async ({ page }) => {
    await soloView(page)
    await show(page, { logs: [] })      // start 114, goal 100
    await expect(host(page).locator('#wg-starting'), 'the goal fields are on the page, not folded behind a button that does not exist yet').toBeVisible()
    await expect(host(page).locator('#wg-starting')).toHaveValue('114')
    await expect(host(page).locator('#wg-goal')).toHaveValue('100')
  })

  test('a change under a tenth is "no change", never "0.0 kg", and the big number is rounded like the rest', async ({ page }) => {
    await soloView(page)
    await show(page, { logs: [row('2026-09-01', 100), row('2026-10-01', 100.04)], start: 100, goal: 90 })
    await expect(host(page).locator('#pw-goalcard .pw-pill')).toHaveText('No change since you started')
    await expect(host(page).locator('.pw-item .pw-pill'), 'no 0.0 kg pill on the list either').toHaveCount(0)
    await show(page, { logs: [row('2026-10-01', 82.333)], start: 85, goal: 80 })
    await expect(host(page).locator('.pw-big')).toHaveText('82.3 kg')
  })

  test('a weight outside 20 to 300 kg is refused with a message, and nothing is written', async ({ page }) => {
    await soloView(page)
    await show(page)
    await host(page).getByRole('button', { name: '+ Log weight' }).click()
    const r = await page.evaluate(async () => {
      window._verifyClientAccess = async () => true
      let inserted = 0
      const real = db.from
      db.from = t => t === 'weight_logs' ? { insert: async () => { inserted++; return { error: null } } } : real(t)
      const out = {}
      for (const v of ['-5', '1000000000', '19']) {
        document.getElementById('cwf-weight').value = v
        await saveClientWeight('cid')
        out[v] = document.getElementById('cwf-error').textContent
      }
      out.inserted = inserted
      return out
    })
    for (const v of ['-5', '1000000000', '19']) expect(r[v], `${v} is refused`).toBe('Enter a weight between 20 kg and 300 kg.')
    expect(r.inserted).toBe(0)
  })

  // docs/bugs/2026-11-17-weight-7-day-average-is-a-7-entry-average.md: the average is over 7 DAYS of weigh-ins, and the chart has a range (Jake, 2026-11-17).
  test('the chart opens on 3M with a real 7-day average; 1M with under two weigh-ins says so; All shows every weigh-in', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-17T12:00:00Z'))
    await soloView(page)
    await show(page)
    const pressed = host(page).locator('[data-pw-range][aria-pressed="true"]')
    await expect(pressed).toHaveText('3M')
    // Points are { x: day number, y } since the axis is by date (2026-11-18): the values are the y's.
    const data = () => page.evaluate(() => { const c = Chart.getChart('pw-chart'); return c ? c.data.datasets.slice(0, 2).map(d => d.data.map(p => Number(p.y))) : null })
    // 3M = 20 Aug to 17 Nov: the six weigh-ins from 25 Aug. Each average is the weigh-ins on that day and the 6 days before it.
    expect(await data()).toEqual([[106.8, 107.3, 105.2, 108, 109.7, 110.3], [106.8, 107.3, 106.25, 108, 109.7, 110]])
    await host(page).locator('[data-pw-range="1M"]').click()
    await expect(pressed).toHaveText('1M')
    await expect(host(page).locator('#pw-chart-empty')).toHaveText('Fewer than 2 weigh-ins in the last month. Pick a longer range to see the chart.')
    await expect(host(page).locator('#pw-chart-wrap')).toBeHidden()
    expect(await data(), 'no chart is left on screen from the range before').toBeNull()
    await host(page).locator('[data-pw-range="All"]').click()
    await expect(host(page).locator('#pw-chart-empty')).toBeHidden()
    expect((await data())[0].length, 'All: every weigh-in').toBe(9)
  })

  test('when the last 3 months hold under two weigh-ins the chart opens on All instead of an empty range', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-17T12:00:00Z'))
    await soloView(page)
    await show(page, { logs: [row('2026-02-01', 90), row('2026-03-01', 89)] })
    await expect(host(page).locator('[data-pw-range][aria-pressed="true"]')).toHaveText('All')
    await expect(host(page).locator('#pw-chart-empty')).toBeHidden()
  })

  // 2026-11-18 (audit backlog #5): the chart spaces weigh-ins by their DATE, so a three-week gap looks like three weeks, not like the next day.
  test('the weight chart places each weigh-in by its date: a gap of 21 days is 21 times a gap of one day, and the axis reads as dates', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-17T12:00:00Z'))
    await soloView(page)
    await show(page, { logs: [row('2026-10-01', 90), row('2026-10-02', 89.8), row('2026-10-23', 89)] })
    await host(page).locator('[data-pw-range="All"]').click()
    const r = await page.evaluate(() => {
      const c = Chart.getChart('pw-chart'), xs = c.data.datasets[0].data.map(p => p.x)
      return { type: c.options.scales.x.type, gaps: [xs[1] - xs[0], xs[2] - xs[1]], tick: c.options.scales.x.ticks.callback(xs[2]) }
    })
    expect(r).toEqual({ type: 'linear', gaps: [1, 21], tick: '23 Oct' })
  })

  test('MIRROR: a chart whose points all fall on one day still draws them (one session, a first weigh-in)', async ({ page }) => {
    await soloView(page)
    const r = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.id = 'one-day-chart'; c.width = 300; c.height = 150; document.body.appendChild(c)
      const ch = _renderMetricChart(c, { labels: ['1 Oct'], dates: ['2026-10-01'], series: [{ data: [100] }], legend: false })
      const p = ch.getDatasetMeta(0).data[0], out = { x: p.x, y: p.y }
      ch.destroy(); c.remove(); return out
    })
    expect(Number.isFinite(r.x) && Number.isFinite(r.y), `the point has a place on the canvas: ${JSON.stringify(r)}`).toBe(true)
  })

  test('with one weigh-in in all, the chart says when it will appear rather than asking for a longer range', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-17T12:00:00Z'))
    await soloView(page)
    await show(page, { logs: [row('2026-11-10', 90)] })
    await expect(host(page).locator('#pw-chart-empty')).toHaveText('The chart appears from your second weigh-in.')
  })

  test('with no entries yet the page says so, and the log button and sheet are still there', async ({ page }) => {
    await soloView(page)
    await show(page, { logs: [] })
    await expect(host(page).getByText('No weight logs yet')).toBeVisible()
    await expect(host(page).getByRole('button', { name: '+ Log weight' })).toBeVisible()
    await expect(host(page).locator('#client-weight-form')).toBeAttached()
    await expect(host(page).locator('#cwf-weight'), 'nothing to pre-fill').toHaveValue('')
  })
})
