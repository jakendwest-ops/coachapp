// Stale set fields riding onto the wrong exercise type (2026-08-18). Bug 2 of 5.
//
// Two halves of one defect:
//   (a) saveEditTemplateExercise wrote the RAW window._templateSets, while its two siblings
//       (saveExerciseToTemplate, _confirmRunnerExerciseFromModal) both called _cleanTemplateSets —
//       so every metric-type gate in that function was skipped when EDITING.
//   (b) _cleanTemplateSets passed targetHeightCm/targetDistanceM through unconditionally, and
//       _fmtSetDetail decides "this row is a jump" from the SET DATA, not from metric_type:
//           } else if (s.targetHeightCm || s.targetDistanceM) {      // app-workouts.js:290
//
// Net effect: a height typed under Jump height and then switched to Weight & reps made the plan
// preview render "40cm · 8-10 jumps" on six surfaces (openTemplate, openSessionDetail, the client
// Workouts day rows, the calendar day modal, and two in the programs grid) while the runner —
// which branches on metric_type, correctly — showed weight x reps. The coach's screen and the
// athlete's screen disagreed about what the exercise was.
//
// Fixed at the GATE, not in the renderer: patching _fmtSetDetail would leave the bad data on disk
// and hide only one of the six surfaces.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// The exact number of fields _cleanTemplateSets emits. Verified against the shipped function, not
// assumed — see the assertion below for why a bare cross-type comparison is not enough.
const EXPECTED_KEYS = 42

const clean = (page, set, metricType) => page.evaluate(({ set, metricType }) =>
  _cleanTemplateSets([set], _deriveFromMetricType(metricType), metricType)[0], { set, metricType })

test.describe('Stale set fields must not survive a type change', () => {
  test('a jump height typed then switched to weight/reps is dropped', async ({ page }) => {
    await loginAsPT(page)
    // Exactly the ADD-path repro: Type -> Jump height, type 40, Type -> Weight & reps, fill reps, Add.
    // flushTemplateSets preserves targetHeightCm because the weight/reps editor never renders it.
    const r = await clean(page, { targetHeightCm: '40', repsMin: '8', repsMax: '10' }, 'weight_reps')
    expect(r.targetHeightCm, 'a barbell lift must not carry a jump height').toBeNull()
    expect(r.repsMin, 'the reps the user actually typed must survive').toBe('8')
  })

  test('a real jump KEEPS its height — the gate must not overreach', async ({ page }) => {
    await loginAsPT(page)
    const r = await clean(page, { targetHeightCm: '40', repsMin: '8' }, 'jump_height')
    expect(r.targetHeightCm).toBe('40')
    const d = await clean(page, { targetDistanceM: '2.4' }, 'jump_distance')
    expect(d.targetDistanceM).toBe('2.4')
  })

  test('the plan preview no longer calls a barbell lift a jump', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const stale = { targetHeightCm: '40', repsMin: '8', repsMax: '10', weight: '100' }
      const dirty = _fmtSetDetail(stale)                                    // what shipped
      const cleaned = _cleanTemplateSets([stale], _deriveFromMetricType('weight_reps'), 'weight_reps')[0]
      return { dirty, clean: _fmtSetDetail(cleaned) }
    })
    // This is the user-visible half: same row, two different exercises across two screens.
    expect(r.dirty.toLowerCase(), 'the un-gated set really does render as a jump').toContain('jump')
    expect(r.clean.toLowerCase(), 'after the gate it must read as weight x reps').not.toContain('jump')
  })

  test('an AMRAP flag does not survive a switch to a jump', async ({ page }) => {
    await loginAsPT(page)
    const r = await clean(page, { amrap: true, repsMin: '8' }, 'jump_height')
    // Already gated (2026-08-14) — asserted here because the EDIT path skipped the gate entirely, so
    // this rode through too and produced "AMRAP / JUMPS" in the runner.
    expect(r.amrap, 'AMRAP means nothing on a jump').toBe(false)
    const kept = await clean(page, { amrap: true, repsMin: '8' }, 'weight_reps')
    expect(kept.amrap, 'but it must survive where it IS meaningful').toBe(true)
  })

  test('switching BETWEEN the two jump types leaves only the matching target', async ({ page }) => {
    await loginAsPT(page)
    // The editor renders one input per jump type, but flushTemplateSets preserves the un-rendered one
    // — so Jump distance -> Jump height leaves BOTH set. _fmtSetDetail prefers height unconditionally,
    // so a jump_DISTANCE row rendered "40cm" on the previews while the runner showed "2.4 m".
    // A family-wide gate (jump_height OR jump_distance) would NOT have caught this.
    const both = { targetHeightCm: '40', targetDistanceM: '2.4', repsMin: '5' }
    const asHeight = await clean(page, both, 'jump_height')
    expect(asHeight.targetHeightCm).toBe('40')
    expect(asHeight.targetDistanceM, 'a height jump must not keep a distance target').toBeNull()

    const asDistance = await clean(page, both, 'jump_distance')
    expect(asDistance.targetDistanceM).toBe('2.4')
    expect(asDistance.targetHeightCm, 'a distance jump must not keep a height target').toBeNull()

    // And the user-visible half, through the real renderer.
    const rendered = await page.evaluate((s) => _fmtSetDetail(s), asDistance)
    expect(rendered, 'must show the distance, not a height').toContain('2.4')
    expect(rendered).not.toContain('40')
  })

  test('gating changes VALUES only — never the set of keys', async ({ page }) => {
    await loginAsPT(page)
    // _cleanTemplateSets is an ALLOWLIST: a key it stops emitting is silently gone from every saved
    // row, with no error at any layer. This is the safety net for that — the key set must be
    // identical across metric types, because gating nulls a value, it never removes a field.
    const r = await page.evaluate(() => {
      const set = { repsMin: '8', targetHeightCm: '40', amrap: true, bodyweight: true, workSecs: 30 }
      const keysFor = (mt) => Object.keys(_cleanTemplateSets([set], _deriveFromMetricType(mt), mt)[0]).sort()
      return { weight: keysFor('weight_reps'), jump: keysFor('jump_height'), interval: keysFor('interval') }
    })
    expect(r.jump, 'jump_height must emit the same fields as weight_reps').toEqual(r.weight)
    expect(r.interval, 'interval must too').toEqual(r.weight)
    // The cross-type comparison alone CANNOT catch a line deleted from the allowlist — every type
    // shrinks equally and it stays green. Pinning the count is what makes this a real net. If this
    // number changes, a field was added or removed on the save path for every template exercise:
    // confirm that was deliberate before updating it.
    expect(r.weight.length, 'the allowlist emits a fixed field set — see comment').toBe(EXPECTED_KEYS)
    // And the fields this change touches must still be present, just nulled.
    for (const k of ['targetHeightCm', 'targetDistanceM', 'amrap', 'bodyweight', 'repsMin']) {
      expect(r.weight, `${k} must still be emitted`).toContain(k)
    }
  })

  test('the EDIT path cleans, not just the add path', async ({ page }) => {
    await loginAsPT(page)
    // The gate is only useful if the edit path calls it. Asserting the source directly because the
    // full save requires a real template, ownership resolution and a live write — and the bug was
    // precisely that this one line was absent while its siblings had it.
    const src = await page.evaluate(() => saveEditTemplateExercise.toString())
    expect(src, 'saveEditTemplateExercise must call _cleanTemplateSets').toContain('_cleanTemplateSets')
    expect(src, 'and must write the cleaned array, not the raw one').toMatch(/sets_json:\s*cleanSets/)
    // The one desync that would genuinely corrupt data: `sets` counting the RAW array while
    // `sets_json` holds the cleaned one. _cleanTemplateSets is a bare map today so lengths agree, but
    // nothing enforces that — assert both read from the same array.
    expect(src, 'the count must come from the same array as the payload').toMatch(/sets:\s*cleanSets\.length/)
  })
})
