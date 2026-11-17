// The strength overview (Jake approved 2026-11-17; backlog #4 of docs/superpowers/specs/2026-11-17-progress-section-audit.md): "how much stronger
// am I than 3 / 12 months ago?". Each weight-and-reps lift's best estimated 1RM in the last 4 weeks against its best in the 4 weeks that ended
// 3 (or 12) months ago. A best over 4 weeks, so one off day or one missed week does not decide it. A lift in only one window gets no change.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const cmp = (ex, months, today = '2026-11-17') => JSON.parse(JSON.stringify(get('_strengthCompare')(ex, today, months)))
const e1 = sets => get('_sessionBestE1RM')(sets)
const S = (date, kg, reps = 5, extra = {}) => ({ date, sets: [{ weight_kg: kg, reps_achieved: reps, ...extra }] })
const L = (name, ...sessions) => ({ name, metricType: 'weight_reps', sessions })

describe('_strengthCompare', () => {
  test('3 months: the last 4 weeks (21 Oct to 17 Nov) against the 4 weeks to 17 Aug (21 Jul to 17 Aug)', () => {
    const r = cmp([L('Squat', S('2026-08-10', 100), S('2026-11-10', 110))], 3)
    assert.equal(r.then.from, '2026-07-21'); assert.equal(r.then.to, '2026-08-17')
    assert.equal(r.now.from, '2026-10-21'); assert.equal(r.now.to, '2026-11-17')
    assert.equal(r.rows.length, 1)
    assert.ok(Math.abs(r.rows[0].pct - 10) < 1e-9, '100 x 5 then, 110 x 5 now: +10%')
    assert.equal(r.up, 1)
  })

  test('1 year: against the 4 weeks to 17 Nov last year', () => {
    const r = cmp([L('Squat', S('2025-11-01', 100), S('2026-11-01', 120))], 12)
    assert.equal(r.then.from, '2025-10-21'); assert.equal(r.then.to, '2025-11-17')
    assert.ok(Math.abs(r.rows[0].pct - 20) < 1e-9)
  })

  test('each side is the BEST session in its 4 weeks, by the app\'s own estimate (warm-ups out, RPE counted)', () => {
    const rpe = { date: '2026-11-12', sets: [{ weight_kg: 100, reps_achieved: 3, effort_type: 'rpe', effort_value: 8 }, { weight_kg: 140, reps_achieved: 3, phase: 'warmup' }] }
    const r = cmp([L('Bench', S('2026-07-25', 80), S('2026-08-05', 85), S('2026-10-25', 90), rpe)], 3)
    assert.equal(r.rows[0].then, e1(S('2026-08-05', 85).sets), 'then: the better of the two sessions in the window')
    assert.equal(r.rows[0].now, Math.max(e1(S('2026-10-25', 90).sets), e1(rpe.sets)), 'now: the RPE-tagged triple counts, the warm-up does not')
  })

  test('the windows are inclusive at both ends, and nothing between them counts', () => {
    const r = cmp([L('A', S('2026-07-21', 100), S('2026-10-21', 105)), L('Edge', S('2026-07-20', 100), S('2026-11-17', 110)), L('Middle', S('2026-09-15', 100), S('2026-09-20', 120))], 3)
    assert.deepEqual(r.rows.map(x => x.name), ['A'])
    assert.equal(r.newSince, 1, 'Edge: 20 Jul is a day before the window, so it is new since then')
    assert.equal(r.notLately, 0, 'Middle is in neither window and is not counted at all')
  })

  test('a lift in one window only is counted, never given a change', () => {
    const r = cmp([L('Old', S('2026-08-01', 100)), L('New', S('2026-11-01', 100)), L('Both', S('2026-08-01', 100), S('2026-11-01', 95))], 3)
    assert.deepEqual(r.rows.map(x => x.name), ['Both'])
    assert.equal(r.notLately, 1); assert.equal(r.newSince, 1)
    assert.equal(r.up, 0, 'a lift that went down is not "stronger"')
  })

  test('biggest gain first; under half a percent is not "stronger"', () => {
    const r = cmp([L('Flat', S('2026-08-01', 100), S('2026-11-01', 100.4)), L('Big', S('2026-08-01', 100), S('2026-11-01', 120)), L('Small', S('2026-08-01', 100), S('2026-11-01', 105))], 3)
    assert.deepEqual(r.rows.map(x => x.name), ['Big', 'Small', 'Flat'])
    assert.equal(r.up, 2)
  })

  test('only weight-and-reps lifts with a weighted set; nothing in, nothing out', () => {
    const r = cmp([{ name: 'Run', metricType: 'cardio', sessions: [S('2026-08-01', 100), S('2026-11-01', 110)] },
      L('BW', { date: '2026-08-01', sets: [{ weight_kg: null, reps_achieved: 10 }] }, { date: '2026-11-01', sets: [{ weight_kg: null, reps_achieved: 12 }] })], 3)
    assert.deepEqual([r.rows.length, r.notLately, r.newSince], [0, 0, 0])
    const none = cmp(null, 3)
    assert.deepEqual([none.rows.length, none.up], [0, 0])
  })

  test('a month-end today counts back to the last day of the shorter month', () => {
    const r = cmp([], 3, '2026-05-31')
    assert.equal(r.then.to, '2026-02-28')
  })
})
