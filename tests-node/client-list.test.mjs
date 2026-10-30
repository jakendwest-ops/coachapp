// The coach's client list (MVP item 4, approved by Jake 2026-10-30): search, status chips, sort, and the plan + week each row shows.
// Two pure helpers: _planWeekLabel (js/app-core.js - the client profile can reuse it) and _clientListSelect (js/app-clients.js), which
// filters, sorts and counts the rows renderClients draws. Today in every case: Friday 2026-10-30.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const TODAY = '2026-10-30'
const plain = (v) => JSON.parse(JSON.stringify(v))
const label = (s) => get('_planWeekLabel')({ program_name: null, program_start: null, program_weeks: null, ...s }, TODAY)

describe('_planWeekLabel - the plan and week on a client row', () => {
  test('a running plan: its name and the week of how many, counted Monday to Sunday like the calendar', () => {
    assert.equal(label({ program_name: 'Hypertrophy', program_start: '2026-10-12', program_weeks: 12 }), 'Hypertrophy · Wk 3/12')
    assert.equal(label({ program_name: 'Hypertrophy', program_start: '2026-10-15', program_weeks: 12 }), 'Hypertrophy · Wk 3/12', 'a Thursday start: week 1 is the week it falls in')
    assert.equal(label({ program_name: 'Hypertrophy', program_start: '2026-10-26', program_weeks: 12 }), 'Hypertrophy · Wk 1/12')
  })
  test('ended: how long ago; starting later: when', () => {
    assert.equal(label({ program_name: 'Block A', program_start: '2026-09-07', program_weeks: 4 }), 'Block A · Ended 26d ago')   // ended Sun 10-04
    assert.equal(label({ program_name: 'Block B', program_start: '2026-11-09', program_weeks: 4 }), 'Block B · Starts Mon 9 Nov')
  })
  test('review edge cases: a future start with no weeks still says when; an ended plan with the next block booked says so', () => {
    assert.equal(label({ program_name: 'A', program_start: '2026-10-31', program_weeks: 0 }), 'A · Starts Sat 31 Oct')
    assert.equal(label({ program_name: 'Block A', program_start: '2026-09-07', program_weeks: 4, next_program_start: '2026-11-02' }), 'Block A · Ended 26d ago · next Mon 2 Nov')
  })
  test('no plan, no start date, no weeks: says what is known and nothing more', () => {
    assert.equal(label({}), 'No plan')
    assert.equal(label({ program_name: 'Draft', program_start: null, program_weeks: 4 }), 'Draft')
    assert.equal(label({ program_name: 'Empty', program_start: '2026-10-12', program_weeks: null }), 'Empty')
  })
})

const row = (id, name, o = {}) => ({ id, full_name: name, status: 'active', last_session_date: '2026-10-28', reasons: [], ...o })
const ROWS = [
  row('a', 'Amy Adams', { reasons: [{ severity: 'medium' }] }),
  row('b', 'ben brown', { last_session_date: '2026-10-01' }),
  row('c', 'Cara Cole', { reasons: [{ severity: 'high' }, { severity: 'low' }] }),
  row('d', 'Dan Day', { last_session_date: null }),
  row('e', 'Eve Evans', { status: 'inactive', last_session_date: '2026-06-01' }),
  row('f', 'Fay Fox', { status: 'archived' }),
]
const pick = (state) => plain(get('_clientListSelect')(ROWS, { q: '', status: 'active', sort: 'attention', ...state }))
const ids = (state) => pick(state).rows.map(r => r.id)

describe('_clientListSelect - search, status, sort, counts', () => {
  test('the default: active clients, ranked like the Home card (worst first, then more reasons, then name)', () => {
    assert.deepEqual(ids({}), ['c', 'a', 'b', 'd'])
  })
  test('counts per chip are over the whole roster, not the filtered rows', () => {
    assert.deepEqual(pick({ q: 'zzz' }).counts, { all: 6, active: 4, inactive: 1, archived: 1 })
  })
  test('each status chip', () => {
    assert.deepEqual(ids({ status: 'inactive' }), ['e'])
    assert.deepEqual(ids({ status: 'archived' }), ['f'])
    assert.deepEqual(ids({ status: 'all', sort: 'name' }), ['a', 'b', 'c', 'd', 'e', 'f'])
  })
  test('sort by name ignores case; by last session puts never-trained first, then the oldest', () => {
    assert.deepEqual(ids({ sort: 'name' }), ['a', 'b', 'c', 'd'])
    assert.deepEqual(ids({ sort: 'last' }), ['d', 'b', 'a', 'c'])
  })
  test('search: any part of the name, any case, trimmed; it searches within the chosen status', () => {
    assert.deepEqual(ids({ q: '  BRO ' }), ['b'])
    assert.deepEqual(ids({ q: 'ev' }), [], 'Eve is inactive, so not under Active')
    assert.deepEqual(ids({ q: 'ev', status: 'all' }), ['e'])
  })
  test('the input is not reordered, and an unknown state falls back to the defaults', () => {
    const before = ROWS.map(r => r.id)
    pick({ sort: 'name' })
    assert.deepEqual(ROWS.map(r => r.id), before)
    assert.deepEqual(plain(get('_clientListSelect')(ROWS, { status: 'weird', sort: 'weird' })).rows.map(r => r.id), ['c', 'a', 'b', 'd'])
  })
})
