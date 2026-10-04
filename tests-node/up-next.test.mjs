// The Workouts page's "Up next" card, and the program-week and next-session rules behind it (Jake, 2026-10-04: "Needs to include the next
// workout name").
//
// Reading the code for that request showed the card (_buildWorkoutsHero) took the FIRST session of the current program week whatever today
// was or had been done, so after Monday's workout it still pointed at Monday's: naming it would have named the wrong workout. It now finds the
// session with the calendar's own date map (_programWorkoutsByDate) and the dashboard's rule (_dashNextSession): today's session while it is
// not logged, otherwise the next planned one - so this card and the dashboard's Today card name the same workout.
//
// A second slip turned up on the way: the calendar anchors week 1 to the MONDAY of the start date's week, but the dashboard's program tile and
// this card counted seven-day blocks FROM the start date, so for a program that starts mid-week they disagreed for a few days of every week.
//
// Dates: 2026-09-28 is a Monday; 10-01 a Thursday; 10-03 a Saturday; 10-05 the next Monday.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

// ─── program weeks, the way the calendar counts them ────────────────────────────────────────────────────────────────────────────
describe('_programWeeksElapsed — Monday-to-Sunday program weeks', () => {
  const w = (start, today) => get('_programWeeksElapsed')(start, today)

  test('a Monday start: the week turns over every Monday', () => {
    assert.equal(w('2026-09-28', '2026-09-28'), 0)
    assert.equal(w('2026-09-28', '2026-10-04'), 0, 'Sunday is still week 1')
    assert.equal(w('2026-09-28', '2026-10-05'), 1)
  })

  test('a Thursday start: week 2 begins on the next MONDAY, as the calendar has it - not seven days after the start', () => {
    assert.equal(w('2026-10-01', '2026-10-01'), 0)
    assert.equal(w('2026-10-01', '2026-10-04'), 0, 'Sunday: the last day of week 1')
    assert.equal(w('2026-10-01', '2026-10-05'), 1, 'Monday: week 2 (seven-day blocks said week 1 until the next Thursday)')
    assert.equal(w('2026-10-01', '2026-10-07'), 1, 'Wednesday: still week 2')
    assert.equal(w('2026-10-01', '2026-10-12'), 2)
  })

  test('no start date, an unreadable one, or one in the future is 0 - never NaN, never negative', () => {
    assert.equal(w(null, '2026-10-03'), 0)
    assert.equal(w('', '2026-10-03'), 0)
    assert.equal(w('not a date', '2026-10-03'), 0)
    assert.equal(w('2026-11-02', '2026-10-03'), 0)
  })
})

describe('_dashProgramInfo — a program that starts mid-week', () => {
  const phases = [{ id: 'p1', name: 'Accumulation 1', duration_weeks: 4, order_index: 1 }, { id: 'p2', name: 'Intensification', duration_weeks: 4, order_index: 2 }]
  const cp = start => ({ start_date: start, programs: { name: 'Operation 240', description: '', program_phases: phases } })

  test('started on a Thursday, Tuesday of the next week is week 2 (it read week 1 until that Thursday)', () => {
    assert.equal(get('_dashProgramInfo')(cp('2026-10-01'), '2026-10-04').week, 1)
    assert.equal(get('_dashProgramInfo')(cp('2026-10-01'), '2026-10-06').week, 2)
  })

  test('the phase follows the same Monday weeks: week 5 begins on Monday 26 Oct', () => {
    assert.equal(get('_dashProgramInfo')(cp('2026-10-01'), '2026-10-25').phase, 'Accumulation 1')
    assert.equal(get('_dashProgramInfo')(cp('2026-10-01'), '2026-10-26').phase, 'Intensification')
  })
})

// ─── each dated session knows its phase and its week of that phase ──────────────────────────────────────────────────────────────
describe('_programWorkoutsByDate — each session knows its phase and its week of that phase', () => {
  const cp = phases => ({ id: 'cp1', start_date: '2026-08-03', programs: { program_phases: phases } })
  const by = phases => get('_programWorkoutsByDate')(cp(phases), {})

  test('a phase that repeats week 1: every repeat says which week it is', () => {
    const m = by([{ id: 'p1', name: 'Base', duration_weeks: 3, order_index: 0, program_phase_workouts: [{ id: 'a', day_of_week: 1, session_order: 1, week_number: 1 }] }])
    assert.deepEqual(['2026-08-03', '2026-08-10', '2026-08-17'].map(d => [m[d][0]._phaseName, m[d][0]._weekInPhase]), [['Base', 1], ['Base', 2], ['Base', 3]])
  })

  test('a periodised phase: each week\'s own row is on its own week', () => {
    const m = by([{ id: 'p1', name: 'Peak', duration_weeks: 2, order_index: 0, program_phase_workouts: [
      { id: 'a', day_of_week: 1, session_order: 1, week_number: 1 }, { id: 'b', day_of_week: 1, session_order: 1, week_number: 2 }] }])
    assert.equal(m['2026-08-10'][0]._weekInPhase, 2)
    assert.equal(m['2026-08-10'][0].id, 'b')
  })

  test('the week is within the PHASE: the second phase starts again at week 1', () => {
    const m = by([
      { id: 'p1', name: 'One', duration_weeks: 1, order_index: 0, program_phase_workouts: [{ id: 'a', day_of_week: 1, session_order: 1, week_number: 1 }] },
      { id: 'p2', name: 'Two', duration_weeks: 2, order_index: 1, program_phase_workouts: [{ id: 'b', day_of_week: 1, session_order: 1, week_number: 1 }] },
    ])
    assert.deepEqual([m['2026-08-10'][0]._phaseName, m['2026-08-10'][0]._weekInPhase], ['Two', 1])
    assert.deepEqual([m['2026-08-17'][0]._phaseName, m['2026-08-17'][0]._weekInPhase], ['Two', 2])
  })
})

// ─── the session to do next ─────────────────────────────────────────────────────────────────────────────────────────────────────
describe('_dashNextSession — the session to do next', () => {
  const next = (prog, logs, today) => get('_dashNextSession')(prog, logs, today)
  // Mon 5 Oct, Wed 7 Oct (two sessions), Fri 9 Oct.
  const plan = { '2026-10-05': [{ id: 'mon' }], '2026-10-07': [{ id: 'wed' }, { id: 'wed-pm' }], '2026-10-09': [{ id: 'fri' }] }

  test('a session planned TODAY that is not logged yet is next', () => {
    const n = next(plan, [], '2026-10-05')
    assert.equal(n.ds, '2026-10-05')
    assert.equal(n.sessions[0].id, 'mon')
  })

  test('once something is logged today, the next planned day is next (Jake\'s case: the card kept pointing at the session he had done)', () => {
    const n = next(plan, [{ date: '2026-10-05' }], '2026-10-05')
    assert.equal(n.ds, '2026-10-07')
    assert.equal(n.sessions[0].id, 'wed')
  })

  test('a rest day: the first planned session after today', () => {
    assert.equal(next(plan, [], '2026-10-06').ds, '2026-10-07')
    assert.equal(next(plan, [], '2026-10-08').ds, '2026-10-09')
  })

  test('the whole day comes back in order, so the card can say "+1 more"', () => {
    assert.deepEqual(next(plan, [], '2026-10-06').sessions.map(s => s.id), ['wed', 'wed-pm'])
  })

  test('earlier sessions never count, logged or not (the week strip shows an unlogged one as missed)', () => {
    assert.equal(next(plan, [], '2026-10-08').ds, '2026-10-09')
    assert.equal(next({ '2026-10-05': [{ id: 'mon' }] }, [], '2026-10-06'), null)
  })

  test('a log from another day does not make today done', () => {
    assert.equal(next(plan, [{ date: '2026-10-04' }], '2026-10-05').ds, '2026-10-05')
  })

  test('nothing left in the program, an empty plan, or no plan at all: null', () => {
    assert.equal(next(plan, [], '2026-10-10'), null)
    assert.equal(next({}, [], '2026-10-05'), null)
    assert.equal(next(null, null, '2026-10-05'), null)
    assert.equal(next({ '2026-10-07': [] }, [], '2026-10-05'), null, 'a day with an empty list is not a session')
  })

  test('the order of the keys in the plan does not matter', () => {
    const shuffled = { '2026-10-09': [{ id: 'fri' }], '2026-10-05': [{ id: 'mon' }], '2026-10-07': [{ id: 'wed' }] }
    assert.equal(next(shuffled, [], '2026-10-06').ds, '2026-10-07')
  })
})

// ─── the card ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const hero = (assign, clones, ctx) => get('_buildWorkoutsHero')('c1', assign, clones, ctx)
const phase = (id, name, weeks, rows, order = 1) => ({ id, name, duration_weeks: weeks, order_index: order, program_phase_workouts: rows })
const row = (id, dow, week = 1, so = 1) => ({ id, day_of_week: dow, session_order: so, week_number: week })
const assign = (start, phases, name = 'Operation 240') => ({ id: 'cp1', start_date: start, programs: { name, description: '', program_phases: phases } })

// A 4-week phase, Upper Body on Monday and Lower Body on Thursday, started Monday 28 Sep.
const PROGRAM = assign('2026-09-28', [phase('p1', 'Accumulation 1', 4, [row('a', 1), row('b', 4)])])
const CLONES = { a: { templateId: 'clone-a', name: 'Upper Body' }, b: { templateId: 'clone-b', name: 'Lower Body' } }
const logged = (...dates) => dates.map(date => ({ date }))

describe('the Up next card names the session you would do next', () => {
  test('Saturday, both sessions done: next is Monday\'s Upper Body, with the date and the week it belongs to', () => {
    const h = hero(PROGRAM, CLONES, { todayStr: '2026-10-03', logs: logged('2026-09-28', '2026-10-01') })
    assert.equal(h.eyebrow, 'Up next · Mon 5 Oct')
    assert.equal(h.title, 'Upper Body')
    assert.equal(h.meta, 'Operation 240 · Accumulation 1 · Week 2')
    assert.equal(h.action, "startWorkoutRunner('c1','clone-a')")
  })

  test('a session planned today and not logged: it says Today', () => {
    const h = hero(PROGRAM, CLONES, { todayStr: '2026-10-01', logs: logged('2026-09-28') })
    assert.equal(h.eyebrow, 'Up next · Today')
    assert.equal(h.title, 'Lower Body')
    assert.equal(h.meta, 'Operation 240 · Accumulation 1 · Week 1')
    assert.equal(h.action, "startWorkoutRunner('c1','clone-b')")
  })

  test('once today\'s is logged the card moves on - it no longer points at the session already done', () => {
    const h = hero(PROGRAM, CLONES, { todayStr: '2026-10-01', logs: logged('2026-09-28', '2026-10-01') })
    assert.equal(h.title, 'Upper Body')
    assert.equal(h.eyebrow, 'Up next · Mon 5 Oct')
  })

  test('a rest day: the next planned day', () => {
    const h = hero(PROGRAM, CLONES, { todayStr: '2026-09-29', logs: logged('2026-09-28') })
    assert.equal(h.eyebrow, 'Up next · Thu 1 Oct')
    assert.equal(h.title, 'Lower Body')
  })

  test('a periodised week\'s clone is named "Upper Body — W2": the " — W2" is not shown (the Workouts list below strips it too)', () => {
    const h = hero(PROGRAM, { a: { templateId: 'clone-a2', name: 'Upper Body — W2' }, b: CLONES.b }, { todayStr: '2026-10-03', logs: logged('2026-10-01') })
    assert.equal(h.title, 'Upper Body')
  })

  test('a periodised phase: the week\'s own row is the one named', () => {
    const periodised = assign('2026-09-28', [phase('p1', 'Peak', 2, [row('a', 1, 1), row('a2', 1, 2)])])
    const clones = { a: { templateId: 'w1', name: 'Squat heavy' }, a2: { templateId: 'w2', name: 'Squat light' } }
    const h = hero(periodised, clones, { todayStr: '2026-10-03', logs: [] })
    assert.equal(h.title, 'Squat light')
    assert.equal(h.meta, 'Operation 240 · Peak · Week 2')
    assert.equal(h.action, "startWorkoutRunner('c1','w2')")
  })

  test('two sessions that day: the first is named and the card says there is more', () => {
    const two = assign('2026-09-28', [phase('p1', 'Base', 4, [row('a', 1, 1, 1), row('b', 1, 1, 2)])])
    const h = hero(two, CLONES, { todayStr: '2026-09-28', logs: [] })
    assert.equal(h.title, 'Upper Body')
    assert.match(h.meta, /\+1 more today$/)
    const later = hero(two, CLONES, { todayStr: '2026-09-29', logs: [] })
    assert.match(later.meta, /\+1 more that day$/)
  })

  test('the Workouts card and the dashboard\'s program tile say the same week for a program that started mid-week', () => {
    const thursdayStart = assign('2026-10-01', [phase('p1', 'Accumulation 1', 4, [row('a', 1), row('b', 4)])])
    // Tuesday 6 Oct: the calendar is in week 2, and the next session is Thursday's, which belongs to week 2.
    const h = hero(thursdayStart, CLONES, { todayStr: '2026-10-06', logs: [] })
    assert.match(h.meta, /Week 2$/)
    assert.equal(get('_dashProgramInfo')(thursdayStart, '2026-10-06').week, 2)
  })
})

describe('the edges of the card', () => {
  test('the last session of the program is done: it says the program is complete and offers a freeform session, not an old session', () => {
    const h = hero(PROGRAM, CLONES, { todayStr: '2026-10-26', logs: [] })
    assert.equal(h.eyebrow, 'Program complete')
    assert.equal(h.title, 'Operation 240')
    assert.equal(h.action, "startWorkoutRunner('c1')")
    assert.equal(h.btnLabel, 'Start a session')
  })

  test('no program assigned', () => {
    const h = hero(null, {}, {})
    assert.equal(h.title, 'No program assigned')
    assert.equal(h.action, "startWorkoutRunner('c1')")
  })

  test('a session whose copy is missing still names itself by the program, and Start falls back to a freeform session', () => {
    const h = hero(PROGRAM, {}, { todayStr: '2026-10-03', logs: [] })
    assert.equal(h.title, 'Operation 240')
    assert.equal(h.action, "startWorkoutRunner('c1')")
  })

  test('no start date means no dated plan: the old reading (the first session of the current program week) still works, with the name', () => {
    const undated = assign(null, [phase('p1', 'Accumulation 1', 4, [row('b', 4), row('a', 1)])])
    const h = hero(undated, CLONES, { todayStr: '2026-10-03', logs: [] })
    assert.equal(h.eyebrow, 'Up next')
    assert.equal(h.title, 'Upper Body', 'Monday comes before Thursday')
    assert.equal(h.meta, 'Operation 240 · Accumulation 1 · Week 1')
    assert.equal(h.action, "startWorkoutRunner('c1','clone-a')")
  })

  test('called the old way (three arguments, no date or logs) it still answers', () => {
    const h = get('_buildWorkoutsHero')('c1', assign(new Date().toISOString().split('T')[0], [phase('p1', 'Phase 1', 4, [row('pw-1', 1)])], 'Test Program'), { 'pw-1': { templateId: 'tmpl-abc' } })
    assert.equal(h.title, 'Test Program')
    assert.match(h.meta, /Phase 1/)
    assert.match(h.action, /startWorkoutRunner\('c1','tmpl-abc'\)/)
  })
})

describe('_renderWorkoutsHeroHtml — names are text, never markup', () => {
  test('the eyebrow, title and meta are escaped', () => {
    const html = get('_renderWorkoutsHeroHtml')({ eyebrow: 'Up next · <b>x</b>', title: '<img src=x onerror=alert(1)>', meta: '<script>1</script>', action: "startWorkoutRunner('c1')", btnLabel: '▶ Start' })
    assert.doesNotMatch(html, /<img|<script|<b>/)
    assert.match(html, /&lt;img/)
  })
  test('the eyebrow defaults to "Up next"', () => {
    assert.match(get('_renderWorkoutsHeroHtml')({ title: 'T', meta: 'M', action: 'a()', btnLabel: 'Go' }), />Up next</)
  })
})
