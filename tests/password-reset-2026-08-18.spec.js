// Password reset flow (2026-08-18).
//
// Built after a real beta user (invited 2026-08-09, never confirmed) had NO route back into the app:
//   - there was no reset flow at all — zero `resetPasswordForEmail` anywhere in the codebase;
//   - the invite Edge Function is deliberately idempotent, so re-inviting an existing address
//     silently sends nothing (`if (already) { userId = already.id }` — it skips inviteUserByEmail);
//   - and a dashboard-sent recovery link was inert, because onAuthStateChange did
//     `if (event === 'PASSWORD_RECOVERY') return` — the event was swallowed and no form ever showed.
// Recovering him took hand-written SQL to delete the dead auth row.
//
// The load-bearing part is the GUARD, not the form. A recovery link ESTABLISHES A SESSION, so without
// it `currentUser` is set, `showApp()` fires, and the app boots straight past the password form into
// the dashboard — the user never gets to set one, and the link is burned.
const { test, expect } = require('./fixtures')

// The auth screen renders before login, so these drive the signed-OUT app.
const gotoApp = async (page, hash = '') => {
  await page.goto('http://localhost:3001/' + hash)
  await page.waitForFunction(() => typeof showLoginForm === 'function', { timeout: 15000 })
}

test.describe('Password reset', () => {
  test('the sign-in screen offers a way out — it had none', async ({ page }) => {
    await gotoApp(page)
    await expect(page.locator('#forgot-link')).toBeVisible()
    await page.click('#forgot-link')
    await expect(page.locator('#reset-request-form')).toBeVisible()
    await expect(page.locator('#login-form')).toBeHidden()
    await expect(page.locator('#reset-email')).toBeVisible()
  })

  test('a typed email carries across, and Back returns to sign in', async ({ page }) => {
    await gotoApp(page)
    await page.fill('#login-email', 'colin@example.com')
    await page.click('#forgot-link')
    await expect(page.locator('#reset-email')).toHaveValue('colin@example.com')
    await page.click('#reset-back-link')
    await expect(page.locator('#login-form')).toBeVisible()
    await expect(page.locator('#reset-request-form')).toBeHidden()
  })

  test('requesting a link never reveals whether the account exists', async ({ page }) => {
    await gotoApp(page)
    // Stub the network call — this asserts our COPY and our call shape, not Supabase's mailer.
    const called = await page.evaluate(() => {
      window.__resetArgs = null
      db.auth.resetPasswordForEmail = async (email, opts) => { window.__resetArgs = { email, opts }; return { error: null } }
      return true
    })
    expect(called).toBe(true)

    await page.click('#forgot-link')
    await page.fill('#reset-email', 'definitely-not-a-user@example.com')
    await page.click('#reset-submit')
    await expect(page.locator('#reset-sent')).toBeVisible()

    const text = await page.locator('#reset-sent').textContent()
    // Account enumeration: a "no such user" message lets anyone test which emails have accounts.
    expect(text.toLowerCase()).toContain('if that email has an account')
    expect(text.toLowerCase()).not.toContain('sent to')

    const args = await page.evaluate(() => window.__resetArgs)
    expect(args.email).toBe('definitely-not-a-user@example.com')
    // redirectTo must be the deployed app — supabase appends the recovery hash to it, and the boot
    // code is what turns that hash into the set-password form. Point it elsewhere and the link dies.
    expect(args.opts.redirectTo).toContain('jakendwest-ops.github.io/coachapp')
  })

  test('a recovery link shows the set-password form, NOT the dashboard', async ({ page }) => {
    // The whole bug, in one assertion. type=recovery in the hash is what a real Supabase reset link
    // carries; _initialHash is captured before supabase-js consumes it.
    await gotoApp(page, '#access_token=fake&refresh_token=fake&type=recovery')
    await expect(page.locator('#new-password-form')).toBeVisible()
    await expect(page.locator('#login-form')).toBeHidden()
    await expect(page.locator('#invite-form')).toBeHidden()
    await expect(page.locator('#np-password')).toBeVisible()
    await expect(page.locator('#np-confirm')).toBeVisible()
    // THE failure mode. A recovery link establishes a session, so without the guards in
    // onAuthStateChange, currentUser is set, showApp() fires, and the user lands on the dashboard
    // with the link already burned and no password ever set.
    await expect(page.locator('#app-shell')).toBeHidden()
    await expect(page.locator('#auth-screen')).toBeVisible()
  })


  test('mismatched passwords are caught before any network call', async ({ page }) => {
    await gotoApp(page, '#access_token=fake&refresh_token=fake&type=recovery')
    await page.evaluate(() => {
      window.__updateCalled = false
      db.auth.updateUser = async () => { window.__updateCalled = true; return { error: null } }
    })
    await page.fill('#np-password', 'abcdef1')
    await page.fill('#np-confirm', 'abcdef2')
    await page.click('#np-submit')
    await expect(page.locator('#np-error')).toContainText('do not match')
    // A typo that reaches the server BURNS the single-use recovery token.
    expect(await page.evaluate(() => window.__updateCalled)).toBe(false)
  })

  test('an expired link explains itself instead of showing "Auth session missing!"', async ({ page }) => {
    await gotoApp(page, '#access_token=fake&refresh_token=fake&type=recovery')
    await page.evaluate(() => {
      db.auth.updateUser = async () => ({ error: { message: 'Auth session missing!' } })
    })
    await page.fill('#np-password', 'goodpassword')
    await page.fill('#np-confirm', 'goodpassword')
    await page.click('#np-submit')
    const err = page.locator('#np-error')
    await expect(err).toContainText('expired')
    await expect(err).not.toContainText('Auth session missing')
    // Must stay usable so they can go and request a fresh link.
    await expect(page.locator('#np-submit')).toBeEnabled()
  })

  test('only one auth form is ever visible at a time', async ({ page }) => {
    await gotoApp(page)
    const visibleCount = async () => page.evaluate(() =>
      ['login-form', 'invite-form', 'reset-request-form', 'new-password-form']
        .filter(id => {
          const el = document.getElementById(id)
          return el && getComputedStyle(el).display !== 'none'
        }).length)

    expect(await visibleCount()).toBe(1)
    for (const fn of ['showResetRequestForm', 'showNewPasswordForm', 'showInviteForm', 'showLoginForm']) {
      await page.evaluate(f => window[f](), fn)
      expect(await visibleCount(), `${fn} must leave exactly one form visible`).toBe(1)
    }
  })
})
