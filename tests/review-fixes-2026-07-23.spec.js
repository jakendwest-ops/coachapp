const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Three fixes from the 2026-07-23 full-file review + Jake's live report. Each assertion below went
// RED against the code as it stood that morning.
test.describe('Review fixes 2026-07-23', () => {

  // ── 1. client→coach stored XSS ────────────────────────────────────────────────────────────────
  // `performance_logs.name/.unit/.notes` and `weight_logs.notes` are written BY THE CLIENT from their
  // own My Progress page (saveClientPB / saveClientWeight, app-clients.js) and rendered in the COACH's
  // client-profile tabs. Unescaped, a PB named `<img src=x onerror=…>` runs in the coach's session —
  // JWT theft, which RLS cannot defend against. Third instance of this shape (07-13, 07-18, 07-23).
  test('client-authored PB and weight text is escaped in the coach-facing renders', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const src = renderClientPerformance.toString() + renderClientWeight.toString()
      return {
        // every interpolation of client-authored fields must be wrapped
        rawName:   /\$\{name\}/.test(src),
        rawUnit:   /\$\{best\.unit\}|\$\{r\.unit\}/.test(src),
        rawNotes:  /\$\{r\.notes \|\| '—'\}|\$\{l\.notes \|\| '—'\}/.test(src),
        escapes:   (src.match(/escapeHtml\(/g) || []).length,
        // and escapeHtml must actually neutralise the payload
        neutralised: escapeHtml('<img src=x onerror=alert(1)>').includes('&lt;img'),
      }
    })
    expect(r.rawName, 'exercise/PB name still interpolated raw').toBe(false)
    expect(r.rawUnit, 'client-typed unit still interpolated raw').toBe(false)
    expect(r.rawNotes, 'client-typed notes still interpolated raw').toBe(false)
    expect(r.escapes).toBeGreaterThanOrEqual(5)
    expect(r.neutralised).toBe(true)
  })

  // ── 2. a custom/blank workout was counted, then binned ─────────────────────────────────────────
  // The finish screen filtered `e.loggedSets.length`; the save ALSO required `e.name`. A Custom/blank
  // workout seeds a nameless exercise and the fast table renders no name input, so the finish screen
  // showed "3 Sets" with a full breakdown and Save then said "nothing to save" and lost the session.
  test('a nameless exercise with logged sets is saved, not discarded', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      // `_runner` is a top-level `let` in a classic script — assign the BARE identifier, not
      // window._runner, or the app's own code still sees null (les-024).
      _runner = {
        clientId: 'x', name: 'probe', date: '2026-07-23',
        exercises: [
          { name: '', type: 'strength', metricType: 'weight_reps', loggedSets: [{ weight: '60', reps: '8' }] },
          { name: 'Named', type: 'strength', metricType: 'weight_reps', loggedSets: [{ weight: '40', reps: '10' }] },
          { name: 'NoSets', type: 'strength', metricType: 'weight_reps', loggedSets: [] },
        ],
      }
      const out = _loggedExercises()
      const res = { count: out.length, names: out.map(e => e.name) }
      _runner = null
      return res
    })
    // RED before: the nameless one was dropped by the save while the finish screen counted it.
    expect(r.count, 'the nameless exercise was dropped').toBe(2)
    expect(r.names[0], 'nameless exercise should be named, not discarded').toMatch(/^Exercise \d+$/)
    expect(r.names).toContain('Named')
    expect(r.names).not.toContain('NoSets')   // genuinely empty rows are still excluded
  })

  // ── 3. jump exercises had no reps field ────────────────────────────────────────────────────────
  // Jake, live: "the runner for depth jumps … only displays height in CM and does not have reps
  // fields". A regression from the same day's jump-targets work: the builder gained a jumps-per-set
  // target but the runner's jump row rendered only the measurement cell, so contact volume could not
  // be recorded at all and never reached the charts.
  test('jump rows capture reps (contacts) and carry them to the save shape', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const jump = { name: 'Depth Jump', type: 'strength', metricType: 'jump_height', loggedSets: [],
                     sets_json: [{ targetHeightCm: '40', repsMin: '3' }] }
      const blank = _blankTableRow(jump)

      // drive the real sync: a completed row must emit BOTH the height and the contact count
      jump.tableRows = [{ height_cm: '42', reps: '3', done: true }]
      _runner = { exercises: [jump], exIdx: 0 }
      _syncLoggedSetsFromTable(jump)
      const logged = jump.loggedSets[0]
      _runner = null

      return {
        blankHasReps: Object.prototype.hasOwnProperty.call(blank, 'reps'),
        loggedHeight: logged.height_cm,
        loggedReps: logged.reps,
      }
    })
    expect(r.blankHasReps, 'jump rows still have no reps field').toBe(true)
    expect(r.loggedHeight).toBe('42')
    // RED before: _syncLoggedSetsFromTable emitted { height_cm } only, so reps_achieved was never written.
    expect(r.loggedReps, 'contacts not carried to the save shape').toBe('3')
  })

  // ── 4. review fallout: %1RM machinery must not reach types with no load ────────────────────────
  // Widening `showTargets` so jumps/timed holds finally render a target bar also exposed the
  // intensityMin block to them. A stale intensityMin survives a metric_type switch (flushTemplateSets
  // preserves un-rendered inputs), so a Depth Jump could show "70% / 1RM TARGET" plus the amber
  // "Set your 1RM" banner — and tapping it writes a junk client_1rms row for an exercise with no
  // weight input to spend it on. `tgt.weight` already had this guard; intensityMin and tempo did not.
  test('%1RM and tempo are suppressed on jump and timed-hold types', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const tgt = { intensityMin: '70', tempo: '3011', targetHeightCm: '40', repsMin: '3', duration: '0:00' }
      const mk = mt => _buildTargetCols(tgt, { name: 'x', metricType: mt, oneRM: null })
      const labels = c => c.cols.map(x => x.label)
      return {
        jump:   { labels: labels(mk('jump_height')),  needsOneRM: mk('jump_height').needsOneRM },
        timed:  { labels: labels(mk('timed_hold')),   needsOneRM: mk('timed_hold').needsOneRM },
        weight: { labels: labels(mk('weight_reps')),  needsOneRM: mk('weight_reps').needsOneRM },
      }
    })
    // A jump gets its own TARGET + JUMPS, but no 1RM column and NO banner.
    expect(r.jump.labels).toContain('TARGET')
    expect(r.jump.labels).not.toContain('1RM TARGET')
    expect(r.jump.labels).not.toContain('TEMPO')
    expect(r.jump.needsOneRM, 'depth jump would show the "Set your 1RM" banner').toBe(false)
    expect(r.timed.needsOneRM, 'timed hold would show a banner it cannot fulfil').toBe(false)
    // '0:00' is the builder's PRE-FILLED default — it must not paint a big accent DURATION column.
    expect(r.timed.labels, 'a left-alone 0:00 duration painted a DURATION column').not.toContain('DURATION')
    // weight_reps is unaffected: it still gets both.
    expect(r.weight.labels).toContain('1RM TARGET')
    expect(r.weight.needsOneRM).toBe(true)
  })

  // ── 5. every value reaching an HTML attribute is escaped ───────────────────────────────────────
  // The jump fix made raw sets_json strings (targetHeightCm / repsMin) the first non-numeric values
  // to reach the shared input's `placeholder=` attribute. And a trend chip still built an onclick
  // with `.replace(/'/g,...)`, which leaves `"` live — the exact pattern escapeAttr replaced.
  test('attribute sinks are escaped, not hand-rolled', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => ({
      placeholderEscaped: /placeholder="\$\{escapeHtml\(/.test(renderStrengthTable.toString()),
      trendChipEscaped: /_setTrendMetric\('\$\{escapeAttr\(/.test(_renderPerfExerciseList.toString()),
      handRolledGone: !/replace\(\/'\/g/.test(_renderPerfExerciseList.toString()),
      attrNeutralised: escapeAttr('x" onfocus="alert(1)').includes('&quot;'),
    }))
    expect(r.placeholderEscaped, 'placeholder= still takes a raw value').toBe(true)
    expect(r.trendChipEscaped, 'trend chip onclick not using escapeAttr').toBe(true)
    expect(r.handRolledGone, 'hand-rolled quote escaping still present').toBe(true)
    expect(r.attrNeutralised).toBe(true)
  })
})
