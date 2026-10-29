// Which training plan is a client's CURRENT one, and how back-to-back plans land on the calendar
// (docs/bugs/2026-10-29-current-plan-is-picked-by-assignment-order-not-by-date.md).
//
// Until 2026-10-29 every screen took the newest-ASSIGNED plan, so booking a client's next block for a future date made it current at once
// and the block they were running left their calendar. The rule Jake approved: current = the most recently STARTED plan (a plan with no
// start date starts on the day it was assigned), next = the soonest plan starting after today, and with nothing started the soonest
// upcoming plan is current. On dates, each plan owns its days until the next plan's start date (the day it becomes current).
//
// Dates: 2026-10-26 is a Monday; 10-29 a Thursday; 11-02 the next Monday; 11-04 a Wednesday.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const cp = (id, start_date, created_at = '2026-10-01T09:00:00Z', extra = {}) => ({ id, start_date, created_at, ...extra })
const pick = (rows, today = '2026-10-29') => get('_currentAssignment')(rows, today)
const ids = r => ({ current: r.current?.id ?? null, next: r.next?.id ?? null })

describe('_currentAssignment - the current plan is chosen by date, not by when it was assigned', () => {
  test('no assignments: nothing current, nothing next', () => {
    assert.deepEqual(ids(pick([])), { current: null, next: null })
    assert.deepEqual(ids(pick(null)), { current: null, next: null })
  })

  test('one running plan is current', () => {
    assert.deepEqual(ids(pick([cp('a', '2026-10-05')])), { current: 'a', next: null })
  })

  test('THE BUG: a next block booked later stays NEXT; the running block stays current', () => {
    const running = cp('run', '2026-10-05', '2026-10-01T09:00:00Z')
    const booked = cp('nxt', '2026-11-02', '2026-10-28T09:00:00Z')    // assigned more recently, starts in the future
    assert.deepEqual(ids(pick([booked, running])), { current: 'run', next: 'nxt' })
  })

  test('on the next block\'s start day it takes over, and nothing is next', () => {
    const running = cp('run', '2026-10-05'), booked = cp('nxt', '2026-11-02')
    assert.deepEqual(ids(pick([running, booked], '2026-11-02')), { current: 'nxt', next: null })
    assert.deepEqual(ids(pick([running, booked], '2026-11-01')), { current: 'run', next: 'nxt' }, 'the Sunday before is still the old block')
  })

  test('overlapping plans: the one that started most recently is current', () => {
    assert.deepEqual(ids(pick([cp('older', '2026-09-01'), cp('newer', '2026-10-12')])), { current: 'newer', next: null })
  })

  test('a plan that has ended with nothing after it is still current (the attention list flags it as ended)', () => {
    assert.deepEqual(ids(pick([cp('done', '2026-06-01')])), { current: 'done', next: null })
  })

  test('only future plans: the soonest is current and the one after it is next', () => {
    assert.deepEqual(ids(pick([cp('later', '2026-12-07'), cp('soon', '2026-11-02')])), { current: 'soon', next: 'later' })
  })

  test('no start date: counts as starting on the day it was assigned (as the block history does)', () => {
    const undated = cp('u', null, '2026-10-20T08:00:00Z')
    assert.deepEqual(ids(pick([undated, cp('older', '2026-10-05')])), { current: 'u', next: null }, 'assigned 10-20, so it started after 10-05')
    assert.deepEqual(ids(pick([cp('u', null, '2026-11-10T08:00:00Z')])), { current: 'u', next: null }, 'a future created_at (clock skew) is still the only plan')
  })

  test('no start date AND no created_at: counts as started, but ranks below every dated start', () => {
    assert.deepEqual(ids(pick([cp('x', null, null), cp('d', '2026-10-05')])), { current: 'd', next: null })
    assert.deepEqual(ids(pick([cp('x', null, null)])), { current: 'x', next: null })
  })

  test('the same start date: the most recently assigned wins (then the id, so the pick is stable)', () => {
    const a = cp('a', '2026-10-05', '2026-10-01T09:00:00Z'), b = cp('b', '2026-10-05', '2026-10-03T09:00:00Z')
    assert.equal(pick([a, b]).current.id, 'b')
    assert.equal(pick([b, a]).current.id, 'b', 'input order does not matter')
    const c = cp('c', '2026-10-05', '2026-10-03T09:00:00Z')
    assert.equal(pick([b, c]).current.id, 'c')
    assert.equal(pick([c, b]).current.id, 'c')
  })

  test('ties on created_at follow TIME order, as Postgres does - not localeCompare\'s order for fractional seconds', () => {
    // As PostgREST returns them: trailing zeros trimmed, so ".5" is half a second AFTER the whole second.
    const whole = cp('whole', '2026-10-05', '2026-10-03T09:00:00+00:00'), half = cp('half', '2026-10-05', '2026-10-03T09:00:00.5+00:00')
    assert.equal(pick([whole, half]).current.id, 'half')
    assert.equal(pick([half, whole]).current.id, 'half')
  })

  test('the input array is not reordered', () => {
    const rows = [cp('b', '2026-11-02'), cp('a', '2026-10-05')]
    pick(rows)
    assert.deepEqual(rows.map(r => r.id), ['b', 'a'])
  })
})

// A one-phase, two-week plan with a Monday and a Thursday session (week_number 1 repeats).
const plan = (id, start_date, prefix, created_at = '2026-10-01T09:00:00Z') => cp(id, start_date, created_at, {
  programs: { program_phases: [{ name: prefix, order_index: 0, duration_weeks: 2, program_phase_workouts: [
    { id: `${prefix}-mon`, day_of_week: 1, session_order: 1, week_number: 1 },
    { id: `${prefix}-thu`, day_of_week: 4, session_order: 1, week_number: 1 },
  ] }] },
})
// Re-built in THIS realm: the maps come out of the vm context, whose arrays fail deepStrictEqual against literals written here.
const sessionIds = map => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(map).map(([ds, arr]) => [ds, arr.map(pw => pw.id)]))))

describe('_programWorkoutsByDateAll - back-to-back plans each keep their own weeks', () => {
  const all = (rows, opts) => sessionIds(get('_programWorkoutsByDateAll')(rows, {}, opts))

  test('one plan: the same map _programWorkoutsByDate draws', () => {
    const one = plan('a', '2026-10-26', 'A')
    assert.deepEqual(all([one]), sessionIds(get('_programWorkoutsByDate')(one, {})))
  })

  test('THE BUG: a block booked to follow the running one appears from its start Monday', () => {
    const map = all([plan('nxt', '2026-11-09', 'B'), plan('run', '2026-10-26', 'A')])
    assert.deepEqual(map, {
      '2026-10-26': ['A-mon'], '2026-10-29': ['A-thu'], '2026-11-02': ['A-mon'], '2026-11-05': ['A-thu'],
      '2026-11-09': ['B-mon'], '2026-11-12': ['B-thu'], '2026-11-16': ['B-mon'], '2026-11-19': ['B-thu'],
    })
  })

  test('overlap: the later plan takes over on its start DATE, the day _currentAssignment hands over (a Wednesday start leaves Monday to the old plan)', () => {
    const map = all([plan('run', '2026-10-26', 'A'), plan('nxt', '2026-11-04', 'B')])
    assert.deepEqual(map['2026-11-02'], ['A-mon'], 'Monday is before B starts: still A\'s')
    assert.deepEqual(map['2026-11-05'], ['B-thu'], 'Thursday is after B starts: B\'s')
    assert.deepEqual(map['2026-10-29'], ['A-thu'], 'the old block keeps the weeks before')
  })

  test('THE REVIEW\'S GAP: on the dashboard (fromStart) a mid-week start leaves no empty days between the two plans', () => {
    // B starts Thursday 11-05. Before the fix A stopped at B's start MONDAY and B's own Mon-Wed were dropped, so 11-02 had nothing at all.
    const map = all([plan('run', '2026-10-26', 'A'), plan('nxt', '2026-11-05', 'B')], { fromStart: true })
    assert.deepEqual(map['2026-11-02'], ['A-mon'], 'Monday of the changeover week is still planned - A\'s')
    assert.deepEqual(map['2026-11-05'], ['B-thu'], 'B from its start day')
  })

  test('the calendar (no fromStart) gives a later plan\'s pre-start days to the plan before it, not to the later plan', () => {
    const map = all([plan('run', '2026-10-26', 'A'), plan('nxt', '2026-11-05', 'B')])
    assert.deepEqual(map['2026-11-02'], ['A-mon'])
    assert.equal(Object.entries(map).some(([ds, ids]) => ds < '2026-11-05' && ids.some(id => id.startsWith('B-'))), false, 'no B session before B starts')
  })

  test('overlap on DIFFERENT days: the old block\'s sessions stop at the new block\'s start Monday, not just where the two collide', () => {
    const tueOnly = cp('nxt', '2026-11-02', '2026-10-28T09:00:00Z', { programs: { program_phases: [{ name: 'B', order_index: 0, duration_weeks: 1, program_phase_workouts: [
      { id: 'B-tue', day_of_week: 2, session_order: 1, week_number: 1 },
    ] }] } })
    const map = all([plan('run', '2026-10-26', 'A'), tueOnly])
    assert.deepEqual(map, { '2026-10-26': ['A-mon'], '2026-10-29': ['A-thu'], '2026-11-03': ['B-tue'] },
      'A\'s Monday 11-02 and Thursday 11-05 belong to its second week, which B has taken over')
  })

  test('two plans on the same start date: the more recently assigned one owns the dates', () => {
    const map = all([plan('new', '2026-10-26', 'N', '2026-10-20T00:00:00Z'), plan('old', '2026-10-26', 'O', '2026-10-01T00:00:00Z')])
    assert.deepEqual(map['2026-10-26'], ['N-mon'])
    assert.equal(Object.values(map).flat().some(id => id.startsWith('O-')), false)
  })

  test('a plan with no start date or an unreadable one is not drawn (as _programWorkoutsByDate)', () => {
    assert.deepEqual(all([plan('u', null, 'U'), plan('bad', 'not-a-date', 'X')]), {})
    assert.deepEqual(all([plan('u', null, 'U'), plan('a', '2026-10-26', 'A')]), sessionIds(get('_programWorkoutsByDate')(plan('a', '2026-10-26', 'A'), {})))
  })

  test('fromStart drops each plan\'s days before its own start date (the dashboard\'s rule), not just the first plan\'s', () => {
    const map = all([plan('run', '2026-10-29', 'A'), plan('nxt', '2026-11-11', 'B')], { fromStart: true })
    assert.equal(map['2026-10-26'], undefined, 'A starts on a Thursday: its Monday is not planned')
    assert.deepEqual(map['2026-10-29'], ['A-thu'])
    assert.equal(map['2026-11-09'], undefined, 'B starts on a Wednesday: its Monday is not planned either')
    assert.deepEqual(map['2026-11-12'], ['B-thu'])
  })

  test('empty and null input give an empty map, never null', () => {
    assert.deepEqual(all([]), {})
    assert.deepEqual(all(null), {})
  })
})
