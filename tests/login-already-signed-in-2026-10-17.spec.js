const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

// ─── The form-login fallback when the page is ALREADY signed in (2026-10-17). loginAs() waited for the sign-in form and nothing else, so on a page that a stored session had already signed in
// it waited 10 s for a form that never appeared and failed the test: both first-attempt failures in the 2026-10-17 no-retry full run (client-workout cross-client RLS, progress-session-detail)
// were exactly this (error-context: `#auth-screen` resolved to hidden, the page showing the right user's dashboard), and the most common flake in the suite before it. It is reproduced here on
// demand: sign in, then force the form fallback (NO_SESSION_REUSE is read at call time) while the page is still signed in.
test.describe('loginAs with the page already signed in', () => {
  test('the same user: the helper returns instead of waiting for a sign-in form that never appears', async ({ page }) => {
    test.setTimeout(90_000)
    await loginAsPT(page)
    process.env.NO_SESSION_REUSE = '1'
    try { await loginAsPT(page) } finally { delete process.env.NO_SESSION_REUSE }
    await expect(page.locator('h1:has-text("Welcome back")')).toBeVisible()
  })

  test('a DIFFERENT user already signed in is replaced by the requested one, not accepted', async ({ page }) => {
    test.setTimeout(90_000)
    await loginAsPT(page)
    process.env.NO_SESSION_REUSE = '1'
    try { await loginAsClient(page) } finally { delete process.env.NO_SESSION_REUSE }
    await expect(page.locator('h1:has-text("Hi,")')).toBeVisible()
    await expect(page.locator('h1:has-text("Welcome back")')).toHaveCount(0)
  })
})
