// Session review (MVP item 6, approved by Jake 2026-10-31): a logged session shows the plan workout it came from beside what was done - the
// prescribed line per exercise, a target per set, "Not done" for a planned exercise with no logged row, "Added" for one the client added, and
// a warning when the plan workout was edited after the session (only today's version is stored). One pure helper in js/app-runner.js:
// _sessionVsPlan(logExercises, plan, sessionDate) -> { hasPlan, changedSince, planned, done, rows, notDone }.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const vs = (...a) => JSON.parse(JSON.stringify(get('_sessionVsPlan')(...a)))
const collapsed = (sets, o) => get('_fmtSetsCollapsed')(sets, o)
const detail = (s, o) => get('_fmtSetDetail')(s, o)

const strength = [{ repsMin: 8, repsMax: 8, weight: 80, effortMin: 8, effortType: 'rpe' }, { repsMin: 8, repsMax: 8, weight: 80, effortMin: 8, effortType: 'rpe' }, { repsMin: 6, repsMax: 6, weight: 85, amrap: true }]
const pe = (o) => ({ id: 'te' + Math.random(), exercise_id: null, exercise_name: 'Bench Press', exercise_type: 'strength', metric_type: 'weight_reps', sets: null, sets_json: strength, order_index: 0, ...o })
const le = (o) => ({ id: 'le' + Math.random(), exercise_id: null, exercise_name: 'Bench Press', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0, ...o })
const plan = (exs, updated_at = '2026-10-20T12:00:00Z') => ({ id: 't1', updated_at, workout_template_exercises: exs })
const DATE = '2026-10-28'

describe('_sessionVsPlan - pairing what was done with what was prescribed', () => {
  test('a planned exercise that was logged: done, with the plan\'s own prescribed line and one target per set', () => {
    const r = vs([le({})], plan([pe({})]), DATE)
    assert.equal(r.hasPlan, true)
    assert.equal(r.planned, 1)
    assert.equal(r.done, 1)
    assert.equal(r.rows[0].status, 'done')
    assert.equal(r.rows[0].prescribed, collapsed(strength, {}))
    assert.deepEqual(r.rows[0].targets, strength.map(s => detail(s, {})))
    assert.deepEqual(r.notDone, [])
  })
  test('pairs by exercise id first, then by name (case and spaces ignored); each logged row is used once', () => {
    const r = vs([le({ exercise_id: 'x2', exercise_name: 'Squat' }), le({ exercise_name: '  bench press ' })],
      plan([pe({ exercise_name: 'Bench Press', exercise_id: 'x1' }), pe({ exercise_name: 'Back Squat', exercise_id: 'x2', order_index: 1 })]), DATE)
    assert.deepEqual(r.rows.map(x => x.status), ['done', 'done'])
    assert.equal(r.rows[0].planName, 'Back Squat')
    assert.equal(r.done, 2)
  })
  test('the same exercise planned twice and done once: one done, one not done', () => {
    const r = vs([le({})], plan([pe({}), pe({ order_index: 1 })]), DATE)
    assert.equal(r.planned, 2)
    assert.equal(r.done, 1)
    assert.deepEqual(r.notDone.map(x => x.name), ['Bench Press'])
  })
  test('a planned exercise with no logged row is Not done, carrying its prescribed line', () => {
    const r = vs([le({})], plan([pe({}), pe({ exercise_name: 'Row', order_index: 1, sets_json: [{ repsMin: 10, repsMax: 10 }] })]), DATE)
    assert.deepEqual(r.notDone, [{ name: 'Row', prescribed: collapsed([{ repsMin: 10, repsMax: 10 }], {}) }])
    assert.equal(r.done, 1)
    assert.equal(r.planned, 2)
  })
  test('a logged exercise the plan did not have is Added', () => {
    const r = vs([le({}), le({ exercise_name: 'Curl' })], plan([pe({})]), DATE)
    assert.deepEqual(r.rows.map(x => x.status), ['done', 'added'])
    assert.equal(r.rows[1].prescribed, null)
    assert.deepEqual(r.rows[1].targets, [])
    assert.equal(r.planned, 1)
  })
  test('no plan workout: nothing is marked, nothing is counted', () => {
    const r = vs([le({})], null, DATE)
    assert.equal(r.hasPlan, false)
    assert.equal(r.rows[0].status, null)
    assert.equal(r.rows[0].prescribed, null)
    assert.equal(r.planned, 0)
    assert.deepEqual(r.notDone, [])
  })
  test('the plan edited AFTER the session was saved says so (to the minute, timezone-proof); before it does not', () => {
    const S = { date: DATE, created_at: '2026-10-28T07:30:00Z' }
    assert.equal(vs([le({})], plan([pe({})], '2026-10-28T20:00:00Z'), S).changedSince, true, 'same day, later: review, 2026-10-31')
    assert.equal(vs([le({})], plan([pe({})], '2026-10-29T12:00:00Z'), S).changedSince, true)
    assert.equal(vs([le({})], plan([pe({})], '2026-10-28T06:00:00Z'), S).changedSince, false)
    assert.equal(vs([le({})], plan([pe({})], null), S).changedSince, false)
  })
  test('no saved time on the session: falls back to its date (a later day only)', () => {
    assert.equal(vs([le({})], plan([pe({})], '2026-10-29T12:00:00Z'), { date: DATE }).changedSince, true)
    assert.equal(vs([le({})], plan([pe({})], '2026-10-01T12:00:00Z'), { date: DATE }).changedSince, false)
  })
  test('a logged exercise with NO sets (a hand-logged form left blank) is not done, never counted as done (review, 2026-10-31)', () => {
    const r = vs([le({ workout_log_sets: [] })], plan([pe({})]), DATE)
    assert.equal(r.rows[0].status, 'not-done')
    assert.equal(r.done, 0)
    assert.equal(r.planned, 1)
  })
  test('targets are shown per set only when the logged set count matches the plan: a skipped set would shift them (review, 2026-10-31)', () => {
    const set = (n, side) => ({ set_number: n, ...(side ? { side } : {}) })
    assert.equal(vs([le({ workout_log_sets: [set(1), set(2), set(3)] })], plan([pe({})]), DATE).rows[0].targets.length, 3)
    const short = vs([le({ workout_log_sets: [set(1), set(2)] })], plan([pe({})]), DATE).rows[0]
    assert.deepEqual(short.targets, [])
    assert.equal(short.targetsHidden, true)
    assert.notEqual(short.prescribed, null, 'the prescribed line still shows')
    const uni = vs([le({ exercise_name: 'Split Squat', metric_type: 'unilateral', workout_log_sets: [set(1, 'left'), set(1, 'right')] })],
      plan([pe({ exercise_name: 'Split Squat', metric_type: 'unilateral', sets_json: [{ repsMin: 10, repsMax: 10 }] })]), DATE).rows[0]
    assert.equal(uni.targets.length, 1, 'a unilateral set is two rows, one set number')
  })
})

describe('_sessionVsPlan - every exercise type', () => {
  test('cardio: a prescribed line, no per-set targets (its sets do not line up one to one)', () => {
    const sj = [{ duration: '20:00', hrZoneMin: 2, hrZoneMax: 3 }]
    const r = vs([le({ exercise_name: 'Bike', exercise_type: 'cardio', metric_type: 'cardio' })], plan([pe({ exercise_name: 'Bike', exercise_type: 'cardio', metric_type: 'cardio', sets_json: sj })]), DATE)
    assert.equal(r.rows[0].prescribed, collapsed(sj, { isCardio: true }))
    assert.deepEqual(r.rows[0].targets, [])
  })
  test('interval: a prescribed line, no per-set targets', () => {
    const sj = [{ sets: 6, workSecs: 30, restSecs: 90, cycles: 1 }]
    const r = vs([le({ exercise_name: 'Sprints', exercise_type: 'cardio', metric_type: 'interval' })], plan([pe({ exercise_name: 'Sprints', exercise_type: 'cardio', metric_type: 'interval', sets_json: sj })]), DATE)
    assert.equal(r.rows[0].prescribed, collapsed(sj, { isCardio: true, isInterval: true }))
    assert.deepEqual(r.rows[0].targets, [])
  })
  test('unilateral: the line and each target say per side', () => {
    const sj = [{ repsMin: 10, repsMax: 10, weight: 20 }]
    const r = vs([le({ exercise_name: 'Split Squat', metric_type: 'unilateral' })], plan([pe({ exercise_name: 'Split Squat', metric_type: 'unilateral', sets_json: sj })]), DATE)
    assert.match(r.rows[0].prescribed, /per side/)
    assert.match(r.rows[0].targets[0], /per side/)
  })
  test('bodyweight and %1RM: the plan\'s own wording', () => {
    const bw = [{ repsMin: 12, repsMax: 15 }], pct = [{ repsMin: 5, repsMax: 5, intensityMin: 75, intensityMax: 75 }]
    const r = vs([le({ exercise_name: 'Push-up', metric_type: 'bodyweight' }), le({ exercise_name: 'Deadlift' })],
      plan([pe({ exercise_name: 'Push-up', metric_type: 'bodyweight', sets_json: bw }), pe({ exercise_name: 'Deadlift', sets_json: pct, order_index: 1 })]), DATE)
    assert.equal(r.rows[0].targets[0], detail(bw[0], {}))
    assert.equal(r.rows[1].targets[0], detail(pct[0], {}))
    assert.match(r.rows[1].prescribed, /75%/)
  })
  test('a zero is a real target: RIR 0 is shown, not dropped', () => {
    const sj = [{ repsMin: 5, repsMax: 5, effortMin: 0, effortMax: 0, effortType: 'rir' }]
    const r = vs([le({})], plan([pe({ sets_json: sj })]), DATE)
    assert.match(r.rows[0].targets[0], /RIR 0/)
  })
  test('a workout saved from a session (no per-set prescription, only a set count): "3 sets", no targets', () => {
    const r = vs([le({})], plan([pe({ sets_json: null, sets: 3 })]), DATE)
    assert.equal(r.rows[0].prescribed, '3 sets')
    assert.deepEqual(r.rows[0].targets, [])
  })
  test('an empty prescription (all blank sets): no line, no "3 × —"', () => {
    const r = vs([le({})], plan([pe({ sets_json: [{}, {}, {}] })]), DATE)
    assert.equal(r.rows[0].prescribed, null)
    assert.deepEqual(r.rows[0].targets, [null, null, null])
  })
  test('a legacy cardio row (metric_type left at weight_reps, exercise_type cardio) reads as cardio, as _resolveMetricType says', () => {
    const sj = [{ duration: '20:00' }]
    const r = vs([le({ exercise_name: 'Bike', exercise_type: 'cardio' })], plan([pe({ exercise_name: 'Bike', exercise_type: 'cardio', metric_type: 'weight_reps', sets_json: sj })]), DATE)
    assert.equal(r.rows[0].prescribed, collapsed(sj, { isCardio: true }))
    assert.deepEqual(r.rows[0].targets, [])
  })
  test('an empty plan workout and an empty session: zero planned, zero done, no crash', () => {
    const r = vs([], plan([]), DATE)
    assert.equal(r.planned, 0)
    assert.equal(r.done, 0)
    assert.deepEqual(r.rows, [])
  })
})
