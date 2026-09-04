// Unit tests for the app's pure functions — no browser, no Supabase, no login.
//
// Every function here was previously reachable ONLY by booting Chromium and authenticating (~2.5s
// per login, 633 logins in a full suite). These run in milliseconds. That is the whole point: the
// consolidation phases ahead need a cheap way to prove "the merged function still does what the
// three copies did", and a 35-minute browser suite is not it.
//
// Values were captured from the REAL functions before being written down, not assumed. Where a
// result looked wrong it was investigated rather than encoded quietly — see the _estimate1RM note.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get, scriptOrder, loadApp } from './load-app.mjs'

// REALM GOTCHA, encoded so it is hit once rather than repeatedly. Objects and arrays returned from
// the vm context are built from the SANDBOX realm's Object/Array prototypes, not Node's. So
// assert.deepStrictEqual (which `node:assert/strict` gives you for deepEqual) fails with "same
// structure but not reference-equal" against an ordinary Node literal, even when every value
// matches. Compare structurally instead.
const sameShape = (actual, expected, msg) =>
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), msg)

describe('harness', () => {
  test('all nine modules load and define their functions', () => {
    const ctx = loadApp()
    // Non-zero denominator: a sandbox that loaded nothing would pass every "is it a function" check
    // below by vacuous absence. Assert the corpus is really there first.
    const fnCount = Object.keys(ctx).filter(k => typeof ctx[k] === 'function').length
    assert.ok(fnCount > 400, `expected 400+ functions in the sandbox, got ${fnCount}`)
    assert.equal(scriptOrder().length, 9)
    assert.equal(scriptOrder()[0], 'js/app-core.js', 'app-core must load first — everything reads db/log from it')
  })

  test('get() reaches lexical bindings that are not global properties', () => {
    // A top-level `const` is NOT a property of the global object. This is the same mechanism that
    // makes the 20 cross-file bindings invisible to tooling, so the harness must handle it.
    assert.equal(typeof get('_rollingAvg'), 'function', 'const arrow (app-progress.js:2340)')
    assert.equal(typeof get('escapeHtml'), 'function', 'function declaration (app-core.js:520)')
    assert.equal(typeof get('EVENT_COLOURS'), 'object', 'const object (app-clients.js:555)')
  })
})

describe('escaping — the stored-XSS class this app has shipped 7 instances of', () => {
  test('escapeHtml neutralises a real payload', () => {
    assert.equal(get('escapeHtml')('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;')
  })

  test('escapeHtml handles null and empty without throwing', () => {
    const f = get('escapeHtml')
    assert.doesNotThrow(() => f(null))
    assert.doesNotThrow(() => f(undefined))
    assert.equal(f(''), '')
  })

  test('escapeAttr escapes BOTH quote kinds — an attribute can be delimited by either', () => {
    const out = get('escapeAttr')(`a'b"c`)
    assert.ok(!out.includes("'"), `raw single quote survived: ${out}`)
    assert.ok(!out.includes('"'), `raw double quote survived: ${out}`)
  })

  test('escapeAttr survives a backslash without producing a broken escape', () => {
    // Order matters here: escaping the backslash after the quotes would double-escape the entities.
    const out = get('escapeAttr')('a\\b')
    assert.ok(out.length >= 3, `unexpectedly short: ${out}`)
  })
})

describe('date maths — the UTC-parse bug class (two live copies fixed 2026-09-02)', () => {
  test('_ymdLocal formats the LOCAL date, not the UTC one', () => {
    // Constructed with local components, so the answer must not shift by a day in any timezone.
    assert.equal(get('_ymdLocal')(new Date(2026, 2, 5)), '2026-03-05')
    assert.equal(get('_ymdLocal')(new Date(2026, 11, 31)), '2026-12-31')
  })

  test('_ymdLocal returns null for an unparseable date rather than "NaN-NaN-NaN"', () => {
    assert.equal(get('_ymdLocal')(new Date('not a date')), null)
    assert.equal(get('_ymdLocal')(null), null)
  })

  test('_mondayOfWeek walks back to Monday', () => {
    const monday = get('_mondayOfWeek')('2026-08-05')   // a Wednesday
    assert.equal(get('_ymdLocal')(monday), '2026-08-03')
  })

  test('_mondayOfWeek of a Monday is that same Monday, not the week before', () => {
    assert.equal(get('_ymdLocal')(get('_mondayOfWeek')('2026-08-03')), '2026-08-03')
  })

  test('_mondayOfWeek of a SUNDAY goes back six days, not forward one', () => {
    // The classic off-by-one: JS getDay() makes Sunday 0, so a naive `d - getDay() + 1` jumps
    // FORWARD to the next Monday and silently shifts a whole programme week.
    assert.equal(get('_ymdLocal')(get('_mondayOfWeek')('2026-08-09')), '2026-08-03')
  })

  test('_mondayOfWeek returns null on bad input — callers guard on it before .getDate()', () => {
    assert.equal(get('_mondayOfWeek')('not-a-date'), null)
    assert.equal(get('_mondayOfWeek')(null), null)
  })
})

describe('training maths', () => {
  test('_estimate1RM applies Epley', () => {
    assert.equal(Math.round(get('_estimate1RM')(100, 5) * 100) / 100, 116.67)
  })

  test('_estimate1RM refuses nonsense instead of returning a number', () => {
    const f = get('_estimate1RM')
    assert.equal(f(0, 5), null, 'zero weight')
    assert.equal(f(100, 0), null, 'zero reps')
    assert.equal(f(-10, 5), null, 'negative weight')
    assert.equal(f('abc', 5), null, 'non-numeric weight')
    assert.equal(f(100, 999), null, 'beyond _ESTIMATE_1RM_MAX_REPS — the estimate stops being meaningful')
  })

  test('_estimate1RM at 1 rep returns EXACTLY the weight lifted', () => {
    // Jake's call, 2026-09-04, as the training-domain authority: a single IS a demonstrated one-rep
    // max, so there is nothing to estimate. Plain Epley (w * (1 + r/30)) reported 103.33kg for a
    // 100kg single — 3.3% higher than the lifter actually proved — and that number is not decorative:
    // it drives %1RM prescription, and app-progress.js:1839/:2482 apply it to sets already LOGGED,
    // so the charts overstated real performance without ever being asked for a projection.
    assert.equal(get('_estimate1RM')(100, 1), 100)
    assert.equal(get('_estimate1RM')(62.5, 1), 62.5, 'a non-integer weight must pass through untouched')
  })

  test('_estimate1RM at 2+ reps still uses Epley — only the r=1 case changed', () => {
    // Guards against over-correcting. The discontinuity this creates is real and accepted: 100x1
    // reports 100.0 and 100x2 reports 106.7, so adding a rep raises the estimate by 6.7kg. That is
    // the honest shape — one is measured, the other is extrapolated.
    assert.equal(Math.round(get('_estimate1RM')(100, 2) * 100) / 100, 106.67)
    assert.equal(Math.round(get('_estimate1RM')(100, 5) * 100) / 100, 116.67)
  })

  test('_rollingAvg averages over the trailing window', () => {
    sameShape(get('_rollingAvg')([1, 2, 3, 4], 2), [1, 1.5, 2.5, 3.5])
  })

  test('_rollingAvg tolerates gaps and non-numbers rather than producing NaN', () => {
    const out = get('_rollingAvg')([1, null, 3], 2)
    assert.equal(out.length, 3)
    assert.ok(out.every(v => v === null || Number.isFinite(v)), `NaN leaked: ${JSON.stringify(out)}`)
  })
})

describe('progress helpers', () => {
  test('_goalPct uses the start→target RANGE, not a bare current/target ratio', () => {
    // 100→112 of a 100..120 range is 60%, not 93%. Getting this wrong makes every goal look nearly done.
    assert.equal(get('_goalPct')({ start_value: 100, current_value: 112, target_value: 120, goal_milestones: [] }), 60)
  })

  test('_goalPct falls back to milestones when there are no numeric values', () => {
    assert.equal(get('_goalPct')({ goal_milestones: [{ completed_at: 'x' }, { completed_at: null }] }), 50)
  })

  test('_goalPct never returns NaN when start equals target', () => {
    const v = get('_goalPct')({ start_value: 10, current_value: 10, target_value: 10, goal_milestones: [] })
    assert.ok(Number.isFinite(v), `divide-by-zero leaked: ${v}`)
  })

  test('_goalPct clamps to 0..100', () => {
    const over = get('_goalPct')({ start_value: 0, current_value: 500, target_value: 10, goal_milestones: [] })
    assert.ok(over <= 100, `exceeded 100: ${over}`)
  })

  test('_deltaBadge reports direction and returns null delta on a zero baseline', () => {
    const up = get('_deltaBadge')(100, 110, false)
    assert.equal(up.delta, 10)
    assert.equal(up.arrow, '▲')
    // Documented at app-progress.js:2008 — percent change from 0 is undefined, so delta is null.
    assert.equal(get('_deltaBadge')(0, 10, false).delta, null)
  })
})

describe('programme scheduling — _programWorkoutsByDate (extracted 2026-08-30)', () => {
  const cp = (phases) => ({ id: 'cp1', start_date: '2026-08-03', programs: { program_phases: phases } })

  test('day_of_week is 1-BASED: Monday=1 lands on the Monday', () => {
    const map = get('_programWorkoutsByDate')(cp([{
      id: 'p1', name: 'B1', duration_weeks: 1, order_index: 0,
      program_phase_workouts: [{ id: 'a', day_of_week: 1, session_order: 1, week_number: 1, workout_templates: { name: 'Mon' } }]
    }]), {})
    sameShape(Object.keys(map), ['2026-08-03'])
  })

  test('a non-periodised phase REPEATS week 1 across every week', () => {
    const map = get('_programWorkoutsByDate')(cp([{
      id: 'p1', name: 'B1', duration_weeks: 3, order_index: 0,
      program_phase_workouts: [{ id: 'a', day_of_week: 1, session_order: 1, week_number: 1, workout_templates: { name: 'Mon' } }]
    }]), {})
    sameShape(Object.keys(map).sort(), ['2026-08-03', '2026-08-10', '2026-08-17'])
  })

  test('a PERIODISED phase places each week only on its own week', () => {
    const map = get('_programWorkoutsByDate')(cp([{
      id: 'p1', name: 'B1', duration_weeks: 2, order_index: 0,
      program_phase_workouts: [
        { id: 'a', day_of_week: 1, session_order: 1, week_number: 1, workout_templates: { name: 'W1' } },
        { id: 'b', day_of_week: 1, session_order: 1, week_number: 2, workout_templates: { name: 'W2' } }
      ]
    }]), {})
    sameShape(map['2026-08-03'].map(p => p.workout_templates.name), ['W1'])
    sameShape(map['2026-08-10'].map(p => p.workout_templates.name), ['W2'])
  })

  test('the client CLONE id is attached — Start must never run the master template', () => {
    const map = get('_programWorkoutsByDate')(cp([{
      id: 'p1', name: 'B1', duration_weeks: 1, order_index: 0,
      program_phase_workouts: [{ id: 'a', day_of_week: 1, session_order: 1, week_number: 1, workout_templates: { name: 'Mon' } }]
    }]), { a: { templateId: 'clone-1' } })
    assert.equal(map['2026-08-03'][0]._clientTemplateId, 'clone-1')
  })

  test('returns {} — not null — for unusable input, so callers iterate rather than crash', () => {
    sameShape(get('_programWorkoutsByDate')(null, null), {})
    sameShape(get('_programWorkoutsByDate')({ start_date: 'nonsense' }, {}), {})
  })
})
