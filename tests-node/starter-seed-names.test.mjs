// Starter-content seeding must match existing exercises by NAME, ignoring case and padding (2026-10-01).
//
// _seedStarterContent decides which of the ~40 starter exercises are "missing" by comparing names, and it
// compared them case-SENSITIVELY. A coach who already had "bench press" would be given a second "Bench
// Press" — a duplication path in the same family as the picker and Library ones fixed the same day.
// (It matters doubly if the database ever gets a case-insensitive unique index on exercise names: the
// seeding insert would then fail as a whole instead of skipping the one it already has.)

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

describe('_indexExercisesByName', () => {
  const index = rows => get('_indexExercisesByName')(rows)
  const key = n => get('_exerciseKey')(n)

  test('looks a name up regardless of case or surrounding spaces', () => {
    const m = index([{ name: 'bench press', id: 'a' }, { name: '  Back Squat ', id: 'b' }])
    assert.equal(m.get(key('Bench Press')), 'a')
    assert.equal(m.get(key('BACK SQUAT')), 'b')
  })

  test('with duplicates already present, the FIRST id wins (a later row never replaces it)', () => {
    const m = index([{ name: 'Row', id: 'first' }, { name: 'row', id: 'second' }])
    assert.equal(m.get(key('ROW')), 'first')
  })

  test('tolerates null / empty input', () => {
    assert.equal(index(null).size, 0)
    assert.equal(index([]).size, 0)
    assert.equal(index([{ name: null, id: 'x' }]).size, 1)   // keyed on '' — harmless, never matches a starter name
  })

  test('a name like "constructor" or "__proto__" is just a name, not an object property', () => {
    const m = index([{ name: '__proto__', id: 'p' }, { name: 'constructor', id: 'c' }])
    assert.equal(m.get(key('__proto__')), 'p')
    assert.equal(m.get(key('constructor')), 'c')
  })
})

describe('which starter exercises count as missing', () => {
  const missingFor = rows => {
    const idx = get('_indexExercisesByName')(rows)
    // Spread into a Node-realm array first: an array built by the vm sandbox has the SANDBOX's Array.prototype,
    // so assert.deepEqual against an ordinary [] fails even when the contents match (see pure.test.mjs).
    return [...get('STARTER_EXERCISES')].filter(e => !idx.has(get('_exerciseKey')(e.name))).map(e => e.name)
  }

  test('an empty library is missing every starter exercise', () => {
    assert.equal(missingFor([]).length, get('STARTER_EXERCISES').length)
  })

  // THE regression: the same names in the wrong case used to count as missing and be inserted again.
  test('a library holding every starter name in LOWERCASE is missing none', () => {
    const rows = get('STARTER_EXERCISES').map((e, i) => ({ name: e.name.toLowerCase(), id: 'id' + i }))
    assert.deepEqual(missingFor(rows), [])
  })

  test('padded and upper-cased variants count too', () => {
    const first = get('STARTER_EXERCISES')[0].name
    const rows = [{ name: '  ' + first.toUpperCase() + '  ', id: 'x' }]
    assert.equal(missingFor(rows).includes(first), false)
  })

  test('only the genuinely absent one is reported', () => {
    const all = [...get('STARTER_EXERCISES')]
    const rows = all.slice(1).map((e, i) => ({ name: e.name, id: 'id' + i }))
    assert.deepEqual(missingFor(rows), [all[0].name])
  })
})
