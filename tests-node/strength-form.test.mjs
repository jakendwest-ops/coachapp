// The strength form (Step B of docs/superpowers/plans/2026-11-15-workout-builder-speed.md): the pure rules under it.
//   - the range rule (Jake, 2026-11-13): on every range the right end is never below the left. Closes
//     docs/bugs/2026-11-13-a-range-can-be-saved-with-its-high-end-below-its-low-end.md on the save side.
//   - a new exercise starts from the previous exercise's sets, reps, effort and rest (settled point 5).
//   - straight sets on a "today's" base: set 1 sets the weight (Jake, 2026-11-15) - the logger treats set 1 as the reference.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { get, app } from './load-app.mjs'

// Objects built inside the app's vm context have that context's prototypes: compare plain copies.
const plain = o => JSON.parse(JSON.stringify(o))

describe('the range rule: the high end is never below the low end', () => {
  const order = get('_rangeInOrder')
  test('reps, effort, % and rest: an upside-down range is closed up to the low end', () => {
    assert.deepEqual(plain(order({ repsMin: '10', repsMax: '8' })), { repsMin: '10', repsMax: '10' })
    assert.deepEqual(plain(order({ effortMin: '9', effortMax: '7' })), { effortMin: '9', effortMax: '9' })
    assert.deepEqual(plain(order({ intensityMin: '80', intensityMax: '70' })), { intensityMin: '80', intensityMax: '80' })
    assert.deepEqual(plain(order({ restMin: '3:00', restMax: '2:00' })), { restMin: '3:00', restMax: '3:00' })
  })
  test('rest compares as TIME, not as text ("10:00" is more than "9:00")', () => {
    const s = { restMin: '9:00', restMax: '10:00' }
    assert.equal(order(s), s, 'already in order: untouched (the same object)')
  })
  test('a 0 end is a real value (RIR 0 to 2 is in order; 2 to 0 is not)', () => {
    const ok = { effortMin: 0, effortMax: 2 }
    assert.equal(order(ok), ok)
    assert.deepEqual(plain(order({ effortMin: 2, effortMax: 0 })), { effortMin: 2, effortMax: 2 })
  })
  test('one end missing, equal ends, or no range at all: nothing changes', () => {
    for (const s of [{ repsMin: '8' }, { repsMax: '8' }, { repsMin: '8', repsMax: '8' }, {}, { repsMin: '', repsMax: '5' }]) assert.equal(order(s), s)
  })
  test('the save path applies it to every set, whatever the type', () => {
    const clean = get('_cleanTemplateSets')
    const out = clean([{ repsMin: '12', repsMax: '8', restMin: '2:00', restMax: '1:00' }, { repsMin: '5', repsMax: '6' }], { unilateral: false, timed: false }, 'weight_reps')
    assert.equal(out[0].repsMax, '12'); assert.equal(out[0].restMax, '2:00')
    assert.equal(out[1].repsMax, '6', 'a range already in order is left alone')
  })
})

describe('a new exercise starts from the previous one', () => {
  const from = get('_sfStartFromPrevious')
  const S = { repsMin: '8', repsMax: '10', effortType: 'rir', effortMin: '2', effortMax: '2', restMin: '2:00', restMax: '2:00', weight: '100', intensityMin: '70', tempo: '3011', amrap: true }
  test('straight sets: the same count, with reps, effort and rest only (never a weight, %, tempo or AMRAP)', () => {
    const r = from({ exercise_name: 'Squat', metric_type: 'weight_reps', sets_json: [S, S, S] })
    assert.equal(r.from, 'Squat')
    assert.equal(r.sets.length, 3)
    assert.deepEqual(plain(r.sets[0]), { effortType: 'rir', repsMin: '8', repsMax: '10', effortMin: '2', effortMax: '2', restMin: '2:00', restMax: '2:00' })
  })
  test('a top-set exercise passes on its BACK-OFF sets', () => {
    const top = { isTopSet: true, repsMin: '3', effortMin: '9' }
    const r = from({ exercise_name: 'Bench', metric_type: 'weight_reps', sets_json: [top, S, S] })
    assert.equal(r.sets.length, 2)
    assert.equal(r.sets[0].repsMin, '8')
  })
  test('nothing to start from: another type, no sets, or a lone top set', () => {
    assert.equal(from({ metric_type: 'timed_hold', sets_json: [S] }), null)
    assert.equal(from({ metric_type: 'weight_reps', sets_json: [] }), null)
    assert.equal(from({ metric_type: 'weight_reps', sets_json: null }), null)
    assert.equal(from({ metric_type: 'weight_reps', sets_json: [{ isTopSet: true }] }), null)
    assert.equal(from(undefined), null)
  })
  test('unilateral counts as strength', () => {
    assert.equal(from({ metric_type: 'unilateral', sets_json: [S] })?.sets.length, 1)
  })
})

describe('straight sets on a "today\'s" base: set 1 sets the weight', () => {
  const ref = get('_set1IsReference')
  test('the logger treats set 1 as the reference set when a later set uses a "today\'s" base, or when set 1 is a top set', () => {
    assert.equal(ref({ sets_json: [{}, { intensityBasis: 'topSetWeight' }] }), true)
    assert.equal(ref({ sets_json: [{}, { intensityBasis: 'topSet' }] }), true)
    assert.equal(ref({ sets_json: [{ isTopSet: true }, {}] }), true)
    assert.equal(ref({ sets_json: [{}, { intensityBasis: 'stored' }] }), false)
    assert.equal(ref({ sets_json: [{}, { intensityBasis: 'lastBest' }] }), false, "last session's e1RM needs nothing from today")
    assert.equal(ref({ sets_json: [] }), false)
  })
  test('ticking set 1 gives the later sets their base, exactly as a top set does', () => {
    const recompute = get('_recomputeLiveE1RM')
    const ex = { sets_json: [{ effortType: 'rpe' }, { intensityBasis: 'topSetWeight', intensityMin: '80' }], tableRows: [{ done: true, weight: '100', reps: '5', effort: '8' }] }
    recompute(ex)
    assert.equal(ex._liveTopWeight, 100)
    assert.ok(ex._liveE1RM > 100)
    const plain = { sets_json: [{}, { intensityBasis: 'stored' }], tableRows: [{ done: true, weight: '100', reps: '5', effort: '8' }] }
    recompute(plain)
    assert.equal(plain._liveTopWeight, null, 'no "today\'s" base: nothing is worked out from set 1')
  })
})

describe('the form draws Fixed as ONE box and keeps it in step on flush', () => {
  // A minimal DOM: getElementById returns stubs only for ids the form actually drew (parsed from its HTML).
  function harness(sets) {
    const ctx = app()
    const els = {}
    const host = { innerHTML: '', style: {}, dataset: {}, value: '' }
    vm.runInContext('_tsView = { custom: false }; _sfUi = { custom: false, sel: 0, range: {}, chips: {} }', ctx)
    ctx._templateSets = sets
    ctx.document.getElementById = id => {
      if (id === 'att-sets-container') return host
      if (id === 'att-type-field' || id === 'att-type') return els[id] ||= { style: {}, value: 'weight_reps', dataset: {} }
      return els[id] || null
    }
    get('renderTemplateSets')('att-sets-container', 'weight_reps')
    for (const m of host.innerHTML.matchAll(/<input id="([^"]+)"([^>]*)>/g)) els[m[1]] = { value: (/\svalue="([^"]*)"/.exec(m[2]) || [])[1] ?? '', style: {}, dataset: {} }
    return { host, els, ctx }
  }
  test('reps on Fixed: typing 5 over a stored 8 saves 5, not a 5-8 range (the stale high end the builder spec caught)', () => {
    const sets = [{ repsMin: '8', repsMax: '8', effortType: 'rpe' }, { repsMin: '8', repsMax: '8', effortType: 'rpe' }]
    const { els } = harness(sets)
    assert.ok(els['ts-rmin-0'] && !els['ts-rmax-0'], 'Fixed draws one box')
    els['ts-rmin-0'].value = '5'
    get('flushTemplateSets')('att-sets-container')
    assert.deepEqual(sets.map(s => [s.repsMin, s.repsMax]), [['5', '5'], ['5', '5']])
  })
  test('an old row with only a high end shows it in the Fixed box, never an empty box over a real value', () => {
    const { els } = harness([{ repsMax: '10', effortType: 'rpe' }])
    assert.equal(els['ts-rmin-0'].value, '10')
  })
})

// ── Review findings, 2026-11-15 (multi-agent review of Step B). Each was reproduced first; each test failed before its fix. ──
describe('review: opening and saving never changes a set the coach did not touch', () => {
  // A stub DOM that re-reads the form's HTML after every re-render, like a browser would.
  function sheet(sets, type = 'weight_reps') {
    const ctx = app()
    const host = { innerHTML: '', style: {}, dataset: {}, value: '' }
    const shell = { 'att-type': { value: type, style: {}, dataset: {} }, 'att-type-field': { style: {}, dataset: {} }, 'att-notes': { value: '', style: {}, dataset: {} } }
    let parsedFor = null, inputs = {}
    const parse = () => {
      if (parsedFor === host.innerHTML) return
      parsedFor = host.innerHTML; inputs = {}
      for (const m of host.innerHTML.matchAll(/<input id="([^"]+)"([^>]*)>/g)) inputs[m[1]] = { value: (/\svalue="([^"]*)"/.exec(m[2]) || [])[1] ?? '', style: {}, dataset: {} }
    }
    vm.runInContext('_tsView = { custom: false }; _sfUi = { custom: false, sel: 0, range: {}, chips: {} }', ctx)
    ctx._templateSets = sets
    ctx.document.getElementById = id => { if (id === 'att-sets-container') return host; if (shell[id]) return shell[id]; parse(); return inputs[id] || null }
    get('renderTemplateSets')('att-sets-container', type)
    const call = (fn, ...args) => get(fn)(...args)
    const saved = () => { call('flushTemplateSets', 'att-sets-container'); return plain(call('_cleanTemplateSets', ctx._templateSets, call('_deriveFromMetricType', type), type)) }
    return { host, call, saved, el: id => { parse(); return inputs[id] } }
  }
  const pcts = out => out.map(s => [s.intensityMin, s.intensityBasis])

  test('an older row: set 1 on the default base with no %, later sets on "% of today’s top set" - saved exactly as it was', () => {
    const f = sheet([{ effortType: 'rpe', repsMin: '5' }, { effortType: 'rpe', repsMin: '5', intensityMin: '80', intensityMax: '80', intensityBasis: 'topSetWeight' }, { effortType: 'rpe', repsMin: '5', intensityMin: '80', intensityMax: '80', intensityBasis: 'topSetWeight' }])
    assert.deepEqual(pcts(f.saved()), [[null, 'topSetWeight'], ['80', 'topSetWeight'], ['80', 'topSetWeight']])
  })
  test('an older row whose set 1 has its OWN % is shown set by set and saved untouched (never stripped)', () => {
    const f = sheet([{ effortType: 'rpe', intensityMin: '70', intensityMax: '70' }, { effortType: 'rpe', intensityMin: '80', intensityMax: '80', intensityBasis: 'topSetWeight' }])
    assert.equal(f.host.dataset.tsView, 'custom')
    assert.deepEqual(pcts(f.saved()), [['70', 'stored'], ['80', 'topSetWeight']])
  })
  test('a tap on RPE / RIR, or "Back to the same", keeps every later set’s %', () => {
    const shape = () => [{ effortType: 'rpe' }, { effortType: 'rpe', intensityMin: '80', intensityMax: '80', intensityBasis: 'topSet' }, { effortType: 'rpe', intensityMin: '80', intensityMax: '80', intensityBasis: 'topSet' }]
    let f = sheet(shape()); f.call('setTsEffort', 0, 'rir', 'att-sets-container')
    assert.deepEqual(pcts(f.saved()), [[null, 'topSet'], ['80', 'topSet'], ['80', 'topSet']])
    f = sheet(shape()); f.call('tsMakeSetsSame', 'att-sets-container')
    assert.deepEqual(pcts(f.saved()), [[null, 'topSet'], ['80', 'topSet'], ['80', 'topSet']])
  })
  test('top set page: "% of today’s e1RM", 70, then Straight sets: still today’s e1RM, set 1 with no %', () => {
    const f = sheet([{ effortType: 'rpe', repsMin: '3', effortMin: '8', effortMax: '8' }, { effortType: 'rpe', repsMin: '3', effortMin: '8', effortMax: '8' }])
    f.call('tsSetStructure', 'top', 'att-sets-container')
    f.call('sfBasis', 'topSet', 'att-sets-container')
    f.el('ts-imin-1').value = '70'
    f.call('tsSetStructure', 'straight', 'att-sets-container')
    assert.deepEqual(pcts(f.saved()), [[null, 'topSet'], ['70', 'topSet']])
  })
  test('choosing a "today’s" base on Straight sets moves the % to set 2 on and clears set 1; leaving it gives set 1 its % back', () => {
    const f = sheet([0, 1, 2].map(() => ({ effortType: 'rpe', intensityMin: '75', intensityMax: '75' })))
    f.call('sfBasis', 'topSetWeight', 'att-sets-container')
    assert.deepEqual(pcts(f.saved()), [[null, 'topSetWeight'], ['75', 'topSetWeight'], ['75', 'topSetWeight']])
    f.call('sfBasis', 'stored', 'att-sets-container')
    assert.deepEqual(pcts(f.saved()), [['75', 'stored'], ['75', 'stored'], ['75', 'stored']])
  })
  test('rest: the old editor’s "2:00 to 0:00" is one rest of 2:00, not a range; a lone high end is shown, not lost', () => {
    let f = sheet([{ effortType: 'rpe', restMin: '2:00', restMax: '0:00' }])
    assert.equal(f.el('ts-restmax-0'), undefined, 'drawn as Fixed')
    assert.deepEqual([f.saved()[0].restMin, f.saved()[0].restMax], ['2:00', '2:00'])
    f = sheet([{ effortType: 'rpe', restMax: '2:00' }])
    assert.equal(f.el('ts-restmin-0').value, '2:00')
    assert.equal(get('_rangeInOrder')({ restMin: 90, restMax: 120 }).restMax, 120, 'a number of seconds is seconds')
  })
  test('tile text is escaped: a value written straight into sets_json can never become markup', () => {
    const f = sheet([{ repsMin: '<img src=x onerror=alert(1)>', effortType: 'rpe', effortMin: '<script>x()</script>' }, { repsMin: '5', effortType: 'rpe' }])
    assert.equal(f.host.dataset.tsView, 'custom', 'different sets: the tiles are drawn')
    assert.ok(!f.host.innerHTML.includes('<img src=x'), 'reps escaped')
    assert.ok(!f.host.innerHTML.includes('<script>'), 'effort escaped')
  })
  test('a flag the tiles cannot edit (AMRAP on a middle set) is still shown on its tile', () => {
    const f = sheet([{ effortType: 'rpe', repsMin: '8' }, { effortType: 'rpe', repsMin: '8', amrap: true }, { effortType: 'rpe', repsMin: '8' }])
    assert.match(/id="sf-tile-1"[\s\S]*?<\/button>/.exec(f.host.innerHTML)[0], /AMRAP/)
  })
  test('deleting a set moves the later sets’ Fixed / Range choices with them', () => {
    const f = sheet([{ effortType: 'rpe', repsMin: '8' }, { effortType: 'rpe', repsMin: '9' }, { effortType: 'rpe', repsMin: '10' }, { effortType: 'rpe', repsMin: '6', repsMax: '10' }])
    f.call('sfSetRange', 'reps', 2, false, 'att-sets-container')
    f.call('sfDeleteSet', 1, 'att-sets-container')
    f.call('sfSelect', 2, 'att-sets-container')
    assert.ok(f.el('ts-rmax-2'), 'the 6-10 range is still drawn as a range')
    assert.deepEqual([f.saved()[2].repsMin, f.saved()[2].repsMax], ['6', '10'])
  })
})
