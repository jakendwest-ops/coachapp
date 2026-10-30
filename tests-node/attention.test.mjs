// The coach Home's "Needs attention" rules (MVP item 3, approved by Jake 2026-10-30). One pure function, _attentionFor (js/app-core.js),
// turns a client's coach_client_summary row plus what their plan asked of them this week into ranked reasons. Before this the card had
// one rule - no session in 7 days - so a client who missed three planned sessions but logged one extra looked fine, a planned rest week
// was flagged, and a plan running out said nothing.
//
// Today in every case: Friday 2026-10-30. "The last 7 days" = 10-23 .. 10-29 (up to yesterday).

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const TODAY = '2026-10-30'
const s = (o = {}) => ({ client_id: 'c1', full_name: 'Alex', status: 'active', created_at: '2026-09-01T09:00:00Z', last_session_date: '2026-10-29', last_weigh_in_date: '2026-10-28',
  last_check_in_at: '2026-10-27T09:00:00Z', program_id: null, program_name: null, program_start: null, program_weeks: null, next_program_start: null, ...o })
const reasons = (row, ctx = {}) => JSON.parse(JSON.stringify(get('_attentionFor')(row, { todayStr: TODAY, planned: null, logged: 0, onHoliday: false, ...ctx })))
const keys = (row, ctx) => reasons(row, ctx).map(r => r.key)

describe('_attentionFor - each rule', () => {
  test('a client doing everything right needs nothing', () => {
    assert.deepEqual(keys(s(), { planned: 3, logged: 3 }), [])
  })

  test('missed sessions (high): 2 or more missed, or all of them; trained on another day is not a miss', () => {
    assert.deepEqual(keys(s(), { planned: 4, logged: 2 }), ['missed'])
    assert.equal(reasons(s(), { planned: 4, logged: 2 })[0].severity, 'high')
    assert.match(reasons(s(), { planned: 4, logged: 2 })[0].detail, /Missed 2 of 4 planned/)
    assert.deepEqual(keys(s(), { planned: 4, logged: 3 }), [], 'one missed is not flagged')
    assert.deepEqual(keys(s(), { planned: 1, logged: 0 }), ['missed'], 'the only planned session missed')
    assert.deepEqual(keys(s(), { planned: 3, logged: 5 }), [], 'extra sessions never count against them')
    assert.deepEqual(keys(s(), { planned: 0, logged: 0 }), [], 'a planned rest week is not a miss')
    assert.deepEqual(keys(s(), { planned: null, logged: 0 }), [], 'no dated plan: nothing to miss')
  })

  test('gone quiet (medium): 10+ days since the last session; 9 is not', () => {
    assert.deepEqual(keys(s({ last_session_date: '2026-10-20' })), ['quiet'])
    assert.match(reasons(s({ last_session_date: '2026-10-20' }))[0].detail, /10 days/)
    assert.deepEqual(keys(s({ last_session_date: '2026-10-21' })), [])
  })

  test('no sessions yet (medium): a client added 7+ days ago who has never trained; a brand-new one is left alone', () => {
    assert.deepEqual(keys(s({ last_session_date: null, created_at: '2026-10-23T08:00:00Z' })), ['quiet'])
    assert.match(reasons(s({ last_session_date: null, created_at: '2026-10-23T08:00:00Z' }))[0].label, /No sessions yet/)
    assert.deepEqual(keys(s({ last_session_date: null, created_at: '2026-10-25T08:00:00Z' })), [])
  })

  test('plan ending (medium): ends within 7 days with nothing booked after it; booked = no reason', () => {
    // 4 weeks from Mon 2026-10-05: the last week is Mon 10-26 .. Sun 11-01, so it ends in 2 days
    const ending = s({ program_name: 'Block A', program_start: '2026-10-05', program_weeks: 4 })
    assert.deepEqual(keys(ending), ['plan_ending'])
    assert.equal(reasons(ending)[0].action, 'next-block')
    assert.deepEqual(keys({ ...ending, next_program_start: '2026-11-02' }), [], 'the next block is already booked')
    assert.deepEqual(keys(s({ program_start: '2026-10-05', program_weeks: 6 })), [], 'ends in 16 days: not yet')
  })

  test('plan ended (medium): it has ended and nothing is booked', () => {
    const ended = s({ program_name: 'Block A', program_start: '2026-09-07', program_weeks: 4 })   // ended Sun 10-04
    assert.deepEqual(keys(ended), ['plan_ended'])
    assert.match(reasons(ended)[0].detail, /Block A/)
    assert.deepEqual(keys({ ...ended, next_program_start: '2026-11-02' }), [])
  })

  test('check-in overdue (medium): 10+ days, only for someone who has checked in before', () => {
    assert.deepEqual(keys(s({ last_check_in_at: '2026-10-20T09:00:00Z' })), ['checkin'])
    assert.deepEqual(keys(s({ last_check_in_at: '2026-10-21T09:00:00Z' })), [])
    assert.deepEqual(keys(s({ last_check_in_at: null })), [], 'never checked in: not chased')
  })

  test('no weigh-in (low): 14+ days, only for someone who has weighed in before', () => {
    assert.deepEqual(keys(s({ last_weigh_in_date: '2026-10-16' })), ['weighin'])
    assert.equal(reasons(s({ last_weigh_in_date: '2026-10-16' }))[0].severity, 'low')
    assert.deepEqual(keys(s({ last_weigh_in_date: '2026-10-17' })), [])
    assert.deepEqual(keys(s({ last_weigh_in_date: null })), [])
  })

  test('a holiday mutes missed sessions and going quiet - and nothing else', () => {
    const row = s({ last_session_date: '2026-10-10', last_weigh_in_date: '2026-10-01', program_start: '2026-09-07', program_weeks: 4 })
    assert.deepEqual(keys(row, { planned: 3, logged: 0 }), ['missed', 'quiet', 'plan_ended', 'weighin'])
    assert.deepEqual(keys(row, { planned: 3, logged: 0, onHoliday: true }), ['plan_ended', 'weighin'])
  })

  test('reasons come out worst first', () => {
    const row = s({ last_session_date: '2026-10-10', last_weigh_in_date: '2026-10-01', last_check_in_at: '2026-10-01T00:00:00Z' })
    assert.deepEqual(reasons(row, { planned: 2, logged: 0 }).map(r => r.severity), ['high', 'medium', 'medium', 'low'])
  })
})

describe('_attentionRank - who comes first', () => {
  test('worst severity first, then more reasons, then name', () => {
    const items = [
      { id: 'a', name: 'Zed', reasons: [{ severity: 'medium' }] },
      { id: 'b', name: 'Amy', reasons: [{ severity: 'low' }] },
      { id: 'c', name: 'Bob', reasons: [{ severity: 'high' }] },
      { id: 'd', name: 'Cat', reasons: [{ severity: 'medium' }, { severity: 'low' }] },
      { id: 'e', name: 'Ann', reasons: [{ severity: 'medium' }] },
    ]
    assert.deepEqual(JSON.parse(JSON.stringify(get('_attentionRank')(items))).map(i => i.id), ['c', 'd', 'e', 'a', 'b'])
  })
})
