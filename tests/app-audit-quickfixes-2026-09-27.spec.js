// The four quick fixes from the 2026-09-27 app-code audit. Each test was run RED against the code
// before its fix. No test here writes a database row.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

test.describe('App-code audit quick fixes (2026-09-27)', () => {
  // docs/bugs/2026-09-27-login-password-placeholder-shows-garbled-characters.md
  test('the login password placeholder is not double-encoded', async ({ page }) => {
    await page.goto('/')
    const placeholder = await page.locator('#login-password').getAttribute('placeholder')
    // "â€" is what a UTF-8 bullet (or any 3-byte character) looks like after a second encoding pass.
    expect(placeholder).not.toMatch(/â|€/)
  })

  // docs/bugs/2026-09-27-every-phone-user-sees-the-pt-view-switcher-pill.md
  test('a client on a phone does not see the view-switcher pill', async ({ page }) => {
    await loginAsClient(page)
    await expect(page.locator('.bottom-nav')).toBeVisible()
    await expect(page.locator('#mobile-view-switcher')).toBeHidden()
  })

  // The other direction: hiding it must not hide it from the one account it exists for. The pill must
  // follow window._masterAccount exactly, whichever way the PT test account is set up.
  test('on a phone the pill shows exactly when the account is the master account', async ({ page }) => {
    // loginAsPT returns only after the dashboard heading renders, which is after loadUserInfo has decided
    // the master flag. `=== true` because the flag is only ever SET true; a non-master account leaves it
    // undefined, not false (found in review: polling for a boolean could never see a non-master account).
    await loginAsPT(page)
    await expect(page.locator('.bottom-nav')).toBeVisible()
    const isMaster = await page.evaluate(() => window._masterAccount === true)
    console.log(`PT test account _masterAccount=${isMaster}`)
    if (isMaster) await expect(page.locator('#mobile-view-switcher')).toBeVisible()
    else await expect(page.locator('#mobile-view-switcher')).toBeHidden()
  })

  // docs/bugs/2026-09-27-settings-sign-out-leaves-runner-drafts-on-the-phone.md
  // On a phone the sidebar (and its sign-out button) is hidden, so Settings is how people sign out.
  test('signing out from Settings on a phone clears runner drafts', async ({ page }) => {
    await loginAsPT(page)
    await expect(page.locator('#sign-out-btn')).toBeHidden()
    await page.evaluate(() => localStorage.setItem('_runnerDraft_e2e-audit', '{"e2e":true}'))
    await page.locator('[data-page="settings"]:visible').first().click()
    // The Settings route reloads after signing out, and #auth-screen is already visible BEFORE that
    // reload, so wait for the reload itself or the evaluate below can hit a destroyed context.
    const reloaded = page.waitForEvent('load')
    await page.locator('#settings-sign-out-btn').click()
    await reloaded
    await expect(page.locator('#auth-screen')).toBeVisible({ timeout: 10000 })
    const left = await page.evaluate(() => localStorage.getItem('_runnerDraft_e2e-audit'))
    await page.evaluate(() => localStorage.removeItem('_runnerDraft_e2e-audit'))
    expect(left).toBeNull()
  })

  // A floating version (@2, @4) lets a third-party release change production with no tag; no
  // integrity hash lets a compromised CDN run code with the user's session. checks.sh rule 9p
  // blocks both at push time — this proves the page actually loaded with them.
  test('every third-party script is pinned to an exact version with an integrity hash', async ({ page }) => {
    await page.goto('/')
    const scripts = await page.evaluate(() => [...document.querySelectorAll('script[src^="http"]')]
      .map(s => ({ src: s.getAttribute('src'), integrity: s.getAttribute('integrity'), crossorigin: s.getAttribute('crossorigin') })))
    expect(scripts.length).toBeGreaterThan(0)
    for (const s of scripts) {
      expect(s.src, `${s.src} must name an exact x.y.z version`).toMatch(/@\d+\.\d+\.\d+\//)
      expect(s.integrity, `${s.src} needs an integrity hash`).toMatch(/^sha(384|512)-/)
      expect(s.crossorigin, `${s.src} needs crossorigin for SRI`).toBe('anonymous')
    }
    // The pinned libraries actually loaded (a wrong hash makes the browser refuse the file).
    expect(await page.evaluate(() => typeof window.supabase?.createClient)).toBe('function')
    expect(await page.evaluate(() => typeof window.Chart)).toBe('function')
  })
})
