// The dashboard's pure logic (2026-10-03): the weekly streak, the week strip and the program tile.
//
// Jake, scoping the dashboard rework: "Streak: Weeks hitting my whole plan". These pin that rule so it cannot drift:
//   - weeks run Monday to Sunday;
//   - inside the program's span a week counts when every planned session was logged, and a week with nothing planned asks
//     nothing (a planned rest week neither earns nor breaks the streak);
//   - after the span has ended, or with no program at all, any one session keeps the streak alive — otherwise a finished program
//     would let a long-idle person keep a streak;
//   - the streak never looks back past the week the program began (Jake, 2026-10-12: "I have not been on this plan for 16 weeks");
//   - the current week counts once it is complete and is simply ignored until then (a Wednesday is not a missed week).
//
// Dates used: 2026-10-03 is a Saturday. Mondays: 09-28, 09-21, 09-14, 09-07, 08-31, 08-24, 08-17, 08-10, 08-03.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const streak = (prog, logs, today, max) => get('_dashStreakWeeks')(prog, logs, today, max)
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

describe('_dashStreakWeeks — no program: any one session a week', () => {
  const today = '2026-10-03'
  test('no logs: no streak', () => {
    assert.deepEqual({ ...streak({}, [], today) }, { weeks: 0, capped: false, onPlan: false })
  })
  test('a session in each of the last three finished weeks is a 3-week streak (this week, unfinished, is ignored)', () => {
    const r = streak({}, weeksOf('2026-09-21', '2026-09-14', '2026-09-07'), today)
    assert.equal(r.weeks, 3)
  })
  test('this week counts as soon as it has a session', () => {
    const r = streak({}, weeksOf('2026-09-28', '2026-09-21', '2026-09-14'), today)
    assert.equal(r.weeks, 3)
  })
  test('an empty week breaks it — and nothing before the gap counts', () => {
    const r = streak({}, weeksOf('2026-09-21', '2026-09-14', '2026-08-31', '2026-08-24'), today)
    assert.equal(r.weeks, 2)
  })
  test('three sessions in one week are still one week', () => {
    assert.equal(streak({}, logsIn('2026-09-21', 3), today).weeks, 1)
  })
})

describe('_dashStreakWeeks — with a program: every planned session', () => {
  const prog = program('2026-08-03', '2026-09-28')   // 3 a week, nine weeks, including this one
  test('every planned session logged in each finished week counts them all', () => {
    const logs = ['2026-09-21', '2026-09-14', '2026-09-07', '2026-08-31'].flatMap(m => logsIn(m, 3))
    // 08-24 .. 08-03 have a plan and nothing logged, so the streak stops at 08-31.
    assert.equal(streak(prog, logs, '2026-10-03').weeks, 4)
  })
  test('two of three is a miss: it breaks the streak', () => {
    const logs = [...logsIn('2026-09-21', 2), ...logsIn('2026-09-14', 3), ...logsIn('2026-09-07', 3)]
    assert.equal(streak(prog, logs, '2026-10-03').weeks, 0)
  })
  test('the current week is complete only when ALL its sessions are logged', () => {
    const base = ['2026-09-21', '2026-09-14'].flatMap(m => logsIn(m, 3))
    assert.equal(streak(prog, [...base, ...logsIn('2026-09-28', 3)], '2026-10-03').weeks, 3, 'all three this week: it counts')
    assert.equal(streak(prog, [...base, ...logsIn('2026-09-28', 2)], '2026-10-03').weeks, 2, 'two of three: ignored, not a break')
  })
  test('a Wednesday with one of three logged does not break a long streak (an unfinished week is not a missed one)', () => {
    const logs = ['2026-09-21', '2026-09-14', '2026-09-07'].flatMap(m => logsIn(m, 3)).concat(logsIn('2026-09-28', 1))
    assert.equal(streak(prog, logs, '2026-09-30').weeks, 3)
  })
  test('a planned rest week (nothing scheduled inside the program) neither earns nor breaks', () => {
    const p = program('2026-08-03', '2026-09-28', 3, ['2026-09-14'])
    const logs = ['2026-09-21', '2026-09-07', '2026-08-31'].flatMap(m => logsIn(m, 3))
    assert.equal(streak(p, logs, '2026-10-03').weeks, 3, 'the empty week of 09-14 is skipped, not counted')
  })
  test('extra sessions are fine: four logged against three planned still counts', () => {
    assert.equal(streak(prog, logsIn('2026-09-21', 4), '2026-10-03').weeks, 1)
  })
})

describe('_dashStreakWeeks — outside the program\'s span, one session a week keeps it alive', () => {
  test('a program that ended and nothing since: the streak is 0 however clean the old weeks were', () => {
    const ended = program('2026-07-06', '2026-09-07')
    const logs = ['2026-09-07', '2026-08-31', '2026-08-24'].flatMap(m => logsIn(m, 3))
    assert.equal(streak(ended, logs, '2026-10-03').weeks, 0, 'four idle weeks after the plan ended')
  })
  test('after the plan ends, a session a week carries the streak on and joins the planned weeks before it', () => {
    const ended = program('2026-07-06', '2026-09-07')
    const logs = [...weeksOf('2026-09-21', '2026-09-14'), ...['2026-09-07', '2026-08-31', '2026-08-24'].flatMap(m => logsIn(m, 3))]
    // 09-21 and 09-14: one session each (outside the span); 09-07, 08-31, 08-24: all three; 08-17: nothing logged -> stop.
    assert.equal(streak(ended, logs, '2026-10-03').weeks, 5)
  })
  test('before the program began, weeks do not count: the streak starts with the plan (it was 5 before 2026-10-12)', () => {
    const started = program('2026-09-14', '2026-09-28')
    const logs = [...['2026-09-28', '2026-09-21', '2026-09-14'].flatMap(m => logsIn(m, 3)), ...weeksOf('2026-09-07', '2026-08-31')]
    const r = streak(started, logs, '2026-10-03')
    assert.equal(r.weeks, 3, 'the three planned weeks only, not the two single-session weeks before the plan')
    assert.equal(r.capped, false, 'the plan\'s first week is a real boundary: the true figure cannot be higher')
  })
  test('Jake\'s case: a one-week plan after 16 weeks of single sessions reads 0, not 16', () => {
    const plan = program('2026-10-12', '2026-10-12')     // one week, Mon/Wed/Fri
    const before = Array.from({ length: 16 }, (_, i) => addDays('2026-10-05', -7 * i))
    const logs = [...weeksOf(...before), ...logsIn('2026-10-12', 1)]
    assert.equal(streak(plan, logs, '2026-10-12').weeks, 0, 'this week is unfinished (1 of 3) so it is ignored, and the 16 earlier weeks are not the plan')
    assert.equal(streak(plan, [...weeksOf(...before), ...logsIn('2026-10-12', 3)], '2026-10-12').weeks, 1, 'finish the week and it is 1')
  })
  test('a plan that has not begun yet: nothing to hit, however long the person has been training', () => {
    const later = program('2026-10-12', '2026-10-26')
    const logs = weeksOf('2026-10-05', '2026-09-28', '2026-09-21')
    assert.equal(streak(later, logs, '2026-10-08').weeks, 0)
  })
  test('with no program the old weeks still count (the plain training streak)', () => {
    assert.equal(streak({}, weeksOf('2026-09-21', '2026-09-14', '2026-09-07'), '2026-10-03').weeks, 3)
  })
  // The 2026-10-12 review: the tile's words follow HOW the number was counted, not whether a program exists.
  test('onPlan says the streak was counted by the plan; notBegun that the plan starts later; a program with no dated session is a plain streak', () => {
    const plan = program('2026-09-14', '2026-09-28')
    assert.equal(streak(plan, logsIn('2026-09-28', 3), '2026-10-03').onPlan, true)
    const later = streak(program('2026-10-12', '2026-10-26'), [], '2026-10-08')
    assert.deepEqual({ ...later }, { weeks: 0, capped: false, onPlan: true, notBegun: true })
    const noDates = streak({}, weeksOf('2026-09-21', '2026-09-14'), '2026-10-03')
    assert.equal(noDates.onPlan, false, 'a program with no start date or no sessions places nothing on the calendar, so nothing is dated')
    assert.equal(noDates.weeks, 2, 'and it stays the one-session-a-week streak')
  })
  test('a plan exactly as old as the lookback is exact, not "N+" (the first week of the plan is a real boundary)', () => {
    const plan = program('2026-09-07', '2026-09-28')      // first = 09-07, three weeks before this week (09-28)
    const logs = ['2026-09-28', '2026-09-21', '2026-09-14', '2026-09-07'].flatMap(m => logsIn(m, 3))
    const r = streak(plan, logs, '2026-10-03', 3)          // lookback of 3 weeks: the loop ends exactly on the plan's first week
    assert.deepEqual({ ...r }, { weeks: 4, capped: false, onPlan: true })
  })
})

describe('_dashStreakWeeks — edges', () => {
  test('a very long run is capped at the lookback and says so', () => {
    const mondays = Array.from({ length: 60 }, (_, i) => addDays('2026-09-28', -7 * i))
    const r = streak({}, weeksOf(...mondays), '2026-10-03')
    assert.equal(r.weeks, 53, 'this week plus the 52 weeks looked back')
    assert.equal(r.capped, true)
  })
  test('junk is ignored: unparseable log dates and empty plan days', () => {
    const r = streak({ '2026-09-30': [], 'junk': [{}] }, ['nope', null, ...weeksOf('2026-09-21')], '2026-10-03')
    assert.equal(r.weeks, 1)
  })
  test('missing inputs do not throw', () => {
    assert.equal(streak(undefined, undefined, '2026-10-03').weeks, 0)
  })
})

// What the streak tile SAYS follows how the number was counted (Jake, 2026-10-12: it read '16 week streak, hitting your whole plan' on a one-week plan).
describe('_dashTilesHtml - the streak tile wording', () => {
  const words = streak => get('_dashTilesHtml')(streak, { week: 1, name: 'Op', phase: null, totalWeeks: 1 }, false).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  test('counted by the plan: hitting your whole plan', () => {
    assert.match(words({ weeks: 2, capped: false, onPlan: true }), /2 week streak hitting your whole plan/)
  })
  test('counted as a plain streak (no dated plan session): a session every week, never the plan', () => {
    const t = words({ weeks: 16, capped: false, onPlan: false })
    assert.match(t, /16 week streak a session every week/)
    assert.doesNotMatch(t, /whole plan/)
  })
  test('nothing yet: the hint says why, by how the streak is counted', () => {
    assert.match(words({ weeks: 0, capped: false, onPlan: true, notBegun: true }), /your plan has not started yet/)
    assert.match(words({ weeks: 0, capped: false, onPlan: true }), /finish this week's plan to start one/)
    assert.match(words({ weeks: 0, capped: false, onPlan: false }), /log a session this week to start one/)
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
