// Goal projection (Jake approved the backlog 2026-11-17; audit backlog #7): a goal page says when, at the current rate, the target is reached, and what rate
// the due date needs. The rate is a straight line through the last 6 weeks of readings (updates, weigh-ins or session top sets), as the weight trend is.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const P = (date, v) => ({ date, v })
const proj = (pts, n, due, today = '2026-10-13') => JSON.parse(JSON.stringify(get('_goalProjection')(pts, n, due, today)))
const text = (pts, n, due, unit = ' kg', today = '2026-10-13') => get('_goalProjectionText')(get('_goalProjection')(pts, n, due, today), unit, due, today)
const UP = { start: 100, target: 160, cur: 130, up: true }
const DOWN = { start: 92, target: 85, cur: 88.4, up: false }

describe('_goalProjection', () => {
  test('two updates three weeks apart: +5 kg in 21 days is about +1.7 kg a week; at that rate from today, 30 kg more is 126 days: 16 Feb 2027', () => {
    const p = proj([P('2026-08-15', 117.5), P('2026-09-12', 125), P('2026-10-03', 130)], UP, '2027-03-13')
    assert.ok(Math.abs(p.perWeek - 5 / 3) < 1e-9, 'only the last 6 weeks count (15 Aug is older)')
    assert.equal(p.eta, '2027-02-16', 'counted on from TODAY from the latest reading, as _weightTrend does')
    assert.ok(Math.abs(p.neededPerWeek - 30 / (151 / 7)) < 1e-9, '30 kg to go in 151 days')
  })

  test('moving the wrong way, or flat, gives no date', () => {
    assert.equal(proj([P('2026-09-12', 130), P('2026-10-03', 125)], UP, null).eta, null)
    assert.equal(proj([P('2026-09-12', 130), P('2026-10-03', 130)], UP, null).eta, null)
  })

  test('a goal that goes down projects down', () => {
    const p = proj([P('2026-09-15', 90), P('2026-10-13', 88)], DOWN, null)
    assert.ok(p.perWeek < 0)
    assert.equal(p.eta, '2026-11-24', '88 to 85 is 3 kg at 1/14 kg a day: 42 days after 13 Oct')
  })

  test('under two readings, or under a week apart: no rate, but the needed rate still shows with a due date', () => {
    const one = proj([P('2026-10-10', 88.4)], DOWN, '2027-01-20')
    assert.equal(one.perWeek, null)
    assert.ok(Math.abs(one.neededPerWeek - (85 - 88.4) / (99 / 7)) < 1e-9)
    assert.equal(proj([P('2026-10-10', 88), P('2026-10-13', 87)], DOWN, null), null, 'nothing to say')
  })

  test('a goal already reached, or one with no numbers, projects nothing', () => {
    assert.equal(proj([P('2026-09-12', 150), P('2026-10-03', 161)], { ...UP, cur: 161 }, '2027-03-13'), null)
    assert.equal(proj([P('2026-09-12', 150)], null, '2027-03-13'), null)
  })

  test('a date more than 104 weeks out is not a date (the Bodyweight page\'s own cap), and the slow progress is said instead', () => {
    const slow = proj([P('2026-09-02', 130), P('2026-10-13', 131)], UP, null)      // 1 kg in 41 days: 29 kg more is about 1,190 days
    assert.ok(slow.perWeek > 0.05, 'it IS moving towards the target')
    assert.equal(slow.eta, null)
    assert.equal(slow.slow, true)
    assert.equal(get('_goalProjectionText')(get('_goalProjection')([P('2026-09-02', 130), P('2026-10-13', 131)], UP, null, '2026-10-13'), ' kg', null, '2026-10-13'), 'Moving towards the target (+0.2 kg a week), but too slowly to reach it within two years.')
  })
})

describe('_goalProjectionText', () => {
  test('both sentences, in the goal\'s unit, with the year when it is not this year', () => {
    assert.equal(text([P('2026-09-12', 125), P('2026-10-03', 130)], UP, '2027-03-13'),
      'At your current rate (+1.7 kg a week) you reach 160 kg around 16 Feb 2027. To reach it by 13 Mar 2027 you need +1.4 kg a week.')
  })
  test('the wrong way says so; a due date already passed asks for nothing', () => {
    assert.equal(text([P('2026-09-12', 130), P('2026-10-03', 125)], UP, '2026-10-01'), 'Moving away from the target lately.')
    assert.equal(text([P('2026-09-12', 130), P('2026-10-03', 130)], UP, null), 'No change lately.')
  })
  test('only the needed rate when there is no rate yet', () => {
    assert.equal(text([P('2026-10-10', 88.4)], DOWN, '2027-01-20'), 'To reach it by 20 Jan 2027 you need −0.2 kg a week.')
  })
})
