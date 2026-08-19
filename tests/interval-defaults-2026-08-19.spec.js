// Interval blocks defaulted to a 0-second work period (2026-08-19). Bug 3 of the five-bug plan.
//
// `window._templateSets = [{ workSecs: b.workSecs ?? 30, …, ...b }]` spread `...b` LAST, so any key
// that was present-but-null overrode its own default instead of falling back to it.
//
// That is the NORMAL case, not an edge case: _cleanTemplateSets writes every interval key as
// `s.workSecs ?? null` on EVERY save, including plain weight_reps sets. So any previously-saved
// exercise carries workSecs: null, and editing it into Intervals seeded 0:00, saved workSecs: 0, and
// the runner's "Start timer" then finished the phase on its first tick — which cascades into finishing
// the exercise, which ends the workout instantly.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('Interval defaults', () => {
  test('a saved row carrying explicit nulls still gets real defaults', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const host = document.createElement('div')
      host.id = 'ivtest'
      host.innerHTML = '<select id="att-type"><option value="interval" selected>i</option></select>' +
                       '<div id="att-metric-pills"></div><div id="att-sets-container"></div>'
      document.body.appendChild(host)
      // EXACTLY what _cleanTemplateSets writes for any previously-saved exercise — the shape that
      // made this fire on the common path rather than a rare one.
      window._templateSets = [{ workSecs: null, restSecs: null, sets: null, cycles: null,
                                countdownSecs: null, warmupSecs: null, recoverySecs: null,
                                cooldownSecs: null, workDistanceM: null, isDistanceBased: null }]
      try {
        renderTemplateSets('att-sets-container', 'interval')
        const s = window._templateSets[0]
        return { workSecs: s.workSecs, sets: s.sets, cycles: s.cycles, countdownSecs: s.countdownSecs }
      } finally { host.remove() }
    })
    // 0 here is what ended the workout on the first tick.
    expect(r.workSecs, 'a null workSecs must fall back to the 30s default').toBe(30)
    expect(r.sets, 'sets must default to 1, not 0').toBe(1)
    expect(r.cycles, 'cycles must default to 1, not 0').toBe(1)
    expect(r.countdownSecs).toBe(5)
  })

  test('a REAL saved value is never overwritten by the default', async ({ page }) => {
    await loginAsPT(page)
    // The other half: moving the spread must not clobber genuine values. A 0 the coach actually typed
    // is a distinct third state from null, and `??` keeps it — which is correct, and is why the runner
    // carries its own guard rather than relying on this.
    const r = await page.evaluate(() => {
      const host = document.createElement('div')
      host.innerHTML = '<select id="att-type"><option value="interval" selected>i</option></select>' +
                       '<div id="att-metric-pills"></div><div id="att-sets-container"></div>'
      document.body.appendChild(host)
      window._templateSets = [{ workSecs: 45, restSecs: 15, sets: 8, cycles: 3 }]
      try {
        renderTemplateSets('att-sets-container', 'interval')
        const s = window._templateSets[0]
        return { workSecs: s.workSecs, restSecs: s.restSecs, sets: s.sets, cycles: s.cycles }
      } finally { host.remove() }
    })
    expect(r).toEqual({ workSecs: 45, restSecs: 15, sets: 8, cycles: 3 })
  })

  test('the runner refuses a zero-length phase instead of ending the workout', async ({ page }) => {
    await loginAsPT(page)
    // `_runner` is `let`-declared in app-workouts.js:3041, so a test CANNOT reach it from outside — a
    // top-level `let` in a classic script creates no window property. That is exactly why the guard
    // sits ABOVE stopIntervalTimer(): refusing before anything dereferences _runner means this path is
    // reachable, and testable, with no live runner. A guard that could only be exercised by driving a
    // whole real workout would not have been tested at all.
    const r = await page.evaluate(() => {
      let toast = ''
      const origToast = window.showToast
      window.showToast = (m) => { toast = m }
      let threw = null
      try { startIntervalPhaseTimer(0) } catch (e) { threw = e.message }
      const zero = { toast, threw }
      toast = ''; threw = null
      try { startIntervalPhaseTimer(null) } catch (e) { threw = e.message }
      const nul = { toast, threw }
      window.showToast = origToast
      return { zero, nul }
    })
    // Starting a 0-second phase is what ended the workout on its first tick.
    expect(r.zero.threw, 'the guard must return cleanly, not throw').toBeNull()
    expect(r.zero.toast.toLowerCase()).toContain('no work time')
    // null is the shape a previously-saved row actually carries — the whole cause of this bug.
    expect(r.nul.threw).toBeNull()
    expect(r.nul.toast.toLowerCase()).toContain('no work time')
  })

  test('the guard runs BEFORE anything dereferences the runner', async ({ page }) => {
    await loginAsPT(page)
    // Ordering is the load-bearing detail, and the reason the test above can exist at all. If the
    // guard drifts back below stopIntervalTimer(), refusing a phase throws instead of toasting.
    // Comments are stripped first: the explanatory comment above the guard NAMES stopIntervalTimer(),
    // so a naive indexOf finds the comment rather than the call and the test passes for the wrong reason.
    const src = await page.evaluate(() =>
      startIntervalPhaseTimer.toString().split('\n').filter(l => !l.trim().startsWith('//')).join('\n'))
    const guardAt = src.indexOf('Number(secs) > 0')
    const stopAt = src.indexOf('stopIntervalTimer()')
    expect(guardAt, 'the guard must exist').toBeGreaterThan(-1)
    expect(guardAt, 'the guard must come first').toBeLessThan(stopAt)
  })
})
