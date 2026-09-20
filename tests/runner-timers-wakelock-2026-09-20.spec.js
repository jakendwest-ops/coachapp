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

  // From the review (B, 2026-09-20). _runner is assigned BEFORE renderRunner() runs in both start paths, so
  // if that render ever throws (e.g. a malformed localStorage draft on the Resume path) _runner stays set with
  // no #workout-runner on screen and nothing to discard it. Before the wake lock a stale _runner was inert;
  // now the visibilitychange handler would take the screen lock and hold it. The lock is only wanted while a
  // runner is actually on screen.
  test('WAKE LOCK: a stale runner (its overlay is gone) does not take the lock on return to the tab', async ({ page }) => {
    await installWakeLock(page)
    await startRunner(page)
    await expect.poll(async () => (await wl(page)).held).toBe(1)
    const requestsAfter = await page.evaluate(() => {
      const s = window.__wl.sentinels[0]; s.released = true; s.dispatchEvent(new Event('release'))   // the browser drops it
      document.getElementById('workout-runner').remove()                                            // …and the runner is no longer on screen
      document.dispatchEvent(new Event('visibilitychange'))                                          // request() is called synchronously
      return window.__wl.requests.length
    })
    expect(requestsAfter, 'no second request for a runner nobody can see').toBe(1)
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
    // A generous margin: pauseAt throws "Cannot fast-forward to the past" if its target is already behind the
    // (still flowing) clock, and the two round trips above can take longer than a tight 50 ms. It fast-forwards
    // to that time firing due timers once, so the rest reads ~88 afterwards — every assertion below is
    // RELATIVE to the `start` value returned here, never an absolute number.
    await page.clock.pauseAt(new Date(now + 2000))
    const start = await page.evaluate(() => _runner.restRemaining)
    expect(start, 'the fixture asks for a 90 s rest').toBeGreaterThanOrEqual(84)
    return start
  }
  const remaining = (page) => page.evaluate(() => _runner.restRemaining)

  test('REST: a phone locked for 60 s of a 90 s rest wakes to ~30 s left, and the display agrees', async ({ page }) => {
    const start = await restingRunner(page)
    await page.clock.fastForward(60000)                 // due timers fire ONCE, as when a suspended tab wakes
    const left = await remaining(page)
    expect(left, `60 s should come off (a tick counter takes ~1; started ${start}, got ${left})`).toBeGreaterThanOrEqual(start - 62)
    expect(left).toBeLessThanOrEqual(start - 58)
    const shown = await page.evaluate(() => document.getElementById('rt-countdown')?.textContent || '')
    expect(shown, 'the on-screen countdown shows the same time').toBe(`0:${String(left).padStart(2, '0')}`)
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
    const start = await restingRunner(page)
    const now = await page.evaluate(() => Date.now())
    await page.clock.setSystemTime(new Date(now + 60000))   // time moves; NO timer fires
    expect(await remaining(page), 'nothing has ticked yet').toBe(start)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    const left = await remaining(page)
    expect(left, `visibilitychange must re-derive the countdown immediately (started ${start}, got ${left})`).toBeGreaterThanOrEqual(start - 62)
    expect(left).toBeLessThanOrEqual(start - 58)
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

  // From the review (B and C, 2026-09-20). The old tick-counter finished a 0 s rest on its first tick
  // (0 - 1 <= 0). The end-time version compared "remaining" with "what is shown" and returned when they were
  // equal — so a rest that STARTS at 0 (or is written to 0 mid-rest) never finished: the interval stayed live,
  // the queued next step never fired, and logging stayed blocked (it tests _restInterval). Unreachable through
  // today's callers (they pass `restSecs || 90`; interval rest phases only exist when non-zero), so this pins
  // the old behaviour for the next caller rather than fixing a live bug. NaN would also have re-anchored and run
  // the display branch four times a second forever.
  test('REST: a degenerate rest (0, NaN, or written to 0 mid-rest) still finishes once, as the old counter did', async ({ page }) => {
    await page.clock.install({ time: new Date() })
    await startRunner(page)
    const run = async (label, setup) => {
      await page.evaluate((setupSrc) => {
        window.__afterRest = 0
        _runner._afterRest = () => { window.__afterRest++ }
        new Function(setupSrc)()
      }, setup)
      await page.clock.fastForward(2000)                // one due tick fires; a 1 s rest is over by then
      const r = await page.evaluate(() => ({ left: _runner.restRemaining, after: window.__afterRest, interval: _runner._restInterval }))
      expect.soft(r.left, `${label}: the rest is over`).toBeNull()
      expect.soft(r.after, `${label}: the queued step fired once`).toBe(1)
      expect.soft(r.interval, `${label}: no timer is left running`).toBeNull()
    }
    await run('startRestTimer(0)', 'startRestTimer(0)')
    await run('startRestTimer(NaN)', 'startRestTimer(NaN)')
    await run('restRemaining written to 0 mid-rest', 'startRestTimer(90); _runner.restRemaining = 0')
  })

  test('MIRROR: a numeric-string duration is honoured, not mistaken for garbage', async ({ page }) => {
    await page.clock.install({ time: new Date() })
    await startRunner(page)
    const r = await page.evaluate(() => { startRestTimer('90'); return { left: _runner.restRemaining, total: _runner.restTotal } })
    // Number(): the OLD code stored the string as-is, the new code stores a number — the invariant is only that
    // "90" is honoured as 90 s, not mistaken for garbage and clamped to 1.
    expect(Number(r.left), 'a "90" is 90 s, not clamped to 1').toBeGreaterThanOrEqual(89)
    expect(Number(r.total)).toBeGreaterThanOrEqual(89)
  })
})
