// _neededOneRMsByName — which exercises a programme needs a STORED 1RM for, and which exercise_id
// anchors each one (RPE top-set review, round 2, 2026-10-01).
//
// Two questions that round 1 folded into one: "does this exercise need a stored 1RM?" (a %1RM row
// does, unless it is a 'topSet'-basis row) and "which exercise_id identifies it?" (harvested from
// EVERY slot). Narrowing the first to skip topSet rows silently narrowed the second, so an id that
// only a top-set slot carried was lost and _saveMissingOneRMEntries wrote a name-only client_1rms row.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const needed = phases => get('_neededOneRMsByName')(phases)
const slot = (week_number, exercises) => ({
  week_number,
  workout_templates: { workout_template_exercises: exercises }
})
const phase = (...slots) => [{ program_phase_workouts: slots }]
const ex = (exercise_name, exercise_id, sets_json) => ({ exercise_name, exercise_id, sets_json })

describe('_neededOneRMsByName', () => {
  test('a stored-basis %1RM row needs a 1RM, anchored on its exercise_id', () => {
    const m = needed(phase(slot(1, [ex('Squat', 'sq-1', [{ intensityMin: '75', intensityBasis: 'stored' }])])))
    assert.equal(m.size, 1)
    assert.equal(m.get('Squat'), 'sq-1')
  })

  test('a row with no intensityBasis key (every pre-existing template) still needs one', () => {
    const m = needed(phase(slot(1, [ex('Squat', 'sq-1', [{ intensityMin: '75' }])])))
    assert.equal(m.has('Squat'), true)
  })

  test("an exercise whose ONLY %1RM rows are 'topSet'-basis needs no stored 1RM", () => {
    const m = needed(phase(slot(1, [ex('Bench', 'b-1', [{ isTopSet: true }, { intensityMin: '70', intensityBasis: 'topSet' }])])))
    assert.equal(m.size, 0, 'it resolves against today\'s top set, so asking the coach for a 1RM is wrong')
  })

  // The "guard that stops guarding" check: a topSet row beside a stored-basis row must not hide the
  // stored one. .some() over all rows is what keeps this true.
  test('a topSet row beside a stored-basis row still needs a stored 1RM', () => {
    const m = needed(phase(slot(1, [ex('Squat', 'sq-1', [
      { intensityMin: '70', intensityBasis: 'topSet' },
      { intensityMin: '80', intensityBasis: 'stored' }
    ])])))
    assert.equal(m.has('Squat'), true)
  })

  // THE regression. Day 1: Squat as a top set (library id). Day 3: Squat at a stored %1RM, id null.
  test("an id carried only by a topSet slot still anchors a stored-basis slot's row", () => {
    const m = needed(phase(
      slot(1, [ex('Squat', 'sq-1', [{ isTopSet: true }, { intensityMin: '70', intensityBasis: 'topSet' }])]),
      slot(1, [ex('Squat', null, [{ intensityMin: '80', intensityBasis: 'stored' }])])
    ))
    assert.equal(m.get('Squat'), 'sq-1', 'losing it makes a name-only client_1rms row, which breaks on rename')
  })

  test('first real id wins, and a later NULL never overwrites it', () => {
    const m = needed(phase(
      slot(1, [ex('Squat', 'sq-1', [{ intensityMin: '75' }])]),
      slot(1, [ex('Squat', null, [{ intensityMin: '80' }])])
    ))
    assert.equal(m.get('Squat'), 'sq-1')
  })

  test('a real id still upgrades a null seen earlier', () => {
    const m = needed(phase(
      slot(1, [ex('Squat', null, [{ intensityMin: '75' }])]),
      slot(1, [ex('Squat', 'sq-2', [{ intensityMin: '80' }])])
    ))
    assert.equal(m.get('Squat'), 'sq-2')
  })

  test('only week 1 decides — later weeks reuse the same names', () => {
    const m = needed(phase(slot(2, [ex('Deadlift', 'd-1', [{ intensityMin: '85' }])])))
    assert.equal(m.size, 0)
  })

  test('a missing week_number counts as week 1, and an empty programme is empty', () => {
    assert.equal(needed(phase({ workout_templates: { workout_template_exercises: [ex('Row', 'r-1', [{ intensityMin: '70' }])] } })).has('Row'), true)
    assert.equal(needed(null).size, 0)
    assert.equal(needed([]).size, 0)
  })
})
