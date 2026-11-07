// Merging lift names (docs/superpowers/plans/2026-11-01-merge-lift-names.md, Task 2): the pure parts.
// `_liftNameSuggestions` finds names that are probably one lift; `_canonLiftName` follows a person's recorded merges so NEW logging lands under the kept name.
// The fixture is Jake's real list (names and session counts read from his history on 2026-11-02), because the point is that it finds HIS pairs and none of his non-pairs.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const json = (v) => JSON.parse(JSON.stringify(v))
const L = (name, count) => ({ name, count })
const JAKE = [
  L('Barbell hold', 1), L('Barbell Hold', 1), L('Depth jump', 2), L('Depth Jump', 6), L('Trap bar jump', 1), L('Trap Bar Jump', 1),
  L('Barbell Deadlft', 1), L('Barbell Deadlift', 4), L('Deadlift', 6), L('Back Squat', 8), L('Barbell Back Squat', 2),
  L('Deadstop Barbell Row', 8), L('Dead-Stop Barbell Row', 2), L('Barbell Row', 2),
  L('Close Grip Lat Pulldown', 4), L('Close Grip Pulldown', 3), L('Close Grip Pull Down', 1),
  L('Cross Body Tricep Cable Extension', 1), L('Cross-body tricep cable extension', 3),
  L('Bench Press', 17), L('Barbell Bench Press', 9), L('Dumbbell Lu Raise', 10), L('Seated Dumbbell Lu Raise', 3),
  L('Military Press', 15), L('Barbell Military Press', 10), L('Seated Military Press', 1), L('Pull Up', 13), L('Neutral Grip Pull Up', 2), L('Tricep Dip', 17),
]

describe('_liftNameSuggestions', () => {
  const sug = (names) => json(get('_liftNameSuggestions')(names))
  const setOf = (s) => s.names.map(n => n.name).sort()

  test('names that differ only by capitals, spaces or hyphens are one "same lift" group, and the most used spelling is the suggested keeper', () => {
    const same = sug(JAKE).filter(s => s.kind === 'same')
    const g = (a) => same.find(s => setOf(s).includes(a))
    assert.deepEqual(setOf(g('Depth jump')), ['Depth Jump', 'Depth jump'])
    assert.equal(g('Depth jump').keep, 'Depth Jump', 'six sessions beat two')
    assert.deepEqual(setOf(g('Barbell hold')), ['Barbell Hold', 'Barbell hold'])
    assert.deepEqual(setOf(g('Trap bar jump')), ['Trap Bar Jump', 'Trap bar jump'])
    assert.deepEqual(setOf(g('Dead-Stop Barbell Row')), ['Dead-Stop Barbell Row', 'Deadstop Barbell Row'])
    assert.equal(g('Dead-Stop Barbell Row').keep, 'Deadstop Barbell Row')
    assert.deepEqual(setOf(g('Close Grip Pull Down')), ['Close Grip Pull Down', 'Close Grip Pulldown'], 'the spacing pair; "Lat" is a different word, so that one is for Jake to decide')
    assert.deepEqual(setOf(g('Cross-body tricep cable extension')), ['Cross Body Tricep Cable Extension', 'Cross-body tricep cable extension'])
    assert.equal(g('Cross-body tricep cable extension').keep, 'Cross-body tricep cable extension', 'three sessions beat one')
  })

  test('"maybe" pairs are flagged separately and never as "same": a typo one edit away, or one name inside another', () => {
    const maybe = sug(JAKE).filter(s => s.kind === 'maybe')
    const has = (a, b) => maybe.some(s => setOf(s).includes(a) && setOf(s).includes(b))
    assert.ok(has('Barbell Deadlft', 'Barbell Deadlift'), 'the typo')
    assert.ok(has('Back Squat', 'Barbell Back Squat'))
    assert.ok(has('Bench Press', 'Barbell Bench Press'))
    assert.ok(has('Deadlift', 'Barbell Deadlift'))
    assert.ok(has('Military Press', 'Barbell Military Press'))
    assert.ok(!sug(JAKE).some(s => s.kind === 'same' && setOf(s).includes('Back Squat')), 'Back Squat / Barbell Back Squat is never offered as "same lift"')
  })

  test('every suggestion names at least two different lifts, the keeper is one of them, and a lone lift is never suggested', () => {
    for (const s of sug(JAKE)) {
      assert.ok(s.names.length >= 2, JSON.stringify(s))
      assert.ok(s.names.some(n => n.name === s.keep), JSON.stringify(s))
    }
    assert.ok(!sug(JAKE).some(s => setOf(s).includes('Tricep Dip')), 'Tricep Dip has no look-alike')
  })

  test('different lifts that share words are not "same": Seated vs standing, Neutral Grip vs plain', () => {
    const same = sug(JAKE).filter(s => s.kind === 'same')
    assert.ok(!same.some(s => setOf(s).includes('Seated Dumbbell Lu Raise')))
    assert.ok(!same.some(s => setOf(s).includes('Neutral Grip Pull Up')))
    assert.ok(!same.some(s => setOf(s).includes('Seated Military Press')))
  })

  test('empty, one name, or null gives no suggestions; blank names are ignored', () => {
    assert.deepEqual(sug([]), [])
    assert.deepEqual(sug(null), [])
    assert.deepEqual(sug([L('Squat', 3)]), [])
    assert.deepEqual(sug([L('', 2), L('   ', 1), L('Squat', 3)]), [])
  })

  test('the same name twice (two rows) is one lift, not a suggestion', () => {
    assert.deepEqual(sug([L('Squat', 3), L('Squat', 2)]), [])
  })
})

describe('_canonLiftName', () => {
  const canon = get('_canonLiftName')
  const merges = [{ from_name: 'Back Squat', to_name: 'Barbell Back Squat' }, { from_name: 'Chain A', to_name: 'Chain C' }, { from_name: 'Chain B', to_name: 'Chain C' }]

  test('a merged-away name becomes the kept name; any other name is unchanged', () => {
    assert.equal(canon('Back Squat', merges), 'Barbell Back Squat')
    assert.equal(canon('Bench Press', merges), 'Bench Press')
  })

  test('ignoring capitals and edge spaces, so a typed variation still lands on the kept name', () => {
    assert.equal(canon('  back squat ', merges), 'Barbell Back Squat')
    assert.equal(canon('BACK SQUAT', merges), 'Barbell Back Squat')
  })

  test('follows a chain, and stops on a loop instead of spinning', () => {
    assert.equal(canon('Chain A', [{ from_name: 'Chain A', to_name: 'Chain B' }, { from_name: 'Chain B', to_name: 'Chain C' }]), 'Chain C')
    const loop = [{ from_name: 'X', to_name: 'Y' }, { from_name: 'Y', to_name: 'X' }]
    assert.equal(typeof canon('X', loop), 'string')
  })

  test('a record pointing at its own spelling (case-only merge) returns the kept spelling', () => {
    assert.equal(canon('depth jump', [{ from_name: 'Depth jump', to_name: 'Depth Jump' }]), 'Depth Jump')
  })

  test('no merges, null merges, empty and null names are safe', () => {
    assert.equal(canon('Squat', []), 'Squat')
    assert.equal(canon('Squat', null), 'Squat')
    assert.equal(canon('', merges), '')
    assert.equal(canon(null, merges), null)
    assert.equal(canon(undefined, merges), undefined)
  })
})
