// Saved 1RMs (client_1rms) are append-only: one dated row per test. Two different questions are asked of them, and they have different answers:
//   - the PERSONAL BEST is the highest row ever saved (docs/bugs/2026-11-17-personal-best-shows-latest-1rm-not-highest.md);
//   - the CURRENT 1RM, which % of 1RM sets are worked out from, is the newest row (docs/bugs/2026-11-17-runner-reads-saved-1rms-in-no-order.md).
// A lower re-test after an injury must change the training weights, but must not erase the best.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const r = (id, kg, date, extra = {}) => ({ id, exercise_name: 'Back Squat', exercise_id: null, one_rm_kg: kg, recorded_at: date, ...extra })

describe('_pbBestOf: the best, the best before it, and the latest, from one lift\'s rows newest first', () => {
  const pick = rows => get('_pbBestOf')(rows)

  test('a lower re-test does not replace the best', () => {
    const p = pick([r('c', 140, '2026-09-08'), r('b', 160, '2026-08-01'), r('a', 150, '2026-07-01')])
    assert.equal(p.best.id, 'b', 'the best is the highest, 160')
    assert.equal(p.prev.id, 'a', 'the best before it is 150')
    assert.equal(p.latest.id, 'c', 'the latest is still the 140')
  })

  test('a new best is both the best and the latest', () => {
    const p = pick([r('b', 160, '2026-09-08'), r('a', 150, '2026-07-01')])
    assert.equal(p.best.id, 'b')
    assert.equal(p.latest.id, 'b')
    assert.equal(p.prev.id, 'a')
  })

  test('a tie goes to the newer row, and the older one is what it was', () => {
    const p = pick([r('c', 160, '2026-09-08'), r('b', 160, '2026-08-01'), r('a', 150, '2026-07-01')])
    assert.equal(p.best.id, 'c')
    assert.equal(p.prev.id, 'b', 'the equal older row is "was", so no gain is claimed')
  })

  test('the values are compared as numbers, not text ("95" is not above "160")', () => {
    const p = pick([r('b', '95', '2026-09-08'), r('a', '160', '2026-07-01')])
    assert.equal(p.best.id, 'a')
  })

  test('one row, and none', () => {
    const one = pick([r('a', 150, '2026-07-01')])
    assert.equal(one.best.id, 'a'); assert.equal(one.latest.id, 'a'); assert.equal(one.prev, null)
    // JSON, not deepEqual: the result is built inside the app's vm context, whose Object.prototype is not this file's.
    assert.equal(JSON.stringify(pick([])), JSON.stringify({ best: null, prev: null, latest: null }))
    assert.equal(JSON.stringify(pick(null)), JSON.stringify({ best: null, prev: null, latest: null }))
  })
})

describe('_oneRMLookup: the runner\'s % of 1RM source is the NEWEST row per lift, whatever order the rows arrive in', () => {
  const look = rows => get('_oneRMLookup')(rows)
  const rows = [
    r('new', 140, '2026-09-08', { exercise_id: 'ex-sq' }),
    r('old', 160, '2026-08-01', { exercise_id: 'ex-sq' }),
    r('oldest', 150, '2026-07-01', { exercise_id: null }),
    { id: 'dl', exercise_name: ' Deadlift ', exercise_id: null, one_rm_kg: '200', recorded_at: '2026-07-01' }
  ]

  test('every order of the rows gives the newest', () => {
    const orders = [rows, [...rows].reverse(), [rows[1], rows[3], rows[0], rows[2]], [rows[2], rows[0], rows[3], rows[1]]]
    for (const o of orders) {
      const m = look(o)
      assert.equal(m.byId['ex-sq'], 140, 'by id: the 8 Sep row')
      assert.equal(m.byName['back squat'], 140, 'by name: the 8 Sep row, not the 1 Aug or 1 Jul one')
      assert.equal(m.byName.deadlift, 200, 'names are trimmed and lower-cased, values are numbers')
    }
  })

  test('the same day: the row saved later (larger created_at) wins', () => {
    const same = [
      r('a', 150, '2026-09-08', { created_at: '2026-09-08T10:00:00Z' }),
      r('b', 155, '2026-09-08', { created_at: '2026-09-08T18:00:00Z' })
    ]
    assert.equal(look(same).byName['back squat'], 155)
    assert.equal(look([...same].reverse()).byName['back squat'], 155)
  })

  test('no rows', () => {
    assert.equal(JSON.stringify(look(null)), JSON.stringify({ byName: {}, byId: {} }))
  })
})
