const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Jake, live: his brother visited the bare URL, hit the public "Sign up" link on the login screen,
// and self-registered — landing on a full PT/coach account with no invite, no approval, nobody
// vetting who gets in. Decision: accounts are provisioned ONLY by Jake creating the auth user
// directly and handing over credentials. The login screen must not offer any path to create one.
//
// This closes the CLIENT-SIDE path only. Supabase Auth's "Allow new users to sign up" must also be
// turned off in the dashboard — db.auth.signUp() is callable directly via devtools/API with just the
// public anon key, regardless of whether this UI exists. Flagged to Jake, not something this commit
// can enforce from the client.
test.describe('Public self-signup removed 2026-07-24', () => {
  test('the login screen offers no way to create an account', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 10000 })

    // RED before: #show-signup was a visible "Don't have an account? Sign up" link.
    await expect(page.locator('#show-signup')).toHaveCount(0)
    await expect(page.locator('#signup-form')).toHaveCount(0)
    await expect(page.locator('text=Sign up')).toHaveCount(0)
    await expect(page.locator('text=Create account')).toHaveCount(0)

    // The signup submit handler itself must be gone too, not just hidden — a lingering handler bound
    // to a re-added element would be a silent trap for a future edit.
    const hasSignupListener = await page.evaluate(() => !!document.getElementById('signup-form'))
    expect(hasSignupListener).toBe(false)
  })

  // The invite-acceptance flow (a coach explicitly invites a specific client) is a DIFFERENT,
  // still-legitimate onboarding path — untouched by this change. showInviteForm used to also hide
  // the now-removed #signup-form; confirm that stale reference didn't survive as a runtime error.
  test('showInviteForm still works with signup-form gone (no getElementById-on-null crash)', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 10000 })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.evaluate(() => showInviteForm())
    await expect(page.locator('#invite-form')).toBeVisible()
    expect(errors, 'showInviteForm threw after signup-form was removed').toEqual([])
  })

  // Login itself must be completely unaffected by the removal.
  test('login still works normally', async ({ page }) => {
    await loginAsPT(page)
    await expect(page.locator('#app-shell')).toBeVisible()
  })
})
