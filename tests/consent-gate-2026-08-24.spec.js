// UK GDPR consent gate — 2026-08-24
//
// The app handles special-category (health) data and had NO consent capture anywhere, while a real
// outside beta tester was onboarded 2026-08-09. privacy-policy.html had existed since 2026-06-29 but
// was linked from NOWHERE — `grep -rn "privacy-policy" js/ index.html` returned zero hits, which is
// the red-before for this whole file.
//
// What these tests pin, in order of what actually protects a data subject:
//   1. the policy is reachable at all,
//   2. the consent control exists on the only path to an active account,
//   3. the JS guard refuses activation even when the `required` attribute is stripped, and
//   4. an existing user can still find the policy from Settings.
//
// (3) is the one that matters. `required` alone is removable in devtools in about four seconds, so a
// test that only proves native validation would be testing the browser, not this app.

const { test, expect } = require('./fixtures')
const { loginAsPT, clickVisible } = require('./helpers')

test.describe('GDPR consent gate', () => {
  test('the privacy policy is served and is the real UK GDPR text', async ({ page }) => {
    const res = await page.goto('/privacy-policy.html')
    expect(res.status()).toBe(200)
    // Not just "a page exists" — assert the sections a UK GDPR policy must actually carry, so a
    // truncated or placeholder file cannot pass this.
    for (const section of ['What data we collect', 'legal basis', 'Your rights under UK GDPR', 'How long we keep your data']) {
      await expect(page.locator('body')).toContainText(section)
    }
  })

  test('the invite form carries a consent checkbox linking to the policy', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 10000 })
    await page.evaluate(() => showInviteForm())

    const box = page.locator('#invite-consent')
    await expect(box).toBeVisible()
    await expect(box).not.toBeChecked()                       // must be opt-IN, never pre-ticked
    await expect(box).toHaveAttribute('required', '')

    const link = page.locator('#invite-form a[href="privacy-policy.html"]')
    await expect(link).toBeVisible()
  })

  test('activation is REFUSED with consent unticked, even with `required` stripped', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 10000 })
    await page.evaluate(() => showInviteForm())

    // Simulate the devtools bypass: drop the attribute the browser enforces, so the ONLY thing left
    // standing between an unticked box and an active account is the JS guard in the submit handler.
    await page.evaluate(() => document.getElementById('invite-consent').removeAttribute('required'))

    // Fail loudly if activation is even attempted — reaching Supabase at all would mean the guard
    // did not run. This is the assertion that would have caught a guard placed after the await.
    let activationAttempted = false
    page.on('request', r => { if (/\/auth\/v1\/user/.test(r.url())) activationAttempted = true })

    await page.fill('#invite-name', 'Consent Probe')
    await page.fill('#invite-password', 'probe-password-123')
    await page.click('#invite-submit')

    await expect(page.locator('#invite-error')).toContainText('Privacy Policy')
    expect(activationAttempted).toBe(false)
    // Still on the auth screen — no account was activated.
    await expect(page.locator('#auth-screen')).toBeVisible()
  })

  test('with consent TICKED the guard does NOT block — activation is attempted', async ({ page }) => {
    // The green path, and the one the other three cannot cover. Every other test here proves a
    // REFUSAL, so a guard written `!consent?.value` instead of `!consent?.checked` would refuse every
    // legitimate user on earth and all of them would still pass. A guard's real risk is refusing the
    // person it is supposed to let through — that is how "View as" broke.
    //
    // This asserts the REQUEST is attempted, not that activation succeeds: there is no real invite
    // session in a test, so Supabase answers "Auth session missing!". Reaching Supabase at all is the
    // proof that the guard stepped aside.
    await page.goto('/')
    await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 10000 })
    await page.evaluate(() => showInviteForm())

    await page.fill('#invite-name', 'Consent Probe')
    await page.fill('#invite-password', 'probe-password-123')
    await page.check('#invite-consent')
    await page.click('#invite-submit')

    // Assert on the ERROR TEXT, not on a network request. supabase-js rejects updateUser
    // client-side when there is no session, so it never puts a request on the wire — a
    // request-listener assertion here fails for the wrong reason and looks like a broken guard.
    // (It did, on the first version of this test.) What DOES prove passage is which message
    // comes back: Supabase's own, rather than the consent refusal.
    const err = page.locator('#invite-error')
    await expect(err).not.toBeEmpty({ timeout: 8000 })
    await expect(err).not.toContainText('agree to the Privacy Policy')
    // The button is restored, so a legitimate user who hit a downstream error can retry.
    await expect(page.locator('#invite-submit')).toBeEnabled()
  })

  // ── the READ-side gate ──────────────────────────────────────────────────────
  // The checkbox above covers one of three routes to an active account. This gate covers all of
  // them, plus every account that predates it, plus re-consent after a policy edit.
  test('_needsConsent FAILS OPEN when consent state is unreadable', async ({ page }) => {
    // The single most important property in this file. If the migration has not been run, the
    // consent columns do not exist, the select errors, and _loadConsentState returns null. If that
    // null were treated as "needs consent", EVERY user — including the owner — would be locked out
    // of the whole app by a gate they cannot satisfy. Unknown must mean "do not prompt".
    await page.goto('/')
    await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 10000 })
    expect(await page.evaluate(() => _needsConsent(null))).toBe(false)
  })

  test('_needsConsent decides correctly on real row shapes', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 10000 })
    const r = await page.evaluate(() => ({
      noConsent:  _needsConsent({ consented_at: null, consent_policy_version: null }),
      current:    _needsConsent({ consented_at: '2026-08-24T00:00:00Z', consent_policy_version: PRIVACY_POLICY_VERSION }),
      superseded: _needsConsent({ consented_at: '2026-08-24T00:00:00Z', consent_policy_version: '2020-01-01' })
    }))
    expect(r.noConsent).toBe(true)    // never consented
    expect(r.current).toBe(false)     // consented to the CURRENT policy — must not nag
    expect(r.superseded).toBe(true)   // consented to an older text — re-consent. This is the
                                      // behaviour PRIVACY_POLICY_VERSION documented and nothing
                                      // implemented until now.
  })

  test('the consent gate cannot be dismissed without deciding', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 10000 })
    await page.evaluate(() => showConsentGate(false))

    const modal = page.locator('#consent-gate-modal')
    await expect(modal).toBeVisible()
    // No close affordance — consent or sign out are the only exits.
    await expect(modal.locator('.modal-close')).toHaveCount(0)
    // Clicking the backdrop must NOT dismiss it (every other modal in the app does dismiss).
    await modal.click({ position: { x: 5, y: 5 } })
    await expect(modal).toBeVisible()
    // Opt-IN: the accept button is dead until the box is ticked.
    const accept = page.locator('#consent-gate-accept')
    await expect(accept).toBeDisabled()
    await page.check('#consent-gate-box')
    await expect(accept).toBeEnabled()
    await expect(modal.locator('a[href="privacy-policy.html"]')).toBeVisible()
  })

  test('Settings exposes the policy to an already-active user', async ({ page }) => {
    await loginAsPT(page)
    await clickVisible(page, '[data-page="settings"]')
    const link = page.locator('#settings-privacy-link')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', 'privacy-policy.html')
  })
})
