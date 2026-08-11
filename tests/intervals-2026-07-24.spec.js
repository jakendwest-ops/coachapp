const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Jake described the interval flow he wants: tap Start -> a "get ready" countdown -> the work timer
// starts -> a beep signals rest starting -> rest auto-counts down -> the next work timer auto-starts
// -> repeat. Reading app-runner.js showed the work<->rest loop (startIntervalTimer/startRestTimer,
// via _afterRest) already existed and worked — the one real gap was the missing lead-in before the
// FIRST work interval. Scoping the builder side separately, Jake asked to minimise clicks: today
// building N identical rounds means "+ Add set" then "Copy set i (up arrow)" N-1 more times.
test.describe('Intervals 2026-07-24 — get-ready countdown + repeat-set builder shortcut', () => {

  // ── 1. startCardioTimer must go through the count-in, not straight into the work timer ─────────
  test('startCardioTimer starts the count-in lead-in, not the work timer directly', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => ({
      wired: /startRunnerCountIn\(secs\)/.test(startCardioTimer.toString()),
      // RED before: startCardioTimer called startIntervalTimer(secs) directly.
      notDirect: !/startIntervalTimer\(secs\)/.test(startCardioTimer.toString()),
    }))
    expect(r.wired, 'startCardioTimer should hand off to startRunnerCountIn').toBe(true)
    expect(r.notDirect, 'startCardioTimer should no longer call startIntervalTimer directly').toBe(true)
  })

  // ── 2. The count-in genuinely delays the work timer, then hands off to it ──────────────────────
  test('startRunnerCountIn holds off startIntervalTimer until the lead-in finishes', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      _runner = { exercises: [{ name: '[E2E] Row', type: 'cardio', targetSets: 3, loggedSets: [], sets_json: [{ duration: '0:30' }] }], exIdx: 0 }
      startRunnerCountIn(30)
      const immediatelyAfter = { intervalRunning: !!_runner._intervalRunning, overlayShown: !!document.getElementById('wr-countin-overlay') }
      // Fast-forward past the 5-second lead-in without a real 5s wait — force the next tick to be the last one.
      _runner._countInRemaining = 1
      await new Promise(res => setTimeout(res, 1300))
      const afterHandoff = {
        intervalRunning: !!_runner._intervalRunning,
        intervalSecs: _runner._intervalSecs,
        countInOverlayGone: !document.getElementById('wr-countin-overlay'),
      }
      stopIntervalTimer()
      return { immediatelyAfter, afterHandoff }
    })
    expect(r.immediatelyAfter.intervalRunning, 'the work timer must not start before the count-in finishes').toBe(false)
    expect(r.immediatelyAfter.overlayShown, 'the count-in overlay should show immediately').toBe(true)
    expect(r.afterHandoff.intervalRunning, 'the count-in must hand off to the existing work-interval timer').toBe(true)
    expect(r.afterHandoff.intervalSecs, 'the work timer should receive the original duration').toBe(30)
    expect(r.afterHandoff.countInOverlayGone).toBe(true)
  })

  // ── 3. stopRunnerCountIn must be wired into every navigation/discard path stopIntervalTimer is ──
  // A dangling count-in interval left running after the coach navigates away would fire
  // startIntervalTimer on a screen the user has already left — the exact timer-leak class the
  // multi-agent-review's render-safety angle checks for.
  test('stopRunnerCountIn is wired into every place stopIntervalTimer is, plus discardRunner', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => ({
      skipToNext: /stopRunnerCountIn\(\)/.test(skipToNextExercise.toString()),
      jumpTo: /stopRunnerCountIn\(\)/.test(runnerJumpTo.toString()),
      // runnerGoBack was folded into runnerJumpTo(exIdx - 1) on 2026-07-29 (the nav-persistent rest
      // redesign) — it no longer calls stopRunnerCountIn() directly, but inherits it by delegating to
      // runnerJumpTo, which the assertion above already proves still stops the count-in.
      goBack: /runnerJumpTo\(/.test(runnerGoBack.toString()),
      discard: /clearInterval\(_runner\?\._countInInterval\)/.test(discardRunner.toString()),
    }))
    expect(r.skipToNext, 'skipToNextExercise must stop a running count-in').toBe(true)
    expect(r.jumpTo, 'runnerJumpTo must stop a running count-in').toBe(true)
    expect(r.goBack, 'runnerGoBack must delegate to runnerJumpTo (which stops the count-in)').toBe(true)
    expect(r.discard, 'discardRunner must clear the count-in interval').toBe(true)
  })

  // ── 4. Round X of Y labeling on the two timer overlays (was bare "Set N", no total) ────────────
  test('interval + rest overlays show "Round N of M" for a multi-round cardio exercise', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      _runner = {
        exercises: [{ name: '[E2E] Intervals', type: 'cardio', targetSets: 3, loggedSets: [], sets_json: [{ duration: '0:30', restMin: '0:30' }] }],
        exIdx: 0, restRemaining: 30, restTotal: 30,
      }
      _runner._intervalRemaining = 30
      _runner._intervalSecs = 30
      renderIntervalTimer()
      const intervalText = document.getElementById('wr-interval-overlay')?.textContent || ''
      document.getElementById('wr-interval-overlay')?.remove()

      // Simulate having just completed round 1 (so "next" should read round 2).
      _runner.exercises[0].loggedSets.push({ duration: '0:30' })
      renderRestTimer()
      const restText = document.getElementById('rest-timer-overlay')?.textContent || ''
      document.getElementById('rest-timer-overlay')?.remove()
      _runner.exercises[0].loggedSets.length = 0

      _runner._countInRemaining = 5
      renderRunnerCountIn()
      const countInText = document.getElementById('wr-countin-overlay')?.textContent || ''
      document.getElementById('wr-countin-overlay')?.remove()

      // A single steady-state effort (targetSets defaults low, e.g. 1) should keep the old "Set N"
      // wording rather than misname a one-off cardio effort "Round 1 of 1".
      _runner.exercises[0].targetSets = 1
      renderIntervalTimer()
      const singleEffortText = document.getElementById('wr-interval-overlay')?.textContent || ''
      document.getElementById('wr-interval-overlay')?.remove()

      return { intervalText, restText, countInText, singleEffortText }
    })
    expect(r.intervalText).toContain('Round 1 of 3')
    expect(r.restText).toContain('Round 2 of 3')
    expect(r.countInText).toContain('Round 1 of 3')
    expect(r.singleEffortText, 'a single-round cardio effort should keep "Set N", not "Round 1 of 1"').toContain('Set 1')
    expect(r.singleEffortText).not.toContain('Round')
  })

  // ── 7. LOG must not fire mid-count-in, and showRunnerFinish must not leave the count-in ticking ──
  // Caught by multi-agent-review: logRunnerSet already blocks itself during rest
  // (`if (_runner._restInterval) return`) but had no equivalent guard for the new count-in state —
  // the cardio duration field is pre-filled with the target duration, so LOG firing mid-count-in
  // would silently log a full round that was never actually performed. Separately, showRunnerFinish's
  // own header comment documents it as doing "FULL teardown" of every runner timer specifically
  // because a stray timer left running paints a live overlay over the finish screen — the new
  // count-in timer was missed.
  test('logRunnerSet is blocked during the count-in, and showRunnerFinish tears it down', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const finishTearsDown = /stopRunnerCountIn\(\)/.test(showRunnerFinish.toString())
      return { finishTearsDown }
    })
    expect(r.finishTearsDown, 'showRunnerFinish must stop a still-running count-in').toBe(true)
  })

  // 2026-07-29: rewritten as a BEHAVIORAL test (was a source-text regex, flagged by multi-agent review
  // as provable-but-not-enforced — it could pass even if the real `if` no longer combined the
  // conditions correctly). Also covers the rest half's new ownership qualifier from the nav-persistent
  // rest redesign: a rest belonging to a DIFFERENT exercise must NOT block logging on this one.
  test('logRunnerSet is blocked by count-in and an own-exercise rest, but not by another exercise\'s rest', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      // Cardio, not strength: the wizard was deleted 2026-08-11, so logRunnerSet is now reached only
      // by cardio — a strength fixture here would hit the non-cardio guard and never exercise the
      // rest/count-in logic this test is actually about. The same ownership guard on the TABLE path
      // (toggleTableSet, which is what strength uses now) is covered by
      // ledger-fixes-2026-07-29.spec.js:313 — "exercise B, set 0 — should NOT be blocked by A's rest".
      const mkEx = () => ({ name: 'X', type: 'cardio', metricType: 'cardio', loggedSets: [], sets_json: [{}] })
      const run = (setup) => {
        const ex = mkEx()
        _runner = { exercises: [ex, mkEx()], exIdx: 0, ...setup }
        document.getElementById('wr-cardio-dur')?.remove()
        const input = document.createElement('input'); input.id = 'wr-cardio-dur'; input.value = '5:00'
        document.body.appendChild(input)
        const before = ex.loggedSets.length
        logRunnerSet()
        const logged = ex.loggedSets.length > before
        input.remove()
        _runner = null
        return logged
      }
      return {
        blockedByCountIn: run({ _countInInterval: 999 }) === false,
        blockedByOwnRest: run({ _restInterval: 999, _restForExIdx: 0 }) === false,
        notBlockedByOtherRest: run({ _restInterval: 999, _restForExIdx: 1 }) === true,
        notBlockedWhenIdle: run({}) === true,
      }
    })
    expect(r.blockedByCountIn, 'LOG must not fire mid-count-in').toBe(true)
    expect(r.blockedByOwnRest, 'LOG must not fire while THIS exercise is resting').toBe(true)
    expect(r.notBlockedByOtherRest, 'a DIFFERENT exercise\'s rest must not block this one').toBe(true)
    expect(r.notBlockedWhenIdle, 'LOG must work normally with no timer active').toBe(true)
  })
})
