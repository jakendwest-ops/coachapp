// The Goals tab's pure logic (Jake, 2026-10-13/14: "cramped or cluttered, progress unclear, milestones clumsy"; prototype https://claude.ai/artifact/JEJgr7Q81rjzotfJAfDWox):
// where a goal stands along its own line (up for a lift, down for a weight loss), when a step with a number ticks itself, the next step, and the time left.
// No browser: the same functions the list and the goal page call. The markup (goalCard) is checked as text.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const nums = g => get('_goalNums')(g)
const frac = n => get('_goalFrac')(n)
const toGo = n => get('_goalToGo')(n)
const steps = g => get('_goalSteps')(g)
const reached = (n, m) => get('_goalStepReached')(n, m)
const done = (g, m) => get('_goalStepDone')(g, m)
const next = g => get('_goalNextStep')(g)
const left = (due, today) => get('_goalTimeLeft')(due, today)

describe('_goalNums - a goal can be measured only when it has a start AND a target that differ', () => {
  test('a lift: start 100, now 130, target 160 goes up', () => {
    const n = nums({ start_value: 100, current_value: 130, target_value: 160 })
    assert.deepEqual({ ...n }, { start: 100, target: 160, cur: 130, up: true })
  })
  test('a weight loss runs downward', () => {
    assert.equal(nums({ start_value: 92, current_value: 88.4, target_value: 85 }).up, false)
  })
  test('the database may hand numbers back as strings', () => {
    const n = nums({ start_value: '100.00', current_value: '130.5', target_value: '160' })
    assert.equal(n.start, 100); assert.equal(n.cur, 130.5); assert.equal(n.target, 160)
  })
  test('no check-in yet: the current number is the start', () => {
    assert.equal(nums({ start_value: 100, current_value: null, target_value: 160 }).cur, 100)
    assert.equal(nums({ start_value: 100, target_value: 160 }).cur, 100)
  })
  test('without both numbers, or with the same number twice, there is nothing to measure: null (never NaN)', () => {
    for (const g of [{}, null, undefined, { start_value: 100 }, { target_value: 160 }, { start_value: '', target_value: '' }, { start_value: 'x', target_value: 160 }, { start_value: 100, target_value: 100 }])
      assert.equal(nums(g), null, JSON.stringify(g))
  })
  test('a goal from the old form has a target and a number but no start: it runs from 0, like the dashboard\'s _goalPct (current / target)', () => {
    const n = nums({ target_value: 100, current_value: 80 })
    assert.deepEqual({ ...n }, { start: 0, target: 100, cur: 80, up: true })
    assert.equal(frac(n), 0.8)
    assert.equal(nums({ target_value: 100 }), null, 'no number yet: nothing to measure')
    assert.equal(nums({ target_value: 0, current_value: 5 }), null, 'a target of 0 is no line to run along')
    assert.equal(get('_goalPct')({ target_value: 100, current_value: 80 }), 80, 'the dashboard\'s answer, so the two cannot disagree')
  })
  test('a start of 0 is a start (0 is a number, not "missing")', () => {
    const n = nums({ start_value: 0, current_value: 5, target_value: 100 })
    assert.equal(n.start, 0); assert.equal(n.cur, 5)
  })
})

describe('_goalFrac / _goalToGo - how far along, in the goal\'s own direction', () => {
  test('halfway up and halfway down are both 0.5', () => {
    assert.equal(frac(nums({ start_value: 100, current_value: 130, target_value: 160 })), 0.5)
    assert.equal(frac(nums({ start_value: 90, current_value: 85, target_value: 80 })), 0.5)
  })
  test('past the target is 1, the wrong way is 0 (a bar never leaves its track)', () => {
    assert.equal(frac(nums({ start_value: 100, current_value: 170, target_value: 160 })), 1)
    assert.equal(frac(nums({ start_value: 100, current_value: 90, target_value: 160 })), 0)
    assert.equal(frac(nums({ start_value: 92, current_value: 95, target_value: 85 })), 0)
  })
  test('to go: what is left in the goal\'s direction, 0 once it is reached or passed', () => {
    assert.equal(toGo(nums({ start_value: 100, current_value: 130, target_value: 160 })), 30)
    assert.ok(Math.abs(toGo(nums({ start_value: 92, current_value: 88.4, target_value: 85 })) - 3.4) < 1e-9)
    assert.equal(toGo(nums({ start_value: 100, current_value: 170, target_value: 160 })), 0)
    assert.equal(toGo(nums({ start_value: 92, current_value: 84, target_value: 85 })), 0)
  })
})

describe('steps - a step with a number ticks itself, any other is ticked by hand', () => {
  const up = nums({ start_value: 100, current_value: 130, target_value: 160 })
  const down = nums({ start_value: 92, current_value: 88.4, target_value: 85 })
  test('reached once progress passes the number, in the goal\'s direction', () => {
    assert.equal(reached(up, { target_value: 120 }), true)
    assert.equal(reached(up, { target_value: 130 }), true, 'exactly on it counts')
    assert.equal(reached(up, { target_value: 140 }), false)
    assert.equal(reached(down, { target_value: 90 }), true, 'a weight loss passes 90 on the way to 85')
    assert.equal(reached(down, { target_value: 87 }), false)
  })
  test('a step is reached only if its number lies ON the goal\'s line: a typo, or a number beyond the target, never ticks itself', () => {
    assert.equal(reached(up, { target_value: 14 }), false, '14 for 140 on a 100 -> 160 goal')
    assert.equal(reached(up, { target_value: 170 }), false, 'beyond the target')
    assert.equal(reached(up, { target_value: 100 }), true, 'exactly the start is on the line')
    assert.equal(reached(up, { target_value: 160 }), false, 'the target itself, not yet reached at 130')
    assert.equal(reached(down, { target_value: 95 }), false, 'above the start of a weight loss')
    assert.equal(reached(down, { target_value: 80 }), false, 'below the target of a weight loss')
    assert.equal(reached(nums({ start_value: 100, current_value: 160, target_value: 160 }), { target_value: 160 }), true, 'the target, once reached')
  })
  test('a step with no number is never reached by progress, and nor is anything on a goal with no numbers', () => {
    assert.equal(reached(up, {}), false)
    assert.equal(reached(up, { target_value: '' }), false)
    assert.equal(reached(null, { target_value: 120 }), false)
  })
  test('done: a person\'s tick (completed_at) always counts, and a reached step counts without one', () => {
    const g = { start_value: 100, current_value: 130, target_value: 160 }
    assert.equal(done(g, { completed_at: '2026-10-01T10:00:00Z' }), true)
    assert.equal(done(g, { target_value: 120 }), true)
    assert.equal(done(g, { target_value: 140 }), false)
    assert.equal(done({}, { title: 'plain' }), false)
    assert.equal(done({}, { completed_at: '2026-10-01T10:00:00Z' }), true)
  })
  test('a step ticked by hand stays done if the number later slips back', () => {
    assert.equal(done({ start_value: 100, current_value: 110, target_value: 160 }, { target_value: 140, completed_at: '2026-10-01T10:00:00Z' }), true)
  })
  test('in order: the order column first, then when they were made; a missing order sorts first; the input is not reordered', () => {
    const g = { goal_milestones: [
      { id: 'c', order: 2, created_at: '2026-01-01' }, { id: 'a', order: 1, created_at: '2026-01-03' },
      { id: 'n2', order: null, created_at: '2026-01-02' }, { id: 'n1', order: null, created_at: '2026-01-01' } ] }
    assert.deepEqual(Array.from(steps(g), s => s.id), ['n1', 'n2', 'a', 'c'])
    assert.deepEqual(g.goal_milestones.map(s => s.id), ['c', 'a', 'n2', 'n1'])
    assert.deepEqual(Array.from(steps({})), [])
    assert.deepEqual(Array.from(steps(null)), [])
  })
  test('the next step is the first one not done, skipping those the numbers have already ticked', () => {
    const g = { start_value: 100, current_value: 130, target_value: 160, goal_milestones: [
      { id: 's1', order: 1, target_value: 120 }, { id: 's2', order: 2, completed_at: '2026-10-01T10:00:00Z' }, { id: 's3', order: 3, target_value: 140 }, { id: 's4', order: 4 } ] }
    assert.equal(next(g).id, 's3')
    assert.equal(next({ goal_milestones: [{ id: 'x', completed_at: '2026-10-01T10:00:00Z' }] }), null, 'all done: null')
    assert.equal(next({}), null)
  })
})

describe('_goalTimeLeft - days, then weeks, never a negative or a NaN', () => {
  test('under two weeks it counts days, from two weeks it counts weeks', () => {
    assert.equal(left('2026-10-20', '2026-10-13').text, '7 days left')
    assert.equal(left('2026-10-26', '2026-10-13').text, '13 days left')
    assert.equal(left('2026-10-27', '2026-10-13').text, '2 weeks left')
    assert.equal(left('2027-03-13', '2026-10-13').text, '22 weeks left')
  })
  test('one day, today, and past due', () => {
    assert.equal(left('2026-10-14', '2026-10-13').text, '1 day left')
    assert.deepEqual({ ...left('2026-10-13', '2026-10-13') }, { text: 'due today', late: false })
    assert.deepEqual({ ...left('2026-10-10', '2026-10-13') }, { text: '3 days past due', late: true })
    assert.equal(left('2026-10-12', '2026-10-13').text, '1 day past due')
  })
  test('no date, or one that is not a date, is null', () => {
    for (const d of [null, undefined, '', 'soon', '2026-13']) assert.equal(left(d, '2026-10-13'), null, String(d))
    assert.equal(left('2026-10-13', 'nope'), null)
  })
  test('a date with a time on it is the same day', () => {
    assert.equal(left('2026-10-20T00:00:00+00:00', '2026-10-13').text, '7 days left')
  })
  describe('across a daylight-saving change (London: clocks back on 25 Oct 2026)', () => {
    const prev = process.env.TZ
    before(() => { process.env.TZ = 'Europe/London' })
    after(() => { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev })
    test('whole days apart, so the extra hour cannot make it 2 days become 1', () => {
      assert.equal(left('2026-10-26', '2026-10-24').text, '2 days left')
      assert.equal(left('2026-03-30', '2026-03-28').text, '2 days left', 'and the hour that goes in March')
    })
  })
})

describe('small formatters', () => {
  test('_glDate reads a calendar day as its own parts (never through new Date(string))', () => {
    assert.equal(get('_glDate')('2026-12-20'), '20 Dec')
    assert.equal(get('_glDate')('2026-12-20', true), '20 Dec 2026')
    assert.equal(get('_glDate')('2026-01-05T23:30:00Z'), '5 Jan')
    for (const v of [null, undefined, '', 'soon', '2026-13']) assert.equal(get('_glDate')(v), '', String(v))
  })
  test('_glFmt: one decimal at most, no trailing zero', () => {
    const f = get('_glFmt')
    assert.equal(f(130), '130'); assert.equal(f(88.44), '88.4'); assert.equal(f(117.5), '117.5'); assert.equal(f('100.00'), '100'); assert.equal(f(0), '0')
  })
})

describe('goalCard - the list card', () => {
  const card = (g, cid = 'c1') => get('goalCard')(g, cid)
  const text = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const squat = { id: 'g1', title: 'Squat 160 kg', status: 'active', metric_unit: 'kg', start_value: 100, current_value: 130, target_value: 160, target_date: '2099-03-13',
    goal_check_ins: [{ date: '2026-09-12' }, { date: '2026-10-03' }, { date: '2026-08-01' }],   // not in date order: the newest is found, not the last
    goal_milestones: [{ id: 's1', order: 1, title: 'Squat 120 kg', target_value: 120 }, { id: 's2', order: 2, title: 'Squat 140 kg', target_value: 140 }, { id: 's3', order: 3, title: 'Squat 150 kg', target_value: 150 }] }
  test('a numeric goal: the number, how far to go, a bar, the next step, the steps count, the last update and the date', () => {
    const h = card(squat), t = text(h)
    assert.match(t, /Squat 160 kg/)
    assert.match(t, /130 of 160 kg/)
    assert.match(t, /30 kg to go/)
    assert.match(h, /class="pw-bar gl-bar"><i style="width:50%"/)
    assert.match(t, /Next Squat 140 kg/, 'step 120 has ticked itself; the next is 140')
    assert.match(t, /1 of 3 steps · Updated 3 Oct/, 'the NEWEST check-in, not the first in the list')
    assert.match(t, /Due 13 Mar/)
  })
  test('the card is one tap target for the mouse and the keyboard, and opens THIS goal for THIS client', () => {
    const h = card(squat, 'client-9')
    assert.match(h, /role="button" tabindex="0"/)
    assert.match(h, /onclick="openGoal\('g1','client-9'\)"/)
    assert.match(h, /onkeydown="if\(event\.key==='Enter'\|\|event\.key===' '\)\{event\.preventDefault\(\);openGoal\('g1','client-9'\)\}"/)
  })
  test('a weight loss reads downward: 88.4 of 85, 3.4 kg to go, 51% along', () => {
    const t = text(card({ id: 'g2', title: 'Body weight 85 kg', status: 'active', metric_unit: 'kg', start_value: 92, current_value: 88.4, target_value: 85 }))
    assert.match(t, /88\.4 of 85 kg/)
    assert.match(t, /3\.4 kg to go/)
  })
  test('a goal with no numbers is its steps: "1 of 4 steps", and says what is next', () => {
    const g = { id: 'g3', title: 'Run 5k under 25 min', status: 'active', goal_milestones: [
      { id: 'a', order: 1, title: 'Run 5k without stopping', completed_at: '2026-09-01T10:00:00Z' }, { id: 'b', order: 2, title: 'Under 30 minutes' }, { id: 'c', order: 3, title: 'Under 27 minutes' }, { id: 'd', order: 4, title: 'Under 25 minutes' }] }
    const h = card(g), t = text(h)
    assert.match(t, /1 of 4 steps/)
    assert.match(h, /style="width:25%"/)
    assert.match(t, /Next Under 30 minutes/)
    assert.match(t, /No updates yet/)
    assert.match(t, /No date set/)
  })
  test('one step reads "1 step"; no steps at all prints no "Next" and no "All steps done"', () => {
    assert.match(text(card({ id: 'g', title: 't', goal_milestones: [{ id: 'a', title: 'x' }] })), /0 of 1 step\b/)
    const t = text(card({ id: 'g', title: 'plain' }))
    assert.doesNotMatch(t, /Next|All steps done/)
    assert.match(t, /No steps yet/, 'nothing to measure says so, not "0 of 0 steps"')
    assert.doesNotMatch(card({ id: 'g', title: 'plain' }), /pw-bar/, 'and draws no empty bar that would read as 0%')
  })
  test('every step done says so instead of "Next"', () => {
    const t = text(card({ id: 'g', title: 't', goal_milestones: [{ id: 'a', title: 'x', completed_at: '2026-09-01T10:00:00Z' }] }))
    assert.match(t, /All steps done/)
    assert.doesNotMatch(t, /Next/)
  })
  test('a finished goal says "Done" once (the pill), shows no to-go and no Next', () => {
    const t = text(card({ ...squat, status: 'completed' }))
    assert.equal((t.match(/Done/g) || []).length, 1)
    assert.doesNotMatch(t, /to go|Next|All steps done/)
  })
  test('a due date carries its year only when it is not this year', () => {
    const y = new Date().getFullYear()
    assert.match(text(card({ ...squat, target_date: `${y + 1}-03-13` })), new RegExp(`Due 13 Mar ${y + 1}`))
    assert.doesNotMatch(text(card({ ...squat, target_date: `${y}-12-20` })), new RegExp(`Due 20 Dec ${y}`))
    assert.match(text(card({ ...squat, target_date: `${y}-12-20` })), /Due 20 Dec/)
  })
  test('a paused or finished goal wears a pill, and a finished one shows no time left', () => {
    assert.match(card({ ...squat, status: 'paused' }), /<span class="pw-pill">Paused<\/span>/)
    const done = card({ ...squat, status: 'completed' })
    assert.match(done, /<span class="pw-pill">Done<\/span>/)
    assert.doesNotMatch(text(done), /weeks left|days left/)
    assert.match(card({ ...squat, status: 'abandoned' }), /Abandoned/)
    assert.doesNotMatch(card(squat), /pw-pill/, 'an active goal has no pill')
  })
  test('text a coach typed is shown as text and never becomes markup (title, unit, step)', () => {
    const h = card({ ...squat, title: '<img src=x onerror="window.__xss=1">', metric_unit: '<svg onload=1>kg', goal_milestones: [{ id: 'z', order: 1, title: '"><script>1</script>' }] })
    assert.doesNotMatch(h, /<img|<svg|<script/)
    assert.match(h, /&lt;img src=x/)
    assert.match(h, /&lt;script&gt;/)
  })
  test('a start of 0 is a real start (a 0-to-100 goal at 5 is 5%)', () => {
    assert.match(card({ id: 'g', title: 't', start_value: 0, current_value: 5, target_value: 100 }), /style="width:5%"/)
  })
})
