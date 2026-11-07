// Personal view's four destinations: Today, Train, Progress, More (2026-10-31, approved by Jake).
// Plan: docs/superpowers/plans/2026-10-31-personal-view-four-tabs.md. Every test here was run against the old code first and failed.
const { test, expect } = require('./fixtures')
const { loginAsPT, soloReady } = require('./helpers')

const activeTab = (page) => page.locator('.bottom-nav-item.active').getAttribute('data-page')

test.describe('Personal view: Today', () => {
  test('the calendar opens from Today (no My calendar card), shows a way back, and keeps Today lit', async ({ page }) => {
    await soloReady(page)
    await expect(page.locator('#dash-calendar'), 'the My calendar card is gone in Personal view').toHaveCount(0)
    await page.locator('[data-open-calendar]').click()
    await expect.poll(() => page.evaluate(() => currentPage)).toBe('calendar')
    expect(await activeTab(page), 'Calendar lives under Today').toBe('solo-dashboard')
    await page.locator('[data-today-back]').click()
    await expect.poll(() => page.evaluate(() => currentPage)).toBe('solo-dashboard')
  })

  test('log today\'s weight from Today: empty and zero are refused, a number is stored for today', async ({ page }) => {
    await soloReady(page)
    const input = page.locator('#dash-weight-input')
    const msg = page.locator('#dash-weight-msg')
    await page.locator('[data-quick-weight]').click()
    await expect(msg).toContainText('Enter your weight')
    await input.fill('0')
    await page.locator('[data-quick-weight]').click()
    await expect(msg, '0 is its own case, not a weight').toContainText('Enter your weight')
    expect(await page.evaluate(() => currentPage), 'tapping inside the card does not open the Weight page').toBe('solo-dashboard')
    const today = await page.evaluate(() => _ymdLocal(new Date()))
    // The shared insert itself refuses 0 and negatives, so the Weight page's form (which only checked "not empty") refuses them too.
    const refused = await page.evaluate(async (d) => {
      const out = []
      for (const w of [0, -5]) out.push((await _insertWeightLog(window._soloClientId, { date: d, weight: w })).error?.message || null)
      const { data } = await db.from('weight_logs').select('id').eq('client_id', window._soloClientId).eq('date', d).lte('weight_kg', 0)
      return { out, stored: (data || []).length }
    }, today)
    expect(refused.out).toEqual(['Enter a weight above 0.', 'Enter a weight above 0.'])
    expect(refused.stored, 'nothing at or below 0 was stored').toBe(0)
    try {
      await input.fill('80.4')
      await page.locator('[data-quick-weight]').click()
      await expect.poll(async () => page.evaluate(async (d) => {
        const { data } = await db.from('weight_logs').select('id, weight_kg').eq('client_id', window._soloClientId).eq('date', d)
        return (data || []).some(r => Math.abs(weightToPref(r.weight_kg) - 80.4) < 0.05)
      }, today), { timeout: 8000 }).toBe(true)
    } finally {
      // Removes only the row this test wrote: today's date, this exact value.
      const cleanup = await page.evaluate(async (d) => {
        const { data } = await db.from('weight_logs').select('id, weight_kg').eq('client_id', window._soloClientId).eq('date', d)
        const mine = (data || []).filter(r => Math.abs(weightToPref(r.weight_kg) - 80.4) < 0.05).map(r => r.id)
        if (!mine.length) return { found: 0, removed: 0 }
        const { data: gone } = await db.from('weight_logs').delete().in('id', mine).select('id')
        return { found: mine.length, removed: (gone || []).length }
      }, today)
      expect(cleanup.removed, 'cleanup removed every row this test wrote').toBe(cleanup.found)
    }
  })

  test('CLIENT: the client dashboard still has My calendar and no quick weight box', async ({ page }) => {
    const { loginAsClient } = require('./helpers')
    await loginAsClient(page)
    await page.evaluate(() => navigate('client-dashboard'))
    await expect(page.locator('#dash-calendar')).toHaveCount(1, { timeout: 15000 })
    await expect(page.locator('#dash-weight-input')).toHaveCount(0)
    await expect(page.locator('[data-open-calendar]')).toHaveCount(0)
  })
})

test.describe('Personal view: Progress', () => {
  const TAG = '[E2E-PROGTABS]'
  const chips = (page) => page.locator('#main-content .chip-row').first().locator('button.chip')

  // Five pills since 2026-11-01 (Jake chose one row; narrower phones fall back to two rows). The row must never scroll sideways.
  test('Progress opens on Goals; the pills are Goals, Records, Performance, Bodyweight, Cardio; an old Body Weight link opens Bodyweight', async ({ page }) => {
    await soloReady(page)
    await page.evaluate(() => { window._progressTab = undefined; navigate('progress') })
    await expect(chips(page)).toHaveText(['Goals', 'Records', 'Performance', 'Bodyweight', 'Cardio'])
    await expect(page.locator('#main-content .chip-row .chip[aria-selected="true"]').first()).toHaveText('Goals')
    await page.evaluate(() => { window._progressTab = 'Body Weight'; navigate('progress') })
    await expect(page.locator('#main-content .chip-row .chip[aria-selected="true"]').first()).toHaveText('Bodyweight')
  })

  for (const width of [390, 360, 320]) {
    test(`the pill row never scrolls sideways or clips a name at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await soloReady(page)
      await page.evaluate(() => { window._progressTab = undefined; navigate('progress') })
      await expect(chips(page)).toHaveCount(5)
      const m = await page.evaluate(() => {
        const row = document.querySelector('#main-content .chip-row')
        return { overflow: row.scrollWidth - row.clientWidth, rows: new Set([...row.querySelectorAll('.chip')].map(c => Math.round(c.getBoundingClientRect().top))).size,
          clipped: [...row.querySelectorAll('.chip')].filter(c => c.scrollWidth > c.clientWidth + 1).map(c => c.textContent),
          heights: [...row.querySelectorAll('.chip')].map(c => Math.round(c.getBoundingClientRect().height)), page: document.documentElement.scrollWidth - innerWidth }
      })
      expect(m.overflow, 'the row has nothing to scroll').toBeLessThanOrEqual(0)
      expect(m.clipped, 'no pill clips its name').toEqual([])
      expect(m.page, 'the page itself does not scroll sideways').toBeLessThanOrEqual(0)
      expect(Math.min(...m.heights), 'pills are at least 44 px tall to tap').toBeGreaterThanOrEqual(44)
      // One row on a wide-enough phone, two on a narrow one - never more.
      expect(m.rows, width >= 390 ? 'one row' : 'two rows').toBe(width >= 390 ? 1 : 2)
    })
  }

  test('Performance is its own page again: the 1M to All range is in the first screen, and Records no longer carries the Performance views', async ({ page }) => {
    await soloReady(page)
    await page.evaluate(() => { window._progressTab = 'Performance'; navigate('progress') })
    const range = page.locator('#perf-range')
    await expect(range).toBeVisible({ timeout: 15000 })
    expect((await range.boundingBox()).y, 'the range selector is within the first screen').toBeLessThan(500)
    await expect(page.locator('#main-content button.chip', { hasText: 'Lifts' })).toBeVisible()
    await page.evaluate(() => { window._progressTab = 'Records'; navigate('progress') })
    await expect(page.locator('#pb-1rms-section')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#perf-range'), 'no range selector on Records').toHaveCount(0)
    expect(await page.evaluate(() => document.getElementById('main-content').scrollHeight), 'Records is a short page, not ten screens').toBeLessThan(3500)
  })

  for (const width of [390, 360, 320]) {
    test(`Performance's own Lifts / Sessions / Blocks row never scrolls sideways at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await soloReady(page)
      await page.evaluate(() => { window._progressTab = 'Performance'; window._perfTab = 'Lifts'; navigate('progress') })
      await expect(page.locator('#perf-range')).toBeVisible({ timeout: 15000 })
      const m = await page.evaluate(() => {
        const row = document.querySelectorAll('#main-content .chip-row')[1]
        return { overflow: row.scrollWidth - row.clientWidth, names: [...row.querySelectorAll('.chip')].map(c => c.textContent),
          clipped: [...row.querySelectorAll('.chip')].filter(c => c.scrollWidth > c.clientWidth + 1).map(c => c.textContent),
          page: document.documentElement.scrollWidth - innerWidth,
          rangeInside: document.getElementById('perf-range').getBoundingClientRect().right <= innerWidth }
      })
      expect(m.names).toEqual(['Lifts', 'Sessions', 'Blocks'])
      expect(m.overflow, 'the row has nothing to scroll').toBeLessThanOrEqual(0)
      expect(m.clipped, 'no pill clips its name').toEqual([])
      expect(m.page, 'the page does not scroll sideways').toBeLessThanOrEqual(0)
      expect(m.rangeInside, 'the range selector is on screen').toBe(true)
    })
  }

  test('Performance pills read Lifts, Sessions, Blocks; an old stored name (Per training plan) opens Blocks', async ({ page }) => {
    await soloReady(page)
    await page.evaluate(() => { window._progressTab = 'Performance'; window._perfTab = 'Per training plan'; navigate('progress') })
    const sub = page.locator('#progress-tab-content .chip-row-3 .chip')
    await expect(sub).toHaveText(['Lifts', 'Sessions', 'Blocks'], { timeout: 15000 })
    await expect(page.locator('#progress-tab-content .chip-row-3 .chip[aria-selected="true"]')).toHaveText('Blocks')
    expect(await page.evaluate(() => window._perfTab), 'the stored label is migrated').toBe('Blocks')
  })

  test('two Performance renders in a row fill the page once, not twice (the second replaces the first)', async ({ page }) => {
    await soloReady(page)
    await page.evaluate(() => { window._progressTab = 'Performance'; window._perfTab = 'Lifts'; navigate('progress') })
    await expect(page.locator('#perf-range')).toBeVisible({ timeout: 15000 })
    const fills = await page.evaluate(async () => {
      let n = 0
      const real = window.renderProgressStrength
      window.renderProgressStrength = (...a) => { n++; return real(...a) }
      const el = document.getElementById('progress-tab-content')
      await Promise.all([renderPerformance(el), renderPerformance(el)])
      window.renderProgressStrength = real
      return n
    })
    expect(fills, 'only the newest render fills #perf-sub-content').toBe(1)
  })

  test('a cardio record shows under Cardio and not Records; a strength record the other way round', async ({ page }) => {
    await soloReady(page)
    const stamp = Date.now()
    const names = { cardio: `${TAG} row ${stamp}`, strength: `${TAG} lift ${stamp}` }
    await page.evaluate(async ({ names }) => {
      const cid = window._soloClientId, d = _ymdLocal(new Date())
      await db.from('performance_logs').insert([
        { client_id: cid, logged_by: currentUser.id, date: d, category: 'cardio', name: names.cardio, value: 600, unit: 'sec' },
        { client_id: cid, logged_by: currentUser.id, date: d, category: 'strength', name: names.strength, value: 100, unit: 'kg' },
      ])
    }, { names })
    try {
      await page.evaluate(() => { window._progressTab = 'Cardio'; navigate('progress') })
      await expect(page.locator('#main-content', { hasText: names.cardio })).toBeVisible({ timeout: 15000 })
      await expect(page.locator(`text=${names.strength}`)).toHaveCount(0)
      await expect(page.locator('#pl-category option'), 'Cardio logs cardio only').toHaveText(['Cardio'])

      await page.evaluate(() => { window._progressTab = 'Records'; navigate('progress') })
      await expect(page.locator('#main-content', { hasText: names.strength })).toBeVisible({ timeout: 15000 })
      await expect(page.locator(`text=${names.cardio}`)).toHaveCount(0)
    } finally {
      const removed = await page.evaluate(async (tag) => {
        const { data } = await db.from('performance_logs').delete().eq('client_id', window._soloClientId).like('name', tag + '%').select('id')
        return (data || []).length
      }, TAG)
      expect(removed, 'cleanup removed both tagged records').toBe(2)
    }
  })

  // A lift's page is a page of its own: opening one hides the records form and list. Owns its fixture: one tagged saved best, removed at the end.
  test('in Records, opening a lift\'s page hides the record form and list', async ({ page }) => {
    await soloReady(page)
    const lift = `${TAG} best ${Date.now()}`
    await page.evaluate(async (n) => {
      const { error } = await db.from('client_1rms').insert({ client_id: window._soloClientId, exercise_name: n, one_rm_kg: 100, recorded_at: _ymdLocal(new Date()) })
      if (error) throw new Error(error.message)
    }, lift)
    try {
      await page.evaluate(() => { window._progressTab = 'Records'; navigate('progress') })
      await expect(page.locator('#pb-performance-section')).toBeVisible({ timeout: 15000 })
      await page.locator('#pb-1rms-section button.pb-row', { hasText: lift }).click()
      await expect(page.locator('#pb-performance-section')).toBeHidden()
    } finally {
      const removed = await page.evaluate(async (tag) => {
        const { data } = await db.from('client_1rms').delete().eq('client_id', window._soloClientId).like('exercise_name', tag + '%').select('id')
        return (data || []).length
      }, TAG)
      expect(removed, 'cleanup removed the tagged best').toBe(1)
    }
  })

  test('CLIENT: Progress still has Body Weight, Personal Bests, Performance, Goals', async ({ page }) => {
    const { loginAsClient } = require('./helpers')
    await loginAsClient(page)
    await page.evaluate(() => { window._progressTab = undefined; navigate('progress') })
    await expect(chips(page)).toHaveText(['Body Weight', 'Personal Bests', 'Performance', 'Goals'])
  })
})

test.describe('Personal view: old links, saved pages and switching view', () => {
  // An old link opens a fresh page: goto with only a new #hash is a same-document jump the app never sees, so reload after it.
  const lands = async (page, hash) => {
    await page.goto('/' + hash)
    await page.reload()
    await expect.poll(() => page.evaluate(() => currentProfile?.role), { timeout: 15000 }).toBe('solo')
    // Settled = the page this link names has drawn its own heading (or the Today page its root).
    await expect.poll(() => page.evaluate(() => !!document.querySelector('#main-content h1, #dash-root')), { timeout: 15000 }).toBe(true)
    return page.evaluate(() => ({ page: currentPage, lit: document.querySelector('.bottom-nav-item.active')?.dataset.page || null,
      h1: document.querySelector('#main-content h1')?.textContent?.trim() || '', tab: window._progressTab || null }))
  }

  test('#library, #calendar, #programs and #goals each land on a real page with the right tab lit', async ({ page }) => {
    await soloReady(page)
    expect(await lands(page, '#library')).toMatchObject({ page: 'library', lit: '__more__', h1: 'Exercise library' })
    expect(await lands(page, '#calendar')).toMatchObject({ page: 'calendar', lit: 'solo-dashboard', h1: 'Calendar' })
    expect(await lands(page, '#programs')).toMatchObject({ page: 'programs', lit: 'workouts', h1: 'Training plans' })
    expect(await lands(page, '#goals'), 'Goals live in Progress').toMatchObject({ page: 'progress', lit: 'progress', tab: 'Goals' })
  })

  test('a saved page of goals (from before) reopens on Progress > Goals', async ({ page }) => {
    await soloReady(page)
    await page.evaluate(() => localStorage.setItem('_activePage', 'goals'))
    expect(await lands(page, '')).toMatchObject({ page: 'progress', lit: 'progress', tab: 'Goals' })
  })

  test('the master account: Calendar in Personal view, switch to PT, then back - the nav follows the view each time', async ({ page }) => {
    await soloReady(page)
    await page.evaluate(() => navigate('calendar'))
    await expect.poll(() => page.evaluate(() => currentPage)).toBe('calendar')
    await page.evaluate(() => switchView('coach'))
    await expect.poll(() => page.evaluate(() => currentProfile?.role)).toBe('coach')
    await expect(page.locator('.bottom-nav-item')).toHaveText(['Dashboard', 'Clients', 'Training plans', 'Calendar', 'More'])      // the coach's bar since MVP 8 (2026-11-01)
    await page.evaluate(() => switchView('solo'))
    await expect.poll(() => page.evaluate(() => currentProfile?.role)).toBe('solo')
    await expect(page.locator('.bottom-nav-item')).toHaveText(['Today', 'Train', 'Progress', 'More'])
  })
})

// One check per row of docs/superpowers/plans/2026-10-31-personal-view-four-tabs-affordances.md: every way in that the old nav offered
// still has a home you can reach by tapping, the way a person would (soloNav uses the bar, the More sheet and the switches).
test('every affordance in the table has a reachable home', async ({ page }) => {
  const { soloNav } = require('./helpers')
  await soloReady(page)
  // Today: the session card and the week strip are the dashboard itself.
  await expect(page.locator('#dash-hero')).toBeVisible()
  // Train > Workouts: Create a workout, Train now, Your workouts' search.
  await soloNav(page, 'workouts')
  await expect(page.locator('[data-create-workout]')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('[data-train-now]')).toBeVisible()
  // Train > Plans: + New training plan.
  await soloNav(page, 'programs')
  await expect(page.locator('button:has-text("New training plan")')).toBeVisible({ timeout: 10000 })
  // More > Exercise library: adding an exercise.
  await soloNav(page, 'library')
  await expect(page.locator('h1')).toHaveText('Exercise library', { timeout: 10000 })
  await expect(page.locator('#main-content button', { hasText: /add exercise|new exercise/i }).first()).toBeVisible()
  // Today > Calendar: + Add event.
  await soloNav(page, 'calendar')
  await expect(page.locator('button:has-text("Add event")')).toBeVisible({ timeout: 10000 })
  // Progress > Goals: the goals list.
  await soloNav(page, 'goals')
  await expect(page.locator('#tab-content')).toBeVisible({ timeout: 10000 })
  // More > Settings, and the master account's Switch to PT view.
  await soloNav(page, 'settings')
  await expect.poll(() => page.evaluate(() => currentPage)).toBe('settings')
  await page.click('.bottom-nav-item[data-page="__more__"]')
  await expect(page.locator('#more-sheet-modal button:has-text("Switch to PT view")'), 'the test PT is a master account').toBeVisible()
})

test.describe('Personal view: Train', () => {
  test('Train opens on Workouts with a Workouts | Plans switch; Plans keeps Train lit', async ({ page }) => {
    await soloReady(page)
    await page.evaluate(() => navigate('workouts'))
    const sw = page.locator('#train-switch')
    await expect(sw).toBeVisible()
    await expect(sw.locator('button')).toHaveText(['Workouts', 'Plans'])
    await expect(sw.locator('button[aria-pressed="true"]')).toHaveText('Workouts')
    expect(await activeTab(page)).toBe('workouts')
    await sw.locator('button', { hasText: 'Plans' }).click()
    await expect.poll(() => page.evaluate(() => currentPage)).toBe('programs')
    await expect(page.locator('#train-switch button[aria-pressed="true"]')).toHaveText('Plans')
    expect(await activeTab(page), 'Plans lives under Train').toBe('workouts')
  })

  test('the Library is the Exercise library under More, with no templates tab and a way back to More', async ({ page }) => {
    await soloReady(page)
    await page.evaluate(() => navigate('library'))
    await expect(page.locator('h1.page-title')).toHaveText('Exercise library')
    await expect(page.locator('#wt-tab-templates')).toHaveCount(0)
    await expect(page.locator('button', { hasText: '+ New template' })).toHaveCount(0)
    expect(await activeTab(page)).toBe('__more__')
    await page.locator('[data-more-back]').click()
    await expect(page.locator('#more-sheet-modal')).toBeVisible()
  })

  test('COACH: Workouts, Training plans and the Library are unchanged (no Train switch, templates tab kept)', async ({ page }) => {
    await loginAsPT(page)
    await page.evaluate(() => { if (currentProfile?.role === 'solo') switchView('coach') })
    await expect.poll(() => page.evaluate(() => currentProfile?.role)).toBe('coach')
    for (const pg of ['workouts', 'programs', 'library']) {
      await page.evaluate((p) => navigate(p), pg)
      await expect.poll(() => page.evaluate(() => currentPage)).toBe(pg)
      await page.waitForTimeout(800)
      await expect(page.locator('#train-switch'), `${pg}: no Train switch for a coach`).toHaveCount(0)
    }
    await expect(page.locator('#wt-tab-templates')).toHaveCount(1)
  })
})
