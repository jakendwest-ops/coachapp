// The shared exercise-stats maths (2026-10-03) — ONE set of numbers behind the runner's Stats sheet and the My progress cards.
//
// Why this exists. The two screens were separate implementations and had already drifted: the runner sheet projected
// every set with plain Epley (100 kg for one rep read 103.3, a 15-rep set was projected) while My progress used
// _estimate1RM (a single is measured, nothing over 12 reps is projected). Jake: "this amount of data should also be
// consistent with the 'my progress' page". These functions are the single definition; the browser spec proves the two
// screens show identical figures, this file pins the arithmetic.
//
// Jake's reaction to the prototype is encoded too: records are SETS ("Heaviest set 117.5 kg × 3"), and the estimated 1RM
// names the set it came from, so a 1RM higher than the heaviest weight explains itself.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const close = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg || ''} expected ${expected} ± ${tol}, got ${actual}`)

const metrics = (sets, opts) => get('_xsSessionMetrics')(sets, opts)
const set = (weight_kg, reps_achieved, extra = {}) => ({ weight_kg, reps_achieved, ...extra })

describe('_xsSessionMetrics — one session of one exercise', () => {
  test('volume, reps, sets, top set and intensity', () => {
    const m = metrics([set(100, 5), set(100, 5), set(90, 8)])
    assert.equal(m.sets, 3)
    assert.equal(m.reps, 18)
    assert.equal(m.volume, 100 * 5 + 100 * 5 + 90 * 8)
    assert.equal(m.top, 100)
    assert.equal(m.topReps, 5)
    close(m.intensity, m.volume / 18, 1e-9, 'intensity is volume per rep')
  })

  test('the top set is the heaviest; on a tie the one with more reps', () => {
    const m = metrics([set(100, 3), set(100, 5), set(90, 10)])
    assert.equal(m.top, 100)
    assert.equal(m.topReps, 5, 'two sets at 100: the 5-rep one is the top set')
  })

  test('a warm-up is not training volume (the app-wide rule: _countableSets)', () => {
    const m = metrics([set(20, 10, { phase: 'warmup' }), set(100, 5)])
    assert.equal(m.sets, 1)
    assert.equal(m.volume, 500)
    assert.equal(m.top, 100)
  })

  test('a bodyweight exercise (no weight) has reps but no weight figures — and does not throw', () => {
    const m = metrics([set(null, 10), set(null, 9)])
    assert.equal(m.sets, 2)
    assert.equal(m.reps, 19)
    assert.equal(m.volume, 0)
    assert.equal(m.top, 0)
    assert.equal(m.e1rm, 0)
    assert.equal(m.e1rmSrc, null)
  })

  test('an empty session is all zeros, not NaN', () => {
    const m = metrics([])
    for (const k of ['sets', 'reps', 'volume', 'top', 'topReps', 'e1rm', 'intensity']) assert.equal(m[k], 0, k)
  })
})

describe('_xsSessionMetrics — the one estimated-1RM rule (the thing the two screens disagreed about)', () => {
  test('one rep is MEASURED, not projected: 100 kg x 1 is 100, not Epley\'s 103.3', () => {
    close(metrics([set(100, 1)]).e1rm, 100, 1e-9)
  })

  test('nothing over 12 reps is projected: a 15-rep set gives no estimate', () => {
    const m = metrics([set(60, 15)])
    assert.equal(m.e1rm, 0)
    assert.equal(m.e1rmSrc, null)
  })

  test('otherwise Epley: 62.5 kg x 8 -> 79.17', () => {
    close(metrics([set(62.5, 8)]).e1rm, 62.5 * (1 + 8 / 30), 1e-9)
  })

  test('a logged RPE counts: 100 x 3 @ RPE 8 is 115.9 (the chart), not Epley\'s 110', () => {
    close(metrics([set(100, 3, { effort_value: 8, effort_type: 'rpe' })]).e1rm, 100 / 0.863, 0.01)
  })

  test('with the effort switched off the same set falls back to plain reps maths', () => {
    close(metrics([set(100, 3, { effort_value: 8, effort_type: 'rpe' })], { useEffort: false }).e1rm, 110, 1e-9)
  })

  test('RIR 2 means RPE 8 — the scale is converted, never read as a bare number', () => {
    const rir = metrics([set(100, 3, { effort_value: 2, effort_type: 'rir' })]).e1rm
    const rpe = metrics([set(100, 3, { effort_value: 8, effort_type: 'rpe' })]).e1rm
    close(rir, rpe, 1e-9)
  })

  test('an effort with no scale is ignored — RIR and RPE run in opposite directions, so a guess would invert it', () => {
    close(metrics([set(100, 3, { effort_value: 8 })]).e1rm, 110, 1e-9)
    close(metrics([set(100, 3, { effort_value: 8, effort_type: null })]).e1rm, 110, 1e-9)
  })

  test('RIR 0 (to failure) is a real value and behaves like a plain set', () => {
    close(metrics([set(100, 3, { effort_value: 0, effort_type: 'rir' })]).e1rm, 110, 1e-9)
  })

  test('the 1RM comes from whichever set estimates highest — not necessarily the heaviest', () => {
    const m = metrics([set(100, 5), set(110, 1)])
    assert.equal(m.top, 110, 'the heaviest set')
    close(m.e1rm, 100 * (1 + 5 / 30), 1e-9, '5 x 100 estimates 116.7, more than the measured 110')
    assert.equal(m.e1rmSrc.weight_kg, 100)
    assert.equal(m.e1rmSrc.reps_achieved, 5)
  })
})

describe('_xsRecords — personal records, named by SET, each with its date', () => {
  const sessions = [
    { date: '2026-09-01', sets: [set(100, 5)] },
    { date: '2026-09-08', sets: [set(117.5, 3, { effort_value: 9, effort_type: 'rpe' }), set(105, 3)] },
    { date: '2026-09-15', sets: [set(117.5, 2)] },
  ]
  const rec = get('_xsRecords')(sessions)

  test('Heaviest SET: the most weight, with its reps (a tie on weight goes to more reps)', () => {
    assert.equal(rec.heaviest.weight_kg, 117.5)
    assert.equal(rec.heaviest.reps_achieved, 3, '117.5 x 3 beats 117.5 x 2')
    assert.equal(rec.heaviest.date, '2026-09-08')
  })

  test('Best est. 1RM names the set it came from, so it can be higher than the heaviest weight without looking wrong', () => {
    close(rec.e1rm.value, 117.5 / 0.892, 0.01, '3 reps at RPE 9 is 89.2% of 1RM')
    assert.equal(rec.e1rm.src.weight_kg, 117.5)
    assert.equal(rec.e1rm.src.reps_achieved, 3)
    assert.equal(rec.e1rm.date, '2026-09-08')
    assert.ok(rec.e1rm.value > rec.heaviest.weight_kg, 'the case Jake noticed: a 1RM well above the heaviest weight')
  })

  test('Biggest set is the most weight x reps in one set — a different thing from the heaviest', () => {
    assert.equal(rec.biggest.weight_kg, 100)
    assert.equal(rec.biggest.reps_achieved, 5)
    assert.equal(rec.biggest.date, '2026-09-01')
  })

  test('Best session volume, with its date', () => {
    close(rec.volume.value, 117.5 * 3 + 105 * 3, 1e-9)
    assert.equal(rec.volume.date, '2026-09-08')
  })

  test('an exact tie goes to the MORE RECENT session (history is oldest first)', () => {
    const r = get('_xsRecords')([{ date: '2026-09-01', sets: [set(100, 5)] }, { date: '2026-09-08', sets: [set(100, 5)] }])
    assert.equal(r.heaviest.date, '2026-09-08')
    assert.equal(r.biggest.date, '2026-09-08')
    assert.equal(r.volume.date, '2026-09-08')
    assert.equal(r.e1rm.date, '2026-09-08')
  })

  test('no weighted sets: every record is null, nothing throws', () => {
    const r = get('_xsRecords')([{ date: '2026-09-01', sets: [set(null, 10)] }])
    assert.equal(r.heaviest, null)
    assert.equal(r.e1rm, null)
    assert.equal(r.biggest, null)
    assert.equal(r.volume, null)
    assert.equal(get('_xsRecords')([]).heaviest, null)
  })

  test('warm-ups never make a record', () => {
    const r = get('_xsRecords')([{ date: '2026-09-01', sets: [set(200, 1, { phase: 'warmup' }), set(100, 5)] }])
    assert.equal(r.heaviest.weight_kg, 100)
  })
})

describe('My progress and the shared maths cannot drift apart (the point of this change)', () => {
  test('_metricPointsFor (every other trend consumer) reads the same numbers as the card does', () => {
    const sets = [set(117.5, 3, { effort_value: 9, effort_type: 'rpe' }), set(105, 6), set(100, 1)]
    const p = get('_metricPointsFor')({ name: 'Lay A', metricType: 'weight_reps', sessions: [{ date: '2026-09-08', sets }] }).points[0]
    const m = metrics(sets)
    assert.equal(p.topWeight, m.top)
    close(p.e1rm, m.e1rm, 1e-9, 'e1rm — including the logged RPE')
    assert.equal(p.volume, m.volume)
    close(p.intensity, m.intensity, 1e-9)
    assert.equal(p.reps, m.reps)
  })
})

describe('_xsStripHtml — the change arrow under each number', () => {
  const session = (key, date, sets) => ({ key, date, sets, m: metrics(sets) })
  const strip = (cur, prev) => get('_xsStripHtml')({ plotted: [prev, cur], sel: null })
  // { value, delta } of one tile, where delta is the raw HTML of its change line.
  const tile = (html, id) => {
    const m = new RegExp(`data-xs-tile="${id}"><div class="xs-tl">[^<]*</div><div class="xs-tv">([^<]*)</div><div class="xs-td">(.*?)</div></div>`, 's').exec(html)
    assert.ok(m, `tile ${id} is in the strip`)
    return { value: m[1], delta: m[2] }
  }
  const prev = session('k0', '2026-09-22', [set(100, 1)])

  test('a real rise is a green arrow with the rounded size of the change', () => {
    const t = tile(strip(session('k1', '2026-09-29', [set(110, 1)]), prev), 'e1rm')
    assert.match(t.delta, /xs-up/)
    assert.match(t.delta, /▲ 10/)
  })

  test('a real fall is a red arrow', () => {
    const t = tile(strip(session('k1', '2026-09-29', [set(90, 1)]), prev), 'top')
    assert.match(t.delta, /xs-dn/)
    assert.match(t.delta, /▼ 10/)
  })

  test('a change that rounds to nothing on screen is "–", never a red "▼ 0" (the bug the first screenshot showed)', () => {
    // 100.4 vs 100: the estimates differ by 0.4, which the whole-number display would have shown as "▲ 0".
    const t = tile(strip(session('k1', '2026-09-29', [set(100.4, 1)]), prev), 'e1rm')
    assert.match(t.delta, /xs-eq/)
    assert.match(t.delta, /–/)
    assert.doesNotMatch(t.delta, /▲|▼/)
  })

  test('big changes carry a thousands separator and still read as a change', () => {
    const t = tile(strip(session('k1', '2026-09-29', Array.from({ length: 10 }, () => set(100, 12))), session('k0', '2026-09-22', [set(100, 5)])), 'volume')
    assert.equal(t.value, '12,000')
    assert.match(t.delta, /▲ 11,500/)
  })

  test('today\'s arrows are grey, not green and red: half a workout against a whole one is not a drop', () => {
    const t = tile(strip(session('today', 'Today', [set(60, 5)]), prev), 'top')
    assert.match(t.delta, /xs-eq/)
    assert.match(t.delta, /▼ 40/)
    assert.doesNotMatch(t.delta, /xs-dn|xs-up/)
  })

  test('the first session has nothing to compare against: no arrow at all', () => {
    const html = get('_xsStripHtml')({ plotted: [session('k0', '2026-09-22', [set(100, 5)])], sel: null })
    assert.equal(tile(html, 'top').delta, '')
  })
})

describe('_xsSessionMetrics.topSet — the ROW behind the top set (2026-10-04)', () => {
  test('is the heaviest set itself (a tie on weight goes to the set with more reps), so its effort can be shown', () => {
    const m = metrics([set(100, 3), set(100, 5, { effort_value: 9, effort_type: 'rpe' }), set(90, 10)])
    assert.equal(m.topSet.weight_kg, 100)
    assert.equal(m.topSet.reps_achieved, 5)
    assert.equal(m.topSet.effort_value, 9)
  })
  test('is null when nothing was weighted (a bodyweight session has no heaviest set), and for an empty session', () => {
    assert.equal(metrics([set(null, 10), set(null, 9)]).topSet, null)
    assert.equal(metrics([]).topSet, null)
  })
  test('never a warm-up', () => {
    assert.equal(metrics([set(200, 1, { phase: 'warmup' }), set(100, 5)]).topSet.weight_kg, 100)
  })
})

// The runner's "Last time" panel (Jake, 2026-10-04: "This panel needs to show top set"). It used to read "2 sets, top 23 kg" - the
// weight but not the reps it was lifted for. Now: the top set as weight x reps, with its effort when one was logged, plus the count.
describe('_lastTimeSummary — what the runner\'s Last time panel says', () => {
  const sum = (sets) => get('_lastTimeSummary')(sets)

  test('Jake\'s case: two sets, 23 kg for 5 is the top set, and the count comes back with it', () => {
    const s = sum([set(20, 5), set(23, 5)])
    assert.equal(s.count, 2)
    assert.equal(s.top, '23 kg × 5')
  })

  test('the top set is the Stats card\'s: heaviest first, a tie going to the set with more reps', () => {
    const s = sum([set(100, 3), set(100, 5), set(90, 10)])
    assert.equal(s.top, '100 kg × 5')
    assert.equal(s.count, 3)
  })

  test('the logged effort travels with the set, and its scale with it: RPE as @9, RIR as @2 RIR', () => {
    assert.equal(sum([set(100, 3, { effort_value: 9, effort_type: 'rpe' }), set(85, 5)]).top, '100 kg × 3 @9')
    assert.equal(sum([set(100, 3, { effort_value: 2, effort_type: 'rir' })]).top, '100 kg × 3 @2 RIR')
  })

  test('an effort with no scale is not shown (RIR and RPE run in opposite directions, so a guess could invert it)', () => {
    assert.equal(sum([set(100, 3, { effort_value: 8 })]).top, '100 kg × 3')
  })

  test('a warm-up is neither the top set nor part of the count (the Stats card ignores it too)', () => {
    const s = sum([set(20, 10, { phase: 'warmup' }), set(100, 5)])
    assert.equal(s.count, 1)
    assert.equal(s.top, '100 kg × 5')
  })

  test('a bodyweight lift has no heaviest set: its top set is the one with the most reps', () => {
    const s = sum([set(null, 10), set(null, 12), set(null, 9)])
    assert.equal(s.top, '12 reps')
    assert.equal(s.count, 3)
  })

  test('a weight with no reps recorded shows the weight alone, never "× 0"', () => {
    assert.equal(sum([set(23, 0)]).top, '23 kg')
  })

  test('one set reads as one set, and nothing countable (only warm-ups) is null so no empty panel is drawn', () => {
    assert.equal(sum([set(60, 8)]).count, 1)
    assert.equal(sum([set(20, 10, { phase: 'warmup' })]), null)
    assert.equal(sum([]), null)
  })

  test('shown in the user\'s unit, converted from the canonical kg', () => {
    const prefs = get('window')._unitPrefs
    const before = prefs.weight
    try {
      prefs.weight = 'lb'
      assert.equal(sum([set(100, 5)]).top, '220.5 lb × 5')
    } finally { prefs.weight = before }
  })
})
