// Sessions: "vs last time" and weekly volume (docs/superpowers/specs/2026-10-31-performance-charts-design.md, goal 3). The pure rules: which session is "last time", how two
// sessions compare set by set, and what the weekly bars count. The screens are covered by tests/session-compare-2026-11-07.spec.js.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const json = (v) => JSON.parse(JSON.stringify(v))
const set = (n, weight_kg, reps_achieved, extra = {}) => ({ set_number: n, weight_kg, reps_achieved, ...extra })
const ex = (exercise_name, sets, extra = {}) => ({ exercise_name, exercise_type: 'strength', metric_type: 'weight_reps', workout_log_sets: sets, ...extra })
const sess = (id, date, name, family, exercises) => ({ id, date, name, workout_templates: family ? { family_id: family } : null, workout_log_exercises: exercises })
const bench = (w = 100, r = 5) => ex('Bench', [set(1, w, r)])

describe('_previousSessionOf: which session is "last time"', () => {
  const prev = (list, i = 0) => { const r = get('_previousSessionOf')(list, i); return r && r.id }

  test('the same template family, even under another name, skipping other workouts', () => {
    const list = [sess('a', '2026-11-05', 'Upper wk5', 'F', [bench()]), sess('b', '2026-11-03', 'Lower', 'G', [bench()]), sess('c', '2026-10-29', 'Upper wk4', 'F', [bench()])]
    assert.equal(prev(list), 'c')
  })
  test('with a family, the same name in another family is not the same workout', () => {
    assert.equal(prev([sess('a', '2026-11-05', 'Upper', 'F', [bench()]), sess('b', '2026-11-03', 'Upper', 'G', [bench()])]), null)
  })
  test('no family: the same name, ignoring case and spaces', () => {
    assert.equal(prev([sess('a', '2026-11-05', ' Upper ', null, [bench()]), sess('b', '2026-11-03', 'upper', null, [bench()])]), 'b')
  })
  test('a family on one side only falls back to the name: a deleted template must not make an old session vanish', () => {
    assert.equal(prev([sess('a', '2026-11-05', 'Upper', 'F', [bench()]), sess('b', '2026-11-03', 'Upper', null, [bench()])]), 'b')
    assert.equal(prev([sess('a', '2026-11-05', 'Upper', null, [bench()]), sess('b', '2026-11-03', 'Upper', 'F', [bench()])]), 'b')
  })
  test('"Workout", the default name of an untitled session, says nothing about what was done', () => {
    assert.equal(prev([sess('a', '2026-11-05', 'Workout', null, [bench()]), sess('b', '2026-11-03', 'Workout', null, [bench()])]), null)
  })
  test('an abandoned session with no sets is never "last time"', () => {
    const list = [sess('a', '2026-11-05', 'Upper', 'F', [bench()]), sess('b', '2026-11-03', 'Upper', 'F', [ex('Bench', [])]), sess('c', '2026-11-01', 'Upper', 'F', [bench()])]
    assert.equal(prev(list), 'c')
  })
  test('warm-up phases alone do not make a session', () => {
    const list = [sess('a', '2026-11-05', 'Row', 'F', [bench()]), sess('b', '2026-11-03', 'Row', 'F', [ex('Row', [set(1, null, null, { phase: 'warmup' })])])]
    assert.equal(prev(list), null)
  })
  test('the oldest session has none; an unnamed session with no family matches nothing', () => {
    assert.equal(prev([sess('a', '2026-11-05', 'Upper', 'F', [bench()])]), null)
    assert.equal(prev([sess('a', '2026-11-05', '', null, [bench()]), sess('b', '2026-11-03', '', null, [bench()])]), null)
  })
})

describe('_setMark: one set against the same set last time', () => {
  const mark = (now, then) => get('_setMark')(now, then)
  test('more weight for the same reps, or more reps at the same weight, is up', () => {
    assert.equal(mark(set(1, 105, 5), set(1, 100, 5)), 'up')
    assert.equal(mark(set(1, 100, 6), set(1, 100, 5)), 'up')
    assert.equal(mark(set(1, 105, 6), set(1, 100, 5)), 'up')
  })
  test('the reverse is down, and the same set is the same', () => {
    assert.equal(mark(set(1, 95, 5), set(1, 100, 5)), 'down')
    assert.equal(mark(set(1, 100, 4), set(1, 100, 5)), 'down')
    assert.equal(mark(set(1, 95, 4), set(1, 100, 5)), 'down')
    assert.equal(mark(set(1, 100, 5), set(1, 100, 5)), 'same')
  })
  test('more weight for fewer reps claims nothing either way', () => {
    assert.equal(mark(set(1, 110, 3), set(1, 100, 5)), null)
  })
  test('a bodyweight set (no weight) compares its reps, and zero is a real weight', () => {
    assert.equal(mark(set(1, null, 12), set(1, null, 10)), 'up')
    assert.equal(mark(set(1, 0, 10), set(1, null, 10)), 'same')
  })
  test('a set with no reps recorded (a hold, a distance) claims nothing', () => {
    assert.equal(mark(set(1, null, null, { duration_seconds: 60 }), set(1, null, null, { duration_seconds: 45 })), null)
  })
})

describe('_setChange: what moved in one set (the Change column)', () => {
  const change = (now, then) => json(get('_setChange')(now, then))
  const rpe = v => ({ effort_type: 'rpe', effort_value: v })
  test('weight, reps and RPE, each only when it changed (Jake\'s screenshot: 55x7 @7 then 70x3 @7)', () => {
    assert.deepEqual(change(set(1, 70, 3, rpe(7)), set(1, 55, 7, rpe(7))), [['+15 kg', 'up'], ['−4 reps', 'down'], ['RPE same', 'even']])
    assert.deepEqual(change(set(1, 57.5, 4), set(1, 57.5, 7, rpe(8))), [['−3 reps', 'down']])
    assert.deepEqual(change(set(1, 100, 6), set(1, 100, 5)), [['+1 rep', 'up']])
  })
  test('an identical set is "same"; an RPE that moved is never coloured', () => {
    assert.deepEqual(change(set(1, 100, 5, rpe(8)), set(1, 100, 5, rpe(8))), [['same', 'even']])
    assert.deepEqual(change(set(1, 100, 5, rpe(9)), set(1, 100, 5, rpe(8))), [['RPE +1', 'even']])
  })
  test('RPE against RIR says nothing about effort: they run in opposite directions', () => {
    assert.deepEqual(change(set(1, 100, 5, { effort_type: 'rir', effort_value: 2 }), set(1, 100, 5, rpe(8))), [])
  })
  test('bodyweight compares reps; zero is a real weight; going from bodyweight to a load shows the load', () => {
    assert.deepEqual(change(set(1, null, 10), set(1, null, 8)), [['+2 reps', 'up']])
    assert.deepEqual(change(set(1, 0, 10), set(1, null, 10)), [['same', 'even']])
    assert.deepEqual(change(set(1, 10, 8), set(1, null, 8)), [['+10 kg', 'up']])
  })
  test('pounds: the difference of the two weights as shown', () => {
    const prefs = get('window')._unitPrefs, before = prefs.weight
    try { prefs.weight = 'lb'; assert.deepEqual(change(set(1, 102.5, 5), set(1, 100, 5)), [['+5.5 lb', 'up']]) } finally { prefs.weight = before }
  })
  test('a hold, a jump and a distance', () => {
    assert.deepEqual(change(set(1, null, null, { duration_seconds: 60 }), set(1, null, null, { duration_seconds: 45 })), [['+15 s', 'up']])
    assert.deepEqual(change(set(1, null, null, { duration_seconds: 90 }), set(1, null, null, { duration_seconds: 180 })), [['−1:30', 'down']])
    assert.deepEqual(change(set(1, null, null, { height_cm: 52 }), set(1, null, null, { height_cm: 50 })), [['+2 cm', 'up']])
    assert.deepEqual(change(set(1, null, null, { distance_m: 1200, duration_seconds: 300 }), set(1, null, null, { distance_m: 1000, duration_seconds: 300 })), [['+200 m', 'up']])
  })
  test('unilateral: the side is not a change', () => {
    assert.deepEqual(change(set(1, 20, 10, { side: 'left' }), set(1, 17.5, 10, { side: 'left' })), [['+2.5 kg', 'up']])
  })
  test('a loaded hold that got longer says so, never "same" (review, 2026-11-08)', () => {
    assert.deepEqual(change(set(1, 20, null, { duration_seconds: 45 }), set(1, 20, null, { duration_seconds: 30 })), [['+15 s', 'up']])
  })
  test('the weight difference matches the weights as shown, both ways', () => {
    assert.deepEqual(change(set(1, 101.25, 5), set(1, 100, 5)), [['+1.25 kg', 'up']])
    assert.deepEqual(change(set(1, 100, 5), set(1, 100.25, 5)), [['−0.25 kg', 'down']])
  })
  test('nothing to compare is not "same": a time on one side and a distance on the other', () => {
    assert.deepEqual(change(set(1, null, null, { duration_seconds: 300 }), set(1, null, null, { distance_m: 1000 })), [])
  })
})

describe('_sessionCompare: two sessions', () => {
  const cmp = (a, b) => json(get('_sessionCompare')(sess('a', '2026-11-05', 'Upper', 'F', a), sess('b', '2026-10-29', 'Upper', 'F', b)))
  const row = (r, name) => r.exercises.find(e => e.name === name)

  test('each exercise in both says how many sets were added or dropped, and each paired set what changed', () => {
    const r = cmp([ex('Bench', [set(1, 105, 5), set(2, 100, 5)])], [ex('Bench', [set(1, 100, 5), set(2, 100, 5), set(3, 100, 5)])])
    assert.equal(row(r, 'Bench').setDelta, -1)
    assert.deepEqual(row(r, 'Bench').sets.map(x => x.change), [[['+5 kg', 'up']], [['same', 'even']], null])
    assert.equal(row(cmp([ex('Curl', [set(1, 20, 10)])], [bench()]), 'Curl').setDelta, 0, 'a new exercise has no count to compare')
  })
  test('a unilateral lift counts sets per side: one more each side is one more set', () => {
    const lr = n => Array.from({ length: n }, (_, k) => [set(k + 1, 20, 10, { side: 'left' }), set(k + 1, 20, 10, { side: 'right' })]).flat()
    assert.equal(row(cmp([ex('Lunge', lr(4))], [ex('Lunge', lr(3))]), 'Lunge').setDelta, 1)
  })
  test('the total kg change, and how many of the exercises in both went up', () => {
    const r = cmp([ex('Bench', [set(1, 105, 5)]), ex('Row', [set(1, 80, 5)]), ex('Curl', [set(1, 20, 5)])], [ex('Bench', [set(1, 100, 5)]), ex('Row', [set(1, 80, 5)]), ex('Press', [set(1, 50, 5)])])
    assert.equal(r.nowTotalKg, 525 + 400 + 100)
    assert.equal(r.thenTotalKg, 500 + 400 + 250)
    assert.equal(r.upCount, 1)
    assert.equal(r.bothCount, 2)
  })
  test('sets match in order; a set missing this time says so, and an extra set is named', () => {
    const fewer = row(cmp([ex('Bench', [set(1, 100, 5)])], [ex('Bench', [set(1, 100, 5), set(2, 100, 5)])]), 'Bench')
    assert.deepEqual(fewer.sets.map(s => s.mark), ['same', 'missing'])
    assert.equal(fewer.verdict, 'fewer-sets')
    const more = row(cmp([ex('Bench', [set(1, 100, 5), set(2, 100, 5)])], [ex('Bench', [set(1, 100, 5)])]), 'Bench')
    assert.deepEqual(more.sets.map(s => s.mark), ['same', 'extra'])
    assert.equal(more.verdict, 'more-sets')
  })
  test('sets are put in set order first: the API gives an embed in no order', () => {
    const r = row(cmp([ex('Bench', [set(2, 80, 5), set(1, 100, 5)])], [ex('Bench', [set(1, 100, 5), set(2, 75, 5)])]), 'Bench')
    assert.deepEqual(r.sets.map(s => s.mark), ['same', 'up'])
  })
  test('verdicts: improved, down, mixed, same; an exercise only this time or only last time gets no arrows', () => {
    const r = cmp(
      [ex('A', [set(1, 105, 5)]), ex('B', [set(1, 95, 5)]), ex('C', [set(1, 105, 5), set(2, 95, 5)]), ex('D', [set(1, 100, 5)]), ex('New', [set(1, 50, 5)])],
      [ex('A', [set(1, 100, 5)]), ex('B', [set(1, 100, 5)]), ex('C', [set(1, 100, 5), set(2, 100, 5)]), ex('D', [set(1, 100, 5)]), ex('Gone', [set(1, 50, 5)])])
    assert.deepEqual(r.exercises.map(e => [e.name, e.verdict]), [['A', 'improved'], ['B', 'down'], ['C', 'mixed'], ['D', 'same'], ['New', 'new'], ['Gone', 'not-done']])
    assert.equal(r.upCount, 1, 'only A')
    assert.equal(r.bothCount, 4)
  })
  test('a change that cannot be called up or down is "changed", never "same", and does not count toward "exercises up"', () => {
    const plank = (s) => ex('Plank', [set(1, null, null, { duration_seconds: s })], { metric_type: 'timed' })
    const r = cmp([plank(60), ex('Bench', [set(1, 110, 3)])], [plank(45), ex('Bench', [set(1, 100, 5)])])
    assert.equal(row(r, 'Plank').verdict, 'changed')
    assert.equal(row(r, 'Bench').verdict, 'changed')
    assert.equal(r.bothCount, 0)
    const same = cmp([plank(60)], [plank(60)])
    assert.equal(row(same, 'Plank').verdict, 'same', 'an identical hold is the same')
  })
  test('a real up alongside a set that cannot be called keeps the up', () => {
    const r = cmp([ex('Bench', [set(1, 105, 5), set(2, 110, 3)])], [ex('Bench', [set(1, 100, 5), set(2, 100, 5)])])
    assert.equal(row(r, 'Bench').verdict, 'improved')
  })
  test('unilateral sets pair side by side: a missing side does not shift the rest', () => {
    const L = (n, w, r) => set(n, w, r, { side: 'left' }), R = (n, w, r) => set(n, w, r, { side: 'right' })
    const r = row(cmp([ex('Lunge', [R(1, 20, 10), L(1, 22, 10), R(2, 20, 10)])], [ex('Lunge', [L(1, 20, 10), R(1, 20, 10), L(2, 20, 10), R(2, 20, 10)])]), 'Lunge')
    assert.deepEqual(r.sets.map(s => [(s.now || s.then).side, (s.now || s.then).set_number, s.mark]), [['left', 1, 'up'], ['right', 1, 'same'], ['left', 2, 'missing'], ['right', 2, 'same']])
  })
  test('warm-up phases are not sets, and one exercise twice in a session is one row', () => {
    const r = row(cmp([ex('Bench', [set(1, 40, 5, { phase: 'warmup' }), set(2, 100, 5)]), ex('Bench', [set(3, 100, 5)])], [ex('Bench', [set(1, 100, 5), set(2, 100, 5)])]), 'Bench')
    assert.deepEqual(r.sets.map(s => s.mark), ['same', 'same'])
    assert.equal(r.nowKg, 1000)
  })
  test('cardio gets no verdict and no kg, and does not count as an exercise that could go up', () => {
    const run = (m) => ex('Run', [set(1, null, null, { distance_m: m })], { exercise_type: 'cardio', metric_type: 'cardio' })
    const r = cmp([run(5000)], [run(4000)])
    assert.equal(r.hasKg, false)
    assert.equal(r.bothCount, 0)
    assert.equal(row(r, 'Run').verdict, null)
  })
})

describe('_sessionVsLine: the line on the card', () => {
  const line = (over) => get('_sessionVsLine')({ nowTotalKg: 1320, thenTotalKg: 1000, upCount: 3, bothCount: 5, hasKg: true, ...over }, '2026-11-02')
  test('kg, exercises, and the date of last time', () => {
    assert.equal(line(), 'vs Mon 2 Nov: +320 kg · 3 of 5 exercises up')
  })
  test('down, and a change that rounds to nothing', () => {
    assert.equal(line({ nowTotalKg: 879.6 }), 'vs Mon 2 Nov: −120 kg · 3 of 5 exercises up')
    assert.equal(line({ nowTotalKg: 1000.3 }), 'vs Mon 2 Nov: same total kg · 3 of 5 exercises up')
  })
  test('it is the difference of the two rounded totals, so it never disagrees with the two tiles above it', () => {
    assert.equal(line({ nowTotalKg: 1000.4, thenTotalKg: 999.6 }), 'vs Mon 2 Nov: same total kg · 3 of 5 exercises up')
  })
  test('one exercise, and a session with nothing to weigh', () => {
    assert.equal(line({ bothCount: 1, upCount: 1 }), 'vs Mon 2 Nov: +320 kg · 1 of 1 exercise up')
    assert.equal(line({ hasKg: false, bothCount: 0, upCount: 0 }), 'vs Mon 2 Nov')
  })
})

describe('_weeklyVolume: the bars', () => {
  const weeks = (list, today = '2026-11-05') => json(get('_weeklyVolume')(list, today))
  test('eight weeks, oldest first, ending with this week, empty weeks included', () => {
    const w = weeks([])
    assert.equal(w.length, 8)
    assert.equal(w[0].monday, '2026-09-14')
    assert.equal(w[7].monday, '2026-11-02')
    assert.deepEqual(w.map(x => x.current), [false, false, false, false, false, false, false, true])
    assert.ok(w.every(x => x.sets === 0 && x.kg === 0))
  })
  test('a week runs Monday to Sunday, and sessions before the eight weeks are left out', () => {
    const w = weeks([sess('a', '2026-11-02', 'x', null, [bench()]), sess('b', '2026-11-01', 'x', null, [bench()]), sess('c', '2026-09-13', 'x', null, [bench()])])
    assert.equal(w[7].sets, 1)
    assert.equal(w[6].sets, 1)
    assert.equal(w.reduce((n, x) => n + x.sets, 0), 2)
  })
  test('working sets only: no warm-up phases, no cardio or interval in sets or kg; a timed hold is a set with no kg', () => {
    const w = weeks([sess('a', '2026-11-03', 'x', null, [
      ex('Bench', [set(1, 40, 5, { phase: 'warmup' }), set(2, 100, 5)]),
      ex('Run', [set(1, null, null, { distance_m: 5000 })], { exercise_type: 'cardio', metric_type: 'cardio' }),
      ex('Tabata', [set(1, null, null, { duration_seconds: 20, phase: 'work' })], { exercise_type: 'cardio', metric_type: 'interval' }),
      ex('Plank', [set(1, null, null, { duration_seconds: 60 })], { metric_type: 'timed' }),
    ])])
    assert.equal(w[7].sets, 2)
    assert.equal(w[7].kg, 500)
  })
})
