// The dashboard's pure logic (2026-10-03): the streak tile, the week strip and the program tile.
//
// The STREAK TILE has two readings (Jake, 2026-10-13, replacing "62 sessions in a row", which counted every session and so measured nothing):
//   - while a plan governs this week: plan adherence - "9 of 10 planned sessions done so far", the week of the plan, this week's count;
//   - with no plan: a weekly target the person sets (default 3, 1 to 14) - "4 weeks in a row at 3 a week".
// Counting is by Monday-to-Sunday WEEK: a planned session is done when a session is logged in the same week, up to the number planned that week (extras add
// nothing, so it never passes 100%); "out of" is the sessions due so far; a plan cannot be done before its start date.

// Dates used: 2026-10-03 is a Saturday. Mondays: 09-28, 09-21, 09-14, 09-07, 08-31, 08-24, 08-17, 08-10, 08-03.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const adherence = (prog, logs, today, planStart, totalWeeks) => get('_dashPlanAdherence')(prog, logs, today, planStart, totalWeeks)
const targetStreak = (logs, today, target, max) => get('_dashTargetStreak')(logs, today, target, max)
const model = (prog, logs, today, opts) => get('_dashStreakModel')(prog, logs, today, opts)
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

// ── the streak tile, plan mode: adherence ──
describe('_dashPlanAdherence - "9 of 10 planned sessions done so far"', () => {
  const plan = program('2026-09-14', '2026-10-26')   // 3 a week (Mon, Wed, Fri) from Monday 14 Sep: seven weeks
  const today = '2026-10-03'                          // Saturday of the plan's third week
  test('nothing logged: 0 of what is due so far (every planned session on or before today), placed in the plan', () => {
    const r = adherence(plan, [], today, '2026-09-14', 7)
    assert.equal(r.mode, 'plan')
    assert.equal(r.done, 0)
    assert.equal(r.due, 9, 'three weeks of three, the third week all on or before Saturday')
    assert.equal(r.pct, 0)
    assert.equal(r.week, 3)
    assert.equal(r.totalWeeks, 7)
    assert.equal(r.weekPlanned, 3)
    assert.equal(r.weekDone, 0)
  })
  test('sessions done are counted by WEEK, up to the number planned that week: 3 + 2 + 1 of 9', () => {
    const logs = [...logsIn('2026-09-14', 3), ...logsIn('2026-09-21', 2), ...logsIn('2026-09-28', 1)]
    const r = adherence(plan, logs, today, '2026-09-14', 7)
    assert.equal(r.done, 6)
    assert.equal(r.due, 9)
    assert.equal(r.pct, 67)
    assert.equal(r.weekDone, 1)
  })
  test('a session on a day nothing was planned for still counts (logsIn is Mon, Tue, Wed against a Mon/Wed/Fri plan)', () => {
    assert.equal(adherence(plan, logsIn('2026-09-14', 3), today, '2026-09-14', 7).done, 3)
  })
  test('extra sessions add nothing: five logged against three planned is three, and the figure never passes 100%', () => {
    const r = adherence(plan, [...logsIn('2026-09-14', 5), ...logsIn('2026-09-21', 3), ...logsIn('2026-09-28', 4)], today, '2026-09-14', 7)
    assert.equal(r.done, 9)
    assert.equal(r.due, 9)
    assert.equal(r.pct, 100)
    assert.equal(r.weekDone, 3, 'this week: four logged, three planned: 3 of 3, never 4 of 3')
  })
  test('"out of" is the sessions DUE so far: on a Wednesday, Friday\'s session is not in it yet', () => {
    const r = adherence(plan, logsIn('2026-09-28', 1), '2026-09-30', '2026-09-14', 7)
    assert.equal(r.due, 8, 'two full weeks and Monday + Wednesday of this one')
    assert.equal(r.done, 1)
    assert.equal(r.weekPlanned, 3, 'the week line still reads against the whole week')
  })
  test('sessions done ahead of the day cannot pass what is due: three logged by Wednesday is 2 of 2 due, and 3 of 3 for the week', () => {
    const r = adherence(plan, logsIn('2026-09-28', 3), '2026-09-30', '2026-09-14', 7)
    assert.equal(r.done, 2)
    assert.equal(r.due, 8)
    assert.equal(r.weekDone, 3)
  })
  test('a planned rest week inside the plan: nothing planned this week, and it says so', () => {
    const p = program('2026-09-14', '2026-10-26', 3, ['2026-09-28'])
    const r = adherence(p, logsIn('2026-09-28', 2), today, '2026-09-14', 7)
    assert.equal(r.weekPlanned, 0)
    assert.equal(r.weekDone, 0)
    assert.equal(r.due, 6)
  })
  test('a plan cannot be done before it begins: a plan starting Wednesday plans from Wednesday, and a log on the Monday before does not count', () => {
    const p = program('2026-09-28', '2026-10-12')
    const r = adherence(p, ['2026-09-28', '2026-09-30'], '2026-10-02', '2026-09-30', 3)
    assert.equal(r.due, 2, 'Wednesday and Friday; the Monday is before the start')
    assert.equal(r.done, 1, 'only Wednesday\'s log is inside the plan')
  })
  test('a new plan starts again at 0, however long the run of sessions before it', () => {
    const p = program('2026-10-12', '2026-11-02')
    const before = Array.from({ length: 16 }, (_, i) => addDays('2026-10-05', -7 * i))
    const fresh = adherence(p, weeksOf(...before), '2026-10-12', '2026-10-12', 4)
    assert.equal(fresh.done, 0)
    assert.equal(fresh.due, 1, 'Monday\'s session is due, nothing else yet')
    assert.equal(adherence(p, [...weeksOf(...before), '2026-10-12'], '2026-10-12', '2026-10-12', 4).done, 1)
  })
  test('a plan assigned late in a week has nothing due yet: 0 due, 0%, and a rest week (no division by zero)', () => {
    const p = program('2026-10-05', '2026-10-26')
    const r = adherence(p, [], '2026-10-10', '2026-10-10', 4)
    assert.equal(r.mode, 'plan')
    assert.equal(r.due, 0)
    assert.equal(r.pct, 0)
    assert.equal(r.week, 1)
    assert.equal(r.weekPlanned, 0)
  })
  test('the plan\'s length counts rest weeks at its end: a plan with sessions only to 14 Sep but 10 weeks long is still on in its last weeks', () => {
    const p = program('2026-08-03', '2026-09-14')
    const r = adherence(p, [], '2026-09-30', '2026-08-03', 10)
    assert.ok(r, 'on the plan: week 9 of 10')
    assert.equal(r.week, 9)
    assert.equal(r.totalWeeks, 10)
    assert.equal(r.weekPlanned, 0)
  })
  test('not on a plan: none assigned, not started, ended, nothing in it, or no start date', () => {
    assert.equal(adherence({}, [], today, '2026-09-14', 7), null, 'no sessions in it')
    assert.equal(adherence(plan, [], today, null, 7), null, 'no start date')
    assert.equal(adherence(plan, [], '2026-09-08', '2026-09-14', 7), null, 'not started')
    assert.equal(adherence(program('2026-08-03', '2026-09-14'), [], today, '2026-08-03', 0), null, 'ended, and totalWeeks unknown')
    assert.equal(adherence(program('2026-08-03', '2026-09-14'), [], today, '2026-08-03', 6), null, 'ended: six weeks from 3 Aug')
    assert.equal(adherence(undefined, undefined, today, '2026-09-14', 7), null)
  })
  test('a plan longer than the lookback is measured over the same year on both sides (done is never read against a due it could not have seen)', () => {
    const p = program('2025-08-04', '2026-11-30')
    const r = adherence(p, [], today, '2025-08-04', 70)
    assert.equal(r.due, 53 * 3, 'this week and the 52 before it')
    assert.equal(r.week, 61, 'but the week is placed in the whole plan')
  })
})

describe('_dashPlanAdherence - the plan\'s edges (found by the 2026-10-13 review)', () => {
  const plan = program('2026-09-14', '2026-10-26')   // seven weeks; the last begins Monday 26 Oct and ends Sunday 1 Nov
  test('the plan\'s last week is still on the plan, through its Sunday; the Monday after, it is not', () => {
    const sunday = adherence(plan, [], '2026-11-01', '2026-09-14', 7)
    assert.ok(sunday, 'Sunday 1 Nov is the last day of week 7')
    assert.equal(sunday.week, 7)
    assert.equal(sunday.totalWeeks, 7)
    assert.equal(adherence(plan, [], '2026-11-02', '2026-09-14', 7), null, 'Monday 2 Nov: the plan has ended')
  })
  test('the same on the first side: the Sunday before the start week is not on the plan, the Monday is', () => {
    assert.equal(adherence(plan, [], '2026-09-13', '2026-09-14', 7), null)
    assert.equal(adherence(plan, [], '2026-09-14', '2026-09-14', 7).week, 1)
  })
  test('a plan that starts on a Sunday: that Sunday is week 1 with nothing due, and the Monday is week 2', () => {
    const p = program('2026-10-05', '2026-10-26')
    const sun = adherence(p, [], '2026-10-04', '2026-10-04', 4)
    assert.equal(sun.week, 1)
    assert.equal(sun.due, 0)
    assert.equal(sun.weekPlanned, 0)
    const mon = adherence(p, [], '2026-10-05', '2026-10-04', 4)
    assert.equal(mon.week, 2)
    assert.equal(mon.due, 1)
  })
  test('junk keys in the plan\'s map are ignored: empty days, a key that is not a date', () => {
    assert.equal(adherence({ '2026-09-30': [], junk: [{}] }, [], '2026-10-03', '2026-09-14', 4), null, 'nothing real in it')
    const withJunk = { ...plan, junk: [{}], '2026-09-17': [] }
    assert.equal(adherence(withJunk, [], '2026-10-03', '2026-09-14', 7).due, 9)
  })
  test('a log date that arrives with a time on it is the same day', () => {
    assert.equal(adherence(plan, ['2026-09-14T09:30:00+00:00', '2026-09-15T18:00:00Z'], '2026-10-03', '2026-09-14', 7).done, 2)
    assert.equal(targetStreak(['2026-09-21T09:30:00Z', '2026-09-22T09:30:00Z', '2026-09-23T09:30:00Z'], '2026-10-03', 3).weeks, 1)
  })
})

// A local-midnight week is 167 or 169 hours across a clock change. Fixed to London for these (the clocks went forward on 29 Mar and back on 25 Oct 2026), and put back.
describe('weeks across a daylight-saving change', () => {
  const prev = process.env.TZ
  before(() => { process.env.TZ = 'Europe/London' })
  after(() => { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev })
  test('_dashWeeksBetween is a whole number of weeks over a spring-forward and a fall-back', () => {
    const w = get('_dashWeeksBetween')
    assert.equal(w('2026-03-23', '2026-04-06'), 2)
    assert.equal(w('2026-10-19', '2026-11-02'), 2)
  })
  test('a plan that spans the change is placed in the right week', () => {
    const p = program('2026-10-12', '2026-11-30')
    const r = adherence(p, [], '2026-11-02', '2026-10-12', 8)
    assert.equal(r.week, 4, 'Monday 2 Nov is week 4 of a plan that began Monday 12 Oct')
    assert.equal(r.totalWeeks, 8)
  })
})

// ── the streak tile, no plan: the weekly target ──
describe('_dashWeeklyTarget - the stored value as the number the tile uses', () => {
  const w = v => get('_dashWeeklyTarget')(v)
  test('a whole number from 1 to 14 is itself', () => {
    for (const n of [1, 3, 7, 14]) assert.equal(w(n), n)
    assert.equal(w('5'), 5, 'a string from a form field')
  })
  test('null (never set), undefined (the column is not there yet), 0, a negative, 15, text, NaN, a fraction and a boolean are the default 3', () => {
    for (const v of [null, undefined, 0, -2, 15, 100, 'abc', NaN, '', 2.5, '2.5', true, false]) assert.equal(w(v), 3, String(v))
  })
})

describe('_dashTargetStreak - weeks in a row at the target', () => {
  const today = '2026-10-03'
  const t = (logs, target = 3, max) => targetStreak(logs, today, target, max)
  test('no logs: 0 weeks, 0 of the target this week, the default target', () => {
    const r = t([], undefined)
    assert.equal(r.mode, 'target')
    assert.equal(r.weeks, 0)
    assert.equal(r.capped, false)
    assert.equal(r.target, 3)
    assert.equal(r.weekDone, 0)
  })
  test('three finished weeks at the target: 3 (this week, short so far, is not a break)', () => {
    const r = t(['2026-09-21', '2026-09-14', '2026-09-07'].flatMap(m => logsIn(m, 3)))
    assert.equal(r.weeks, 3)
    assert.equal(r.weekDone, 0)
  })
  test('this week counts the moment it reaches the target', () => {
    const logs = [...logsIn('2026-09-28', 3), ...logsIn('2026-09-21', 3), ...logsIn('2026-09-14', 3)]
    assert.equal(t(logs).weeks, 3)
    assert.equal(t(logsIn('2026-09-28', 3)).weeks, 1)
  })
  test('this week short of the target adds nothing and breaks nothing, and shows what is done so far', () => {
    const r = t([...logsIn('2026-09-28', 1), ...logsIn('2026-09-21', 3), ...logsIn('2026-09-14', 3)])
    assert.equal(r.weeks, 2)
    assert.equal(r.weekDone, 1)
  })
  test('a finished week below the target ends the run, and nothing before it counts', () => {
    assert.equal(t([...logsIn('2026-09-21', 3), ...logsIn('2026-09-14', 2), ...logsIn('2026-09-07', 3), ...logsIn('2026-08-31', 3)]).weeks, 1)
  })
  test('the target is the person\'s: 2 a week counts weeks of two, 1 a week counts a session a week', () => {
    const logs = ['2026-09-21', '2026-09-14'].flatMap(m => logsIn(m, 2))
    assert.equal(t(logs, 2).weeks, 2)
    assert.equal(t(logs, 3).weeks, 0)
    assert.equal(t(weeksOf('2026-09-21', '2026-09-14', '2026-09-07'), 1).weeks, 3)
  })
  test('extra sessions are fine and do not count twice: five in a week is one week, and this week\'s figure stops at the target', () => {
    const r = t([...logsIn('2026-09-28', 5), ...logsIn('2026-09-21', 5)])
    assert.equal(r.weeks, 2)
    assert.equal(r.weekDone, 3, '3 of 3, never 5 of 3')
  })
  test('a very long run is capped at the lookback and says so', () => {
    const mondays = Array.from({ length: 60 }, (_, i) => addDays('2026-09-28', -7 * i))
    const r = t(mondays.flatMap(m => logsIn(m, 3)))
    assert.equal(r.weeks, 53, 'this week plus the 52 weeks looked back')
    assert.equal(r.capped, true)
    const noThisWeek = t(mondays.slice(1).flatMap(m => logsIn(m, 3)))
    assert.equal(noThisWeek.weeks, 52)
    assert.equal(noThisWeek.capped, true)
  })
  test('junk is ignored: unparseable log dates, and missing inputs do not throw', () => {
    assert.equal(t(['nope', null, undefined, ...logsIn('2026-09-21', 3)]).weeks, 1)
    assert.equal(targetStreak(undefined, today, 3).weeks, 0)
    assert.equal(targetStreak([], 'not a date', 3).weeks, 0)
  })
})

describe('_dashStreakModel - plan adherence while a plan governs this week, the weekly target otherwise', () => {
  const plan = program('2026-09-14', '2026-10-26')
  test('on a plan: the adherence model', () => {
    assert.equal(model(plan, [], '2026-10-03', { planStart: '2026-09-14', totalWeeks: 7 }).mode, 'plan')
  })
  test('no plan, a plan not started, a plan that has ended: the target model, with the target passed through', () => {
    for (const [p, start, weeks, today] of [[{}, null, 0, '2026-10-03'], [plan, '2026-09-14', 7, '2026-09-08'], [plan, '2026-09-14', 7, '2026-11-09']]) {
      const r = model(p, [], today, { planStart: start, totalWeeks: weeks, target: 5 })
      assert.equal(r.mode, 'target')
      assert.equal(r.target, 5)
    }
  })
  test('with nothing passed it is the default target', () => {
    assert.equal(model({}, [], '2026-10-03').target, 3)
  })
})

// What the tile SAYS (Jake, 2026-10-13).
describe('_dashTilesHtml - the streak tile', () => {
  const html = m => get('_dashTilesHtml')(m, { week: 1, name: 'Op', phase: null, totalWeeks: 1, pct: 100 }, false)
  const words = m => html(m).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const planModel = (over = {}) => ({ mode: 'plan', done: 9, due: 10, pct: 90, week: 3, totalWeeks: 8, weekDone: 2, weekPlanned: 4, ...over })
  const targetModel = (over = {}) => ({ mode: 'target', weeks: 4, capped: false, target: 3, weekDone: 1, ...over })

  test('plan: sessions done of what is due so far, the week of the plan and this week\'s count, and a bar at the percentage', () => {
    const h = html(planModel())
    assert.match(words(planModel()), /Sessions done 9 of 10 planned so far Week 3 of 8 · this week 2 of 4/)
    assert.match(h, /data-mode="plan"/)
    assert.match(h, /class="dash-meter"><i style="width:90%"/)
    assert.doesNotMatch(h.match(/<section[^>]*id="dash-streak"[^>]*>/)[0], /onclick|dash-tap/, 'the plan tile is not a link')
  })
  test('plan, nothing due yet: "0 sessions due yet", not "0 of 0"; a rest week says so', () => {
    const t = words(planModel({ done: 0, due: 0, pct: 0, weekDone: 0, weekPlanned: 0 }))
    assert.match(t, /0 sessions due yet/)
    assert.doesNotMatch(t, /0 of 0/)
    assert.match(t, /Week 3 of 8 · a rest week/)
  })
  test('no plan: weeks in a row at the target, this week against it, and a tap opens Settings where the target is set', () => {
    const h = html(targetModel())
    assert.match(words(targetModel()), /Streak 4 weeks in a row at 3 a week · this week 1 of 3/)
    assert.match(h, /data-mode="target"/)
    assert.match(h, /onclick="navigate\('settings'\)"/)
    assert.match(h, /class="dash-meter"><i style="width:33%"/)
  })
  test('no plan, no run yet: it says what to aim for; one week is singular; a capped run says N+', () => {
    assert.match(words(targetModel({ weeks: 0 })), /0 weeks in a row Aim for 3 a week · this week 1 of 3/)
    assert.match(words(targetModel({ weeks: 1 })), /1 week in a row at 3 a week/)
    assert.match(words(targetModel({ weeks: 53, capped: true })), /53\+ weeks in a row/)
    assert.match(words(targetModel({ weeks: 1, capped: true })), /1\+ weeks in a row/)
  })
  test('without the link (the owner\'s "View as" page) the target tile is not tappable', () => {
    const h = get('_dashTilesHtml')(targetModel(), { week: 1, name: 'Op', phase: null, totalWeeks: 1, pct: 100 }, false, false)
    const open = h.match(/<section[^>]*id="dash-streak"[^>]*>/)[0]   // the streak tile's own opening tag (the program tile after it is rightly tappable)
    assert.doesNotMatch(open, /onclick/)
    assert.doesNotMatch(open, /dash-tap/)
    assert.match(h, /4 <small>weeks in a row/, 'still drawn, just not a link')
  })
  test('this week at the target fills the bar', () => {
    assert.match(html(targetModel({ weekDone: 3 })), /<i style="width:100%"/)
  })
  test('the program tile is still beside it', () => {
    assert.match(words(planModel()), /Training plan/)
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
