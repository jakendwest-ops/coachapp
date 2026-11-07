// End-of-block review (docs/superpowers/plans/2026-11-07-end-of-block-review.md, Task 1): the pure parts. When a plan ends, whether a hint or a card is due,
// and what the card says. The screens are covered by tests/block-review-2026-11-07.spec.js.
// Fixture: a 12-week plan, three sessions a week (Mon, Wed, Fri), starting Monday 10 Aug 2026, so its last Sunday is 1 Nov 2026.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const json = (v) => JSON.parse(JSON.stringify(v))
const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const START = '2026-08-10', END = '2026-11-01'
const plan = (weeks, { skipLastWeeks = 0, start = START } = {}) => {
  const by = {}
  for (let w = 0; w < weeks - skipLastWeeks; w++) for (const d of [0, 2, 4]) by[add(start, 7 * w + d)] = [{ name: 'S' }]
  return by
}
const sessionDates = (by) => Object.keys(by).sort()

describe('_dashPlanEndSunday', () => {
  const end = get('_dashPlanEndSunday')
  test('the Sunday of the last week: by length, or by the last week that holds a session if that is later', () => {
    assert.equal(end(plan(12), START, 12), END)
    assert.equal(end(plan(12, { skipLastWeeks: 2 }), START, 12), END, 'a planned rest at the end does not shorten it')
    assert.equal(end(plan(13), START, 12), '2026-11-08', 'a session in week 13 of a 12-week plan runs it on')
    assert.equal(end(plan(12), START, 0), END, 'no length given: the last week with a session')
  })
  test('no sessions, no start date: null', () => {
    assert.equal(end({}, START, 12), null)
    assert.equal(end(plan(12), null, 12), null)
    assert.equal(end(null, START, 12), null)
  })
  test('sessions dated before the plan starts are not part of it', () => {
    const by = { ...plan(12), '2026-08-03': [{ name: 'early' }] }
    assert.equal(end(by, START, 12), END)
  })
})

describe('_dashPlanAdherence still agrees with the end it now shares', () => {
  const adh = get('_dashPlanAdherence')
  test('mid-plan: due counts sessions to date, done is capped at due; after the end it is null', () => {
    const by = plan(12), all = sessionDates(by)
    const r = json(adh(by, all, '2026-08-26', START, 12))
    assert.deepEqual([r.done, r.due, r.pct, r.week, r.totalWeeks], [8, 8, 100, 3, 12])
    assert.equal(adh(by, all, '2026-11-02', START, 12), null, 'the Monday after the last Sunday: no plan governs the week')
    assert.notEqual(adh(by, all, END, START, 12), null, 'the last Sunday is still the plan')
  })
})

describe('_blockEndState', () => {
  const st = (o) => json(get('_blockEndState')({ planStart: START, endSunday: END, hasNext: false, logDates: sessionDates(plan(12)), todayStr: END, ...o }))
  test('before the last week: nothing; the last Monday and the last Sunday: the hint', () => {
    assert.equal(st({ todayStr: '2026-10-25' }).state, 'none')
    assert.equal(st({ todayStr: '2026-10-26' }).state, 'last-week')
    assert.equal(st({ todayStr: '2026-11-01' }).state, 'last-week')
  })
  test('after the end: the card for 28 days, nothing from day 29', () => {
    const a = st({ todayStr: '2026-11-02' }); assert.equal(a.state, 'ended'); assert.equal(a.daysSinceEnd, 1)
    const b = st({ todayStr: '2026-11-29' }); assert.equal(b.state, 'ended'); assert.equal(b.daysSinceEnd, 28)
    assert.equal(st({ todayStr: '2026-11-30' }).state, 'none')
  })
  test('a plan booked after this one, no start date, or no end: nothing', () => {
    assert.equal(st({ todayStr: '2026-11-03', hasNext: true }).state, 'none')
    assert.equal(st({ todayStr: '2026-11-03', planStart: null }).state, 'none')
    assert.equal(st({ todayStr: '2026-11-03', endSunday: null }).state, 'none')
  })
  test('a plan under 2 weeks never earns a review; exactly 2 weeks does', () => {
    assert.equal(st({ planStart: '2026-10-26', todayStr: '2026-11-03', logDates: ['2026-10-26', '2026-10-28', '2026-10-30'] }).state, 'none')
    assert.equal(st({ planStart: '2026-10-19', todayStr: '2026-11-03', logDates: ['2026-10-19', '2026-10-21', '2026-10-26'] }).state, 'ended')
  })
  test('it takes 3 logged sessions inside the plan: 2 is not enough, and sessions outside the plan do not count', () => {
    assert.equal(st({ todayStr: '2026-11-03', logDates: ['2026-08-10', '2026-08-12'] }).state, 'none')
    assert.equal(st({ todayStr: '2026-11-03', logDates: ['2026-08-10', '2026-08-12', '2026-08-14'] }).state, 'ended')
    assert.equal(st({ todayStr: '2026-11-03', logDates: ['2026-08-03', '2026-08-05', '2026-08-07', '2026-11-03'] }).state, 'none', 'before the start, and after the end')
    assert.equal(st({ todayStr: '2026-11-03', logDates: ['2026-08-10', '2026-08-12', '2026-11-03', '2026-11-05'] }).state, 'none')
  })
  test('empty and missing logs are safe', () => {
    assert.equal(st({ todayStr: '2026-11-03', logDates: [] }).state, 'none')
    assert.equal(st({ todayStr: '2026-11-03', logDates: null }).state, 'none')
  })
  test('it reports how many sessions the block holds', () => {
    assert.equal(st({ todayStr: '2026-11-03' }).loggedInBlock, 36)
  })
})

describe('_blockReviewModel', () => {
  const model = (o) => json(get('_blockReviewModel')({ endSunday: END, planStart: START, totalWeeks: 12, currentByDate: plan(12), logDates: sessionDates(plan(12)).slice(0, 34), summary: null, hasPrevious: true, canRepeat: true, todayStr: '2026-11-03', ...o }))
  const row = (name, last, now) => ({ name, last, this: now, delta: now - last, pct: Math.round(((now - last) / last) * 1000) / 10 })

  test('sessions done against planned is the capped adherence figure for the whole plan', () => {
    const m = model({})
    assert.deepEqual([m.doneOf.done, m.doneOf.due, m.doneOf.pct], [34, 36, 94])
  })
  test('the three most improved lifts by percent, ties by name; lifts that did not go up are left out', () => {
    const summary = { both: [row('A', 100, 110), row('B', 100, 105), row('C', 100, 120), row('D', 100, 110), row('E', 100, 100), row('F', 100, 90)], onlyLast: [], onlyThis: [] }
    assert.deepEqual(model({ summary }).improved.map(x => x.name), ['C', 'A', 'D'])
    assert.deepEqual(model({ summary: { both: [row('E', 100, 100), row('F', 100, 90)], onlyLast: [], onlyThis: [] } }).improved, [])
  })
  test('no summary yet (still loading, or the read failed): no lifts, never an invented change', () => {
    assert.deepEqual(model({ summary: { both: [{ name: 'G', last: 100, this: 100.04, delta: 0.04, pct: 0 }], onlyLast: [], onlyThis: [] } }).improved, [], 'a drift that would print as +0.0 is no change')
    assert.deepEqual(model({ summary: null }).improved, [])
    assert.deepEqual(model({ summary: undefined }).improved, [])
  })
  test('the first block is flagged so the card can say there is nothing to compare', () => {
    assert.equal(model({ hasPrevious: false }).firstBlock, true)
    assert.equal(model({ hasPrevious: true }).firstBlock, false)
  })
  test('the repeat start: the Monday after the end if that is today or later, else the next Monday, never in the past', () => {
    assert.equal(model({ todayStr: '2026-11-02' }).repeatStart, '2026-11-02')
    assert.equal(model({ todayStr: '2026-11-01' }).repeatStart, '2026-11-02')
    assert.equal(model({ todayStr: '2026-11-04' }).repeatStart, '2026-11-09', 'a Wednesday: the 2nd has gone')
    assert.equal(model({ todayStr: '2026-11-09', endSunday: '2026-10-25' }).repeatStart, '2026-11-09', 'today is a Monday')
    assert.equal(model({ todayStr: '2026-11-11', endSunday: '2026-10-25' }).repeatStart, '2026-11-16')
  })
  test('canRepeat passes through', () => {
    assert.equal(model({ canRepeat: false }).canRepeat, false)
    assert.equal(model({ canRepeat: true }).canRepeat, true)
  })
})

describe('_blockReviewWindows: the windows the card and the review page share', () => {
  const windows = get('_blockReviewWindows')
  const run = (key, start, end, extra = {}) => ({ key, start, end, name: key, ...extra })
  const FINISHED = run('live:a', START, '2026-11-07', { open: true })

  test('freezes the finished run at its last Sunday, against the run before it, trimmed so no day is in both', () => {
    const w = windows([FINISHED, run('past:b', '2026-05-11', '2026-08-12')], 'live:a', END)
    assert.equal(w.a.end, END)
    assert.equal(w.a.key, 'live:a')
    assert.equal(w.b.key, 'past:b')
    assert.equal(w.b.end, '2026-08-09')
  })
  test('a run added part-way through the block cannot take the place of the block, or of the one before it', () => {
    const w = windows([run('past:mid', '2026-09-07', '2026-09-20'), FINISHED, run('past:b', '2026-05-11', '2026-08-02')], 'live:a', END)
    assert.equal(w.a.key, 'live:a')
    assert.equal(w.b.key, 'past:b')
  })
  test('the run before stops at its planned length: its archived end is the day it was replaced, and free training after the plan is not that block', () => {
    const older = run('past:b', '2026-05-11', '2026-08-05', { weeks: 8 })   // 8 weeks ends Sun 5 Jul; replaced a month later
    assert.equal(windows([FINISHED, older], 'live:a', END).b.end, '2026-07-05')
    const stoppedEarly = run('past:c', '2026-05-11', '2026-06-03', { weeks: 8 })
    assert.equal(windows([FINISHED, stoppedEarly], 'live:a', END).b.end, '2026-06-03', 'a block stopped early keeps its own end')
  })
  test('no earlier run: the same length just before it, which the card reads as a first block', () => {
    assert.equal(windows([FINISHED], 'live:a', END).b.source, 'weeks')
  })
  test('the run is gone: null, never another block\'s windows', () => {
    assert.equal(windows([run('past:b', '2026-05-11', '2026-08-02')], 'live:a', END), null)
    assert.equal(windows(null, 'live:a', END), null)
  })
})
