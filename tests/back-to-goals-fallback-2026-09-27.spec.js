const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Ledger row 2026-08-07-audit-that-every-page-is-connected-and-every-back-button-wor: the whole-app Back
// button audit found 5 of 6 affordances correct and one inconsistent — backToGoals (app-calendar-goals.js)
// had no fallback for a missing #tab-content, unlike its direct sibling backToClientWorkouts
// (app-runner.js), which falls back to navigate('workouts') when the container is gone. Recorded as
// "latent, could not make it break" rather than confirmed live.
//
// #tab-content is reachable-missing in two real ways: (1) a coach navigates away from a client's profile
// (which is the only place a coach's Goals tab lives) while a goal detail is open or its fetch is still in
// flight; (2) the same, on solo's standalone Goals page. Both are exercised here — a pure state test, no
// fixture rows needed, since backToGoals takes only an id and never reads the database itself.
test.describe('backToGoals falls back safely when its container is gone (2026-08-07 audit gap)', () => {
  test('coach: backToGoals does not throw when #tab-content is missing, and lands on a valid page', async ({ page }) => {
    await loginAsPT(page)
    const res = await page.evaluate(() => {
      document.getElementById('tab-content')?.remove()
      let threw = null
      try { backToGoals('00000000-0000-0000-0000-000000000000') } catch (e) { threw = e.message }
      return { threw, page: currentPage }
    })
    expect(res.threw, 'backToGoals must not throw when its container is absent').toBeNull()
    // navigate('workouts') is valid for every role (app-core.js coachPages/clientPages/soloPages all
    // carry it) — the whole point of matching the sibling's literal, not just its shape.
    expect(res.page, 'must land on a real page, not "Page not found"').toBe('workouts')
  })

  test('solo: backToGoals does not throw when #tab-content is missing, and lands on a valid page', async ({ page }) => {
    await loginAsPT(page)
    await expect.poll(() => page.evaluate(() => !!window._soloClientId), { timeout: 10000 }).toBe(true)
    await page.evaluate(() => switchView('solo'))
    await expect.poll(() => page.evaluate(() => currentProfile?.role)).toBe('solo')
    const res = await page.evaluate(() => {
      document.getElementById('tab-content')?.remove()
      let threw = null
      try { backToGoals('00000000-0000-0000-0000-000000000000') } catch (e) { threw = e.message }
      return { threw, page: currentPage }
    })
    expect(res.threw, 'backToGoals must not throw for solo either').toBeNull()
    expect(res.page).toBe('workouts')
  })
})
