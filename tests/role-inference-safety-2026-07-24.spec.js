const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// A real coach account (the PT test account) got its profiles.role silently overwritten to 'client'
// in the live database on 2026-07-24 — not a display bug, an actual persisted write. Root cause:
// loadUserInfo's role-inference fallback ("If profile has no role... check the clients table") fires
// on ANY falsy currentProfile.role, without checking whether the SELECT ITSELF FAILED (vs genuinely
// returning a null role). A profiles select that errors for ANY reason — a schema migration mid-flight
// (what actually happened here — a column was added to the select before the live DB had it), a
// network blip, a transient RLS hiccup — leaves currentProfile.role falsy. If that account has ANY
// clients row for its own user_id (including a coach's own self-referential solo row, which every
// master account has), the fallback "heals" it into role:'client' and PERSISTS that via upsert. A
// perfectly fine coach got silently downgraded. Fixed: the fallback now only fires when `!error`.
test.describe('loadUserInfo role-inference safety (2026-07-24)', () => {
  test('a failed profiles fetch never triggers the role-patch upsert, even when a clients row exists', async ({ page }) => {
    await loginAsPT(page) // has a permanent self-referential "E2E PT Solo" clients row — exactly the shape that triggered the real incident

    const r = await page.evaluate(async () => {
      // Confirm the precondition this bug depends on: a clients row for this user_id must actually
      // exist, or the fallback would no-op regardless of the fix.
      const { data: clientsRows } = await db.from('clients').select('id').eq('user_id', currentUser.id)

      const realFrom = db.from.bind(db)
      let sawUpsert = false
      // The fake upsert NEVER touches the real database, regardless of whether the guard is present —
      // this test must be safe to run against the fix OR its absence without any real-data risk.
      db.from = (table) => {
        if (table === 'profiles') {
          return {
            select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'simulated fetch failure' } }) }) }),
            upsert: () => { sawUpsert = true; return Promise.resolve({ data: null, error: null }) },
          }
        }
        return realFrom(table)
      }

      await loadUserInfo()
      db.from = realFrom

      return { clientsRowCount: clientsRows?.length || 0, sawUpsert, currentProfileRoleAfterFailedFetch: currentProfile?.role }
    })

    expect(r.clientsRowCount, 'this test needs a real clients row for the account to be a meaningful check').toBeGreaterThan(0)
    // RED before: sawUpsert would be true here — a failed fetch used to be indistinguishable from a
    // genuinely-null role, and the fallback would have persisted role:'client' onto a real coach.
    expect(r.sawUpsert, 'a failed fetch must never trigger the role-inference patch').toBe(false)
  })

  test('source confirms the fallback is gated on a successful fetch, not just a falsy role', async ({ page }) => {
    await loginAsPT(page)
    const guarded = await page.evaluate(() => /if \(!error && \(!currentProfile\?\.role/.test(loadUserInfo.toString()))
    expect(guarded, 'the role-inference fallback must check !error before trusting a falsy role').toBe(true)
  })
})
