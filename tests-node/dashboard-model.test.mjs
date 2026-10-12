// The dashboard's pure logic (2026-10-03): the streak, the week strip and the program tile.
//
// The streak is SESSIONS LOGGED IN A ROW (Jake, 2026-10-12: "the streak should show how many sessions you have logged in a row"; it counted weeks until then):
//   - the number of sessions logged across the unbroken run of Monday-to-Sunday weeks ending with this one; every session counts, planned or not;
//   - a FINISHED week inside the plan breaks the run when fewer sessions were logged than planned (a planned session left unlogged); a week with nothing
//     planned (a planned rest week) neither earns nor breaks it;
//   - a finished week outside the plan (before it began, after it ended, no plan) breaks it when no session was logged: his "7 days with none", as whole weeks;
//   - this week never breaks it (a Wednesday is not a missed week) and adds what is logged so far;
//   - a plan cannot ask for a session before its start date.

// Dates used: 2026-10-03 is a Saturday. Mondays: 09-28, 09-21, 09-14, 09-07, 08-31, 08-24, 08-17, 08-10, 08-03.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const streak = (prog, logs, today, max, planStart) => get('_dashStreak')(prog, logs, today, max, planStart)
const addDays = (ymd, n) => get('_dashAddDays')(ymd, n)

// A program of `perWeek` sessions on Mon/Wed/Fri for each week in [fromMonday, toMonday] (both inclusive); `skip` lists Mondays with nothing planned.
function program(fromMonday, toMonday, perWeek = 3, skip = []) {
  const out = {}
  for (let wk = fromMonday; wk <= toMonday; wk = addDays(wk, 7)) {
    if (skip.includes(wk)) continue
    ;[0, 2, 4].slice(0, perWeek).forEach(d => { out[addDays(wk, d)] = [{ id: 'pw-' + addDays(wk, d) }] })
  }
  return out
}
// `n` logs in the week starting `monday` (on consecutive days from Monday).
const logsIn = (monday, n) => Array.from({ length: n }, (_, i) => addDays(monday, i))
const weeksOf = (...mondays) => mondays.flatMap(m => logsIn(m, 1))

describe('_dashMonday / _dashAddDays', () => {
  test('Monday of the week containing any day, Sunday included (a week runs Monday to Sunday)', () => {
    const m = get('_dashMonday')
    assert.equal(m('2026-09-28'), '2026-09-28')   // Monday
    assert.equal(m('2026-10-03'), '2026-09-28')   // Saturday
    assert.equal(m('2026-10-04'), '2026-09-28')   // Sunday belongs to the week that began on the 28th
    assert.equal(m('2026-10-05'), '2026-10-05')   // next Monday
  })
  test('an unparseable date is null, never "NaN-NaN-NaN"', () => {
    assert.equal(get('_dashMonday')('not a date'), null)
    assert.equal(get('_dashMonday')(null), null)
  })
  test('adding days crosses month and year ends in local time', () => {
    assert.equal(addDays('2026-09-28', 7), '2026-10-05')
    assert.equal(addDays('2026-12-28', 7), '2027-01-04')
    assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  })
})

describe('_dashStreak — no plan: a session every week keeps it, and every session counts', () => {
  const today = '2026-10-03'
  test('no logs: no streak', () => {
    assert.deepEqual({ ...streak({}, [], today) }, { sessions: 0, capped: false, onPlan: false })
  })
  test('a session in each of the last three finished weeks is 3 sessions (this week, with none yet, is ignored)', () => {
    assert.equal(streak({}, weeksOf('2026-09-21', '2026-09-14', '2026-09-07'), today).sessions, 3)
  })
  test('this week\'s sessions count as they are logged', () => {
    assert.equal(streak({}, weeksOf('2026-09-28', '2026-09-21', '2026-09-14'), today).sessions, 3)
  })
  test('every session counts, not every week: three and two in a row of weeks are 5', () => {
    assert.equal(streak({}, [...logsIn('2026-09-21', 3), ...logsIn('2026-09-14', 2)], today).sessions, 5)
  })
  test('an empty week breaks it, and nothing before the gap counts', () => {
    assert.equal(streak({}, weeksOf('2026-09-21', '2026-09-14', '2026-08-31', '2026-08-24'), today).sessions, 2)
  })
})

describe('_dashStreak — with a plan: a planned session left unlogged breaks it', () => {
  const prog = program('2026-08-03', '2026-09-28')   // 3 a week, nine weeks, including this one
  test('every planned session logged in each finished week counts them all', () => {
    const logs = ['2026-09-21', '2026-09-14', '2026-09-07', '2026-08-31'].flatMap(m => logsIn(m, 3))
    // 08-24 .. 08-03 have a plan and nothing logged, so the run stops at 08-31.
    assert.equal(streak(prog, logs, '2026-10-03').sessions, 12)
  })
  test('two of three is a miss: it breaks the run, and nothing before it counts', () => {
    const logs = [...logsIn('2026-09-21', 2), ...logsIn('2026-09-14', 3), ...logsIn('2026-09-07', 3)]
    assert.equal(streak(prog, logs, '2026-10-03').sessions, 0)
    assert.equal(streak(prog, [...logs, ...logsIn('2026-09-28', 1)], '2026-10-03').sessions, 1, 'only what is logged since the miss')
  })
  test('this week adds what is logged so far and never breaks the run', () => {
    const base = ['2026-09-21', '2026-09-14'].flatMap(m => logsIn(m, 3))
    assert.equal(streak(prog, base, '2026-10-03').sessions, 6, 'nothing logged this week yet: not a miss')
    assert.equal(streak(prog, [...base, ...logsIn('2026-09-28', 1)], '2026-10-03').sessions, 7, 'one of three this week: counted, not a break')
  })
  test('extra sessions are fine and all count: four logged against three planned', () => {
    assert.equal(streak(prog, logsIn('2026-09-21', 4), '2026-10-03').sessions, 4)
  })
  test('a planned rest week (nothing scheduled inside the plan) neither earns nor breaks, and a session logged in it counts', () => {
    const p = program('2026-08-03', '2026-09-28', 3, ['2026-09-14'])
    const logs = [...['2026-09-21', '2026-09-07', '2026-08-31'].flatMap(m => logsIn(m, 3)), ...logsIn('2026-09-14', 1)]
    assert.equal(streak(p, logs, '2026-10-03').sessions, 10)
  })
  test('a Wednesday with one session logged does not break a long run', () => {
    const logs = ['2026-09-21', '2026-09-14', '2026-09-07'].flatMap(m => logsIn(m, 3)).concat(logsIn('2026-09-28', 1))
    assert.equal(streak(prog, logs, '2026-09-30').sessions, 10)
  })
})

describe('_dashStreak — a plan cannot ask for a session before the day it starts', () => {
  // Mon/Wed/Fri plan from Monday 28 Sep, but assigned with a start date of Wednesday 30 Sep: its Monday 28 is not a planned session.
  const plan = program('2026-09-28', '2026-10-12')
  const logs = [...logsIn('2026-10-12', 1), ...logsIn('2026-10-05', 3), '2026-09-30', '2026-10-02', ...weeksOf('2026-09-21')]
  test('with the start date, week 1 asks for the two sessions that exist and is met', () => {
    assert.equal(streak(plan, logs, '2026-10-12', 52, '2026-09-30').sessions, 7, '1 this week + 3 + 2 in week 1 + 1 the week before the plan')
  })
  test('without it, week 1 asks for three, can never be met, and breaks the run (the 2026-10-12 review)', () => {
    assert.equal(streak(plan, logs, '2026-10-12').sessions, 4)
  })
})

describe('_dashStreak — the start week of a plan is in the plan', () => {
  // The assign form defaults the start date to today: a plan assigned on Saturday 10 Oct has no Mon/Wed/Fri session on or after its start that week.
  test('a plan assigned late in a week: that week is a planned rest week (asks nothing), not an outside week that needs a session', () => {
    const plan = program('2026-10-05', '2026-10-26')
    const logs = [...logsIn('2026-10-12', 1), ...logsIn('2026-09-28', 2), ...logsIn('2026-09-21', 1)]
    const r = streak(plan, logs, '2026-10-14', 52, '2026-10-10')
    assert.equal(r.sessions, 4, '1 this week + 0 in the start week (rest) + 2 + 1 before the plan; the week before that is empty and ends it')
    assert.equal(r.onPlan, true)
  })
})

describe('_dashPlannedFrom - planned days before the start date are not planned sessions', () => {
  const f = (m, d) => get('_dashPlannedFrom')(m, d)
  const map = { '2026-09-28': [{ id: 'a' }], '2026-09-30': [{ id: 'b' }], '2026-10-02': [{ id: 'c' }] }
  test('days before the start date are dropped; the start date itself stays', () => {
    assert.deepEqual(Object.keys(f(map, '2026-09-30')), ['2026-09-30', '2026-10-02'])
  })
  test('no start date leaves the map alone; junk input is an empty map', () => {
    assert.deepEqual(Object.keys(f(map, null)), Object.keys(map))
    assert.deepEqual(Object.keys(f(undefined, '2026-09-30')), [])
  })
  test('a start date with a time part is read as its date', () => {
    assert.deepEqual(Object.keys(f(map, '2026-09-30T00:00:00+00:00')), ['2026-09-30', '2026-10-02'])
  })
})

describe('_dashStreak — outside the plan, a session a week keeps it alive and joins the planned weeks', () => {
  test('a plan that ended and nothing since: the run is 0 however clean the old weeks were', () => {
    const ended = program('2026-07-06', '2026-09-07')
    const logs = ['2026-09-07', '2026-08-31', '2026-08-24'].flatMap(m => logsIn(m, 3))
    assert.equal(streak(ended, logs, '2026-10-03').sessions, 0, 'two idle weeks after the plan ended')
  })
  test('after the plan ends, a session a week carries on and joins the planned weeks before it', () => {
    const ended = program('2026-07-06', '2026-09-07')
    const logs = [...weeksOf('2026-09-21', '2026-09-14'), ...['2026-09-07', '2026-08-31', '2026-08-24'].flatMap(m => logsIn(m, 3))]
    // 09-21 and 09-14: one session each (outside the plan); 09-07, 08-31, 08-24: three each; 08-17: planned three, nothing logged -> stop.
    assert.equal(streak(ended, logs, '2026-10-03').sessions, 11)
  })
  test('before the plan began a week still needs one session, and its sessions count', () => {
    const started = program('2026-09-14', '2026-09-28')
    const logs = [...['2026-09-28', '2026-09-21', '2026-09-14'].flatMap(m => logsIn(m, 3)), ...weeksOf('2026-09-07', '2026-08-31')]
    assert.equal(streak(started, logs, '2026-10-03').sessions, 11)
  })
  test('Jake\'s case: a one-week plan after 16 weeks of single sessions is 17 sessions in a row, and says so (not "weeks on the plan")', () => {
    const plan = program('2026-10-12', '2026-10-12')
    const before = Array.from({ length: 16 }, (_, i) => addDays('2026-10-05', -7 * i))
    const r = streak(plan, [...weeksOf(...before), ...logsIn('2026-10-12', 1)], '2026-10-12')
    assert.equal(r.sessions, 17)
    assert.equal(r.onPlan, true, 'this week is inside the plan')
  })
  test('onPlan: true only while the plan governs this week', () => {
    const plan = program('2026-09-14', '2026-09-28')
    assert.equal(streak(plan, [], '2026-10-03').onPlan, true, 'this week is the plan\'s last')
    assert.equal(streak(plan, [], '2026-10-12').onPlan, false, 'the plan has ended')
    assert.equal(streak(plan, [], '2026-09-08').onPlan, false, 'the plan has not begun')
    assert.equal(streak({}, [], '2026-10-03').onPlan, false, 'no plan')
  })
})

describe('_dashStreak — edges', () => {
  test('a very long run is capped at the lookback and says so', () => {
    const mondays = Array.from({ length: 60 }, (_, i) => addDays('2026-09-28', -7 * i))
    const r = streak({}, weeksOf(...mondays), '2026-10-03')
    assert.equal(r.sessions, 53, 'this week plus the 52 weeks looked back, one session each')
    assert.equal(r.capped, true)
  })
  test('junk is ignored: unparseable log dates and empty plan days', () => {
    const r = streak({ '2026-09-30': [], 'junk': [{}] }, ['nope', null, ...weeksOf('2026-09-21')], '2026-10-03')
    assert.equal(r.sessions, 1)
  })
  test('missing inputs do not throw', () => {
    assert.equal(streak(undefined, undefined, '2026-10-03').sessions, 0)
  })
})

// What the streak tile SAYS follows how the number was counted (Jake, 2026-10-12): sessions in a row, and "the plan" only while the plan governs this week.
describe('_dashTilesHtml - the streak tile wording', () => {
  const words = streak => get('_dashTilesHtml')(streak, { week: 1, name: 'Op', phase: null, totalWeeks: 1 }, false).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  test('while a plan governs the week: sessions in a row, without missing a planned session', () => {
    assert.match(words({ sessions: 12, capped: false, onPlan: true }), /12 sessions in a row without missing a planned session/)
  })
  test('otherwise: sessions in a row, a session every week, never the plan; one session is singular; a capped run says N+', () => {
    const t = words({ sessions: 16, capped: false, onPlan: false })
    assert.match(t, /16 sessions in a row a session every week/)
    assert.doesNotMatch(t, /planned session/)
    assert.match(words({ sessions: 1, capped: false, onPlan: false }), /1 session in a row/)
    assert.match(words({ sessions: 53, capped: true, onPlan: false }), /53\+ sessions in a row/)
  })
  test('nothing yet: the hint says what starts one (a planned rest week asks for none, so it never says "planned")', () => {
    assert.match(words({ sessions: 0, capped: false, onPlan: true }), /0 sessions in a row log a session to start one/)
    assert.match(words({ sessions: 0, capped: false, onPlan: false }), /0 sessions in a row log a session to start one/)
  })
  test('a capped 1 reads "1+ sessions", not "1+ session"', () => {
    assert.match(words({ sessions: 1, capped: true, onPlan: false }), /1\+ sessions in a row/)
  })
})

describe('_dashWeekDays — the week strip', () => {
  const prog = program('2026-09-28', '2026-09-28')           // Mon 28, Wed 30, Fri 2 planned
  const logs = [{ id: 'l1', name: 'Upper', date: '2026-09-28', workout_log_exercises: [{ id: 'e' }] }]
  const days = get('_dashWeekDays')('2026-10-03', prog, logs)       // today is Saturday

  test('seven days, Monday first, with their labels and day numbers', () => {
    assert.equal(days.length, 7)
    assert.deepEqual(Array.from(days, d => d.label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])   // Array.from: the days come from the sandbox's realm
    assert.deepEqual(Array.from(days, d => d.num), [28, 29, 30, 1, 2, 3, 4])
    assert.equal(days.filter(d => d.today).length, 1)
    assert.equal(days[5].today, true)
  })
  test('a logged day is done, a planned past day with nothing logged is missed, a rest day is rest', () => {
    assert.equal(days[0].kind, 'done')
    assert.equal(days[1].kind, 'rest')
    assert.equal(days[2].kind, 'miss', 'Wednesday was planned and nothing was logged')
    assert.equal(days[4].kind, 'miss')
    assert.equal(days[5].kind, 'rest', 'Saturday: nothing planned')
  })
  test('today with a session planned and nothing logged is "plan"; later planned days are "later"', () => {
    const d = get('_dashWeekDays')('2026-09-29', prog, logs)         // Tuesday
    assert.equal(d[1].kind, 'rest')
    assert.equal(d[2].kind, 'later')
    const wed = get('_dashWeekDays')('2026-09-30', prog, logs)
    assert.equal(wed[2].kind, 'plan')
  })
  test('logging on a planned day makes it done even today', () => {
    const l = [...logs, { id: 'l2', name: 'Lower', date: '2026-09-30', workout_log_exercises: [{ id: 'e' }] }]
    assert.equal(get('_dashWeekDays')('2026-09-30', prog, l)[2].kind, 'done')
  })
  test('the counts: done is what was logged, planned never reads lower than done', () => {
    const c = get('_dashWeekCounts')(days)
    assert.equal(c.done, 1)
    assert.equal(c.planned, 3)
    const extra = [...logs, { id: 'x1', name: 'A', date: '2026-10-01', workout_log_exercises: [{ id: 'e' }] }, { id: 'x2', name: 'B', date: '2026-10-03', workout_log_exercises: [{ id: 'e' }] }, { id: 'x3', name: 'C', date: '2026-10-03', workout_log_exercises: [{ id: 'e' }] }]
    const c2 = get('_dashWeekCounts')(get('_dashWeekDays')('2026-10-03', prog, extra))
    assert.equal(c2.done, 4)
    assert.equal(c2.planned, 4, '4 of 3 would read as a mistake')
  })
  test('a Sunday belongs to the week that began on the Monday before it', () => {
    const d = get('_dashWeekDays')('2026-10-04', prog, logs)
    assert.equal(d[0].ds, '2026-09-28')
    assert.equal(d[6].today, true)
  })
  test('no program and no logs: seven rest days', () => {
    const d = get('_dashWeekDays')('2026-10-03', {}, [])
    assert.deepEqual(Array.from(d, x => x.kind), Array(7).fill('rest'))
  })
})

describe('_dashProgramInfo — the program tile', () => {
  const phases = [
    { id: 'p1', name: 'Accumulation 1', duration_weeks: 4, order_index: 1 },
    { id: 'p2', name: 'Intensification', duration_weeks: 4, order_index: 2 },
    { id: 'p3', name: 'Peak', duration_weeks: 4, order_index: 3 },
  ]
  const cp = (start) => ({ start_date: start, programs: { name: 'Operation 240', description: 'desc', program_phases: phases } })

  test('week N of the whole program, the phase it is in, and how far through', () => {
    const i = get('_dashProgramInfo')(cp('2026-09-28'), '2026-10-03')
    assert.equal(i.name, 'Operation 240')
    assert.equal(i.week, 1)
    assert.equal(i.totalWeeks, 12)
    assert.equal(i.phase, 'Accumulation 1')
    assert.equal(i.pct, 8)
  })
  test('weeks later it is in the right phase', () => {
    const i = get('_dashProgramInfo')(cp('2026-08-31'), '2026-10-03')   // 4 weeks and 5 days in
    assert.equal(i.week, 5)
    assert.equal(i.phase, 'Intensification')
  })
  test('the week never runs past the end', () => {
    const i = get('_dashProgramInfo')(cp('2026-01-05'), '2026-10-03')
    assert.equal(i.week, 12)
    assert.equal(i.phase, 'Peak')
    assert.equal(i.pct, 100)
  })
  test('a program that starts in the future reads week 1', () => {
    assert.equal(get('_dashProgramInfo')(cp('2026-11-02'), '2026-10-03').week, 1)
  })
  test('no program, or no start date: null / week 1, never NaN', () => {
    assert.equal(get('_dashProgramInfo')(null, '2026-10-03'), null)
    const noStart = get('_dashProgramInfo')({ start_date: null, programs: { name: 'X', program_phases: phases } }, '2026-10-03')
    assert.equal(noStart.week, 1)
  })
})
