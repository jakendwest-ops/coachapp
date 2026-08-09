const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Weekly full-file review (2026-08-09) — Agent C found discardRunner() clears every runner timer/overlay
// EXCEPT the timed-hold strength-set countdown (_setTimerInterval / wr-set-timer-overlay), which its own
// sibling teardown (stopStrengthSetTimer) already knows to clear. Reachable via confirmEndRunner's bare
// discardRunner() branch — tapping End before any set anywhere is logged, while a timed-hold countdown is
// running. Left a stuck fullscreen overlay and an orphaned interval that throws against the just-nulled
// _runner on its next tick.
test.describe('discardRunner() timer/overlay leak (weekly review, 2026-08-09)', () => {
  test('clears the timed-hold set timer and removes its overlay, leaving no orphaned interval', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', e => pageErrors.push(e.message))
    await loginAsPT(page)

    const before = await page.evaluate(() => {
      _runner = {
        clientId: 'x', exIdx: 0, exercises: [{
          name: 'Plank', type: 'strength', loggedSets: [],
          sets_json: [{ timed: true, duration: '0:05' }]
        }]
      }
      startStrengthSetTimer()
      return {
        hadInterval: !!_runner._setTimerInterval,
        overlayPresent: !!document.getElementById('wr-set-timer-overlay'),
      }
    })
    expect(before.hadInterval).toBe(true)
    expect(before.overlayPresent).toBe(true)

    // Let at least one real tick fire before discarding, so a genuinely orphaned interval would have a
    // chance to reference the just-nulled _runner on ITS next tick and throw.
    await page.waitForTimeout(1100)

    await page.evaluate(() => { discardRunner() })
    // Past the point where the (correctly-cleared) interval's next tick would have fired if it had leaked.
    await page.waitForTimeout(1200)

    const after = await page.evaluate(() => ({
      overlayPresent: !!document.getElementById('wr-set-timer-overlay'),
      runnerIsNull: _runner === null,
    }))
    expect(after.overlayPresent).toBe(false)
    expect(after.runnerIsNull).toBe(true)
    expect(pageErrors, `unexpected page errors (orphaned interval throwing against null _runner): ${pageErrors.join('; ')}`).toEqual([])
  })
})
