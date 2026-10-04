// The program page rework (Jake, 2026-10-04: "UI of this page needs to be improved (much like we have just done with the
// dashboard)"): an overview first (phases, weeks, sessions a week, a bar with one block per phase), each phase a fold-up card.
// These are the pure parts - the words and the colour a phase gets. The page itself is covered by the browser spec.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { get, REPO } from './load-app.mjs'

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
const openState = (programId, ph, current) => JSON.parse(JSON.stringify(get('_pgmOpenState')(programId, ph, current)))
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

describe('_pgmOpenState - the phase the plan is in opens first', () => {
  test('a first visit opens the current phase, and only that one', () => {
    reset()
    assert.deepEqual(openState('p1', phases('a', 'b', 'c'), 'b'), { b: true })
  })

  test('a current phase the page does not have, or none at all, falls back to the first', () => {
    reset()
    assert.deepEqual(openState('p1', phases('a', 'b', 'c'), 'zzz'), { a: true })
    reset()
    assert.deepEqual(openState('p1', phases('a', 'b', 'c'), null), { a: true })
    reset()
    assert.deepEqual(openState('p1', phases('a', 'b', 'c'), undefined), { a: true })
  })

  test('what you opened or folded afterwards is kept, even when a current phase is given again', () => {
    reset()
    const open = get('_pgmOpenState')('p1', phases('a', 'b', 'c'), 'b')
    open.b = false; open.c = true
    assert.deepEqual(openState('p1', phases('a', 'b', 'c'), 'b'), { b: false, c: true })
  })

  test('a phase added later starts folded even if it is the current one - only a page seen for the first time opens it', () => {
    reset()
    get('_pgmOpenState')('p1', phases('a', 'b'), 'a')
    assert.deepEqual(openState('p1', phases('a', 'b', 'c'), 'c'), { a: true })
  })

  test('the first phase of an empty program still opens, current phase or not', () => {
    reset()
    assert.deepEqual(openState('p1', [], null), {})
    assert.deepEqual(openState('p1', phases('a'), null), { a: true })
  })
})

describe('_programPhaseAt - the phase a plan is in: ONE rule for the dashboard tile and the program page', () => {
  const ph = [
    { id: 'a', name: 'A', duration_weeks: 2, order_index: 0 },
    { id: 'b', name: 'B', duration_weeks: 3, order_index: 1 },
    { id: 'c', name: 'C', duration_weeks: 1, order_index: 2 }
  ]
  const at = (start, today, phases = ph) => get('_programPhaseAt')(phases, start, today)?.id ?? null
  // Program weeks run Monday to Sunday from the Monday of the start week: 2026-09-07 is week 1, 09-14 week 2, 09-21 week 3, 09-28 week 4,
  // 10-05 week 5, 10-12 week 6.

  test('the weeks of each phase add up in order', () => {
    assert.equal(at('2026-09-07', '2026-09-07'), 'a', 'the first Monday')
    assert.equal(at('2026-09-07', '2026-09-20'), 'a', 'the Sunday that ends week 2')
    assert.equal(at('2026-09-07', '2026-09-21'), 'b', 'the Monday that starts week 3')
    assert.equal(at('2026-09-07', '2026-10-11'), 'b', 'the Sunday that ends week 5')
    assert.equal(at('2026-09-07', '2026-10-12'), 'c', 'week 6')
  })

  test('a start in mid-week counts from that week\'s Monday, like the calendar', () => {
    assert.equal(at('2026-09-10', '2026-09-20'), 'a', 'started on a Thursday, still week 2 on the Sunday')
    assert.equal(at('2026-09-10', '2026-09-21'), 'b')
  })

  test('before the start it is the first phase, after the end the last (what the dashboard tile has always said)', () => {
    assert.equal(at('2026-11-02', '2026-10-03'), 'a')
    assert.equal(at('2026-09-07', '2026-10-19'), 'c')
    assert.equal(at('2025-01-06', '2026-10-03'), 'c')
  })

  test('phases given out of order are put in order first; none at all is null', () => {
    assert.equal(at('2026-09-07', '2026-09-21', [ph[2], ph[0], ph[1]]), 'b')
    assert.equal(at('2026-09-07', '2026-09-21', []), null)
    assert.equal(at('2026-09-07', '2026-09-21', null), null)
  })

  test('no start date, or one that cannot be read, is week 1', () => {
    assert.equal(at(null, '2026-10-03'), 'a')
    assert.equal(at('not a date', '2026-10-03'), 'a')
  })

  test('the dashboard tile says the same phase on every day of a whole run, for several start days', () => {
    const info = get('_dashProgramInfo')
    const days = []
    for (let d = new Date('2026-09-01T00:00:00'); d <= new Date('2026-11-10T00:00:00'); d.setDate(d.getDate() + 1)) days.push(d.toISOString().slice(0, 10))
    for (const start of ['2026-09-07', '2026-09-10', '2026-09-13', '2026-10-20']) {
      for (const today of days) {
        const tile = info({ start_date: start, programs: { name: 'X', program_phases: ph } }, today)
        assert.equal(at(start, today), ph.find(p => p.name === tile.phase).id, 'start ' + start + ', today ' + today)
      }
    }
  })
})

describe('_pgmCurrentPhaseId - the phase the viewer is IN right now, or null', () => {
  const ph = [
    { id: 'a', duration_weeks: 2, order_index: 0 },
    { id: 'b', duration_weeks: 3, order_index: 1 },
    { id: 'c', duration_weeks: 1, order_index: 2 }
  ]
  const cur = (mine, today) => get('_pgmCurrentPhaseId')(ph, mine, today)
  const plan = start => ({ start_date: start })

  test('a plan that is running names its phase', () => {
    assert.equal(cur(plan('2026-09-07'), '2026-09-07'), 'a')
    assert.equal(cur(plan('2026-09-07'), '2026-09-22'), 'b')
    assert.equal(cur(plan('2026-09-07'), '2026-10-14'), 'c', 'the last week is still running')
  })

  test('a start later in the SAME Monday-to-Sunday week already counts: the calendar places week 1 on that Monday', () => {
    assert.equal(cur(plan('2026-10-02'), '2026-09-29'), 'a', 'started on the Friday, asked on the Tuesday of that week')
  })

  test('a plan that has not started is null, and so is one that has finished', () => {
    assert.equal(cur(plan('2026-11-02'), '2026-10-03'), null, 'a start next month')
    assert.equal(cur(plan('2026-10-08'), '2026-10-03'), null, 'a start in the next Monday-to-Sunday week')
    assert.equal(cur(plan('2026-09-07'), '2026-10-19'), null, 'six weeks are over')
    assert.equal(cur(plan('2025-01-06'), '2026-10-03'), null)
  })

  test('not following this program, or nothing usable to go on, is null - never a throw', () => {
    assert.equal(cur(null, '2026-10-03'), null)
    assert.equal(cur(undefined, '2026-10-03'), null)
    assert.equal(cur({ error: { message: 'boom' } }, '2026-10-03'), null, 'a failed lookup')
    assert.equal(cur({ error: { message: 'boom' }, start_date: '2026-09-07' }, '2026-09-10'), null, 'an error always wins, even beside a date')
    assert.equal(cur({ start_date: null }, '2026-10-03'), null)
    assert.equal(cur({ start_date: 'soon' }, '2026-10-03'), null)
    assert.equal(cur(plan('2026-09-07'), null), null)
    assert.equal(get('_pgmCurrentPhaseId')([], plan('2026-09-07'), '2026-09-10'), null)
    assert.equal(get('_pgmCurrentPhaseId')(null, plan('2026-09-07'), '2026-09-10'), null)
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

// openProgram reads the program and the viewer's own plan in ONE await (Promise.all), then sets the page globals and paints. A second await
// between the two would let a quick second visit set window._openProgramId / _openProgramPhases / _pgmNowId under this visit's paint, so
// the page on screen and the state its buttons read would disagree. Source scanner (the page itself is the browser spec's job).
describe('openProgram - setting the page globals and painting the page is one synchronous step', () => {
  // The text between the first `from` marker and the next `to` marker after it that contains an await, or '' when there is none.
  const awaitBetween = (body, from, to) => {
    const a = body.indexOf(from)
    const b = a < 0 ? -1 : body.indexOf(to, a)
    if (a < 0 || b < 0) throw new Error(`markers not found: ${a < 0 ? from : to}`)
    const between = body.slice(a, b)
    return /\bawait\b/.test(between) ? between : ''
  }

  test('the scanner sees an await between two markers when there is one, and none when there is not', () => {
    assert.notEqual(awaitBetween('A; await x; B', 'A', 'B'), '')
    assert.equal(awaitBetween('A; x(); B; await y', 'A', 'B'), '')
    assert.throws(() => awaitBetween('A; B', 'Z', 'B'), /markers not found/)
  })

  test('no await sits between window._openProgramId = ... and the page being painted', () => {
    const src = readFileSync(join(REPO, 'js/app-programs.js'), 'utf8')
    const start = src.indexOf('async function openProgram(')
    assert.ok(start > 0, 'openProgram found')
    const body = src.slice(start, src.indexOf('\n}\n', start))
    assert.equal(awaitBetween(body, 'window._openProgramId = programId', 'el.innerHTML = `'), '', 'an await between the globals and the paint')
    assert.equal(awaitBetween(body, 'window._pgmNowId = ', 'el.innerHTML = `'), '', 'an await between the current phase and the paint')
  })
})
