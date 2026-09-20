const { test, expect } = require('./fixtures')
const { loginAsClient, logTableSet } = require('./helpers')

// ─── Runner: the screen stays on, and a rest survives a locked phone (R1e, 2026-09-20) ──────────────
//
// Two gaps, both found by reading the code on 2026-09-19 (nothing in js/ requested a screen wake lock or
// listened for visibilitychange; the rest timer decremented a counter once per interval tick):
//
//   1. WAKE LOCK. A workout logger left on a bench dims and locks the phone mid-rest.
//   2. REST TIMER. `restRemaining--` per tick means a tab the OS suspended (screen locked, app switched)
//      simply stops counting: come back after 60 s and the rest still says ~90 s, its voice cues and finish
//      beep never having fired. The fix counts to an END TIME instead — the displayed second is derived from
//      Date.now() — so the countdown is right the moment the tab comes back.
//
// HOW TIME IS FAKED (Playwright 1.61 page.clock, first use in this suite):
//   - clock.fastForward(ms)   jumps time and fires each due timer AT MOST ONCE — exactly what a suspended
//                             phone does when it wakes. A tick-counting timer sees ONE tick; an end-time timer
//                             sees the truth.
//   - clock.setSystemTime(t)  moves Date.now() WITHOUT firing any timer — a tab frozen by the OS, before its
//                             timers have run again. Only an explicit visibilitychange handler can fix that.
//   - clock.runFor(ms)        advances firing every timer in between, as if running normally — the mirror.
//
// The wake-lock API is stubbed with a fake sentinel (an EventTarget with release()), because headless
// Chromium has none and the test has to be able to make "the browser" drop the lock.
//
// Interval-phase and count-in timers are deliberately NOT changed by this commit (interval phases auto-log
// a set on completion, so they need catch-up logic); the strength SET timer has no production caller
// (bugs/2026-08-29-strength-set-timer-is-dead-code...) so there is nothing to change there. Named in the
// ledger, not fixed.
test.describe('runner wake lock and end-time rest timer', () => {
  let wk
  test.beforeEach(async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    wk = await ownWorkout()
  })

  // mode: 'ok' | 'reject' | 'absent'. Records every request and every sentinel handed out.
  const installWakeLock = (page, mode = 'ok') => page.evaluate((mode) => {
    const log = { requests: [], sentinels: [] }
    const makeSentinel = () => {
      const s = new EventTarget()
      s.released = false
      s.type = 'screen'
      s.release = async () => { if (s.released) return; s.released = true; s.dispatchEvent(new Event('release')) }
      return s
    }
    const api = {
      request: async (type) => {
        log.requests.push(type)
        if (mode === 'reject') throw new DOMException('denied', 'NotAllowedError')
        const s = makeSentinel(); log.sentinels.push(s); return s
      }
    }
    Object.defineProperty(navigator, 'wakeLock', { value: mode === 'absent' ? undefined : api, configurable: true })
    window.__wl = log
    window.__errs = []
    const realErr = console.error
    console.error = (...a) => { window.__errs.push(a.map(String).join(' ')); realErr(...a) }
  }, mode)

  const wl = (page) => page.evaluate(() => ({
    requests: window.__wl.requests.slice(),
    held: window.__wl.sentinels.filter(s => !s.released).length,
    total: window.__wl.sentinels.length,
    errs: window.__errs.slice(),
    toast: document.getElementById('app-toast')?.textContent || ''
  }))

  const startRunner = async (page) => {
    await wk.start()
    await expect(page.locator('button:text-is("End")')).toBeVisible({ timeout: 12000 })
  }

  // ── WAKE LOCK ─────────────────────────────────────────────────────────────────────────────────
  test('WAKE LOCK: a fresh runner asks for the screen wake lock once', async ({ page }) => {
    await installWakeLock(page)
    await startRunner(page)
    await expect.poll(async () => (await wl(page)).requests, { message: 'the runner requests a SCREEN wake lock when it starts' }).toEqual(['screen'])
    expect((await wl(page)).held, 'and holds exactly one').toBe(1)
  })

  test('WAKE LOCK: a runner RESUMED from a saved draft asks for it too', async ({ page }) => {
    await startRunner(page)
    expect(await logTableSet(page, { weight: '60', reps: '8' }), 'a set must be logged so there is a draft worth resuming').toBe(true)
    await page.evaluate(() => _saveRunnerDraft())
    await page.reload()
    await loginAsClient(page)
    await installWakeLock(page)
    await wk.start()                                             // a draft exists -> the resume prompt
    await page.locator('#runner-resume-modal button:has-text("Resume")').click()
    await expect(page.locator('button:text-is("End")')).toBeVisible({ timeout: 12000 })
    await expect.poll(async () => (await wl(page)).requests, { message: 'the resume path requests the lock as well' }).toEqual(['screen'])
  })

  test('WAKE LOCK: when the browser drops the lock (tab hidden) it is taken again on return', async ({ page }) => {
    await installWakeLock(page)
    await startRunner(page)
    await expect.poll(async () => (await wl(page)).held).toBe(1)

    await page.evaluate(() => {                       // what the browser does when the tab is hidden
      const s = window.__wl.sentinels[0]; s.released = true; s.dispatchEvent(new Event('release'))
      document.dispatchEvent(new Event('visibilitychange'))   // and the tab is visible again
    })
    await expect.poll(async () => (await wl(page)).requests.length, { message: 'a second request after the drop' }).toBe(2)
    expect((await wl(page)).held, 'and one live lock is held again').toBe(1)
  })

  test('WAKE LOCK: released when the workout is discarded, and when the finish screen opens', async ({ page }) => {
    await installWakeLock(page)
    await startRunner(page)
    await expect.poll(async () => (await wl(page)).held).toBe(1)
    await page.evaluate(() => discardRunner())
    await expect.poll(async () => (await wl(page)).held, { message: 'discard releases the lock' }).toBe(0)

    // and the finish screen (a runner with a logged set)
    await installWakeLock(page)
    await startRunner(page)
    expect(await logTableSet(page, { weight: '60', reps: '8' })).toBe(true)
    await expect.poll(async () => (await wl(page)).held).toBe(1)
    await page.evaluate(() => { showRunnerFinish() })
    await expect.poll(async () => (await wl(page)).held, { message: 'the finish screen lets the screen sleep again' }).toBe(0)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    expect((await wl(page)).held, 'and coming back to the tab does NOT re-take it on the finish screen').toBe(0)
  })

  // A MIRROR, not a red test: it passes on code with no wake-lock feature at all. It exists to fail if the
  // new code path ever assumes the API is there (iOS Safari before 16.4, older Android WebViews, http pages).
  test('MIRROR: with no wake-lock API the runner just works, silently', async ({ page }) => {
    await installWakeLock(page, 'absent')
    await startRunner(page)                              // asserts the End button is visible
    const r = await wl(page)
    expect(r.errs, 'no console error').toEqual([])
    expect(r.toast, 'no toast').toBe('')
  })

  test('WAKE LOCK: if the request is REFUSED the workout carries on — no toast, no error report', async ({ page }) => {
    await installWakeLock(page, 'reject')
    await startRunner(page)
    await expect.poll(async () => (await wl(page)).requests.length).toBeGreaterThanOrEqual(1)
    await expect(page.locator('button:text-is("End")')).toBeVisible()
    const r = await wl(page)
    expect(r.errs, 'a refused wake lock is not an error worth reporting').toEqual([])
    expect(r.toast, 'and must never interrupt a workout with a toast').toBe('')
  })

  // ── REST TIMER ────────────────────────────────────────────────────────────────────────────────
  // Starts the runner under a fake clock, logs a set (which starts the 90 s rest from the fixture's
  // "1:30"), then PAUSES the clock so the numbers below are deterministic.
  async function restingRunner(page) {
    const T0 = new Date()
    await page.clock.install({ time: T0 })
    await startRunner(page)
    expect(await logTableSet(page, { weight: '60', reps: '8' }), 'a set must be logged to start the rest').toBe(true)
    await page.evaluate(() => {
      window.__beeps = []; window.playBeep = (f) => { window.__beeps.push(f) }
      window.__afterRest = 0
      _runner._afterRest = () => { window.__afterRest++ }
    })
    const now = await page.evaluate(() => Date.now())
    await page.clock.pauseAt(new Date(now + 50))
    const start = await page.evaluate(() => _runner.restRemaining)
    expect(start, 'the fixture asks for a 90 s rest').toBeGreaterThanOrEqual(88)
    return start
  }
  const remaining = (page) => page.evaluate(() => _runner.restRemaining)

  test('REST: a phone locked for 60 s of a 90 s rest wakes to ~30 s left, and the display agrees', async ({ page }) => {
    await restingRunner(page)
    await page.clock.fastForward(60000)                 // due timers fire ONCE, as when a suspended tab wakes
    const left = await remaining(page)
    expect(left, `about 30 s should remain (a tick counter says ~89; got ${left})`).toBeGreaterThanOrEqual(27)
    expect(left).toBeLessThanOrEqual(31)
    const shown = await page.evaluate(() => document.getElementById('rt-countdown')?.textContent || '')
    expect(shown, 'the on-screen countdown shows the same time').toMatch(/^0:(2[7-9]|3[01])$/)
  })

  test('REST: a phone locked past the end fires the finish exactly once on return', async ({ page }) => {
    await restingRunner(page)
    await page.clock.fastForward(120000)
    const r = await page.evaluate(() => ({ left: _runner.restRemaining, after: window.__afterRest, finishBeeps: window.__beeps.filter(f => f === 1046).length, bar: !!document.getElementById('rt-countdown') }))
    expect(r.left, 'the rest is over').toBeNull()
    expect(r.after, 'the queued next step fired once').toBe(1)
    expect(r.finishBeeps, 'and the finish beep sounded once').toBe(1)
    expect(r.bar, 'and the rest bar is gone').toBe(false)
  })

  test('REST: a tab frozen by the OS is corrected the moment it becomes visible, before any timer runs', async ({ page }) => {
    await restingRunner(page)
    const now = await page.evaluate(() => Date.now())
    await page.clock.setSystemTime(new Date(now + 60000))   // time moves; NO timer fires
    expect(await remaining(page), 'nothing has ticked yet').toBeGreaterThanOrEqual(85)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    const left = await remaining(page)
    expect(left, `visibilitychange must re-derive the countdown immediately (got ${left})`).toBeGreaterThanOrEqual(27)
    expect(left).toBeLessThanOrEqual(31)
  })

  test('MIRROR: in normal use a rest still counts down about one second per second, and finishes once', async ({ page }) => {
    const start = await restingRunner(page)
    await page.clock.runFor(3000)
    const left = await remaining(page)
    expect(start - left, `3 s of ticking takes ~3 s off (got ${start - left})`).toBeGreaterThanOrEqual(2)
    expect(start - left).toBeLessThanOrEqual(3)

    await page.clock.runFor(95000)                       // the rest runs out while the clock ticks normally
    const r = await page.evaluate(() => ({ left: _runner.restRemaining, after: window.__afterRest, finishBeeps: window.__beeps.filter(f => f === 1046).length }))
    expect(r.left).toBeNull()
    expect(r.after, 'the queued next step fires once, not per tick').toBe(1)
    expect(r.finishBeeps).toBe(1)
  })

  test('MIRROR: a rest that is skipped stays skipped — no timer is left ticking', async ({ page }) => {
    await restingRunner(page)
    await page.evaluate(() => skipRestTimer())
    const r = await page.evaluate(() => ({ left: _runner.restRemaining, interval: _runner._restInterval, after: window.__afterRest }))
    expect(r.left).toBeNull()
    expect(r.interval, 'the interval is cleared').toBeNull()
    expect(r.after, 'skipping fires the queued step once').toBe(1)
    await page.clock.runFor(120000)
    expect(await page.evaluate(() => window.__afterRest), 'and nothing fires afterwards').toBe(1)
  })
})
