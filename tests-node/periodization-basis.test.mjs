// The weekly percentage wave leaves "% of today's top set" sets alone (Jake, 2026-10-01: "option 2").
//
// generatePhasePeriodization overwrote intensityMin/intensityMax on EVERY set that had one, whatever its intensityBasis. The
// wave numbers are percentages of a stored 1RM; written onto a back-off set pointed at today's top set they became, e.g.,
// "95% of the top set" — a load nobody chose. A set based on the top set now keeps the percentage the coach typed; a set
// based on the stored 1RM still follows the wave exactly as before.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const apply = (s, pct) => get('_applyWavePct')(s, () => pct)

describe('_applyWavePct', () => {
  test('a set at a % of the STORED 1RM follows the wave (unchanged behaviour)', () => {
    const r = apply({ repsMin: '5', intensityMin: '70', intensityMax: '70' }, 80)
    assert.equal(r.intensityMin, 80); assert.equal(r.intensityMax, 80)
  })

  test("an explicit 'stored' basis follows the wave too", () => {
    const r = apply({ intensityMin: '70', intensityBasis: 'stored' }, 85)
    assert.equal(r.intensityMin, 85)
  })

  test("a set at a % of TODAY'S TOP SET keeps its own percentage and its basis", () => {
    const s = { repsMin: '8', intensityMin: '70', intensityMax: '70', intensityBasis: 'topSet' }
    const r = apply(s, 95)
    assert.equal(r.intensityMin, '70', 'the wave number must not land on a top-set-based set')
    assert.equal(r.intensityMax, '70')
    assert.equal(r.intensityBasis, 'topSet')
  })

  test('a set with no percentage is returned untouched, and the wave is not even computed for it', () => {
    let called = 0
    const s = { repsMin: '5', effortMin: '8' }
    const r = get('_applyWavePct')(s, () => { called++; return 80 })
    assert.equal(r, s)
    assert.equal(called, 0)
  })

  test('the top set itself (no percentage by design) is untouched', () => {
    const s = { isTopSet: true, repsMin: '3', effortType: 'rpe', effortMin: '8', intensityBasis: 'stored' }
    assert.deepEqual({ ...apply(s, 80) }, { ...s })
  })

  test('a wave that has no number for this week (null) leaves the set alone — the old rule, kept', () => {
    const s = { intensityMin: '70' }
    assert.equal(apply(s, null), s)
  })

  test("the wave is not computed for a top-set-based set (no wasted call, no throw on a missing config)", () => {
    let called = 0
    get('_applyWavePct')({ intensityMin: '70', intensityBasis: 'topSet' }, () => { called++; return 95 })
    assert.equal(called, 0)
  })
})
