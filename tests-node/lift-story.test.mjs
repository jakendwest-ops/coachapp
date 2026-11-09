// Phase 3: the story of a block, and the bodyweight trend. Pure parts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'
const story = (ex, t = '2026-11-08') => get('_liftStory')(ex, t)
const S = (date, kg, reps = 5) => ({ date, sets: [{ weight_kg: kg, reps_achieved: reps }] })
const L = (name, ...sessions) => ({ name, metricType: 'weight_reps', sessions })

test('ranks lifts by change and counts who got stronger', () => {
  const r = story([L('Flat', S('2026-10-12', 100), S('2026-11-02', 100)), L('Up', S('2026-10-12', 100), S('2026-11-02', 110))])
  assert.equal(r.rows.map(x => x.name).join(), 'Up,Flat'); assert.equal(r.up, 1)
  assert.ok(Math.abs(r.rows[0].pct - 10) < 0.01)
})
test('one off day does not read as going backwards', () => {
  const r = story([L('A', S('2026-10-12', 100), S('2026-10-26', 110), S('2026-11-02', 90))])
  assert.ok(r.rows[0].pct > 9)
})
test('a lift flat for its last three sessions is stalled; three sessions in all is too few to say', () => {
  assert.equal(story([L('A', S('2026-10-05', 100), S('2026-10-12', 100), S('2026-10-19', 95), S('2026-10-26', 100))]).stalled.join(), 'A')
  assert.equal(story([L('A', S('2026-10-12', 100), S('2026-10-19', 100), S('2026-10-26', 100))]).stalled.length, 0)
  assert.equal(story([L('A', S('2026-10-05', 100), S('2026-10-12', 100), S('2026-10-19', 105), S('2026-10-26', 100))]).stalled.length, 0)
})
test('leaves out one-off, old, bodyweight and non-lift sessions', () => {
  const r = story([L('Once', S('2026-11-01', 100)), L('Old', S('2026-01-01', 100), S('2026-02-01', 110)),
    L('BW', { date: '2026-10-12', sets: [{ weight_kg: 0, reps_achieved: 10 }] }, { date: '2026-11-02', sets: [{ weight_kg: null, reps_achieved: 12 }] }),
    { name: 'Row', metricType: 'interval', sessions: [S('2026-10-12', 100), S('2026-11-02', 110)] }])
  assert.equal(r.rows.length, 0)
})
test('warm-ups do not count, and the number is the one the chart draws', () => {
  const warm = { date: '2026-11-02', sets: [{ weight_kg: 200, reps_achieved: 5, phase: 'warmup' }, { weight_kg: 110, reps_achieved: 5, phase: 'work' }] }
  const r = story([L('A', S('2026-10-12', 100), warm)])
  assert.ok(Math.abs(r.rows[0].pct - 10) < 0.01)
  assert.equal(get('_sessionBestE1RM')(warm.sets), get('_xsSessionMetrics')(warm.sets).e1rm)
})
const targets = (row, linked) => ({ ...get('_weightTargets')(row, linked) })   // spread: the app's object comes from another realm, which strict deepEqual refuses
test('a linked goal supplies its own start, not an older saved one', () => {
  assert.deepEqual(targets({ starting_weight_kg: '90', goal_weight_kg: '70' }, { startKg: 82, goalKg: 85 }), { startingWeightKg: 82, goalWeightKg: 85 })
  assert.deepEqual(targets({ starting_weight_kg: '90' }, { startKg: null, goalKg: 85 }), { startingWeightKg: 90, goalWeightKg: 85 })
  assert.deepEqual(targets({ starting_weight_kg: '90', goal_weight_kg: '70' }, null), { startingWeightKg: 90, goalWeightKg: 70 })
  assert.deepEqual(targets({ starting_weight_kg: null, goal_weight_kg: 0 }, null), { startingWeightKg: null, goalWeightKg: 0 })
})
const W = (date, weight_kg) => ({ date, weight_kg })
const trend = (l, g = null, t = '2026-11-08') => get('_weightTrend')(l, g, t)
test('body weight trend per week, and when it reaches a goal it is heading for', () => {
  const r = trend([W('2026-10-18', 80), W('2026-10-25', 80.5), W('2026-11-01', 81), W('2026-11-08', 81.5)], 83.5)
  assert.ok(Math.abs(r.perWeek - 0.5) < 0.001); assert.ok(Math.abs(r.weeksToGoal - 4) < 0.01)
})
test('no projection when moving away from the goal or flat; none with too little data', () => {
  assert.equal(trend([W('2026-10-18', 82), W('2026-11-08', 81)], 85).weeksToGoal, null)
  assert.equal(trend([W('2026-10-18', 82), W('2026-11-08', 82)], 85).weeksToGoal, null)
  assert.equal(trend([W('2026-11-08', 82)], 85), null)
  assert.equal(trend([W('2026-11-05', 82), W('2026-11-08', 83)], 85), null)
})
