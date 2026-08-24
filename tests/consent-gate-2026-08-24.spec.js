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

  test('Settings exposes the policy to an already-active user', async ({ page }) => {
    await loginAsPT(page)
    await clickVisible(page, '[data-page="settings"]')
    const link = page.locator('#settings-privacy-link')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', 'privacy-policy.html')
  })
})
