const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsClient } = require('./helpers')

// ─── Writes keyed on a caller-supplied clientId verify it first (2026-08-12 audit) ────────────────
//
// Ten writes across app-progress.js and app-runner.js took `clientId` as a bare parameter and never
// re-verified it: client_1rms, performance_logs, weight_logs and the clients row itself. They now all
// route through _verifyClientAccess (app-core.js).
//
// RLS backstops these — proven 2026-08-12 by audit-ownership-anchors-rls-2026-08-12.spec.js, which is
// why the row was downgraded High -> Medium — so a database probe cannot go red before the fix. These
// assert the app-level refusal, and the happy paths, which is where the real risk of this change lies:
// the helper accepts TWO shapes (coach_id === me, or user_id === me) because the caller may be either
// side of the relationship. Get that wrong and a coach loses the ability to log data for their client,
// or a solo user loses it for themselves.
const FOREIGN_CLIENT = '00000000-0000-0000-0000-0000000000fc'

test.describe('client-scoped writes verify the clientId', () => {
  test('a coach is refused when the clientId is not one of theirs', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async (foreign) => {
      const captured = []
      const orig = log.error
      log.error = (fn, msg, meta) => { captured.push(fn + '|' + msg); return orig(fn, msg, meta) }
      const origConfirm = window.confirm
      window.confirm = () => true              // deletes prompt first; we are testing the guard behind it
      try {
        await savePerformanceLog(foreign)
        await deletePerfLog('00000000-0000-0000-0000-0000000000fb', foreign)
        await deleteWeightLog('00000000-0000-0000-0000-0000000000fb', foreign)
        await delete1RM('00000000-0000-0000-0000-0000000000fb', foreign)
      } finally { log.error = orig; window.confirm = origConfirm }
      return captured
    }, FOREIGN_CLIENT)

    const joined = r.join(',')
    for (const fn of ['savePerformanceLog', 'deletePerfLog', 'deleteWeightLog', 'delete1RM']) {
      expect(joined, `${fn} must refuse at the ownership guard`).toContain(fn + '|ownership check failed')
    }
  })

  test('a COACH can still write for a client they actually coach (happy path)', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const { data: c } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1).single()
      // Assert the helper's verdict directly. Driving savePerformanceLog end-to-end would need its whole
      // form mounted and would write a real row for a real client; the guard is the thing under test.
      return { clientId: c.id, allowed: await _verifyClientAccess('probe', c.id) }
    })
    expect(r.allowed, 'a coach must still be allowed to write for their own client').toBe(true)
  })

  test('a CLIENT is allowed for their own record and refused for another (both shapes)', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(async (foreign) => {
      const mine = await _getCurrentClientId()
      return {
        mine,
        ownAllowed: await _verifyClientAccess('probe', mine),
        foreignAllowed: await _verifyClientAccess('probe', foreign),
        nullAllowed: await _verifyClientAccess('probe', null),
      }
    }, FOREIGN_CLIENT)

    expect(r.mine, 'the E2E client must have a clients row').not.toBeNull()
    // user_id === me — the shape that a coach_id-only check would wrongly refuse, and the reason solo
    // is not excluded here. Four bugs of that exact shape have shipped in this project.
    expect(r.ownAllowed, 'a client must be allowed to write for their OWN record').toBe(true)
    expect(r.foreignAllowed, 'a client must be refused for someone else\'s record').toBe(false)
    expect(r.nullAllowed, 'a null clientId must fail CLOSED, not open').toBe(false)
  })
})
