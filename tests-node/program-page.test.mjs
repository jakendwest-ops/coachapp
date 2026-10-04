// The program page rework (Jake, 2026-10-04: "UI of this page needs to be improved (much like we have just done with the
// dashboard)"): an overview first (phases, weeks, sessions a week, a bar with one block per phase), each phase a fold-up card.
// These are the pure parts - the words and the colour a phase gets. The page itself is covered by the browser spec.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const sessions = counts => get('_pgmSessionsLabel')(counts)
const method = ph => get('_pgmPhaseMethod')(ph)

describe('_pgmSessionsLabel - "4 sessions a week" for the overview and a phase card', () => {
  test('one number when every phase agrees, a range when they differ', () => {
    assert.equal(sessions([4]), '4 sessions a week')
    assert.equal(sessions([4, 4, 4]), '4 sessions a week')
    assert.equal(sessions([3, 5, 4]), '3–5 sessions a week')
    assert.equal(sessions([2, 3]), '2–3 sessions a week')
  })

  test('one session is singular, and a range ending in 1 cannot happen with a larger number', () => {
    assert.equal(sessions([1]), '1 session a week')
    assert.equal(sessions([1, 1]), '1 session a week')
    assert.equal(sessions([1, 3]), '1–3 sessions a week')
  })

  test('phases with no session yet are ignored, and nothing at all gives nothing to say', () => {
    assert.equal(sessions([0, 4, 0]), '4 sessions a week')
    assert.equal(sessions([0, 0]), '')
    assert.equal(sessions([]), '')
    assert.equal(sessions(undefined), '')
    assert.equal(sessions(null), '')
  })

  test('anything that is not a count is ignored rather than printed', () => {
    assert.equal(sessions([NaN, undefined, null, '4', 3]), '3 sessions a week')
    assert.equal(sessions([Infinity, -2]), '')
  })
})

describe('_pgmSessionsText - the phrase on a phase card', () => {
  const text = n => get('_pgmSessionsText')(n)

  test('nothing until the sessions have been read, then "no sessions yet" or the count', () => {
    assert.equal(text(undefined), '')
    assert.equal(text(null), '')
    assert.equal(text(0), ' · no sessions yet', 'a phase that was read and has none is NOT the same as one not read yet')
    assert.equal(text(1), ' · 1 session a week')
    assert.equal(text(4), ' · 4 sessions a week')
  })
})

// Which phase cards are open. window is the sandbox global, so the state a page would keep can be reset and read here.
const phases = (...ids) => ids.map(id => ({ id }))
const openState = (programId, ph) => JSON.parse(JSON.stringify(get('_pgmOpenState')(programId, ph)))
const reset = () => { get('window')._pgmOpen = undefined }

describe('_pgmOpenState - which phase cards start open and stay open', () => {
  test('a program seen for the first time opens just its first phase', () => {
    reset()
    assert.deepEqual(openState('p1', phases('a', 'b', 'c')), { a: true })
  })

  test('what you opened stays open when the page repaints, and what you folded stays folded', () => {
    reset()
    const open = get('_pgmOpenState')('p1', phases('a', 'b', 'c'))
    open.b = true; open.a = false
    assert.deepEqual(openState('p1', phases('a', 'b', 'c')), { a: false, b: true })
  })

  test('a phase added to a program that already has some starts folded', () => {
    reset()
    get('_pgmOpenState')('p1', phases('a', 'b'))
    assert.deepEqual(openState('p1', phases('a', 'b', 'c')), { a: true })
  })

  test('the FIRST phase of an empty program opens - the coach has nothing else to look at', () => {
    reset()
    assert.deepEqual(openState('p1', []), {})
    assert.deepEqual(openState('p1', phases('a')), { a: true })
  })

  test('after every phase has been removed, the next one added opens', () => {
    reset()
    get('_pgmOpenState')('p1', phases('a', 'b'))
    assert.deepEqual(openState('p1', []), { a: true }, 'nothing to show, the old flags are harmless')
    assert.deepEqual(openState('p1', phases('z')), { a: true, z: true })
  })

  test('another program starts again with its own first phase only', () => {
    reset()
    const open = get('_pgmOpenState')('p1', phases('a', 'b'))
    open.b = true
    assert.deepEqual(openState('p2', phases('x', 'y')), { x: true })
    assert.deepEqual(openState('p1', phases('a', 'b')), { a: true }, 'and going back to the first one starts it again too')
  })
})

describe('_pgmPhaseMethod - which colour a phase wears', () => {
  test('no periodization is "none", whatever else is left in the config', () => {
    assert.equal(method({ periodization_type: null, periodization_config: null }), 'none')
    assert.equal(method({ periodization_type: '', periodization_config: { basis: 'rpe' } }), 'none')
    assert.equal(method({}), 'none')
    assert.equal(method(undefined), 'none')
    assert.equal(method(null), 'none')
  })

  test('a periodised phase is % unless its config says rpe', () => {
    assert.equal(method({ periodization_type: 'linear', periodization_config: { startPct: 65, endPct: 85 } }), 'pct')
    assert.equal(method({ periodization_type: 'undulating', periodization_config: null }), 'pct')
    assert.equal(method({ periodization_type: 'linear', periodization_config: { basis: 'rpe', startRpe: 7, endRpe: 9 } }), 'rpe')
    assert.equal(method({ periodization_type: 'undulating', periodization_config: { basis: 'rpe', tiers: {} } }), 'rpe')
    assert.equal(method({ periodization_type: 'linear', periodization_config: { basis: 'something else' } }), 'pct')
  })
})
