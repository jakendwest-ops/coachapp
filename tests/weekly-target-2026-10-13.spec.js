const { test, expect } = require('./fixtures')
const { loginAsClient, loginAsPT } = require('./helpers')

// ─── The weekly target behind the dashboard's Streak tile (Jake, 2026-10-13) ───────────────────────────────────────────────
//
// With no training plan on, the tile counts weeks in a row at a target the person sets (default 3, 1 to 14), kept on their profile row as
// profiles.weekly_session_target next to the unit preferences. The column is added by a SQL step Jake runs, so the code has to work BEFORE it
// exists: read on its own (never in loadUserInfo's main select, where a missing column would fail the whole profile read), and a failed read is
// the default. The tile itself is covered in dashboard-rework-2026-10-03.spec.js and tests-node/dashboard-model.test.mjs; this spec is the
// load, the Settings card and the save. Every database write is stubbed: nothing real is written.

// A profiles stand-in for loadUserInfo: the main read ({select(cols).eq().single()}) answers with the account's own profile; the target read
// ({select('weekly_session_target').eq().maybeSingle()}) answers as the test says. Records every select's column list.
async function stubProfiles(page, target) {
  await page.evaluate((target) => {
    const real = db.from.bind(db), own = { ...currentProfile }
    window.__selects = []
    db.from = (table) => {
      if (table !== 'profiles') return real(table)
      return {
        select: (cols) => {
          window.__selects.push(cols)
          const chain = { eq: () => chain }
          chain.single = async () => ({ data: { ...own }, error: null })
          chain.maybeSingle = async () => target.throws ? Promise.reject(new Error('boom')) : target.error ? { data: null, error: target.error } : { data: { weekly_session_target: target.value }, error: null }
          return chain
        },
      }
    }
    window.__realFrom = real
  }, target)
}
const unstub = (page) => page.evaluate(() => { if (window.__realFrom) db.from = window.__realFrom })

test.describe('loading the weekly target at login', () => {
  test.beforeEach(async ({ page }) => { await loginAsClient(page) })

  test('it is read on its own, not in the main profile select, and arrives as window._weeklyTarget', async ({ page }) => {
    await stubProfiles(page, { value: 4 })
    const r = await page.evaluate(async () => { window._weeklyTarget = undefined; await loadUserInfo(); return { target: window._weeklyTarget, selects: window.__selects, role: currentProfile?.role } })
    await unstub(page)
    expect(r.target).toBe(4)
    expect(r.selects, 'two reads of profiles').toHaveLength(2)
    const main = r.selects.find(c => c !== 'weekly_session_target')
    expect(main, 'the main read stays as it was').toContain('weight_unit')
    expect(main, 'a select naming a column that is not there yet would fail the whole profile read (role, units and all)').not.toContain('weekly_session_target')
    expect(r.selects.filter(c => c === 'weekly_session_target'), 'the target has its own read').toHaveLength(1)
    expect(r.role, 'the account is still itself').toBe('client')
  })

  test('never set (null) stays null: the tile reads it as 3', async ({ page }) => {
    await stubProfiles(page, { value: null })
    const target = await page.evaluate(async () => { window._weeklyTarget = 9; await loadUserInfo(); return window._weeklyTarget })
    await unstub(page)
    expect(target).toBeNull()
  })

  test('the column not added yet (a failed read) is the default, and the rest of the profile still loads', async ({ page }) => {
    await stubProfiles(page, { error: { code: '42703', message: 'column profiles.weekly_session_target does not exist' } })
    const r = await page.evaluate(async () => { const before = { ...window._unitPrefs }; window._weeklyTarget = 9; await loadUserInfo(); return { target: window._weeklyTarget, role: currentProfile?.role, units: window._unitPrefs, before } })
    await unstub(page)
    expect(r.target).toBeNull()
    expect(r.role, 'the profile read did not fail with it').toBe('client')
    expect({ ...r.units }, 'the units came from the main read as before').toEqual(r.before)
  })

  test('a lookup that throws is the default too', async ({ page }) => {
    await stubProfiles(page, { throws: true })
    const target = await page.evaluate(async () => { window._weeklyTarget = 9; await loadUserInfo(); return window._weeklyTarget })
    await unstub(page)
    expect(target).toBeNull()
  })
})

test.describe('the Settings card', () => {
  const openSettings = async (page) => {
    await page.evaluate(async () => { await renderSettings(document.getElementById('main-content')) })
    await expect(page.locator('h1.page-title')).toHaveText('Settings')
  }

  test('a client sees it, with 1 to 14 and the stored target selected; an unset target shows 3', async ({ page }) => {
    await loginAsClient(page)
    await page.evaluate(() => { window._weeklyTarget = 5 })
    await openSettings(page)
    const sel = page.locator('#settings-weekly-target')
    await expect(sel).toBeVisible()
    await expect(sel.locator('option')).toHaveCount(14)
    await expect(sel).toHaveValue('5')
    expect(await sel.locator('option').evaluateAll(os => os.map(o => o.value))).toEqual(Array.from({ length: 14 }, (_, i) => String(i + 1)))
    await page.evaluate(() => { window._weeklyTarget = null })
    await openSettings(page)
    await expect(page.locator('#settings-weekly-target')).toHaveValue('3')
  })

  test('a coach\'s own view does not get it (no Streak tile there)', async ({ page }) => {
    await loginAsPT(page)
    expect(await page.evaluate(() => currentProfile?.role)).toBe('coach')
    await openSettings(page)
    await expect(page.locator('#settings-weekly-target')).toHaveCount(0)
  })

  test('Save writes the chosen number to this person\'s own profile row, updates the copy the dashboard reads, and says so', async ({ page }) => {
    await loginAsClient(page)
    await openSettings(page)
    await page.evaluate(() => {
      const real = db.from.bind(db)
      window.__realFrom = real
      window.__updates = []
      db.from = (table) => table === 'profiles'
        ? { update: (patch) => ({ eq: (col, v) => ({ select: async () => { window.__updates.push({ patch, col, v }); return { data: [{ weekly_session_target: patch.weekly_session_target }], error: null } } }) }) }
        : real(table)
    })
    await page.locator('#settings-weekly-target').selectOption('7')
    await page.getByRole('button', { name: 'Save target' }).click()
    await expect(page.locator('#settings-target-msg')).toHaveText('Saved ✓')
    const r = await page.evaluate(() => ({ updates: window.__updates, target: window._weeklyTarget, uid: currentUser.id }))
    await unstub(page)
    expect(r.updates).toEqual([{ patch: { weekly_session_target: 7 }, col: 'id', v: r.uid }])
    expect(r.target).toBe(7)
  })

  test('a failed save says so and leaves the copy the dashboard reads alone', async ({ page }) => {
    await loginAsClient(page)
    await page.evaluate(() => { window._weeklyTarget = 4 })
    await openSettings(page)
    await page.evaluate(() => {
      const real = db.from.bind(db)
      window.__realFrom = real
      db.from = (table) => table === 'profiles' ? { update: () => ({ eq: () => ({ select: async () => ({ data: null, error: { code: 'XX000', message: 'boom' } }) }) }) } : real(table)
    })
    await page.locator('#settings-weekly-target').selectOption('9')
    await page.getByRole('button', { name: 'Save target' }).click()
    await expect(page.locator('#settings-target-msg')).toHaveText('Save failed. Try again.')
    expect(await page.evaluate(() => window._weeklyTarget)).toBe(4)
    await unstub(page)
  })

  test('a save that updates no row (a policy filtered it out, or no row matched) is a failure, never "Saved"', async ({ page }) => {
    await loginAsClient(page)
    await page.evaluate(() => { window._weeklyTarget = 4 })
    await openSettings(page)
    await page.evaluate(() => {
      const real = db.from.bind(db)
      window.__realFrom = real
      db.from = (table) => table === 'profiles' ? { update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) } : real(table)
    })
    await page.locator('#settings-weekly-target').selectOption('6')
    await page.getByRole('button', { name: 'Save target' }).click()
    await expect(page.locator('#settings-target-msg')).toHaveText('Save failed. Try again.')
    expect(await page.evaluate(() => window._weeklyTarget), 'nothing was stored, so the copy the dashboard reads stays').toBe(4)
    await unstub(page)
  })

  test('a number outside 1 to 14 is refused before anything is sent', async ({ page }) => {
    await loginAsClient(page)
    await openSettings(page)
    await page.evaluate(() => {
      const real = db.from.bind(db)
      window.__realFrom = real
      window.__updates = 0
      db.from = (table) => table === 'profiles' ? { update: () => { window.__updates++; return { eq: () => ({ select: async () => ({ data: [{}], error: null }) }) } } } : real(table)
      const sel = document.getElementById('settings-weekly-target')
      for (const v of ['0', '99']) { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o) }
    })
    for (const v of ['0', '99']) {
      await page.evaluate(() => { document.getElementById('settings-target-msg').textContent = '' })
      await page.locator('#settings-weekly-target').selectOption(v)
      await page.getByRole('button', { name: 'Save target' }).click()
      await expect(page.locator('#settings-target-msg'), `${v} is refused`).toHaveText('Pick a number from 1 to 14.')
    }
    expect(await page.evaluate(() => window.__updates), 'nothing was written').toBe(0)
    await unstub(page)
  })
})
