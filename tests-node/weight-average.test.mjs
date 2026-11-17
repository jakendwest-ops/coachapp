// The body weight "7-day avg" is an average over 7 DAYS of weigh-ins, not over the last 7 entries
// (docs/bugs/2026-11-17-weight-7-day-average-is-a-7-entry-average.md), and the chart's range keeps only the weigh-ins inside it.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const avg = (pts, days) => JSON.parse(JSON.stringify(get('_avgByDays')(pts, days)))
const p = (date, v) => ({ date, v })

describe('_avgByDays: each point averages the weigh-ins on its day and the days before it', () => {
  test('weekly weigh-ins: one per 7-day window, so the average IS each weigh-in (the old 7-entry average lagged 7 weeks behind)', () => {
    const pts = [p('2026-04-01', 90), p('2026-04-08', 89.5), p('2026-04-15', 89), p('2026-04-22', 88.5), p('2026-04-29', 88), p('2026-05-06', 87.5), p('2026-05-13', 87), p('2026-05-20', 86.5)]
    assert.deepEqual(avg(pts, 7), [90, 89.5, 89, 88.5, 88, 87.5, 87, 86.5])
  })

  test('daily weigh-ins: a trailing 7-day mean', () => {
    const pts = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((v, i) => p(`2026-04-0${i + 1}`, v))
    assert.deepEqual(avg(pts, 7), [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6])
  })

  test('the window is the day and the 6 before it: a weigh-in 7 days back is out', () => {
    assert.deepEqual(avg([p('2026-04-01', 80), p('2026-04-07', 82), p('2026-04-08', 84)], 7), [80, 81, 83])
  })

  test('two weigh-ins on one day both count, for both points (the window is whole days)', () => {
    assert.deepEqual(avg([p('2026-04-01', 80), p('2026-04-01', 81)], 7), [80.5, 80.5])
  })

  test('numbers as strings (weightToPref returns a string in lb) and gaps', () => {
    assert.deepEqual(avg([p('2026-04-01', '176.4'), p('2026-04-02', null), p('2026-04-03', '178.6')], 7), [176.4, 176.4, 177.5])
  })

  test('across a month and a clock change the days are counted as days', () => {
    assert.deepEqual(avg([p('2026-03-26', 80), p('2026-04-01', 82)], 7), [80, 81])
  })

  test('nothing in, nothing out', () => {
    assert.deepEqual(avg([], 7), [])
    assert.deepEqual(avg(null, 7), [])
  })
})

describe('_weightRangeStart: the first day a range shows', () => {
  const start = (r, today) => get('_weightRangeStart')(r, today)
  test('1M / 3M / 1Y are 30 / 90 / 365 days ending today (today counts as the first), as the Lifts range reads them; All has no start', () => {
    assert.equal(start('1M', '2026-11-17'), '2026-10-19')
    assert.equal(start('3M', '2026-11-17'), '2026-08-20')
    assert.equal(start('1Y', '2026-11-17'), '2025-11-18')
    assert.equal(start('All', '2026-11-17'), null)
  })
})
