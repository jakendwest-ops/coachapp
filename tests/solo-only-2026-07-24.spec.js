const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Jake, live: his brother self-signed-up (before signup was closed off, see
// signup-removed-2026-07-24.spec.js) and landed on a full coach account. Jake wants him moved to a
// personal/solo experience with NO path back to a coach dashboard — not even via the view-switcher.
// "solo" was never a real stored role before this: it's always been a VIEW layered on top of a full
// coach account (role stays 'coach'; a self-referential clients row unlocks the Personal tab), and
// the existing master-account pattern always ALSO exposes the coach side via the switcher. This adds
// a genuinely locked-down variant: profiles.solo_only skips window._masterAccount entirely, so the
// switcher never renders and switchView()'s own guard blocks reaching the coach view regardless.
//
// UPDATE 2026-08-01: solo_only was retired in favor of a genuinely-stored profiles.role='solo' value
// (migration scripts/migrate-solo-role-2026-08-01.sql, see also tests/solo-genuine-role-2026-08-01.spec.js).
// loadUserInfo's dedicated `if (currentProfile?.role === 'solo')` branch (js/app-core.js) now covers what
// the old solo_only-flag branch used to do — no in-memory role reassignment, no separate flag. The tests
// below are adjusted to set the real role directly rather than the retired flag; the safety properties
// they guard (never a master account, switchView can't escape it, starter-seed checks the raw role,
// _soloClientId only ever set when the row is actually found) still hold for the new native branch.
test.describe('solo_only — locked personal-only account (2026-07-24)', () => {
  test('loadUserInfo never sets _masterAccount for a solo_only account, and switchView cannot escape it', async ({ page }) => {
    await loginAsPT(page) // has a permanent self-referential "E2E PT Solo" clients row already

    // The mutation to the real, shared PT fixture (role='solo') must not happen until AFTER the
    // precondition it depends on is confirmed — and everything from here on must be inside try/finally,
    // so any assertion failure still resets it. An earlier version of this test mutated first and
    // asserted after, outside the try block: if the clients-row check had ever failed, the mutation would
    // have been left stuck on the shared PT account with no cleanup — the exact class of damage that
    // already happened once this session to the PT2 fixture. Found by multi-agent review, 2026-07-24.
    try {
      const setup = await page.evaluate(async () => {
        // RLS doesn't permit a user to self-insert a coach_id:null clients row for themselves — real
        // solo records have only ever been created via privileged SQL (exactly the gap behind Jake's
        // "Solo must become a genuine account type" decision). PT already carries one from prior test
        // fixtures; use it rather than trying to create a new one through the app's own (deliberately
        // restricted) permissions.
        const { data: existing, error } = await db.from('clients').select('id').eq('user_id', currentUser.id).is('coach_id', null).maybeSingle()
        if (error || !existing) return { error: error?.message || 'PT\'s self-referential clients row is missing' }
        await db.from('profiles').update({ role: 'solo' }).eq('id', currentUser.id)
        return { clientId: existing.id }
      })
      expect(setup.error).toBeFalsy()
      expect(setup.clientId, 'this test needs PT\'s existing self-referential clients row to be present').toBeTruthy()

      // A fresh load is required — loadUserInfo already ran once during login, before solo_only was set.
      await page.reload()
      await page.waitForSelector('#app-shell', { state: 'visible', timeout: 15000 })
      await page.waitForTimeout(1000)

      const r = await page.evaluate(() => {
        const before = {
          masterAccount: !!window._masterAccount,
          role: currentProfile?.role,
          soloClientId: window._soloClientId,
          switcherDisplay: document.getElementById('view-switcher')?.style.display,
        }
        switchView('coach') // the deliberate, product-intended escape hatch — must be a no-op here
        const after = {
          masterAccount: !!window._masterAccount,
          role: currentProfile?.role,
          switcherDisplay: document.getElementById('view-switcher')?.style.display,
        }
        return { before, after }
      })

      // RED before: solo_only didn't exist, so this branch never ran — a normal master account would
      // have masterAccount:true and a visible switcher instead.
      expect(r.before.masterAccount, 'a solo_only account must never become a master account').toBe(false)
      expect(r.before.role, 'a solo_only account must land on the solo role, not coach').toBe('solo')
      expect(r.before.soloClientId, 'window._soloClientId must still be populated so the solo dashboard has something to query').toBe(setup.clientId)
      expect(r.before.switcherDisplay, 'the view-switcher must never be shown').not.toBe('block')
      expect(r.after.masterAccount, 'switchView must not be able to turn a solo_only account into a master account').toBe(false)
      expect(r.after.role, 'switchView(\'coach\') must be a no-op — role must stay solo').toBe('solo')
    } finally {
      // Never creates a row (PT's self-referential clients row is borrowed, not owned by this test —
      // see setup above), so cleanup is just restoring the real role. Runs regardless of which assertion
      // above failed, or even if the precondition check itself failed before any mutation happened.
      await page.evaluate(async () => {
        await db.from('profiles').update({ role: 'coach' }).eq('id', currentUser.id)
      })
    }
  })

  // Starter-content seeding must still work for a native role='solo' account on its genuine first
  // login — checked against the RAW fetched role, not the display role the master-account branch may
  // reassign for a view-switch. (Text updated 2026-08-01 for Task 3's coach-OR-solo starter-seed gate.)
  test('loadUserInfo checks the raw fetched role for starter-seeding, not the display-reassigned role', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => loadUserInfo.toString().includes("(data?.role === 'coach' || data?.role === 'solo') && data?.starter_seeded === false"))
    expect(r, 'the starter-seed check must use the raw data.role, immune to any role reassignment above it').toBe(true)
  })

  // Caught by multi-agent review (2026-07-24): the OLD solo_only branch used to force role:'solo' EVEN IF
  // the self-referential clients-row lookup came back empty or errored — unlike the sibling master-account
  // branch, which only reassigns role when a row is actually found. That in-memory reassignment no longer
  // exists (2026-08-01: role='solo' arrives natively — see UPDATE note at top of file); the equivalent
  // guarantee now is that window._soloClientId is only ever set when the self-referential row is actually
  // found, so a bad lookup can't strand a native solo account with a populated dashboard pointing nowhere.
  test('the solo_only branch only reassigns role when the self-referential clients row is actually found', async ({ page }) => {
    await loginAsPT(page)
    const guarded = await page.evaluate(() => /if \(soloRec\) window\._soloClientId = soloRec\.id/.test(loadUserInfo.toString()))
    expect(guarded, 'window._soloClientId must only be assigned inside an `if (soloRec)` check').toBe(true)
  })

  // Caught by multi-agent review: window._masterAccount/_soloClientId/_masterClientId and the
  // view-switcher's visibility are SESSION state, but loadUserInfo only ever SETS them — nothing
  // reset them on sign-out. On a shared/gym device, the primary sidebar sign-out button doesn't
  // reload the page, so the NEXT account signing in on the same tab inherited the PREVIOUS account's
  // stale _masterAccount=true — which is the ONLY thing switchView()'s guard checks. That silently
  // handed a solo_only account a working escape hatch to the full coach dashboard.
  test('signing out resets master-account/solo session state, closing the same-tab escape hatch', async ({ page }) => {
    await loginAsPT(page) // a genuine master account (has both a coached and a self-referential row) — _masterAccount should start true
    const before = await page.evaluate(() => !!window._masterAccount)
    expect(before, 'setup check: PT should be a master account before signing out').toBe(true)

    await page.evaluate(() => document.getElementById('sign-out-btn').click())
    await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 10000 })

    const after = await page.evaluate(() => ({
      masterAccount: !!window._masterAccount,
      soloClientId: window._soloClientId,
      masterClientId: window._masterClientId,
      switcherDisplay: document.getElementById('view-switcher')?.style.display,
    }))
    expect(after.masterAccount, 'sign-out must reset _masterAccount').toBe(false)
    expect(after.soloClientId, 'sign-out must reset _soloClientId').toBeNull()
    expect(after.masterClientId, 'sign-out must reset _masterClientId').toBeNull()
    expect(after.switcherDisplay, 'sign-out must hide the view-switcher').toBe('none')
  })

  // Caught by multi-agent review: a failed profiles fetch left currentProfile null, and every role
  // check downstream (`role === 'client' ? ... : role === 'solo' ? ... : coach-default`) treats an
  // unrecognised role as 'coach' — so a transient error would silently hand ANY account, including a
  // solo_only one, the full coach nav/dashboard shell. showApp now fails closed instead.
  test('showApp shows a retry state instead of defaulting to the coach dashboard on a failed profile fetch', async ({ page }) => {
    await loginAsPT(page)
    const guarded = await page.evaluate(() => /if \(!currentProfile\) \{/.test(showApp.toString()))
    expect(guarded, 'showApp must check for a missing currentProfile before applying any role default').toBe(true)
  })
})
