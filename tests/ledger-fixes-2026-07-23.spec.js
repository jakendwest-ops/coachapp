const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsClient } = require('./helpers')

// Five fixes from the 2026-07-23 bug ledger (full-file review, 2026-07-23). Each assertion below
// went RED against the code as the review found it.
test.describe('Ledger fixes 2026-07-23', () => {

  // ── 1. legacy unilateral/timed exercises logged as plain weight×reps ───────────────────────────
  // The 2026-07-18 migration backfilled metric_type for cardio and jumps ONLY — legacy unilateral/
  // timed exercises kept metric_type='weight_reps' with the old flag alive in sets_json[0]. But
  // launchRunner always supplied a truthy `metricType: ex.metric_type || 'weight_reps'`, so
  // _exMetricType's legacy-flag fallback could never run. A legacy Bulgarian Split Squat logged with
  // no `side` (L/R chart permanently empty); a legacy Plank asked for reps instead of a hold time.
  test('_resolveMetricType falls back to legacy sets_json flags only on the default type', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => ({
      // metric_type stuck at the DEFAULT ('weight_reps') with a legacy flag → trust the flag
      legacyUni:   _resolveMetricType('weight_reps', 'strength', { unilateral: true }),
      legacyTimed: _resolveMetricType('weight_reps', 'strength', { timed: true }),
      legacyCardio: _resolveMetricType('weight_reps', 'cardio', {}),
      // an EXPLICIT non-default type is trusted outright, never overridden by a stray flag
      explicitJump: _resolveMetricType('jump_height', 'strength', { unilateral: true }),
      // a genuinely new weight_reps set (flags explicitly false) stays weight_reps
      newSet: _resolveMetricType('weight_reps', 'strength', { unilateral: false, timed: false }),
      // the runner and the builder's edit modal must agree — shared helper, not two copies
      runnerUsesShared: _exMetricType.toString().includes('_resolveMetricType'),
    }))
    expect(r.legacyUni).toBe('unilateral')
    expect(r.legacyTimed).toBe('timed_hold')
    expect(r.legacyCardio).toBe('cardio')
    expect(r.explicitJump).toBe('jump_height')
    expect(r.newSet).toBe('weight_reps')
    expect(r.runnerUsesShared).toBe(true)
  })

  // ── 2. Epley estimate accepted any rep count ────────────────────────────────────────────────────
  // Four copies of `w * (1 + r/30)` existed with no cap. 60kg × 30 reps → 120kg, saved as a real 1RM,
  // then driving every %1RM target weight in the runner. Consolidated into one _estimate1RM that
  // returns null above 12 reps — a generous ceiling (an 11-12 rep set still estimates; a burnout set
  // does not).
  test('_estimate1RM refuses to estimate above the rep ceiling', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => ({
      normal: _estimate1RM(60, 8),
      atCeiling: _estimate1RM(60, 12),
      overCeiling: _estimate1RM(60, 30),   // RED before: this returned 120
      zero: _estimate1RM(0, 8),
      noReps: _estimate1RM(60, 0),
    }))
    expect(r.normal).toBeCloseTo(76, 0)
    expect(r.atCeiling).not.toBeNull()
    expect(r.overCeiling, '30-rep set produced a junk 1RM estimate').toBeNull()
    expect(r.zero).toBeNull()
    expect(r.noReps).toBeNull()
  })

  // ── 3. "Best" PB showed the most recently logged entry, not the actual best ────────────────────
  // Both performance_logs queries order by date desc, and both renders took records[0] / the first
  // row seen — badging the NEWEST entry "PB" regardless of value. A slower/lighter session logged
  // later displayed as the personal best. "Best" is category-dependent: TIME units (min/sec) are
  // lower-is-better; everything else (kg, cm, km, reps) is higher-is-better.
  test('_bestPerfLog picks the true best, not the most recent', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      // Deadlift: 180kg on Jan 1, then a lighter 160kg on Feb 1 (newest = records[0], date-desc order)
      const weightLogs = [
        { id: 'b', date: '2026-02-01', value: '160', unit: 'kg' },
        { id: 'a', date: '2026-01-01', value: '180', unit: 'kg' },
      ]
      // 5k time: 20:00 on Jan 1 (best), a slower 22:00 logged more recently
      const timeLogs = [
        { id: 'd', date: '2026-02-01', value: '1320', unit: 'sec' },  // 22:00, worse
        { id: 'c', date: '2026-01-01', value: '1200', unit: 'sec' },  // 20:00, better (lower)
      ]
      return {
        weightBest: _bestPerfLog(weightLogs).id,
        timeBest: _bestPerfLog(timeLogs).id,
        empty: _bestPerfLog([]),
        nullish: _bestPerfLog(null),
      }
    })
    // RED before: both would have returned the newest ('b' / 'd'), the WORSE entry in each case.
    expect(r.weightBest, 'higher weight should win, not the more recent lighter one').toBe('a')
    expect(r.timeBest, 'lower time should win, not the more recent slower one').toBe('c')
    expect(r.empty).toBeNull()
    expect(r.nullish).toBeNull()
  })

  // ── 3b. _bestPerfLog compared raw numbers across DIFFERENT units of the same measurement ───────
  // PERF_CATEGORIES (app-runner.js) lets the same exercise be logged in either unit of a pair — kg
  // or lbs, min or sec — as a free per-entry dropdown choice, not a fixed unit per exercise. The
  // first version of the "true best" fix above (test 3) compared raw `value`s with no conversion,
  // so a heavier/faster entry logged in the "other" unit could lose purely on number size. Found by
  // multi-agent review, 2026-07-24 (same push as test 3, caught before it shipped).
  test('_bestPerfLog converts to a common unit before comparing, not raw numbers', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      // 100kg (older) is the heavier lift; 220lbs (newer) is only ~99.8kg — LOOKS bigger as a raw
      // number (220 > 100) but is actually lighter.
      const mixedWeight = [
        { id: 'lbs220', date: '2026-02-01', value: '220', unit: 'lbs' },
        { id: 'kg100',  date: '2026-01-01', value: '100', unit: 'kg' },
      ]
      // A benchmark clocked in mixed units: 20 min (older) vs 1180 sec (newer, = 19:40 — FASTER,
      // i.e. better, despite the raw number 1180 being much bigger than 20).
      const mixedTime = [
        { id: 'sec1180', date: '2026-02-01', value: '1180', unit: 'sec' },
        { id: 'min20',   date: '2026-01-01', value: '20',   unit: 'min' },
      ]
      return {
        weightBest: _bestPerfLog(mixedWeight).id,
        timeBest: _bestPerfLog(mixedTime).id,
      }
    })
    // RED before: raw-number comparison picked '220' and '20' respectively — the WORSE entry in
    // both cases, purely because of which unit it happened to be logged in.
    expect(r.weightBest, 'the true heavier lift (100kg) should win over the raw-bigger-looking 220lbs (~99.8kg)').toBe('kg100')
    expect(r.timeBest, 'the true faster time (1180sec = 19:40) should win over the raw-smaller-looking 20min').toBe('sec1180')
  })

  // ── 4. distance formatting bypassed the shared fmtDistanceM in 4 places ────────────────────────
  // A 400m interval read "400 m" in the runner (via fmtDistanceM) but "0.4 km" on Progress charts,
  // the diary, and the workout-log table — four inline `(v/1000).toFixed(…)+'km'` copies that never
  // showed metres under 1km, unlike the shared formatter everywhere else already used.
  test('distance formatters route through the shared fmtDistanceM, not an inline km literal', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => ({
      fmt400: fmtDistanceM(400),     // the actual behaviour under test
      fmt5000: fmtDistanceM(5000),
      // source-level guard: these four sites must no longer hand-roll `/1000...+'km'`
      diaryClean: !/\(dist \/ 1000\)\.toFixed/.test(_diaryExMetrics.toString()),
      trendClean: !/v\s*\/\s*1000\)\.toFixed\(1\)\+'km'/.test(JSON.stringify(Object.values(_TREND_METRICS).flat())),
      fmtSetClean: !/\(s\.distance_m\/1000\)\.toFixed/.test(fmtSet.toString()),
    }))
    expect(r.fmt400).toBe('400 m')          // RED before: would have been "0.40 km" at these 3 sites
    expect(r.fmt5000).toBe('5 km')
    expect(r.diaryClean, '_diaryExMetrics still hand-rolls km formatting').toBe(true)
    expect(r.fmtSetClean, 'fmtSet still hand-rolls km formatting').toBe(true)
  })

  // ── 5. Discard had no confirmation ──────────────────────────────────────────────────────────────
  // The Discard button on the finish screen sat directly beside Save, removed the whole session AND
  // cleared the localStorage draft (no undo), with zero confirmation.
  //
  // A first version of this fix put the confirm INSIDE discardRunner() itself — the shared teardown
  // function — which broke two other callers that must stay silent: confirmEndRunner()'s "nothing was
  // logged" branch (nothing to lose, was never meant to prompt) and the post-save cleanup in
  // saveRunnerSession() (the work is already saved; telling the user it's about to be lost right after
  // they saved it is actively wrong). Caught by 5 test failures across runner.spec.js and
  // client-workout.spec.js. The confirm now lives ONLY in a wrapper, confirmDiscardRunner(), called by
  // exactly the one button that can destroy real unsaved work with a single tap.
  test('Discard confirms before destroying real work, but the shared teardown itself stays silent', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => ({
      wrapperConfirms: /if \(!confirm\(/.test((typeof confirmDiscardRunner === 'function' ? confirmDiscardRunner : () => {}).toString()),
      // the shared teardown must NOT confirm — confirmEndRunner's empty-session branch and the
      // post-save cleanup both call it directly and must never see a prompt
      teardownIsSilent: !/confirm\(/.test(discardRunner.toString()),
      // and the actual button must go through the confirming wrapper, not the bare function
      buttonUsesWrapper: /onclick="confirmDiscardRunner\(\)"/.test(showRunnerFinish.toString()),
    }))
    expect(r.wrapperConfirms, 'confirmDiscardRunner has no confirm() guard').toBe(true)
    expect(r.teardownIsSilent, 'discardRunner itself must not confirm — it has silent callers').toBe(true)
    expect(r.buttonUsesWrapper, 'the Discard button must call the confirming wrapper').toBe(true)
  })

  // ── 6. cardio/strength LOG silently no-op'd on an empty required field ─────────────────────────
  // logRunnerSet had 6 bare `return`s on missing distance/duration/reps — no toast, no shake, nothing.
  // toggleTableSet (the fast-table equivalent) already toasts on every equivalent guard; logRunnerSet
  // (the wizard path — cardio, and any exercise still on it) did not.
  test('logRunnerSet toasts instead of silently no-opping on every required-field guard', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const src = logRunnerSet.toString()
      return {
        toastCount: (src.match(/showToast\(/g) || []).length,
      }
    })
    expect(r.toastCount, 'logRunnerSet should toast on every missing-field guard').toBeGreaterThanOrEqual(6)
  })
})

// ── 7. Personal Bests card showed a value paired with the WRONG unit ─────────────────────────────
// renderProgressPBs grouped performance_logs by exercise name and cached `unit` from whichever
// record was encountered FIRST (the newest, since the query orders `date desc`). Once "best" started
// being resolved independently by _bestPerfLog (test 3/3b above), `best` could be a DIFFERENT record
// than the one the cached `unit` came from — rendering a value next to a unit it never actually had
// (e.g. "100 lbs" when the real entries were 100kg and 220lbs). Found by multi-agent review,
// 2026-07-24, in the same push that introduced _bestPerfLog.
test.describe('Ledger fixes 2026-07-23 — Personal Bests unit pairing', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page)
  })

  test('Personal Bests shows the value and unit from the SAME record, even across mixed-unit entries', async ({ page }) => {
    const clientId = await page.evaluate(async () => {
      const { data } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
      return data.id
    })

    // 100kg (older) is the true best; 220lbs (newer, ~99.8kg) only LOOKS bigger as a raw number.
    const insertErr = await page.evaluate(async (clientId) => {
      const { error: e1 } = await db.from('performance_logs').insert({
        client_id: clientId, logged_by: currentUser.id,
        category: 'strength', name: '[E2E] PB Mixed Units', value: 100, unit: 'kg',
        date: '2026-01-01',
      })
      const { error: e2 } = await db.from('performance_logs').insert({
        client_id: clientId, logged_by: currentUser.id,
        category: 'strength', name: '[E2E] PB Mixed Units', value: 220, unit: 'lbs',
        date: '2026-02-01',
      })
      return e1?.message || e2?.message || null
    }, clientId)
    expect(insertErr).toBeNull()

    try {
      await page.click('[data-page="progress"]')
      await page.waitForTimeout(1000)
      await page.click('button:has-text("Personal Bests")')
      await page.waitForTimeout(1500)

      const card = page.locator('div', { hasText: '[E2E] PB Mixed Units' }).last()
      // RED before: this read "100 lbs" — best.value from the 100kg record, paired with the
      // group's cached unit from the newer 220lbs record. Neither entry was ever "100 lbs".
      await expect(page.locator('text=100 kg')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('text=100 lbs')).toHaveCount(0)
      await expect(page.locator('text=220 kg')).toHaveCount(0)
    } finally {
      const cleanup = await page.evaluate(async (clientId) => {
        const { error } = await db.from('performance_logs').delete()
          .eq('client_id', clientId).eq('name', '[E2E] PB Mixed Units')
        const { data: left } = await db.from('performance_logs').select('id')
          .eq('client_id', clientId).eq('name', '[E2E] PB Mixed Units')
        return { err: error ? error.message : null, remaining: (left || []).length }
      }, clientId)
      expect(cleanup.err, 'cleanup delete errored').toBeNull()
      expect(cleanup.remaining, 'cleanup deleted nothing — RLS likely denies DELETE, and this test has been stranding rows').toBe(0)
    }
  })
})
