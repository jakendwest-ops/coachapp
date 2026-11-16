// Supersets in the logger (Step D, docs/superpowers/plans/2026-11-15-workout-builder-speed.md; Jake's option 1: one exercise at a time).
//
// Tick A1 -> A1's rest -> the screen moves to A2 -> tick -> A2's rest -> A3 or back to A1, every round. These pin the pure rules: who is in
// a superset, where the screen goes after a tick, what the header says, and the 0:00 rest. tests/superset-runner-2026-11-16.spec.js drives
// the real runner.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const plain = v => JSON.parse(JSON.stringify(v))
const members = (xs, i) => plain(get('_rnSsMembers')(xs, i))
const next = get('_rnSsNext')
const info = (xs, i) => plain(get('_rnSsInfo')(xs, i))
const rest = get('_rnSsRest')

// A table exercise with n sets, the first d of them ticked.
const E = (name, g, n = 3, d = 0, o = {}) => ({ name, supersetGroup: g, metricType: 'weight_reps', type: 'strength', targetSets: n, loggedSets: [], tableRows: Array.from({ length: n }, (_, x) => ({ done: x < d })), restSecs: 90, sets_json: [], ...o })

describe('who is in a superset', () => {
  test('two or more exercises with the same letter, in list order; case and spaces do not matter', () => {
    const xs = [E('Bench', null), E('Row', 'a'), E('Fly', ' A '), E('Curl', 'B')]
    assert.deepEqual(members(xs, 1), [1, 2])
    assert.deepEqual(members(xs, 0), [])
    assert.deepEqual(members(xs, 3), [], 'a letter on one exercise is not a superset (the builder\'s rule)')
  })
  test('an interval or cardio exercise is done on its own, never part of the rounds', () => {
    const xs = [E('Row', 'A'), E('Bike', 'A', 1, 0, { metricType: 'interval', type: 'cardio' })]
    assert.deepEqual(members(xs, 0), [])
  })
})

describe('where the screen goes after a tick', () => {
  test('A1 -> A2 -> A3 -> back to A1', () => {
    const xs = [E('A', 'A', 3, 1), E('B', 'A', 3, 0), E('C', 'A', 3, 0)]
    assert.equal(next(xs, 0), 1)
    assert.equal(next(xs, 1), 2)
    assert.equal(next(xs, 2), 0)
  })
  test('a member with every set done is passed over; when no OTHER member has a set left the screen stays (-1)', () => {
    const xs = [E('A', 'A', 4, 3), E('B', 'A', 3, 3)]
    assert.equal(next(xs, 0), -1, 'round 4 is A1 alone')
    assert.equal(next([E('A', 'A', 3, 3), E('B', 'A', 3, 3)], 1), -1, 'all done')
  })
  test('not in a superset: -1, the old behaviour', () => {
    assert.equal(next([E('A', null, 3, 1), E('B', null)], 0), -1)
  })
  test('a member not opened yet (no table) counts its logged sets', () => {
    const xs = [E('A', 'A', 3, 1), { ...E('B', 'A', 3, 0), tableRows: undefined }]
    assert.equal(next(xs, 0), 1)
  })
})

describe('what the header says', () => {
  test('the tag is the position in the superset, the round is this exercise\'s next set', () => {
    const xs = [E('Bench', null), E('A', 'A', 3, 1), E('B', 'A', 3, 0)]
    assert.deepEqual(info(xs, 1), { tag: 'A1', line: 'Superset A · round 2 of 3' })
    assert.deepEqual(info(xs, 2), { tag: 'A2', line: 'Superset A · round 1 of 3' })
    assert.deepEqual(info([E('A', 'A', 3, 3), E('B', 'A')], 0), { tag: 'A1', line: 'Superset A · done' })
    assert.equal(info(xs, 0), null)
  })
})

describe('the rest before moving on', () => {
  test('a rest written as 0:00 (or 0) moves on at once; blank still means 90 s; otherwise the exercise\'s own rest', () => {
    assert.equal(rest(E('A', 'A', 3, 0, { sets_json: [{ restMin: '0:00' }], restSecs: 90 })), 0)
    assert.equal(rest(E('A', 'A', 3, 0, { sets_json: [{ restMin: '0' }], restSecs: 90 })), 0)
    assert.equal(rest(E('A', 'A', 3, 0, { sets_json: [{ restMin: '' }], restSecs: 90 })), 90)
    assert.equal(rest(E('A', 'A', 3, 0, { sets_json: [{ restMin: '1:30' }], restSecs: 90 })), 90)
    assert.equal(rest(E('A', 'A', 3, 0, { sets_json: [{ restMin: '2:00' }], restSecs: 120 })), 120)
  })
})
