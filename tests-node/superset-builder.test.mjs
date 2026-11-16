// Supersets in the builder (Step C, docs/superpowers/plans/2026-11-15-workout-builder-speed.md).
//
// The data is unchanged (a superset_group letter per row); the letter is now chosen for the coach, never typed. These pin the pure rules:
// the A1/A2 tags, the next free letter, a superset moving as one block, Sets staying in step, and Remove from superset.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const plain = v => JSON.parse(JSON.stringify(v))   // arrays made inside the app's vm context are not host-realm Arrays
const labels = rows => plain(get('_ssLabels')(rows))
const nextLetter = get('_ssNextLetter')
const moveBlock = (rows, i, dir) => { const r = get('_ssMoveBlock')(rows, i, dir); return r && plain(r).map(x => x.k) }
const sync = get('_ssSyncSetCount')
const leave = (rows, key) => plain(get('_ssLeave')(rows, key))
const canGrow = get('_ssCanGrow')

const R = (k, g = null, o = {}) => ({ _draftKey: k, k, exercise_name: k, metric_type: 'weight_reps', superset_group: g, sets_json: [{ repsMin: '8' }, { repsMin: '8' }, { repsMin: '8' }], sets: 3, ...o })

describe('the tags', () => {
  test('members are numbered by position: A1, A2, A3; a second superset is B1, B2', () => {
    assert.deepEqual(labels([R('a', 'A'), R('b', 'A'), R('c'), R('d', 'B'), R('e', 'B'), R('f', 'A')]), ['A1', 'A2', '', 'B1', 'B2', 'A3'])
  })
  test('a letter on ONE row is not a superset (a legacy typed letter, or a partner removed): no tag', () => {
    assert.deepEqual(labels([R('a', 'C'), R('b')]), ['', ''])
  })
  test('legacy typed letters still count: lower case and spaces read as the same group', () => {
    assert.deepEqual(labels([R('a', 'a'), R('b', ' A ')]), ['A1', 'A2'])
  })
})

describe('the letter is chosen for you', () => {
  test('the first letter no row uses', () => {
    assert.equal(nextLetter([]), 'A')
    assert.equal(nextLetter([R('a', 'A'), R('b', 'A'), R('c', 'C')]), 'B')
  })
  test('a lone legacy letter is still taken, so a new superset never merges into it', () => {
    assert.equal(nextLetter([R('a', 'A')]), 'B')
  })
})

describe('reorder keeps a superset together', () => {
  const rows = () => [R('x'), R('a', 'A'), R('b', 'A'), R('y')]
  test('moving a member moves the whole superset', () => {
    assert.deepEqual(moveBlock(rows(), 2, -1), ['a', 'b', 'x', 'y'])
    assert.deepEqual(moveBlock(rows(), 1, 1), ['x', 'y', 'a', 'b'])
  })
  test('a single exercise jumps the whole superset, never lands inside it', () => {
    assert.deepEqual(moveBlock(rows(), 0, 1), ['a', 'b', 'x', 'y'])
    assert.deepEqual(moveBlock(rows(), 3, -1), ['x', 'y', 'a', 'b'])
  })
  test('at either end there is nowhere to go', () => {
    assert.equal(moveBlock([R('a', 'A'), R('b', 'A'), R('y')], 1, -1), null)
    assert.equal(moveBlock(rows(), 3, 1), null)
  })
})

describe('Sets stay in step', () => {
  test('the other members follow: more sets copy that member\'s last set (never as a top set), fewer drop from the end', () => {
    const rows = [R('a', 'A', { sets_json: [{ isTopSet: true, repsMin: '3' }, { repsMin: '6' }] }), R('b', 'A'), R('c')]
    sync(rows, 'A', 4, 'b')
    assert.deepEqual(plain(rows[0].sets_json), [{ isTopSet: true, repsMin: '3' }, { repsMin: '6' }, { repsMin: '6', isTopSet: false }, { repsMin: '6', isTopSet: false }])
    assert.equal(rows[0].sets, 4)
    assert.equal(rows[1].sets_json.length, 3, 'the member being saved is left as the coach set it')
    assert.equal(rows[2].sets_json.length, 3, 'not in the superset: untouched')
    sync(rows, 'A', 1, 'b')
    assert.deepEqual(plain(rows[0].sets_json), [{ isTopSet: true, repsMin: '3' }])
  })
  test('an interval member is one block, not a list of sets: left alone', () => {
    const rows = [R('a', 'A', { metric_type: 'interval', sets_json: [{ workSecs: 30 }], sets: 1 }), R('b', 'A')]
    sync(rows, 'A', 5, 'b')
    assert.equal(rows[0].sets_json.length, 1)
  })
  test('zero or no sets changes nothing', () => {
    const rows = [R('a', 'A'), R('b', 'A')]
    sync(rows, 'A', 0, 'b')
    assert.equal(rows[0].sets_json.length, 3)
  })
})

describe('Remove from superset', () => {
  test('one of a pair: no superset is left, and it sits just below its old partner', () => {
    const out = leave([R('a', 'A'), R('b', 'A'), R('y')], 'a')
    assert.deepEqual(out.map(r => [r.k, r.superset_group]), [['b', null], ['a', null], ['y', null]])
    assert.deepEqual(out.map(r => r.order_index), [0, 1, 2])
  })
  test('one of three: the other two stay a superset, renumbered, and it goes below them', () => {
    const out = leave([R('a', 'A'), R('b', 'A'), R('c', 'A'), R('y')], 'b')
    assert.deepEqual(out.map(r => r.k), ['a', 'c', 'b', 'y'])
    assert.deepEqual(labels(out), ['A1', 'A2', '', ''])
  })
})

describe('"Add + superset" is offered up to three', () => {
  test('a new exercise, an A2 being added, an existing pair: offered; an A3 being added, a three: not', () => {
    assert.equal(canGrow([], '', false), true)
    assert.equal(canGrow([R('a')], 'A', true), true, 'adding A2 to an exercise with no letter yet')
    assert.equal(canGrow([R('a', 'A'), R('b', 'A')], 'A', false), true)
    assert.equal(canGrow([R('a', 'A'), R('b', 'A')], 'A', true), false, 'this one would be A3')
    assert.equal(canGrow([R('a', 'A'), R('b', 'A'), R('c', 'A')], 'A', false), false)
  })
})

describe('review fixes, 2026-11-16: the set count is never cut by accident', () => {
  const count = get('_ssSetCount')
  const resize = (l, n) => plain(get('_ssResize')(l, n))
  test('an interval or legacy cardio row has no set count (it is one block): it neither sets nor follows', () => {
    assert.equal(count(R('a', 'A', { metric_type: 'interval', sets_json: [{ workSecs: 30 }] })), null)
    assert.equal(count(R('a', 'A', { metric_type: 'cardio' })), null)
    assert.equal(count(R('a', 'A', { sets_json: [{ isTopSet: true }, {}, {}, {}] })), 4, 'a top set counts as a set')
  })
  test('resize keeps the top set, copies the last set for more, and leaves the input alone', () => {
    const src = [{ isTopSet: true, repsMin: '3' }, { repsMin: '6' }]
    assert.deepEqual(resize(src, 3), [{ isTopSet: true, repsMin: '3' }, { repsMin: '6' }, { repsMin: '6', isTopSet: false }])
    assert.equal(src.length, 2)
    assert.deepEqual(resize([], 2), [{ effortType: 'rpe' }, { effortType: 'rpe' }])
  })
})
