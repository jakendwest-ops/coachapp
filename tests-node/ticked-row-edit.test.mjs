// A ticked set whose reps or weight is cleared afterwards stops counting as logged (2026-10-01).
//
// THE GAP. toggleTableSet refuses to tick a row without the fields its metric type logs. Editing a TICKED row afterwards
// was unguarded. Before round 2 that was invisible, because loggedSets was a snapshot taken at tick time (and a
// correction was silently lost). Now the screen is the source of truth — right for a correction, but a CLEARED field was
// saved as cleared: reps cleared -> a set with a weight and no reps; weight AND reps cleared with an effort kept -> an
// effort-only junk row; everything cleared -> counted on the finish screen, dropped by the save.
//
// THE DECISION (taken by Claude 2026-10-01 under "fix any mistakes you have made" — flagged to Jake): a ticked row that no
// longer satisfies the tick-time rule is NOT a logged set. It is left out of loggedSets (so the finish screen and the
// save agree by construction) and un-ticked, so the table stops claiming it is done. The rule is ONE predicate,
// _rowIncompleteReason, shared by the tick and by the read-back, so the two can never drift apart.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { get, app } from './load-app.mjs'

const ctx = app()
const run = src => vm.runInContext(src, ctx)
beforeEach(() => { run('renderRunner = function () {}') })

const blank = mt => get('_blankTableRow')({ metricType: mt })
const mk = (mt, rows, extra = {}) => ({ name: 'Ex', type: 'strength', metricType: mt, sets_json: [{}], tableRows: rows, loggedSets: [], ...extra })
const setRunner = exs => { ctx.__exs = exs; run('_runner = { exercises: __exs, exIdx: 0 }') }

describe('the tick-time rule applies when the live table is read back', () => {
  test('reps cleared on a ticked weight_reps row: the set no longer counts and is un-ticked', () => {
    const ex = mk('weight_reps', [{ ...blank('weight_reps'), done: true, weight: '100', reps: '' }])
    get('_syncLoggedSetsFromTable')(ex)
    assert.equal(ex.loggedSets.length, 0, 'was saved as a weight with no reps')
    assert.equal(ex.tableRows[0].done, false, 'the table must stop claiming it is done')
  })

  test('weight cleared (not a bodyweight exercise): the set no longer counts', () => {
    const ex = mk('weight_reps', [{ ...blank('weight_reps'), done: true, weight: '', reps: '5' }])
    get('_syncLoggedSetsFromTable')(ex)
    assert.equal(ex.loggedSets.length, 0)
  })

  test('weight cleared on a BODYWEIGHT exercise: still counts (BW rows carry no weight)', () => {
    const ex = mk('weight_reps', [{ ...blank('weight_reps'), done: true, weight: '', reps: '12' }], { bodyweight: true })
    get('_syncLoggedSetsFromTable')(ex)
    assert.equal(ex.loggedSets.length, 1)
    assert.equal(ex.tableRows[0].done, true)
  })

  test('weight AND reps cleared with an effort kept: no effort-only junk row', () => {
    const ex = mk('weight_reps', [{ ...blank('weight_reps'), done: true, weight: '', reps: '', effort: '8' }])
    get('_syncLoggedSetsFromTable')(ex)
    assert.equal(ex.loggedSets.length, 0, 'the effort alone used to carry the row past the "has real data" filter')
  })

  test('a complete row is untouched — including a real 0 kg weight', () => {
    const ex = mk('weight_reps', [
      { ...blank('weight_reps'), done: true, weight: '100', reps: '5' },
      { ...blank('weight_reps'), done: true, weight: '0', reps: '5' }
    ])
    get('_syncLoggedSetsFromTable')(ex)
    assert.equal(ex.loggedSets.length, 2)
    assert.equal(ex.loggedSets[1].weight, '0', '0 is a real value, not a missing one')
  })

  test('the other metric types follow their own tick-time rule', () => {
    const uni = mk('unilateral', [{ ...blank('unilateral'), done: true, leftReps: '', rightReps: '' }])
    const hold = mk('timed_hold', [{ ...blank('timed_hold'), done: true, duration: '0:00' }])
    const jh = mk('jump_height', [{ ...blank('jump_height'), done: true, height_cm: '' }])
    const jd = mk('jump_distance', [{ ...blank('jump_distance'), done: true, distance_m: '' }])
    for (const ex of [uni, hold, jh, jd]) { get('_syncLoggedSetsFromTable')(ex); assert.equal(ex.loggedSets.length, 0, ex.metricType) }
    const okUni = mk('unilateral', [{ ...blank('unilateral'), done: true, leftReps: '8', rightReps: '' }])
    get('_syncLoggedSetsFromTable')(okUni)
    assert.equal(okUni.loggedSets.length, 1, 'one side logged is enough, as at tick time')
  })

  test('the finish screen and the save read the SAME set count (both go through _loggedExercises)', () => {
    const ex = mk('weight_reps', [
      { ...blank('weight_reps'), done: true, weight: '100', reps: '5' },
      { ...blank('weight_reps'), done: true, weight: '', reps: '', effort: '' }     // ticked, then fully cleared
    ])
    setRunner([ex])
    const out = get('_loggedExercises')()
    assert.equal(out.length, 1)
    assert.equal(out[0].loggedSets.length, 1, 'was 2 on the finish screen and 1 in the save')
  })
})

describe('toggleTableSet still refuses an incomplete row (the shared predicate did not loosen the tick)', () => {
  test('refuses to tick a row with no reps, and says what is missing', () => {
    const ex = mk('weight_reps', [{ ...blank('weight_reps'), weight: '100', reps: '' }])
    setRunner([ex])
    get('toggleTableSet')(0)
    assert.equal(ex.tableRows[0].done, false)
  })
  test('_rowIncompleteReason names what is missing', () => {
    const f = get('_rowIncompleteReason')
    assert.equal(f(mk('weight_reps', []), { weight: '100', reps: '' }), 'Enter reps first')
    assert.equal(f(mk('weight_reps', []), { weight: '', reps: '5' }), 'Enter weight first')
    assert.equal(f(mk('weight_reps', []), { weight: '100', reps: '5' }), null)
    assert.equal(f(mk('timed_hold', []), { duration: '0:00' }), 'Enter a duration first')
  })
})
