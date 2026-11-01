// Performance > Blocks (2026-11-01, docs/superpowers/plans/2026-11-01-performance-lifts-and-blocks.md): which two blocks are compared,
// and the per-lift table. Pure parts only; the screen is covered by tests/performance-blocks-2026-11-01.spec.js.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const json = (v) => JSON.parse(JSON.stringify(v))
const ses = (date, weight, reps = 5) => ({ date, sets: [{ weight_kg: weight, reps_achieved: reps }] })
const e1rm = (s) => get('_pbE1rmPoints')([s])[0].kg
const block = (key, start, end, name = 'Plan') => ({ key, progKey: key, name, start, end, open: false })

describe('_perfTabName', () => {
  test('Performance pills are Lifts, Sessions, Blocks; every older stored name maps onto one of them', () => {
    const t = get('_perfTabName')
    assert.deepEqual(json(get('_PERF_TABS')), ['Lifts', 'Sessions', 'Blocks'])
    for (const old of [undefined, '', 'Per exercise', '1RMs', 'Progressions', 'Nonsense']) assert.equal(t(old), 'Lifts', String(old))
    for (const old of ['Per session', 'Recent sessions']) assert.equal(t(old), 'Sessions', old)
    assert.equal(t('Per training plan'), 'Blocks')
    for (const now of ['Lifts', 'Sessions', 'Blocks']) assert.equal(t(now), now)
  })
})

describe('_blockWindowsFor', () => {
  const win = get('_blockWindowsFor')

  test('two plan runs: this is the newest start, last is the previous run of ANY plan', () => {
    const blocks = [block('c', '2026-10-05', '2026-11-01', 'C'), block('b', '2026-08-31', '2026-10-04', 'B'), block('a', '2026-06-01', '2026-08-30', 'A')]
    const w = json(win(blocks, '2026-11-01'))
    assert.equal(w.a.source, 'plan'); assert.equal(w.b.source, 'plan')
    assert.deepEqual([w.a.start, w.a.end, w.b.start, w.b.end], ['2026-10-05', '2026-11-01', '2026-08-31', '2026-10-04'])
  })

  test('no plan runs: the last 42 days against the 42 days before, ending the day before the first starts', () => {
    const w = json(win([], '2026-11-01'))
    assert.equal(w.a.source, 'weeks')
    assert.deepEqual([w.a.start, w.a.end], ['2026-09-21', '2026-11-01'])
    assert.deepEqual([w.b.start, w.b.end], ['2026-08-10', '2026-09-20'])
  })

  test('one plan run: last is the window of the same length immediately before it', () => {
    const w = json(win([block('c', '2026-10-05', '2026-11-01')], '2026-11-01'))
    assert.equal(w.a.source, 'plan')
    assert.deepEqual([w.a.start, w.a.end], ['2026-10-05', '2026-11-01'])
    assert.equal(w.b.end, '2026-10-04')
    assert.equal(w.b.start, '2026-09-07')   // 28 days, the length of the run
  })

  test('a null block list (failed read) is treated as no plans, never a crash', () => {
    assert.equal(json(win(null, '2026-11-01')).a.source, 'weeks')
  })
})

describe('_blockLiftSummary', () => {
  const sum = get('_blockLiftSummary')
  const a = { start: '2026-09-21', end: '2026-11-01' }, b = { start: '2026-08-10', end: '2026-09-20' }

  test('a lift in both windows: best of each, the change and the percentage', () => {
    const lastBest = ses('2026-08-24', 100), thisBest = ses('2026-10-23', 110)
    const ex = [{ name: 'Bench', sessions: [ses('2026-08-17', 90), lastBest, ses('2026-10-02', 105), thisBest] }]
    const r = json(sum(ex, a, b))
    assert.equal(r.both.length, 1)
    assert.equal(r.both[0].name, 'Bench')
    assert.equal(r.both[0].last, e1rm(lastBest))
    assert.equal(r.both[0].this, e1rm(thisBest))
    assert.equal(r.both[0].delta, e1rm(thisBest) - e1rm(lastBest))
    assert.equal(r.both[0].pct, Math.round(((e1rm(thisBest) - e1rm(lastBest)) / e1rm(lastBest)) * 1000) / 10)
  })

  test('a lift in one window only goes to onlyLast or onlyThis, never a change', () => {
    const ex = [
      { name: 'Deadlift', sessions: [ses('2026-09-03', 200)] },
      { name: 'Row', sessions: [ses('2026-10-23', 80)] },
    ]
    const r = json(sum(ex, a, b))
    assert.deepEqual(r.both, [])
    assert.deepEqual(r.onlyLast.map(x => x.name), ['Deadlift'])
    assert.deepEqual(r.onlyThis.map(x => x.name), ['Row'])
  })

  test('a lift that estimates nothing (no weight) is left out; empty and null histories give empty lists', () => {
    const ex = [{ name: 'Pull up', sessions: [{ date: '2026-10-23', sets: [{ weight_kg: 0, reps_achieved: 10 }] }] }]
    assert.deepEqual(json(sum(ex, a, b)), { both: [], onlyLast: [], onlyThis: [] })
    assert.deepEqual(json(sum([], a, b)), { both: [], onlyLast: [], onlyThis: [] })
    assert.deepEqual(json(sum(null, a, b)), { both: [], onlyLast: [], onlyThis: [] })
  })

  test('the edges of a window are inclusive on both sides', () => {
    const ex = [{ name: 'Bench', sessions: [ses('2026-08-10', 100), ses('2026-11-01', 100)] }]
    assert.equal(json(sum(ex, a, b)).both.length, 1)
  })
})
