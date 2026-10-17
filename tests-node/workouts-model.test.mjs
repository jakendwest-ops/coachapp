// The Workouts page's pure rules (Jake, 2026-10-16: the plan first, a search by name, an Edit button on a workout, and "workouts that are in an ACTIVE program cannot be
// amended on this page, they can only be amended within the Training Plan"). No browser: the same functions the page calls. The markup (_yourWorkoutsHtml) is checked as text.

import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { get, app } from './load-app.mjs'

const rows = (mine, others, used, active) => get('_wkRows')(mine, others, used, active)
const wk = (id, name, n = 2) => ({ id, name, workout_template_exercises: Array.from({ length: n }, (_, i) => ({ id: `${id}-e${i}`, exercise_name: `Exercise ${i}`, order_index: i, sets: 3 })) })
const ctx = (extra = {}) => ({ clientId: 'client-1', activeIds: new Set(), programId: 'prog-1', planName: 'Operation 240', ...extra })
const render = (data, c = ctx()) => get('_yourWorkoutsHtml')(data, c)
const plain = a => [...a]      // the app runs in a vm: its arrays are another realm's, and deepEqual against a normal array fails on the prototype
const itemsIn = h => (h.match(/class="wk-item"/g) || []).length

afterEach(() => { get('filterYourWorkouts')('') })      // the search term is page state that outlives a render: put it back so one test cannot colour the next

describe('_wkWeekless - a periodised plan keeps one copy of a session per week, and the page shows the plain name', () => {
  test('strips the week suffix, leaves everything else alone, never throws on nothing', () => {
    const w = get('_wkWeekless')
    assert.equal(w('Upper — W2'), 'Upper')
    assert.equal(w('Upper — W12'), 'Upper')
    assert.equal(w('Upper'), 'Upper')
    assert.equal(w('W2 Upper'), 'W2 Upper')
    assert.equal(w(null), '')
    assert.equal(w(undefined), '')
  })
})

describe('_wkRows - one row per workout, most recently done first', () => {
  test('a workout the account made is "you", a plan session it trained from is "plan"; done ones first, newest done on top, never done last in made order', () => {
    const r = rows([wk('a', 'Arms'), wk('b', 'Back'), wk('c', 'Chest')], [wk('p', 'Plan Day')], { p: { last: '2026-10-12', n: 1 }, a: { last: '2026-10-05', n: 2 } }, new Set())
    assert.deepEqual(plain(r.map(x => x.t.name)), ['Plan Day', 'Arms', 'Back', 'Chest'])
    assert.deepEqual(plain(r.map(x => x.src)), ['plan', 'you', 'you', 'you'])
    assert.equal(r[3].u, null, 'never done: no last-done')
  })
  test("a periodised plan's weekly copies are ONE row under the plain name, every time added up, shown as the copy done most recently", () => {
    const r = rows([], [wk('w1', 'Upper — W1'), wk('w2', 'Upper — W2')], { w1: { last: '2026-10-05', n: 2 }, w2: { last: '2026-10-12', n: 3 } }, new Set())
    assert.equal(r.length, 1)
    assert.equal(r[0].t.name, 'Upper')
    assert.equal(r[0].t.id, 'w2', 'the copy done last is the one opened, started and copied')
    assert.deepEqual({ ...r[0].u }, { last: '2026-10-12', n: 5 })
  })
  test('nothing is locked when no plan is on: no set, an empty set, or a set of other ids', () => {
    for (const act of [undefined, null, new Set(), new Set(['somewhere-else'])]) {
      const r = rows([wk('a', 'Arms')], [wk('p', 'Plan Day')], {}, act)
      assert.deepEqual(plain(r.map(x => x.locked)), [false, false], String([...(act || [])]))
    }
  })
  test('a workout in the plan the account is on NOW is locked; the same plan session is an ordinary workout once that plan is not on', () => {
    const others = [wk('p', 'Plan Day')]
    assert.equal(rows([], others, {}, new Set(['p']))[0].locked, true)
    assert.equal(rows([], others, {}, new Set())[0].locked, false, 'plan removed or finished: editable again')
  })
  test("a periodised plan's row is locked if ANY of its weekly copies is in the active plan", () => {
    const others = [wk('w1', 'Upper — W1'), wk('w2', 'Upper — W2')]
    assert.equal(rows([], others, {}, new Set(['w1']))[0].locked, true)
    assert.equal(rows([], others, {}, new Set(['w2']))[0].locked, true)
    assert.equal(rows([], others, {}, new Set(['w3']))[0].locked, false)
  })
  test("an account's own workout is locked too if it is somehow in the active plan", () => {
    assert.equal(rows([wk('a', 'Arms')], [], {}, new Set(['a']))[0].locked, true)
  })
  test('a workout named __proto__ or constructor groups like any other and breaks nothing', () => {
    const r = rows([], [wk('x', '__proto__'), wk('y', 'constructor'), wk('z', 'toString')], {}, new Set())
    assert.deepEqual(plain(r.map(x => x.t.name)).sort(), ['__proto__', 'constructor', 'toString'])
  })
  test('no data at all is an empty list, not an error', () => {
    assert.equal(rows(undefined, undefined, {}, undefined).length, 0)
    assert.equal(rows([], [], {}, new Set()).length, 0)
  })
})

describe('_wkPlanFinished - a plan that has run its course is not "active" (the same reading as the Training plan complete card)', () => {
  const finished = get('_wkPlanFinished')
  // a two-week phase whose only session is Monday of week 1; the sessions' own ids index the cpw map the way the page's read does
  const plan = start => ({ id: 'cp1', start_date: start, programs: { id: 'prog-1', name: 'Plan', program_phases: [{ id: 'ph1', name: 'P1', order_index: 0, duration_weeks: 2, program_phase_workouts: [{ id: 'pw1', day_of_week: 1, session_order: 1, week_number: 1 }] }] } })
  const cpw = { pw1: { templateId: 't1', name: 'Day', exercises: [] } }
  test('long over: it started months ago, nothing is left, the last week has passed', () => {
    assert.equal(finished(plan('2026-01-05'), cpw, [], '2026-10-16'), true)
  })
  test('running: this week is week 1 of 2 and its session has been (the later week has none set up yet) is NOT finished', () => {
    assert.equal(finished(plan('2026-10-12'), cpw, [], '2026-10-16'), false)
  })
  test('a session still to come keeps it active', () => {
    assert.equal(finished(plan('2026-10-19'), cpw, [], '2026-10-16'), false)
  })
  test('in the LAST week with a session still to come it is still active; once that session has passed it is finished', () => {
    const p = plan('2026-10-12'); p.programs.program_phases[0].program_phase_workouts.push({ id: 'pw2', day_of_week: 3, session_order: 1, week_number: 2 })
    const map = { ...cpw, pw2: { templateId: 't2', name: 'Day 2', exercises: [] } }
    assert.equal(finished(p, map, [], '2026-10-19'), false, 'Monday of week 2: that Wednesday is still to come')
    assert.equal(finished(p, map, [], '2026-10-23'), true, 'the Friday after it: nothing is left')
  })
  test('a plan with no weeks counted is finished once nothing is left, as the Training plan complete card reads it', () => {
    const p = plan('2026-10-12'); p.programs.program_phases[0].duration_weeks = 0
    assert.equal(finished(p, cpw, [], '2026-10-16'), true)
  })
  test("today's session, not logged yet, keeps it active; logged, and nothing is left, and it is the last week: finished", () => {
    assert.equal(finished(plan('2026-10-12'), cpw, [], '2026-10-12'), false)
    const oneWeek = plan('2026-10-12'); oneWeek.programs.program_phases[0].duration_weeks = 1
    assert.equal(finished(oneWeek, cpw, [{ date: '2026-10-12' }], '2026-10-12'), true)
  })
  test('no assignment, no plan on it, no start date or no sessions: never finished', () => {
    assert.equal(finished(undefined, {}, [], '2026-10-16'), false)
    assert.equal(finished({ id: 'x' }, {}, [], '2026-10-16'), false)
    const empty = plan('2026-01-05'); empty.programs.program_phases[0].program_phase_workouts = []
    assert.equal(finished(empty, {}, [], '2026-10-16'), false, 'a plan with no sessions has no dates to have run out')
  })
})

describe("_wkIsOwnClient - the page acts only on the account's own record", () => {
  test('equal to the solo record id and nothing else, including no id at all', () => {
    const win = get('window'), before = win._soloClientId
    try {
      win._soloClientId = 'me'
      assert.equal(get('_wkIsOwnClient')('me'), true)
      assert.equal(get('_wkIsOwnClient')('someone-else'), false)
      assert.equal(get('_wkIsOwnClient')(''), false)
      assert.equal(get('_wkIsOwnClient')(null), false)
      win._soloClientId = null
      assert.equal(get('_wkIsOwnClient')(null), false, 'no solo record and no id is still not "own"')
      assert.equal(get('_wkIsOwnClient')(undefined), false)
    } finally { win._soloClientId = before }
  })
})

describe('_yourWorkoutsHtml - state that outlives a render', () => {
  const data = (mine, others = [], used = {}) => ({ mine, others, used })
  const setUser = id => vm.runInContext(`currentUser = ${id ? `{ id: '${id}' }` : 'null'}`, app())
  afterEach(() => setUser(null))
  test("a search term with an apostrophe or a backslash comes back in the box exactly as typed (escapeHtml, not escapeAttr)", () => {
    render(data([wk('a', 'Arms')]))
    get('filterYourWorkouts')("Women's \\ x")
    const h = render(data([wk('a', 'Arms')]))
    assert.ok(h.includes('value="Women&#39;s \\ x"'), h.slice(h.indexOf('value=')))
    assert.doesNotMatch(h, /Women\\&#39;s/)
  })
  test('at the most the page reads (100) it says so; with fewer it says nothing', () => {
    const hundred = Array.from({ length: 100 }, (_, i) => wk(`w${i}`, `Workout ${i}`))
    assert.match(render(data(hundred)), /data-yw-capped[^>]*>Showing your 100 newest workouts\./)
    assert.doesNotMatch(render(data(hundred.slice(0, 99))), /data-yw-capped/)
  })
  test("a failed read clears the rows, so the template picker cannot show the previous render's", () => {
    render(data([wk('a', 'Arms')]))
    assert.equal(get('window')._ywRows.length, 1)
    render({ error: true })
    assert.equal(get('window')._ywRows.length, 0)
  })
  test('a different account on the same tab starts with a blank search box; the same account keeps its term', () => {
    setUser('user-a')
    render(data([wk('a', 'Arms'), wk('b', 'Back')]))
    get('filterYourWorkouts')('arm')
    assert.match(render(data([wk('a', 'Arms'), wk('b', 'Back')])), /value="arm"/, 'the same account keeps its term')
    setUser('user-b')
    const h = render(data([wk('a', 'Arms'), wk('b', 'Back')]))
    assert.match(h, /id="yw-search"[^>]*value=""/)
    assert.equal(itemsIn(h), 2)
  })
})

describe('_wkMatch - the search by name', () => {
  const list = rows([wk('a', 'Back and Biceps'), wk('b', 'Chest and Triceps'), wk('c', 'Legs')], [], {}, new Set())
  test('a name that contains the text matches, whatever the case, and the text is trimmed', () => {
    const m = get('_wkMatch')
    assert.deepEqual(plain(m(list, 'and').map(r => r.t.name)), ['Back and Biceps', 'Chest and Triceps'])
    assert.deepEqual(plain(m(list, '  LEGS ').map(r => r.t.name)), ['Legs'])
    assert.deepEqual(plain(m(list, 'tri').map(r => r.t.name)), ['Chest and Triceps'])
  })
  test('blank or missing text shows everything; no match shows nothing', () => {
    const m = get('_wkMatch')
    for (const q of ['', '   ', null, undefined]) assert.equal(m(list, q).length, 3, JSON.stringify(q))
    assert.equal(m(list, 'zzz').length, 0)
  })
  test('a typed % or _ is plain text, not a pattern', () => {
    assert.equal(get('_wkMatch')(list, '%').length, 0)
    assert.equal(get('_wkMatch')(list, '_').length, 0)
  })
})

describe('_wkMoreCount - what "Show N more" adds', () => {
  test('20 at a time, the last click shows what is left, and nothing once all are shown', () => {
    const more = get('_wkMoreCount')
    assert.equal(more(45, 20), 20)
    assert.equal(more(45, 40), 5)
    assert.equal(more(45, 45), 0)
    assert.equal(more(45, 60), 0)
    assert.equal(more(20, 20), 0)
    assert.equal(more(0, 20), 0)
    assert.equal(more(21, 20), 1)
  })
})

describe('_yourWorkoutsHtml - the page part', () => {
  const data = (mine, others = [], used = {}) => ({ mine, others, used })
  test('an ordinary workout offers Edit and Make a copy, and no lock', () => {
    const h = render(data([wk('a', 'Arms')]))
    assert.match(h, /data-yw-edit onclick="editWorkout\('a'\)"/)
    assert.match(h, /data-yw-copy onclick="copyWorkout\('a'\)"/)
    assert.doesNotMatch(h, /data-yw-lock|data-yw-plan/)
  })
  test("a workout in the active plan says so, names the plan, offers Open in Training plans and Make a copy, and has NO Edit (Jake: 'only amended within the Training Plan')", () => {
    const h = render(data([], [wk('p', 'Plan Day')], {}), ctx({ activeIds: new Set(['p']) }))
    assert.match(h, /data-yw-lock/)
    assert.match(h, /Part of your active plan, Operation 240, so it can only be changed in Training plans\./)
    assert.match(h, /data-yw-plan onclick="openWorkoutPlan\('prog-1'\)"/)
    assert.match(h, /data-yw-copy onclick="copyWorkout\('p'\)"/)
    assert.doesNotMatch(h, /data-yw-edit|editWorkout\(/)
  })
  test('with no plan id to open, the lock note stays and the Open button is left out', () => {
    const h = render(data([], [wk('p', 'Plan Day')]), ctx({ activeIds: new Set(['p']), programId: null }))
    assert.match(h, /data-yw-lock/)
    assert.doesNotMatch(h, /data-yw-plan/)
  })
  test('a plan name and a workout name that carry markup are shown as text', () => {
    const h = render(data([wk('a', '<img src=x onerror=1>')], [wk('p', 'Plan Day')]), ctx({ activeIds: new Set(['p']), planName: '<script>1</script>' }))
    assert.doesNotMatch(h, /<img|<script/)
    assert.match(h, /&lt;img src=x/)
    assert.match(h, /&lt;script&gt;/)
  })
  test('every row keeps the hooks the older tests and the expand toggle use', () => {
    const h = render(data([wk('a', 'Arms')]))
    for (const hook of ['data-your-workout', 'data-yw-toggle', 'data-yw-detail', 'data-yw-src', 'class="btn-primary wk-go"', "toggleYourWorkout('a')", "startWorkoutRunner('client-1','a')"]) assert.ok(h.includes(hook), hook)
  })
  test('no workouts: the empty line points at Create a workout, and there is no search box to type into', () => {
    const h = render(data([]))
    assert.match(h, /data-yw-empty/)
    assert.match(h, /Create a workout/)
    assert.doesNotMatch(h, /yw-search/)
  })
  test('a failed read says so and has no search box', () => {
    const h = render({ error: true })
    assert.match(h, /data-yw-error/)
    assert.doesNotMatch(h, /yw-search|data-yw-empty/)
  })
  test('the first page shows 20 of 45, a "Show 20 more" button and the count', () => {
    const mine = Array.from({ length: 45 }, (_, i) => wk(`w${i}`, `Workout ${String(i).padStart(2, '0')}`))
    const h = render(data(mine))
    assert.equal(itemsIn(h), 20)
    assert.match(h, /data-yw-more[^>]*>Show 20 more</)
    assert.match(h, /Showing 20 of 45/)
  })
  test('fewer than 21 workouts: no Show more and no count', () => {
    const h = render(data(Array.from({ length: 20 }, (_, i) => wk(`w${i}`, `Workout ${i}`))))
    assert.equal(itemsIn(h), 20)
    assert.doesNotMatch(h, /data-yw-more|data-yw-count/)
  })
  test('Show more adds 20 and the last click adds what is left', () => {
    const mine = Array.from({ length: 45 }, (_, i) => wk(`w${i}`, `Workout ${i}`))
    render(data(mine))
    get('showMoreYourWorkouts')()
    assert.equal(itemsIn(get('_ywListHtml')()), 40)
    get('showMoreYourWorkouts')()
    const last = get('_ywListHtml')()
    assert.equal(itemsIn(last), 45)
    assert.doesNotMatch(last, /data-yw-more/)
  })
  test('the search term is remembered, shown in the box (escaped), narrows the list, and a miss says so with a way out', () => {
    render(data([wk('a', 'Arms'), wk('b', 'Back')]))
    get('filterYourWorkouts')('ar')
    assert.equal(itemsIn(get('_ywListHtml')()), 1)
    const again = render(data([wk('a', 'Arms'), wk('b', 'Back')]))
    assert.match(again, /value="ar"/, 'the page is redrawn with the term still in the box')
    assert.equal(itemsIn(again), 1, 'and still filtered')
    get('filterYourWorkouts')('zzz')
    const none = get('_ywListHtml')()
    assert.match(none, /data-yw-nomatch/)
    assert.match(none, /data-yw-clear/)
    get('filterYourWorkouts')('a"><img src=x>')
    const esc = render(data([wk('a', 'Arms')]))
    assert.doesNotMatch(esc, /value="a"><img/)
    assert.doesNotMatch(get('_ywListHtml')(), /<img/)
  })
  test('a new search starts again from the first page', () => {
    const mine = Array.from({ length: 45 }, (_, i) => wk(`w${i}`, `Workout ${i}`))
    render(data(mine))
    get('showMoreYourWorkouts')()
    get('filterYourWorkouts')('Workout')
    assert.equal(itemsIn(get('_ywListHtml')()), 20)
  })
})
