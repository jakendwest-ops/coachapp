// What a back-off set's percentage is a percentage OF (Jake, 2026-10-28: "the user can choose whether to use % of the actual weight of the
// top set, or a % of the weight of the e1rm").
//
// THE CONFUSION. The builder's dropdown offered "Last saved 1RM" and "Today's top set". The second one did NOT mean a percentage of the weight
// lifted on the top set: it meant a percentage of the 1RM ESTIMATED from the top set (weight, reps and RPE). For a top set of 100 kg x 4 @ RPE 7,
// 70% came out as 85 kg, not 70 kg, and the screen gave no hint. There are now three bases, named for what they are:
//   stored       -> "Last saved 1RM"          (every template saved before; the default)
//   topSet       -> "Today's estimated 1RM"   (the old "Today's top set": same stored value, so no template changes meaning)
//   topSetWeight -> "Today's top set weight"  (NEW: a percentage of the weight actually lifted)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const isTop = get('_isTopSetBasis'), orDefault = get('_intensityBasisOrDefault')
const short = get('_intensityBasisShort'), label = get('_intensityBasisLabel'), help = get('_intensityBasisHelp')

describe('the three bases are named once', () => {
  test('_isTopSetBasis: both top-set bases, nothing else', () => {
    assert.equal(isTop('topSet'), true)
    assert.equal(isTop('topSetWeight'), true)
    for (const b of ['stored', '', null, undefined, 'TopSet', 'topset', 'e1rm', 0]) assert.equal(isTop(b), false, String(b))
  })

  test('_intensityBasisOrDefault: the three known values survive, everything else is the stored-1RM default', () => {
    assert.equal(orDefault('stored'), 'stored')
    assert.equal(orDefault('topSet'), 'topSet')
    assert.equal(orDefault('topSetWeight'), 'topSetWeight')
    for (const b of [undefined, null, '', 'weight', 'TopSetWeight', 5]) assert.equal(orDefault(b), 'stored', String(b))
  })

  test('the labels say what each basis is (the old "Today\'s top set" is now "Today\'s estimated 1RM")', () => {
    assert.equal(label('stored'), 'Last saved 1RM')
    assert.equal(label('topSet'), "Today's estimated 1RM")
    assert.equal(label('topSetWeight'), "Today's top set weight")
    assert.equal(short('stored'), '% 1RM')
    assert.equal(short('topSet'), '% of e1RM')
    assert.equal(short('topSetWeight'), '% of top set')
    for (const b of ['stored', 'topSet', 'topSetWeight']) assert.ok(help(b).length > 10, b + ' has a plain-English sentence')
    assert.notEqual(help('topSet'), help('topSetWeight'))
  })
})

describe('the builder saves all three bases, and only for weight and reps', () => {
  const clean = (sets, mt = 'weight_reps') => get('_cleanTemplateSets')(sets, { unilateral: false, timed: false }, mt)
  const top = { isTopSet: true, repsMin: '4', effortMin: '7' }

  test('each basis round-trips through a save', () => {
    for (const b of ['stored', 'topSet', 'topSetWeight']) {
      const out = clean([top, { repsMin: '4', intensityMin: '70', intensityMax: '70', intensityBasis: b }])
      assert.equal(out[1].intensityBasis, b)
      assert.equal(out[1].intensityMin, '70')
    }
  })

  test('an unknown basis (a hand-edited sets_json) becomes the stored-1RM default, never something half-understood', () => {
    const out = clean([top, { repsMin: '4', intensityMin: '70', intensityBasis: 'weight' }])
    assert.equal(out[1].intensityBasis, 'stored')
  })

  test('a metric type that has no top set never keeps a top-set basis (a stale value must not survive a type switch)', () => {
    const out = clean([{ repsMin: '4', intensityMin: '70', intensityBasis: 'topSetWeight' }], 'timed_hold')
    assert.equal(out[0].intensityBasis, 'stored')
  })

  test('the top set itself carries no percentage whatever its basis (unchanged rule)', () => {
    const out = clean([{ isTopSet: true, repsMin: '4', intensityMin: '90', intensityMax: '90', intensityBasis: 'topSetWeight' }])
    assert.equal(out[0].intensityMin, null); assert.equal(out[0].intensityMax, null)
  })
})

describe('the summary line names the basis', () => {
  const detail = (basis) => get('_fmtSetDetail')({ repsMin: '4', repsMax: '4', intensityMin: '70', intensityMax: '70', intensityBasis: basis })
  test('70% of each basis reads differently', () => {
    assert.match(detail('stored'), /70% 1RM/)
    assert.match(detail('topSet'), /70% of e1RM/)
    assert.match(detail('topSetWeight'), /70% of top set/)
    assert.doesNotMatch(detail('topSet'), /of top set/, 'the estimated-1RM basis must no longer read as "of top set"')
  })
})

describe('the runner resolves each basis to the right kilograms', () => {
  const basisKg = get('_basisKgFor')
  const ex = { oneRM: 120, _liveE1RM: 123.3, _liveTopWeight: 100 }

  test('stored -> the saved 1RM; topSet -> today\'s estimated 1RM; topSetWeight -> the weight lifted', () => {
    assert.equal(basisKg(ex, { intensityBasis: 'stored' }), 120)
    assert.equal(basisKg(ex, {}), 120, 'no basis at all is the stored 1RM, as it always was')
    assert.equal(basisKg(ex, { intensityBasis: 'topSet' }), 123.3)
    assert.equal(basisKg(ex, { intensityBasis: 'topSetWeight' }), 100)
  })

  test('the same 70% gives three different loads (the worked example the builder shows)', () => {
    const pct = (b) => Number(get('_calcWeightFromPct')(basisKg(ex, { intensityBasis: b }), 70))
    assert.equal(pct('topSetWeight'), 70)       // 70% of 100 kg
    assert.equal(pct('topSet'), 85)             // 70% of 123.3 kg = 86.3, rounded DOWN to 2.5 kg
    assert.equal(pct('stored'), 82.5)           // 70% of 120 kg = 84, rounded down to 2.5 kg
  })

  test('a top-set basis that cannot be worked out yet is blank, and never falls back to the stored 1RM', () => {
    const early = { oneRM: 120 }                // nothing logged yet
    assert.ok(!basisKg(early, { intensityBasis: 'topSetWeight' }))
    assert.ok(!basisKg(early, { intensityBasis: 'topSet' }))
  })

  test('_recomputeLiveE1RM: the top-set WEIGHT needs only a ticked row with a weight; the e1RM also needs reps and an effort', () => {
    const mk = (row) => ({ sets_json: [{ isTopSet: true, effortType: 'rpe' }], tableRows: [row] })
    const recompute = get('_recomputeLiveE1RM')

    let e = mk({ done: true, weight: '100', reps: '4', effort: '7' }); recompute(e)
    assert.equal(e._liveTopWeight, 100)
    assert.ok(Math.abs(e._liveE1RM - 123.3) < 0.1, 'e1RM from 100 kg x 4 @ RPE 7')

    e = mk({ done: true, weight: '100', reps: '4', effort: '' }); recompute(e)
    assert.equal(e._liveTopWeight, 100, 'no effort: the weight is still known')
    assert.equal(e._liveE1RM, null, '...but no estimate can be made')

    e = mk({ done: false, weight: '100', reps: '4', effort: '7' }); recompute(e)
    assert.equal(e._liveTopWeight, null, 'not ticked yet: nothing lifted')
    assert.equal(e._liveE1RM, null)

    e = mk({ done: true, weight: '0', reps: '4', effort: '7' }); recompute(e)
    assert.equal(e._liveTopWeight, null, 'a 0 kg row is not a load to take a percentage of')

    e = { sets_json: [{ isTopSet: false }], tableRows: [{ done: true, weight: '100', reps: '4', effort: '7' }], _liveE1RM: 99, _liveTopWeight: 99 }; recompute(e)
    assert.equal(e._liveTopWeight, null, 'no top set: both are cleared')
    assert.equal(e._liveE1RM, null)
  })

  test('the target bar labels the basis and never raises the "set your 1RM" banner for a top-set basis', () => {
    const cols = get('_buildTargetCols')
    const exercise = { name: 'Squat', metric_type: 'weight_reps', oneRM: null }
    const tgt = (b) => ({ repsMin: '4', intensityMin: '70', intensityMax: '70', intensityBasis: b })
    const labelOf = (r) => r.cols.find(c => /%$/.test(c.val))?.label
    assert.equal(labelOf(cols(tgt('topSetWeight'), exercise)), 'OF TOP SET')
    assert.equal(labelOf(cols(tgt('topSet'), exercise)), 'OF E1RM')
    assert.equal(labelOf(cols(tgt('stored'), exercise)), '1RM TARGET')
    assert.equal(cols(tgt('topSetWeight'), exercise).needsOneRM, false)
    assert.equal(cols(tgt('topSet'), exercise).needsOneRM, false)
    assert.equal(cols(tgt('stored'), exercise).needsOneRM, true, 'a stored-1RM row with no saved 1RM still asks for one')
  })
})

describe('the programme code treats both top-set bases the same way', () => {
  test('neither needs a stored 1RM, and the weekly percentage wave leaves both alone', () => {
    const wave = (s) => get('_applyWavePct')(s, () => 95)
    for (const b of ['topSet', 'topSetWeight']) {
      const s = { repsMin: '8', intensityMin: '70', intensityMax: '70', intensityBasis: b }
      assert.equal(wave(s), s, b + ': the wave number must not land on it')
    }
    const stored = wave({ intensityMin: '70', intensityMax: '70', intensityBasis: 'stored' })
    assert.equal(stored.intensityMin, 95, 'a stored-1RM set still follows the wave')

    const phases = (basis) => [{ program_phase_workouts: [{ week_number: 1, workout_templates: { workout_template_exercises: [
      { exercise_name: 'Squat', exercise_id: 'e1', sets_json: [{ intensityMin: 70, intensityBasis: basis }] }] } }] }]
    const needed = (basis) => [...get('_neededOneRMsByName')(phases(basis)).keys()]
    assert.deepEqual(needed('topSetWeight'), [])
    assert.deepEqual(needed('topSet'), [])
    assert.deepEqual(needed('stored'), ['Squat'])
  })
})
