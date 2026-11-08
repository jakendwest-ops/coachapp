// Periodization by added weight (Jake, 2026-11-08, Phase 2a of docs/superpowers/plans/2026-11-08-solo-audit-response.md). A phase's
// periodization_config carries basis:'kg' and stepKg. These are the pure parts; the dialog and Generate are covered by the browser spec.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const add = (cfg, week) => get('_computePeriodizedKg')(cfg, week)
const wave = (s, n) => get('_applyWaveKg')(s, n)
const report = pws => get('_pzWeek1Report')('kg', pws)
const slot = (...exercises) => ({ workout_templates: { name: 'Upper', workout_template_exercises: exercises.map(sets_json => ({ sets_json })) } })

describe('_pzBasis', () => {
  test('reads kg, and leaves rpe and old phases alone', () => {
    assert.equal(get('_pzBasis')({ basis: 'kg', stepKg: 2.5 }), 'kg')
    assert.equal(get('_pzBasis')({ basis: 'rpe' }), 'rpe')
    assert.equal(get('_pzBasis')({ startPct: 65 }), 'pct')
    assert.equal(get('_pzBasis')({ basis: 'nonsense' }), 'pct')
  })
})

describe('_computePeriodizedKg', () => {
  test('Week 1 adds nothing, later weeks add the step each week', () => {
    assert.deepEqual([1, 2, 3, 4].map(w => add({ stepKg: 2.5 }, w)), [0, 2.5, 5, 7.5])
  })
  test('a deload week adds nothing, and the next week carries on', () => {
    assert.deepEqual([3, 4, 5].map(w => add({ stepKg: 5, deloadWeek: 4 }, w)), [10, 0, 20])
    assert.equal(add({ stepKg: 5, deloadWeek: '4' }, 4), 0)
  })
  test('no valid step gives null, never NaN', () => {
    for (const cfg of [{}, null, { stepKg: 0 }, { stepKg: -1 }, { stepKg: 'abc' }, { stepKg: '' }]) assert.equal(add(cfg, 2), null)
  })
})

describe('_applyWaveKg', () => {
  test('adds to a typed weight and keeps every other field', () => {
    const s = { weight: 100, repsMin: '5', restMin: '3:00', effortMin: 8 }
    assert.deepEqual({ ...wave(s, 2.5) }, { weight: 102.5, repsMin: '5', restMin: '3:00', effortMin: 8 })
    assert.equal(s.weight, 100, 'the source set is not mutated')
  })
  test('keeps a stored string a string', () => assert.equal(wave({ weight: '60' }, 5).weight, '65'))
  test('leaves bodyweight, blank, 0 kg and non-numeric sets as the same object', () => {
    for (const s of [{ weight: 50, bodyweight: true }, { weight: '' }, { weight: null }, {}, { weight: 0 }, { weight: 'BW' }, { intensityMin: 80 }]) assert.equal(wave(s, 2.5), s)
  })
  test('adding nothing, or a missing step, leaves the set alone', () => {
    const s = { weight: 100 }
    assert.equal(wave(s, 0), s); assert.equal(wave(s, null), s)
  })
  test('a jump or interval set keeps any stale weight; lifts, unilateral and holds step', () => {
    for (const m of ['jump_height', 'jump_distance', 'interval']) { const s = { weight: 50 }; assert.equal(get('_applyWaveKg')(s, 5, m), s) }
    for (const m of ['weight_reps', 'unilateral', 'timed_hold', undefined]) assert.equal(get('_applyWaveKg')({ weight: 50 }, 5, m).weight, 55)
  })
  test('does not store floating point dust', () => assert.equal(wave({ weight: 60.1 }, 0.2).weight, 60.3))
})

describe('_pzWeek1Report for kg', () => {
  test('counts only sets a weight can be added to, and never calls differing weights a problem', () => {
    const r = report([slot([{ weight: 100 }, { weight: 90 }], [{ weight: '' }, { bodyweight: true, weight: 20 }])])
    assert.equal(r.sessions, 1); assert.equal(r.stepped, 2); assert.equal(r.mixed, false)
  })
})

test('_periodizationLabel with no step says only Linear (the step is checked in the browser spec)', () => {
  assert.equal(get('_periodizationLabel')({ periodization_type: 'linear', periodization_config: { basis: 'kg' } }), 'Linear')
})
