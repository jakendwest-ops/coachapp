const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// 2026-08-09 — Jake: onboarding a beta-testing friend as a solo/personal account needed a terminal +
// a manually-pasted Supabase service-role key each time ("too convoluted... won't scale"). This moves
// the privileged logic (already proven correct in scripts/invite-solo-user.cjs) into a Supabase Edge
// Function (supabase/functions/invite-solo-user/index.ts — the only place a service-role-level
// capability may safely live) plus a Settings-page card, so every future invite is just "type a name
// and email, click Send" inside the app. The Edge Function itself can't be exercised here (no local
// Deno runtime for it, same limitation the pre-existing sendClientInvite has always had — zero test
// coverage for it either) — these tests cover what CAN be verified locally: the card is genuinely
// gated to jakendwest@gmail.com (a UI convenience only; the real authorization check is the Edge
// Function's own server-side caller.email check, not testable here), field validation, and the
// request/response handling contract via a mocked fetch.

test.describe('Invite a personal user — Settings card', () => {
  test('card is hidden for a non-owner account, visible once currentUser.email is the owner', async ({ page }) => {
    await loginAsPT(page)
    const before = await page.evaluate(async () => {
      await navigate('settings')
      await new Promise(r => setTimeout(r, 500))
      return !!document.getElementById('solo-invite-name')
    })
    expect(before).toBe(false)

    const after = await page.evaluate(async () => {
      currentUser.email = 'jakendwest@gmail.com'
      await navigate('settings')
      await new Promise(r => setTimeout(r, 500))
      return !!document.getElementById('solo-invite-name')
    })
    expect(after).toBe(true)
  })

  test('requires both name and email before attempting to send', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      currentUser.email = 'jakendwest@gmail.com'
      await navigate('settings')
      await new Promise(res => setTimeout(res, 500))
      window.confirm = () => true
      document.getElementById('solo-invite-name').value = ''
      document.getElementById('solo-invite-email').value = ''
      // No real click needed here — the empty-field guard returns before touching `event`.
      await inviteSoloUser()
      return document.getElementById('solo-invite-msg')?.textContent
    })
    expect(r).toContain('required')
  })

  test('on success: clears the fields and shows a confirmation, using the response userId', async ({ page }) => {
    await loginAsPT(page)
    await page.route('**/functions/v1/invite-solo-user', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ userId: 'fake-new-user-id' }) })
    )
    await page.evaluate(async () => {
      currentUser.email = 'jakendwest@gmail.com'
      await navigate('settings')
      await new Promise(res => setTimeout(res, 500))
      window.confirm = () => true
      document.getElementById('solo-invite-name').value = 'Test Friend'
      document.getElementById('solo-invite-email').value = 'test-friend@example.com'
    })
    await page.click('button:has-text("Send invite")')
    await expect(page.locator('button:has-text("Invite sent")')).toBeVisible({ timeout: 5000 })
    const cleared = await page.evaluate(() => ({
      name: document.getElementById('solo-invite-name').value,
      email: document.getElementById('solo-invite-email').value,
    }))
    expect(cleared.name).toBe('')
    expect(cleared.email).toBe('')
  })

  test('on failure: shows the edge function\'s error in the button and re-enables it', async ({ page }) => {
    await loginAsPT(page)
    await page.route('**/functions/v1/invite-solo-user', route =>
      route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Not authorized' }) })
    )
    await page.evaluate(async () => {
      currentUser.email = 'jakendwest@gmail.com'
      await navigate('settings')
      await new Promise(res => setTimeout(res, 500))
      window.confirm = () => true
      document.getElementById('solo-invite-name').value = 'Test Friend'
      document.getElementById('solo-invite-email').value = 'test-friend@example.com'
    })
    await page.click('button:has-text("Send invite")')
    await expect(page.locator('button:has-text("Not authorized")')).toBeVisible({ timeout: 5000 })
    // Reverts to the enabled, neutral state after the timeout — not stuck failed forever.
    await expect(page.locator('button:has-text("Send invite")')).toBeVisible({ timeout: 5000 })
    const disabled = await page.evaluate(() =>
      [...document.querySelectorAll('button')].find(b => b.textContent.includes('Send invite'))?.disabled
    )
    expect(disabled).toBe(false)
  })

  // Found by multi-agent-review: without clearing the previous revert timer, a second invite started
  // within 3s of the first one's success/failure would have its own "Sending…" label silently stomped
  // back to "Send invite" by the FIRST invite's stale timeout — not a double-submit (disabled holds),
  // but a misleading mid-flight visual state.
  test('rapid back-to-back invites: the first invite\'s revert timer does not stomp the second invite\'s in-progress label', async ({ page }) => {
    await loginAsPT(page)
    let callCount = 0
    await page.route('**/functions/v1/invite-solo-user', async route => {
      callCount++
      if (callCount === 1) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ userId: 'first-id' }) })
      } else {
        // Long enough that invite #1's 3s revert timer would fire while this one is still pending.
        await new Promise(r => setTimeout(r, 3500))
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ userId: 'second-id' }) })
      }
    })
    await page.evaluate(async () => {
      currentUser.email = 'jakendwest@gmail.com'
      await navigate('settings')
      await new Promise(res => setTimeout(res, 500))
      window.confirm = () => true
    })

    await page.fill('#solo-invite-name', 'First Friend')
    await page.fill('#solo-invite-email', 'first@example.com')
    await page.click('button:has-text("Send invite")')
    await expect(page.locator('button:has-text("Invite sent")')).toBeVisible({ timeout: 5000 })

    await page.fill('#solo-invite-name', 'Second Friend')
    await page.fill('#solo-invite-email', 'second@example.com')
    await page.click('button:has-text("Send invite")')
    await expect(page.locator('button:has-text("Sending")')).toBeVisible({ timeout: 2000 })

    // Past where invite #1's 3s revert timer would have fired had it not been cleared.
    await page.waitForTimeout(3200)
    await expect(page.locator('button:has-text("Sending")')).toBeVisible()
  })

  // Found by multi-agent-review: the validation message ("Name and email are both required.") was
  // never cleared on a subsequent successful send, so it could sit stale next to "✓ Invite sent".
  test('a stale validation message is cleared once a real send attempt begins', async ({ page }) => {
    await loginAsPT(page)
    await page.route('**/functions/v1/invite-solo-user', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ userId: 'fake-id' }) })
    )
    await page.evaluate(async () => {
      currentUser.email = 'jakendwest@gmail.com'
      await navigate('settings')
      await new Promise(res => setTimeout(res, 500))
      window.confirm = () => true
    })
    // Trip the validation message first.
    await page.evaluate(() => inviteSoloUser())
    await expect(page.locator('#solo-invite-msg')).toHaveText(/required/)

    // Then a real, valid send.
    await page.fill('#solo-invite-name', 'Test Friend')
    await page.fill('#solo-invite-email', 'test-friend@example.com')
    await page.click('button:has-text("Send invite")')
    await expect(page.locator('button:has-text("Invite sent")')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('#solo-invite-msg')).toHaveText('')
  })
})
