// Scheduled workouts (Personal view, 2026-11-16; docs/bugs/2026-11-16-new-workout-cannot-be-scheduled-or-seen-on-dashboard.md).
// A workout put on a day is a calendar event with template_id; _scheduledByDate turns those rows into planned sessions of the SAME
// shape as a plan session, and _mergePlanned adds them to a plan's day map. Every screen that judges a day (Today, the week strip,
// done / missed, the calendar) reads that one merged map - so these two pure functions are the whole rule.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const json = (v) => JSON.parse(JSON.stringify(v))
const ev = (id, date, tid, name, exs = []) => ({ id, date, title: name, template_id: tid, workout_templates: tid ? { id: tid, name, workout_template_exercises: exs } : null })

describe('scheduled workouts', () => {
  test('an event with a workout becomes a planned session that ▶ Start can run', () => {
    const m = get('_scheduledByDate')([ev('e1', '2026-11-16', 't1', 'Upper A', [{ exercise_name: 'Bench' }])])
    assert.deepEqual(Object.keys(m), ['2026-11-16'])
    const s = m['2026-11-16'][0]
    assert.equal(s._scheduled, true)
    assert.equal(s._scheduledEventId, 'e1')
    assert.equal(s._clientTemplateId, 't1', 'Start runs the person\'s own workout')
    assert.equal(s.workout_templates.name, 'Upper A')
    assert.equal(get('_dashSessionName')(s), 'Upper A', 'named the way a plan session is')
    assert.deepEqual(json(s._clientExercises), [{ exercise_name: 'Bench' }], 'the calendar day sheet lists its exercises')
  })

  test('ordinary events, empty and missing input add nothing', () => {
    const f = get('_scheduledByDate')
    assert.deepEqual(json(f([{ id: 'x', date: '2026-11-16', title: 'Holiday', template_id: null }])), {})
    assert.deepEqual(json(f([])), {})
    assert.deepEqual(json(f(null)), {})
    assert.deepEqual(json(f(undefined)), {})
    assert.deepEqual(json(f([null, { id: 'y', template_id: 't', date: null }])), {})
  })

  test('a workout the person can no longer read still shows, by the event\'s own title', () => {
    const m = get('_scheduledByDate')([{ id: 'e2', date: '2026-11-17', title: 'Old name', template_id: 't9', workout_templates: null }])
    assert.equal(m['2026-11-17'][0].workout_templates.name, 'Old name')
    assert.deepEqual(json(m['2026-11-17'][0]._clientExercises), [])
  })

  test('two workouts on one day keep their order; a timestamp date is cut to the day', () => {
    const m = get('_scheduledByDate')([ev('a', '2026-11-18T00:00:00', 't1', 'One'), ev('b', '2026-11-18', 't2', 'Two')])
    assert.deepEqual(json(m['2026-11-18'].map(s => s.workout_templates.name)), ['One', 'Two'])
  })

  test('merging: plan sessions first, added workouts after; days of either alone survive; inputs untouched', () => {
    const merge = get('_mergePlanned')
    const plan = { '2026-11-16': [{ id: 'p1' }], '2026-11-17': [{ id: 'p2' }] }
    const sched = { '2026-11-16': [{ id: 's1' }], '2026-11-20': [{ id: 's2' }] }
    const out = merge(plan, sched)
    assert.deepEqual(json(out), { '2026-11-16': [{ id: 'p1' }, { id: 's1' }], '2026-11-17': [{ id: 'p2' }], '2026-11-20': [{ id: 's2' }] })
    assert.deepEqual(json(plan), { '2026-11-16': [{ id: 'p1' }], '2026-11-17': [{ id: 'p2' }] }, 'the plan map is not changed')
    assert.deepEqual(json(merge(null, undefined)), {})
    assert.deepEqual(json(merge(plan, null)), json(plan))
  })

  test('a scheduled workout makes a day planned: done once logged, missed when it has passed, planned today, later after', () => {
    const kind = get('_dashDayKind'), m = get('_scheduledByDate')([ev('e', '2026-11-14', 't', 'HIIT')])
    const p = m['2026-11-14']
    assert.equal(kind('2026-11-14', '2026-11-16', p, []), 'miss')
    assert.equal(kind('2026-11-14', '2026-11-16', p, [{ id: 'log' }]), 'done')
    assert.equal(kind('2026-11-14', '2026-11-14', p, []), 'plan')
    assert.equal(kind('2026-11-14', '2026-11-10', p, []), 'later')
    const week = get('_dashWeekDays')('2026-11-16', m, [])
    assert.deepEqual(json(get('_dashWeekCounts')(week)), { done: 0, planned: 0 }, 'the 14th is last week, not this one')
    const last = get('_dashWeekDays')('2026-11-16', m, [], '2026-11-09')
    assert.deepEqual(json(get('_dashWeekCounts')(last)), { done: 0, planned: 1 }, 'it counts in its own week\'s "x of y"')
  })

  test('Today card: a day of added workouts only says so, starts the added workout, and offers View plan only with a plan', () => {
    const hero = get('_dashHeroHtml')
    const planned = get('_scheduledByDate')([ev('e', '2026-11-16', 't1', 'Upper A')])['2026-11-16']
    const day = { ds: '2026-11-16', today: true, kind: 'plan', planned, done: [] }
    const ctx = (hasProgram) => ({ role: 'solo', clientId: 'c1', todayStr: '2026-11-16', days: [day], hasProgram, program: hasProgram ? { name: 'Deadlift Focused' } : null, next: null })
    const noPlan = hero(day, ctx(false)), withPlan = hero(day, ctx(true))
    assert.match(noPlan, /Today · Added by you/)
    assert.match(noPlan, /startWorkoutRunner\('c1','t1'\)/)
    assert.doesNotMatch(noPlan, /View plan/)
    assert.match(withPlan, /Today · Added by you/, 'not the plan\'s name: this workout is not part of it')
    assert.match(withPlan, /View plan/)
  })

  test('Today card: a plan session AND an added workout get one named Start each', () => {
    const hero = get('_dashHeroHtml')
    const planned = [{ id: 'pw', workout_templates: { name: 'Squat Day' }, _clientTemplateId: 'clone1' }, ...get('_scheduledByDate')([ev('e', '2026-11-16', 't1', 'Zone 2')])['2026-11-16']]
    const day = { ds: '2026-11-16', today: true, kind: 'plan', planned, done: [] }
    const html = hero(day, { role: 'solo', clientId: 'c1', todayStr: '2026-11-16', days: [day], hasProgram: true, program: { name: 'P' }, next: null })
    assert.match(html, /Today · P/, 'a plan session on the day keeps the plan\'s name')
    assert.match(html, /startWorkoutRunner\('c1','clone1'\)">▶ Squat Day</)
    assert.match(html, /startWorkoutRunner\('c1','t1'\)">▶ Zone 2</)
    assert.match(html, /2 sessions today/)
  })

  test('a later day of added workouts only opens the calendar, not a plan; with no plan, a rest day offers no View plan', () => {
    const hero = get('_dashHeroHtml')
    const planned = get('_scheduledByDate')([ev('e', '2026-11-20', 't1', 'Zone 2')])['2026-11-20']
    const day = { ds: '2026-11-20', today: false, kind: 'later', planned, done: [] }
    const ctx = { role: 'solo', clientId: 'c1', todayStr: '2026-11-16', days: [day], hasProgram: true, program: { name: 'P' }, next: null }
    const html = hero(day, ctx)
    assert.match(html, /navigate\('calendar'\)">Open calendar</)
    assert.doesNotMatch(html, /View plan/)
    const rest = { ds: '2026-11-16', today: true, kind: 'rest', planned: [], done: [] }
    const noPlan = hero(rest, { ...ctx, days: [rest], hasProgram: false, program: null, next: { date: '2026-11-20', title: 'Zone 2' } })
    assert.match(noPlan, /Next up: Zone 2/)
    assert.doesNotMatch(noPlan, /View plan/, 'the next session is an added workout and there is no plan')
  })

  test('a future rest day offers + Add a workout in Personal view only', () => {
    const hero = get('_dashHeroHtml')
    const day = { ds: '2026-11-20', today: false, kind: 'rest', planned: [], done: [] }
    const ctx = (role) => ({ role, clientId: 'c1', todayStr: '2026-11-16', days: [day], hasProgram: true, program: null, next: null })
    assert.match(hero(day, ctx('solo')), /_openAddWorkoutSheet\('2026-11-20'\)/)
    assert.doesNotMatch(hero(day, ctx('client')), /Add a workout/)
    const past = { ...day, ds: '2026-11-10' }
    assert.doesNotMatch(hero(past, ctx('solo')), /Add a workout/, 'never on a day that has gone')
  })
})
