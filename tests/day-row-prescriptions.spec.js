const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// 2026-07-22, Jake: day rows showed only an exercise name and a set count — "it doesnt show any
// detail of the weights, rest period, rest etc. its not good UX or helpful to a user who wants to
// look at their week ahead to see what the plan has in store for them."
//
// The formatting already existed TWICE (openSessionDetail + openTemplate) and had already drifted.
// Rather than add a third copy, both were refactored onto one shared `_fmtSetDetail`, with
// `_fmtSetsCollapsed` layering the collapse-identical-sets behaviour on top (les-037).
test.describe('Set prescription formatting', () => {
  test('_fmtSetsCollapsed collapses identical sets and expands differing ones', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(() => {
      const rpe = { effortType: 'rpe' }
      const set = (o) => ({ ...rpe, ...o })
      return {
        // 4 identical sets -> ONE line, not four.
        identical: _fmtSetsCollapsed([
          set({ repsMin: '8', repsMax: '10', weight: '60', effortMin: '8' }),
          set({ repsMin: '8', repsMax: '10', weight: '60', effortMin: '8' }),
          set({ repsMin: '8', repsMax: '10', weight: '60', effortMin: '8' }),
          set({ repsMin: '8', repsMax: '10', weight: '60', effortMin: '8' }),
        ]),
        // A genuine ramp must NOT be flattened — that would hide the prescription.
        ramped: _fmtSetsCollapsed([
          set({ repsMin: '5', weight: '60' }),
          set({ repsMin: '5', weight: '70' }),
        ]),
        // The zero case — a distinct third state from one-vs-many (les-032). Must be null so the
        // caller renders nothing rather than "0 sets".
        empty: _fmtSetsCollapsed([]),
        nullish: _fmtSetsCollapsed(null),
        // Legacy '0:00' rest is truthy — it must not render a phantom "0:00 rest".
        zeroRest: _fmtSetsCollapsed([set({ repsMin: '10', restMin: '0:00' })]),
        // Cardio routes through a completely different branch; distance is METRES (2026-07-22).
        cardio: _fmtSetsCollapsed([
          set({ isDistanceBased: true, distanceM: '500', pace500Min: '1:45', wattsMin: '210' }),
        ], { isCardio: true }),
        // Jump: a "rep" is a contact, so it reads as jumps.
        jump: _fmtSetsCollapsed([set({ targetHeightCm: '40', repsMin: '3' })]),
        // Legacy sets_json keys that only openTemplate's copy supported — must survive the merge.
        legacyKeys: _fmtSetsCollapsed([{ reps: '12', rpe: '7', rest: '90s' }]),
        // A range with only one end set must render that end, NOT "24–?" — the old copies hardcoded
        // a '?' placeholder, which reads as broken in a compact row when a coach prescribes a floor.
        halfRangeStroke: _fmtSetsCollapsed([set({ isDistanceBased: true, distanceM: '5000', strokeRateMin: '24' })], { isCardio: true }),
        halfRangeHr: _fmtSetsCollapsed([set({ duration: '20:00', hrZoneMin: '150' })], { isCardio: true }),
        // --- regressions the pre-push review (Agent C) caught in the refactor itself ---
        // C1: weight and %1RM are SEPARATE prescriptions and are editable on the same set. The merge
        // had taken openSessionDetail's lossy `weight || intensity`, hiding a %1RM typed alongside a weight.
        weightAndPct: _fmtSetsCollapsed([set({ repsMin: '5', weight: '100', intensityMin: '80', intensityMax: '85' })]),
        // C2: AMRAP must not eat the rep floor an AMRAP back-off set prescribes.
        amrapKeepsReps: _fmtSetsCollapsed([set({ amrap: true, repsMin: '8', repsMax: '10', weight: '60' })]),
        // C3: RPE/RIR is editable for jumps and was being dropped.
        jumpEffort: _fmtSetsCollapsed([set({ targetHeightCm: '40', repsMin: '3', effortMin: '8' })]),
        // Rest may be stored as a bare seconds NUMBER, not just mm:ss.
        numericRest: _fmtSetsCollapsed([set({ repsMin: '8', restMin: 90 })]),
        // A set with no fields at all formatted to '—', and the collapser printed "3 × —".
        allEmpty: _fmtSetsCollapsed([{}, {}, {}]),
      }
    })

    expect(r.identical).toBe('4 × 8–10 reps · 60kg · RPE 8')
    expect(r.ramped).toContain('60kg')
    expect(r.ramped).toContain('70kg')
    expect(r.ramped).not.toMatch(/^2 ×/)
    expect(r.empty).toBeNull()
    expect(r.nullish).toBeNull()
    expect(r.zeroRest).not.toContain('0:00')
    expect(r.cardio).toContain('500 m')
    expect(r.cardio).toContain('210 W')
    expect(r.jump).toContain('40cm')
    expect(r.jump).toContain('3 jumps')
    expect(r.legacyKeys).toContain('12 reps')
    expect(r.legacyKeys).toContain('RPE 7')
    expect(r.legacyKeys).toContain('90s rest')
    expect(r.halfRangeStroke).toContain('24 spm')
    expect(r.halfRangeStroke).not.toContain('?')
    expect(r.halfRangeHr).toContain('HR 150')
    expect(r.halfRangeHr).not.toContain('?')
    expect(r.weightAndPct).toContain('100kg')
    expect(r.weightAndPct).toContain('80–85% 1RM')   // both, not weight-wins
    expect(r.amrapKeepsReps).toContain('8–10 reps')  // the floor survives
    expect(r.amrapKeepsReps).toContain('AMRAP')
    expect(r.jumpEffort).toContain('RPE 8')
    expect(r.numericRest).toContain('1:30 rest')     // 90s formatted, not "90 rest"
    expect(r.allEmpty).toBeNull()                    // not "3 × —"
  })

  // Regression guard for the refactor itself: the two pre-existing surfaces each had their OWN copy
  // with different rest handling. `includeRest` preserves that difference — if it ever stops doing
  // so, one of those surfaces silently changes appearance.
  test('_fmtSetDetail honours includeRest per call site', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const s = { effortType: 'rpe', repsMin: '8', weight: '60', restMin: '2:00' }
      return {
        withRest: _fmtSetDetail(s, { includeRest: true }),   // openTemplate's behaviour
        withoutRest: _fmtSetDetail(s, { includeRest: false }), // openSessionDetail's (own span)
        noArgs: _fmtSetDetail(s),
        nullSet: _fmtSetDetail(null),
        // openSessionDetail prints AMRAP in its own left-hand label column, so the string must NOT
        // repeat it there — the row would read "AMRAP | 8 reps (AMRAP) · 60kg".
        amrapMarked: _fmtSetDetail({ effortType: 'rpe', amrap: true, repsMin: '8' }, { markAmrap: true }),
        amrapUnmarked: _fmtSetDetail({ effortType: 'rpe', amrap: true, repsMin: '8' }, { markAmrap: false }),
      }
    })
    expect(r.withRest).toContain('2:00 rest')
    expect(r.withRest).not.toContain('?')
    expect(r.withoutRest).not.toContain('rest')
    expect(r.withoutRest).toContain('8 reps')
    expect(r.noArgs).not.toContain('rest')  // defaults must not change a caller's output
    expect(r.nullSet).toBe('—')
    expect(r.amrapMarked).toContain('AMRAP')
    expect(r.amrapUnmarked).not.toContain('AMRAP')
    expect(r.amrapUnmarked).toContain('8 reps')
  })

  // Found by the pre-push multi-agent review (Agent B), 2026-07-23. `day_of_week` is 1-BASED
  // everywhere it is stored (renderPhaseWeekGrid writes i+1; starter-content seeds 1 = 'Monday';
  // the calendar reads day_of_week-1), but the new picker usage label indexed a 0-based array
  // directly — so every day was off by one and SUNDAY (7) fell off the end and rendered no day at
  // all. Worse than useless: the label exists precisely to disambiguate identical rows, and it was
  // pointing at the wrong day.
  test('_DAY_LABELS is indexed with the 1-based day_of_week convention', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => ({
      labels: _DAY_LABELS,
      mon: _DAY_LABELS[1 - 1],
      sun: _DAY_LABELS[7 - 1],
      // the writer's own convention, read straight out of the render function
      writerAddsOne: /const dayNum = i \+ 1/.test(renderPhaseWeekGrid.toString()),
    }))
    expect(r.labels).toHaveLength(7)
    expect(r.mon).toBe('MON')     // day_of_week 1 → MON
    expect(r.sun).toBe('SUN')     // day_of_week 7 → SUN, not undefined
    expect(r.writerAddsOne).toBe(true)
  })

  // Found by the pre-push review (Agent A), 2026-07-23. The formatter concatenates RAW sets_json
  // values (tempo/weight/reps/rpe/stroke/HR). On a client PLAN CLONE that row belongs to the client,
  // so an unescaped innerHTML sink is the client→coach stored-XSS shape from 2026-07-18. The NEW day
  // rows escaped; the two sinks the refactor rewrote did not.
  test('every consumer of _fmtSetDetail escapes before innerHTML', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const payload = '<img src=x onerror=alert(1)>'
      const out = _fmtSetDetail({ effortType: 'rpe', repsMin: '8', tempo: payload }, { includeRest: true })
      return {
        // the formatter itself is deliberately NOT html-safe — callers escape
        formatterPassesThrough: out.includes(payload),
        // …so assert every interpolation of its output is wrapped in escapeHtml
        sessionDetailEscapes: /\$\{escapeHtml\(detail\)\}/.test(openSessionDetail.toString()),
        templateCardEscapes: /\$\{escapeHtml\(summary\)\}/.test(openTemplate.toString()),
        escapedPayload: escapeHtml(out).includes('&lt;img'),
      }
    })
    expect(r.formatterPassesThrough).toBe(true)
    expect(r.sessionDetailEscapes).toBe(true)
    expect(r.templateCardEscapes).toBe(true)
    expect(r.escapedPayload).toBe(true)
  })
})
