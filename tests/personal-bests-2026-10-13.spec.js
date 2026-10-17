const { test, expect } = require('./fixtures')
const { loginAsPT, acceptConfirm } = require('./helpers')

// ─── Jake, 2026-10-13: "page needs UI rework. you should be able to click into an exercise and see exercise/personal best data for that exercise" ───────────────────────────────────
// docs/bugs/2026-10-13-progress-page-needs-a-ui-rework-starting-with-the-body-weight-section.md; prototype https://claude.ai/artifact/AvgWLiWo4ogERWiRzJJomm.
//
// Personal Bests is a row per lift (name, when recorded, the change since the one before, the best); a tap opens that lift's page: the best, its history, the heaviest set logged for at
// least 1 / 3 / 5 / 8 / 10 reps, and the estimated 1RM. "Update best" is the Add 1RM sheet and appends a dated client_1rms row. The grid of number boxes and "Save all" is gone.
//
// Every read is stubbed (the real renderers run on rows made here); the writes are captured, never made.

const BEST = [
  { id: 'b2', exercise_name: 'Back Squat', exercise_id: null, one_rm_kg: 160, recorded_at: '2026-09-08' },
  { id: 'm1', exercise_name: 'Military Press', exercise_id: null, one_rm_kg: 75, recorded_at: '2026-07-13' },
  { id: 'd1', exercise_name: 'Deadlift', exercise_id: 'ex-dl', one_rm_kg: 200, recorded_at: '2026-07-01' },
  { id: 'b1', exercise_name: 'Back Squat', exercise_id: null, one_rm_kg: 150, recorded_at: '2026-07-01' }
]
const SESSIONS = {
  'Deadlift': [{ date: '2026-09-14', sets: [{ weight_kg: 200, reps_achieved: 1 }] }],
  'Back Squat': [
    { date: '2026-07-01', sets: [{ weight_kg: 140, reps_achieved: 5, phase: 'work' }, { weight_kg: 60, reps_achieved: 10, phase: 'warmup' }] },
    { date: '2026-09-08', sets: [{ weight_kg: 160, reps_achieved: 1 }, { weight_kg: 140, reps_achieved: 5 }, { weight_kg: 120, reps_achieved: 8 }] },
    { date: '2026-10-05', sets: [{ weight_kg: 135, reps_achieved: 6 }, { weight_kg: 110, reps_achieved: 10 }] }
  ]
}

async function soloView(page) {
  await loginAsPT(page)
  await page.evaluate(() => localStorage.setItem('_activeView', 'solo'))
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => !!window._soloClientId), { timeout: 15000 }).toBe(true)
  await expect(page.locator('#dash-goals')).toBeVisible({ timeout: 20000 })      // the app's start-up navigation has landed (it closes every open modal; a test that opens one first loses it)
  // The bottom bar and the floating PT / Personal switch are fixed over the foot of the page and can sit over what a test clicks: this spec is about the Progress lists, not the chrome.
  await page.addStyleTag({ content: '#mobile-view-switcher, #mobile-view-switcher.mvs-on, .bottom-nav { display: none !important }' })
}

// Renders the real Personal Bests list into a scratch host over stubbed reads. `hostId` is the real container id so the post-write refresh resolves to it.
async function show(page, { rows = BEST, unit = 'kg', hostId = 'pb-1rms-section', sessionsFail = false, bestFail = false } = {}) {
  await page.evaluate(async ({ rows, unit, hostId, sessions, sessionsFail, bestFail }) => {
    window.__realFrom = window.__realFrom || db.from.bind(db)
    window.__writes = { insert: [], deleted: [] }
    // The reads are paged (_fetchAllRows asks for .range(from, to) with an exact count), so the stub answers a range from the filtered rows.
    const q = data => {
      const f = {}
      const rowsNow = () => data.filter(r => Object.entries(f).every(([c, v]) => c === 'client_id' || r[c] === v))
      // an unpaged read gets what the API gives: the first 200 rows, silently
      const answer = (a, b) => bestFail ? { data: null, error: { code: 'E2E' } } : { data: b == null ? rowsNow().slice(0, 200) : rowsNow().slice(a, b + 1), error: null, count: rowsNow().length }
      const o = { select: () => o, eq: (c, v) => { f[c] = v; return o }, order: () => o, range: (a, b) => Promise.resolve(answer(a, b)), then: (res, rej) => Promise.resolve(answer()).then(res, rej) }
      return o
    }
    db.from = t => t === 'client_1rms' ? Object.assign(q(rows), {
      insert: async row => { window.__writes.insert.push(row); return { error: null } },
      delete: () => ({ eq: (c, id) => ({ eq: () => ({ select: async () => { window.__writes.deleted.push(id); return { data: [{ id }], error: null } } }) }) })
    }) : window.__realFrom(t)
    window._fetchExerciseSessions = async (cid, name) => { if (sessionsFail) throw new Error('E2E sessions refused'); return sessions[name] || [] }
    window._verifyClientAccess = async () => true
    // The app's own start-up navigation can land after the test has opened a sheet, and _navigateNow closes every open modal: the sheet vanishes mid-test (found 2026-10-13 with a
    // trace of Element.remove). Nothing here navigates, so the stray one is ignored.
    window._navigateNow = async () => {}
    window._unitPrefs.weight = unit
    document.getElementById('pb-test-host')?.remove()
    document.getElementById('pb-1rms-section')?.remove()
    const el = document.createElement('div'); el.id = hostId; document.body.appendChild(el)
    await renderClient1RMs('cid', el)
  }, { rows, unit, hostId, sessions: SESSIONS, sessionsFail, bestFail })
  await expect(page.locator(`#${hostId} .pb-row`).first()).toBeVisible()
}
const host = page => page.locator('#pb-1rms-section')
const row = (page, name) => host(page).locator('.pb-row', { hasText: name })

test.describe('Personal Bests: a row per lift, and a page for each (2026-10-13)', () => {
  test('the list: recorded lifts first with their best, date and the change since the one before; lifts with no best say so and offer Record best', async ({ page }) => {
    await soloView(page)
    await show(page)
    await expect(host(page).locator('.pw-title')).toHaveText('My Personal Bests')
    await expect(host(page).locator('.pw-list .pb-name')).toHaveText(['Back Squat', 'Military Press', 'Deadlift', 'Bench Press', 'Overhead Press', 'Barbell Row'])
    await expect(row(page, 'Back Squat').locator('.pb-best')).toHaveText('160 kg')
    await expect(row(page, 'Back Squat').locator('.pb-sub')).toHaveText('Recorded 8 Sep 2026')
    await expect(row(page, 'Back Squat').locator('.pw-pill'), 'up 10 kg on the one before: green').toHaveText('+10 kg')
    await expect(row(page, 'Back Squat').locator('.pw-pill')).toHaveClass(/is-good/)
    await expect(row(page, 'Deadlift').locator('.pw-pill'), 'a single entry has nothing to compare with').toHaveCount(0)
    await expect(host(page).getByText('Not recorded yet', { exact: true }).first()).toBeVisible()
    for (const n of ['Bench Press', 'Overhead Press', 'Barbell Row']) {
      await expect(host(page).locator('.pb-row-static', { hasText: n }).getByRole('button', { name: 'Record best' })).toBeVisible()
    }
    // the grid is gone
    await expect(host(page).locator('input')).toHaveCount(0)
    await expect(host(page).getByRole('button', { name: 'Save all' })).toHaveCount(0)
  })

  test('the coach\'s client-profile tab gets the same list', async ({ page }) => {
    await soloView(page)
    await show(page, { hostId: 'tab-content' })
    await expect(page.locator('#tab-content .pw-title')).toHaveText('Personal Bests')
    await expect(page.locator('#tab-content .pb-row').first()).toBeVisible()
    await page.evaluate(() => document.getElementById('tab-content').remove())
  })

  test('a lift\'s page: the best and what it replaced, the history newest first, the heaviest set for at least each rep count, the estimated 1RM; Back returns to the list', async ({ page }) => {
    await soloView(page)
    await show(page)
    await row(page, 'Back Squat').click()
    await expect(host(page).locator('.pw-title')).toHaveText('Back Squat')
    await expect(host(page).locator('.pw-card').first()).toContainText('160 kg')
    await expect(host(page).locator('.pw-card').first()).toContainText('Recorded 8 Sep 2026 · was 150 kg on 1 Jul 2026')
    await expect(host(page).locator('.pw-card').first().locator('.pw-pill')).toHaveText('+10 kg')
    await expect(host(page).locator('.pw-group')).toHaveText(['Best history', 'Best sets by reps', 'Estimated 1RM'])
    // best history: newest first, each deletable
    const hist = host(page).locator('.pw-card', { has: page.locator('#pb-hist-chart') }).locator('.pw-item')
    await expect(hist.locator('.pw-item-date')).toHaveText(['8 Sep 2026', '1 Jul 2026'])
    await expect(hist.locator('.pw-item-w')).toHaveText(['160 kg', '150 kg'])
    await expect(hist.locator('.pb-del')).toHaveCount(2)
    await expect(host(page).locator('#pb-hist-chart')).toBeVisible()
    // best sets by reps (a set of 6 counts for the 5; warm-ups never count; a tie goes to the later session)
    const reps = host(page).locator('.pw-group', { hasText: 'Best sets by reps' }).locator('xpath=following-sibling::div[1]').locator('.pw-item')
    await expect(reps.locator('.pw-item-date')).toHaveText(['1 rep', '3 reps', '5 reps', '8 reps', '10 reps'])
    await expect(reps.locator('.pw-item-w')).toHaveText(['160 kg', '140 kg', '140 kg', '120 kg', '110 kg'])
    await expect(reps.locator('.pw-item-bf')).toHaveText(['8 Sep 2026', '8 Sep 2026', '8 Sep 2026', '8 Sep 2026', '5 Oct 2026'])
    // estimated 1RM: from the same engine as the Stats sheet, against the recorded best
    const want = await page.evaluate(() => _pbN(_pbE1rmPoints([
      { date: '2026-07-01', sets: [{ weight_kg: 140, reps_achieved: 5, phase: 'work' }] },
      { date: '2026-10-05', sets: [{ weight_kg: 135, reps_achieved: 6 }, { weight_kg: 110, reps_achieved: 10 }] }
    ]).pop().kg))
    await expect(host(page).locator('.pb-e1')).toHaveText(`${want} kg`)
    await expect(host(page).locator('#pb-e1rm-chart')).toBeVisible()
    await expect(host(page).locator('.pb-note').last()).toContainText(/Logged sets point to .* above the recorded best|The recorded best is .* above what logged sets estimate|Logged sets agree with the recorded best/)
    // Back returns to the list
    await host(page).getByRole('button', { name: '‹ Personal Bests' }).click()
    await expect(host(page).locator('.pw-title')).toHaveText('My Personal Bests')
    await expect(row(page, 'Back Squat')).toBeVisible()
  })

  test('_bestSetsByReps and _pbE1rmPoints: at-least reps, ties to the later session, no warm-ups, no bodyweight sets, nothing where nothing qualifies', async ({ page }) => {
    await soloView(page)
    const r = await page.evaluate(() => {
      const sessions = [
        { date: '2026-02-01', sets: [{ weight_kg: 100, reps_achieved: 5 }, { weight_kg: 50, reps_achieved: 12, phase: 'warmup' }, { weight_kg: null, reps_achieved: 20 }] },
        { date: '2026-03-01', sets: [{ weight_kg: 100, reps_achieved: 6 }, { weight_kg: 90, reps_achieved: 3 }] },
        { date: '2026-01-01', sets: [{ weight_kg: 100, reps_achieved: 5 }] }      // out of order on purpose; the same weight as a later one
      ]
      return { by: _bestSetsByReps(sessions, [1, 3, 5, 8, 10]), none: _bestSetsByReps([], [1, 5]), empty: _bestSetsByReps(null, [3]), e1: _pbE1rmPoints([{ date: '2026-01-01', sets: [{ weight_kg: null, reps_achieved: 20 }] }, { date: '2026-02-01', sets: [{ weight_kg: 100, reps_achieved: 5 }] }]) }
    })
    expect(r.by[0], '1+ reps: 100 kg, and the exact tie goes to the later session (1 Mar, not 1 Jan or 1 Feb)').toEqual({ reps: 1, weightKg: 100, date: '2026-03-01' })
    expect(r.by[1]).toEqual({ reps: 3, weightKg: 100, date: '2026-03-01' })
    expect(r.by[2], 'a set of 6 counts for the 5').toEqual({ reps: 5, weightKg: 100, date: '2026-03-01' })
    expect(r.by[3], '8+: nothing qualifies (the 12-rep set was a warm-up, the 20 had no weight)').toBeNull()
    expect(r.by[4]).toBeNull()
    expect(r.none).toEqual([null, null])
    expect(r.empty).toEqual([null])
    expect(r.e1.length, 'a session that estimates nothing is left out').toBe(1)
    expect(r.e1[0].date).toBe('2026-02-01')
  })

  test('in pounds the list and the lift page read in pounds, to one decimal', async ({ page }) => {
    await soloView(page)
    await show(page, { unit: 'lb' })
    await expect(row(page, 'Back Squat').locator('.pb-best')).toHaveText('352.7 lb')      // 160 kg
    await expect(row(page, 'Back Squat').locator('.pw-pill')).toHaveText('+22 lb')       // 10 kg
    await row(page, 'Back Squat').click()
    await expect(host(page).locator('.pw-big').first()).toContainText('352.7')
    await expect(host(page).locator('.pw-item-w').first()).toHaveText('352.7 lb')
  })

  test('if the logged sessions cannot be read the page still shows the best history, and says so where the rest would be', async ({ page }) => {
    await soloView(page)
    await show(page, { sessionsFail: true })
    await row(page, 'Back Squat').click()
    await expect(host(page).locator('.pw-card').first()).toContainText('160 kg')
    await expect(host(page).locator('.pw-item-date').first()).toHaveText('8 Sep 2026')
    await expect(host(page).getByText('Could not load the logged sessions')).toHaveCount(2)      // best sets by reps and the estimate
    await expect(host(page).getByText('No weighted sets logged')).toHaveCount(0)      // a failed read is not "nothing logged"
  })

  test('if the best history cannot be read the page says so, with a way back', async ({ page }) => {
    await soloView(page)
    await show(page)
    await page.evaluate(() => {
      const real = db.from
      db.from = t => t === 'client_1rms' ? (() => { const o = { select: () => o, eq: () => o, order: () => o, range: () => Promise.resolve({ data: null, error: { code: 'E2E' } }) }; return o })() : real(t)
    })
    await row(page, 'Back Squat').click()
    await expect(host(page).getByText("Couldn't load this lift")).toBeVisible()
    await expect(host(page).getByRole('button', { name: '‹ Personal Bests' })).toBeVisible()
  })

  test('Update best opens the sheet for that lift; saving appends a dated row (the Big 5 get their library id) and the lift page repaints; Record best does the same for a new lift', async ({ page }) => {
    await soloView(page)
    await show(page, { unit: 'lb' })
    await page.evaluate(() => { window._effectiveCoachIdForClient = async () => 'coach-1'; window._resolveExerciseIdForSave = async name => 'lib-' + name })
    await row(page, 'Back Squat').click()
    await host(page).getByRole('button', { name: 'Update best' }).click()
    await expect(page.locator('#modal-1rm')).toBeVisible()
    await expect(page.locator('#modal-1rm')).toContainText('Back Squat')
    await expect(page.locator('#modal-1rm').getByRole('button', { name: 'Change' }), 'a lift opened from its own page cannot be swapped for another (the page would repaint the first)').toHaveCount(0)
    await page.locator('[id="1rm-weight"]').fill('364')
    await page.locator('[id="1rm-date"]').fill('2026-10-12')
    await page.locator('#modal-1rm').getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => page.evaluate(() => window.__writes.insert.length)).toBe(1)
    const w = await page.evaluate(() => window.__writes.insert[0])
    expect(w.exercise_name).toBe('Back Squat')
    expect(w.exercise_id, 'a Big 5 lift picked by name gets its library id, as the old grid gave it').toBe('lib-Back Squat')
    expect(w.one_rm_kg, 'typed in pounds, stored in kg').toBeCloseTo(364 / 2.20462, 3)
    expect(w.recorded_at).toBe('2026-10-12')
    expect(w.client_id).toBe('cid')
    await expect(page.locator('#modal-1rm')).toHaveCount(0)
    await expect(host(page).locator('.pw-title'), 'the lift page repainted in place, not the list').toHaveText('Back Squat')
    // a lift that is not a Big 5 and has no library id stays unlinked
    await host(page).getByRole('button', { name: '‹ Personal Bests' }).click()
    await row(page, 'Military Press').click()
    await host(page).getByRole('button', { name: 'Update best' }).click()
    await page.locator('[id="1rm-weight"]').fill('176')
    await page.locator('#modal-1rm').getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => page.evaluate(() => window.__writes.insert.length)).toBe(2)
    expect(await page.evaluate(() => window.__writes.insert[1].exercise_id)).toBeNull()
    // Record best on a lift with no best yet
    await host(page).getByRole('button', { name: '‹ Personal Bests' }).click()
    await host(page).locator('.pb-row-static', { hasText: 'Bench Press' }).getByRole('button', { name: 'Record best' }).click()
    await expect(page.locator('#modal-1rm')).toContainText('Bench Press')
    await page.locator('[id="1rm-weight"]').fill('220')
    await page.locator('#modal-1rm').getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => page.evaluate(() => window.__writes.insert.length)).toBe(3)
    expect(await page.evaluate(() => window.__writes.insert[2].exercise_id)).toBe('lib-Bench Press')
  })

  test('a Big 5 lift for a client that cannot be verified is refused: nothing is written and nothing is created in the library', async ({ page }) => {
    await soloView(page)
    await show(page)
    await page.evaluate(() => { window._effectiveCoachIdForClient = async () => null; window.__created = 0; window._resolveExerciseIdForSave = async () => { window.__created++; return 'x' } })
    await host(page).locator('.pb-row-static', { hasText: 'Bench Press' }).getByRole('button', { name: 'Record best' }).click()
    await page.locator('[id="1rm-weight"]').fill('100')
    await page.locator('#modal-1rm').getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('[id="1rm-error"]')).toContainText('Could not verify this client')
    expect(await page.evaluate(() => [window.__writes.insert.length, window.__created])).toEqual([0, 0])
  })

  test('deleting a history entry asks first, removes exactly that row, and the lift page repaints', async ({ page }) => {
    await soloView(page)
    await show(page)
    await row(page, 'Back Squat').click()
    const oldest = host(page).locator('.pw-card', { has: page.locator('#pb-hist-chart') }).locator('.pw-item').nth(1)
    await oldest.locator('.pb-del').click()
    await acceptConfirm(page)
    await expect.poll(() => page.evaluate(() => window.__writes.deleted)).toEqual(['b1'])
    await expect(host(page).locator('.pw-title')).toHaveText('Back Squat')
  })

  test('a double tap on Save writes ONE row and throws nothing (save1RM is re-entry guarded; the Big 5 path awaits before it writes)', async ({ page }) => {
    await soloView(page)
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await show(page)
    await page.evaluate(() => { window._effectiveCoachIdForClient = async () => 'coach-1'; window._resolveExerciseIdForSave = async name => { await new Promise(r => setTimeout(r, 300)); return 'lib-' + name } })
    await host(page).locator('.pb-row-static', { hasText: 'Bench Press' }).getByRole('button', { name: 'Record best' }).click()
    await page.locator('[id="1rm-weight"]').fill('100')
    await page.locator('#modal-1rm').getByRole('button', { name: 'Save' }).dblclick()
    await expect(page.locator('#modal-1rm')).toHaveCount(0)
    expect(await page.evaluate(() => window.__writes.insert.length), 'one row, not two').toBe(1)
    expect(errors, 'and the second tap did not throw on the sheet that was already gone').toEqual([])
  })

  test('a write for another client does not repaint the open lift page', async ({ page }) => {
    await soloView(page)
    await show(page)
    await row(page, 'Back Squat').click()
    await expect(host(page).locator('.pw-title')).toHaveText('Back Squat')
    await page.evaluate(() => _refresh1RMs('someone-else'))
    await expect(host(page).locator('.pw-title'), 'the list, not client cid\'s lift page painted into another client\'s pane').toHaveText('My Personal Bests')
    expect(await page.evaluate(() => window._pbOpenLift)).toBeNull()
  })

  test('the Performance records stand aside while a lift page is open, and come back with the list', async ({ page }) => {
    await soloView(page)
    await show(page)
    await page.evaluate(() => { const p = document.createElement('div'); p.id = 'pb-performance-section'; p.textContent = 'performance records'; document.getElementById('pb-1rms-section').after(p) })
    await expect(page.locator('#pb-performance-section')).toBeVisible()
    await row(page, 'Back Squat').click()
    await expect(page.locator('#pb-performance-section')).toBeHidden()
    await host(page).getByRole('button', { name: '‹ Personal Bests' }).click()
    await expect(page.locator('#pb-performance-section')).toBeVisible()
  })

  test('closing a lift page destroys only its own charts, never a chart the Performance records have open', async ({ page }) => {
    await soloView(page)
    await show(page)
    await row(page, 'Back Squat').click()
    await expect(host(page).locator('#pb-hist-chart')).toBeVisible()
    // One synchronous step: closeLiftPage runs the teardown before its first await, so the app's own late start-up renders cannot sit between the chart and the check.
    const after = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.id = 'other-chart'; document.body.appendChild(c)
      window.__other = new Chart(c.getContext('2d'), { type: 'line', data: { labels: ['a'], datasets: [{ data: [1] }] } })
      _activeCharts.push(window.__other)
      closeLiftPage('cid')
      return [!!Chart.getChart('other-chart'), !!Chart.getChart('pb-hist-chart')]
    })
    expect(after, "the other chart survives, the lift page's own is gone").toEqual([true, false])
  })

  test('the list is paged: a lift whose only entry is past the first 200 rows is still listed', async ({ page }) => {
    await soloView(page)
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: 'r' + String(i).padStart(3, '0'), exercise_name: 'Back Squat', exercise_id: null, one_rm_kg: 100 + i / 10, recorded_at: '2026-09-' + String(1 + (i % 28)).padStart(2, '0') }))
    rows.push({ id: 'z1', exercise_name: 'Zed Lift', exercise_id: null, one_rm_kg: 50, recorded_at: '2025-01-01' })
    await show(page, { rows })
    await expect(host(page).locator('.pb-name', { hasText: 'Zed Lift' }), 'past the API\'s 200-row cap').toBeVisible()
  })

  test('a lift named like an Object.prototype member is just a lift', async ({ page }) => {
    await soloView(page)
    await show(page, { rows: [{ id: 'c1', exercise_name: 'constructor', exercise_id: null, one_rm_kg: 80, recorded_at: '2026-09-08' }, { id: 't1', exercise_name: 'toString', exercise_id: null, one_rm_kg: 70, recorded_at: '2026-09-08' }] })
    await expect(host(page).locator('.pb-name', { hasText: 'constructor' })).toBeVisible()
    await expect(host(page).locator('.pb-name', { hasText: 'toString' })).toBeVisible()
  })

  test('when the logged sets estimate the recorded best, the page says they agree (not "0 kg above")', async ({ page }) => {
    await soloView(page)
    await show(page)
    await row(page, 'Deadlift').click()
    await expect(host(page).locator('.pb-note').last()).toHaveText('Logged sets agree with the recorded best.')
  })

  test('a lift named like markup is text, and no lift name reaches an attribute', async ({ page }) => {
    await soloView(page)
    const evil = '"><img id="e2e-pb-evil" src=x onerror="window.__pwned=1">'
    await show(page, { rows: [{ id: 'e1', exercise_name: evil, exercise_id: null, one_rm_kg: 100, recorded_at: '2026-09-08' }] })
    await expect(page.locator('#e2e-pb-evil')).toHaveCount(0)
    await expect(host(page).locator('.pb-name').first()).toHaveText(evil)
    const attrs = await page.evaluate(() => [...document.querySelectorAll('#pb-1rms-section [onclick]')].map(e => e.getAttribute('onclick')).join(' '))
    expect(attrs, 'the row\'s handler carries the client id and a position, never the name').not.toContain('img')
    await row(page, 'img').click()
    await expect(page.locator('#e2e-pb-evil')).toHaveCount(0)
    await expect(host(page).locator('.pw-title')).toHaveText(evil)
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined()
  })
})
