// A prescribed effort of 0 (RIR 0, "to failure") must survive every step between the builder and the runner (2026-10-01).
//
// RIR 0 is the most meaningful value on that scale, and this project has shipped the falsy-zero bug at five sites
// already. Three more sites still lost it, all in the PRESCRIPTION path (the logging path was fixed in round 2):
//   - _cleanTemplateSets:  `effortMin: s.effortMin || null`        -> a numeric 0 became null on every save
//   - _buildTargetCols:    `if (tgt.effortMin)`                    -> the RPE/RIR column vanished from the runner's target bar
//   - the set-detail text: `s.effortMin ? ... : null` and range()  -> "RIR 0" never rendered in the builder / calendar
// The builder's own inputs hand back STRINGS ('0' is truthy), so typing 0 in the UI mostly survived by accident; a
// numeric 0 arrives from imported or hand-edited sets_json, and from anything that reads the column back as a number.
// Both shapes are asserted here, because "the UI path works" is how this stayed latent.
//
// Each case that goes red on the old code says which site it guards.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const clean = (sets, mt = 'weight_reps') =>
  get('_cleanTemplateSets')(sets, get('_deriveFromMetricType')(mt), mt)

describe('_effortRange — the one formatter for a prescribed effort', () => {
  test('a real 0 is PRESENT, in both numeric and string form', () => {
    assert.equal(get('_effortRange')(0, null), '0')
    assert.equal(get('_effortRange')('0', ''), '0')
    assert.equal(get('_effortRange')(0, 0), '0', 'min == max collapses to one number')
  })
  test('a range, a single end, and nothing', () => {
    assert.equal(get('_effortRange')(7, 9), '7–9')
    assert.equal(get('_effortRange')('7', '8'), '7–8')
    assert.equal(get('_effortRange')(8, null), '8')
    assert.equal(get('_effortRange')(null, 9), '9')
    assert.equal(get('_effortRange')(0, 2), '0–2', 'RIR 0–2 is a real prescription')
  })
  test('null / undefined / empty string mean "nothing prescribed"', () => {
    assert.equal(get('_effortRange')(null, null), null)
    assert.equal(get('_effortRange')(undefined, undefined), null)
    assert.equal(get('_effortRange')('', ''), null)
  })
})

describe('_cleanTemplateSets — site 1: the save allowlist', () => {
  test('a NUMERIC 0 effortMin survives a save (was nulled)', () => {
    const [r] = clean([{ repsMin: '5', effortType: 'rir', effortMin: 0 }])
    assert.equal(r.effortMin, 0)
    assert.equal(r.effortType, 'rir')
  })
  test('a STRING "0" survives too (the shape the builder inputs produce)', () => {
    const [r] = clean([{ repsMin: '5', effortType: 'rir', effortMin: '0' }])
    assert.equal(r.effortMin, '0')
  })
  test('effortMax of 0 survives', () => {
    const [r] = clean([{ repsMin: '5', effortType: 'rir', effortMin: 0, effortMax: 0 }])
    assert.equal(r.effortMax, 0)
  })
  test('an empty or missing effort is still null (the fix must not start storing blanks)', () => {
    const [a] = clean([{ repsMin: '5', effortMin: '' }])
    const [b] = clean([{ repsMin: '5' }])
    const [c] = clean([{ repsMin: '5', effortMin: null, effortMax: undefined }])
    for (const r of [a, b, c]) { assert.equal(r.effortMin, null); assert.equal(r.effortMax ?? null, null) }
  })
  test('an ordinary RPE is unchanged', () => {
    const [r] = clean([{ repsMin: '5', effortType: 'rpe', effortMin: '8', effortMax: '9' }])
    assert.equal(r.effortMin, '8'); assert.equal(r.effortMax, '9')
  })
})

describe('_buildTargetCols — site 2: the runner target bar', () => {
  const cols = tgt => get('_buildTargetCols')({ repsMin: '5', ...tgt }, { oneRM: null, metric_type: 'weight_reps' }).cols
  const effortCol = c => c.find(x => x.label === 'RIR' || x.label === 'RPE')
  test('RIR 0 shows its column (was dropped), numeric and string', () => {
    for (const v of [0, '0']) {
      const col = effortCol(cols({ effortType: 'rir', effortMin: v }))
      assert.ok(col, `no RIR column for effortMin=${JSON.stringify(v)}`)
      assert.equal(col.label, 'RIR'); assert.equal(col.val, '0')
    }
  })
  test('RIR 0–2 shows the range', () => {
    assert.equal(effortCol(cols({ effortType: 'rir', effortMin: 0, effortMax: 2 })).val, '0–2')
  })
  test('no effort prescribed -> no column (the fix must not invent one)', () => {
    assert.equal(effortCol(cols({ effortMin: null })), undefined)
    assert.equal(effortCol(cols({ effortMin: '' })), undefined)
  })
  test('an ordinary RPE range still reads 8–9', () => {
    const col = effortCol(cols({ effortType: 'rpe', effortMin: '8', effortMax: '9' }))
    assert.equal(col.label, 'RPE'); assert.equal(col.val, '8–9')
  })
})
