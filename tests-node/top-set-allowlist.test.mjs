// _cleanTemplateSets and the top-set flag — RPE top-set review, round 2 (2026-10-01).
//
// A top set exists ONLY on row 0: the runner reads sets_json[0].isTopSet, the builder's TOP SET pill
// renders only for i === 0, and topSetActive reads _templateSets[0]. But the save allowlist gated on
// the raw per-row flag, and "Copy previous set" / the per-row sync button copy a WHOLE row — flag
// included — onto a later row, which then has no pill to clear it.
//
// Round 1 nulled weight/intensityMin/intensityMax on any row carrying the flag (so the hidden cells
// could not leave stale values behind). Together those meant the feature's main workflow —
// mark the top set, tap Copy previous set, set the copy to "70% of today's top set", save — silently
// erased the 70%. The Task 3 browser test never used Copy, so 28 green tests missed it.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const clean = (sets, mt = 'weight_reps') =>
  get('_cleanTemplateSets')(sets, get('_deriveFromMetricType')(mt), mt)

describe('_cleanTemplateSets — a top set is row 0 only', () => {
  test('row 0 as the top set keeps its flag and loses the load/% it no longer shows', () => {
    const [r0] = clean([{ isTopSet: true, weight: '100', intensityMin: '85', intensityMax: '90' }])
    assert.equal(r0.isTopSet, true)
    assert.equal(r0.weight, null)
    assert.equal(r0.intensityMin, null)
    assert.equal(r0.intensityMax, null)
  })

  // THE regression. A flag cloned onto row 1 must neither persist nor take row 1's values with it.
  test('a flag CLONED onto a later row is dropped, and that row keeps its percentage', () => {
    const rows = clean([
      { isTopSet: true },
      { isTopSet: true, intensityBasis: 'topSet', intensityMin: '70', weight: '80' }
    ])
    assert.equal(rows[1].isTopSet, false, 'only row 0 can be a top set')
    assert.equal(rows[1].intensityMin, '70', 'the backoff percentage must survive a save')
    assert.equal(rows[1].weight, '80')
    assert.equal(rows[1].intensityBasis, 'topSet', 'and so must its basis')
  })

  test('with no top set anywhere, weight and intensity persist exactly as before', () => {
    const rows = clean([{ weight: '100', intensityMin: '85' }, { weight: '90', intensityMin: '75' }])
    assert.equal(rows[0].weight, '100')
    assert.equal(rows[0].intensityMin, '85')
    assert.equal(rows[1].weight, '90')
    assert.equal(rows[1].intensityMin, '75')
  })

  test('a non-weight_reps type never carries the flag, even on row 0', () => {
    const [r0] = clean([{ isTopSet: true, weight: '20' }], 'timed_hold')
    assert.equal(r0.isTopSet, false)
    assert.equal(r0.weight, '20', 'and its load is untouched')
  })
})
