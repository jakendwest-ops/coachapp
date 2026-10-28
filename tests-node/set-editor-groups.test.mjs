// The grouped set editor (Jake, 2026-10-28: "the exercise builder is looking much better").
//
// A weight-and-reps or unilateral exercise used to open as one six-field card PER SET. It now opens as ONE block for "all the sets" or, with a top
// set, one block for the top set and one for the back-offs; "Customise each set" opens the per-set cards for the exceptions. The grouped view draws
// only the FIRST set of each group (ids ts-*-0, and ts-*-1 for the back-offs); flushTemplateSets copies that set onto the rest of the group, so the
// save path and sets_json do not change. This file pins the pure rules, the copy-on-flush, what each view draws, and the handlers.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { get, app } from './load-app.mjs'

const ctx = app()
const run = src => vm.runInContext(src, ctx)
const set = (o = {}) => ({ repsMin: '5', repsMax: '8', effortType: 'rpe', effortMin: '8', restMin: '2:00', restMax: '2:00', ...o })

// A stub DOM: only the ids put in `els` exist (a missing id is undefined, as in the page), and the container captures what is rendered.
let els
function dom({ type = 'weight_reps', sets, view = { custom: false }, extra = {} } = {}) {
  els = { 'att-sets-container': { innerHTML: '', style: {}, dataset: {}, value: '' }, 'att-type': { value: type }, ...extra }
  ctx.document.getElementById = id => els[id]
  ctx._templateSets = sets
  run(`_tsView = ${JSON.stringify(view)}`)
}
const render = (type = 'weight_reps') => { get('renderTemplateSets')('att-sets-container', type); return els['att-sets-container'].innerHTML }
const ids = html => [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1])
const dups = html => { const seen = new Set(); return ids(html).filter(i => seen.size === (seen.add(i), seen.size)) }
const el = (value = '', dataset = {}) => ({ value, dataset, style: {} })
const sets = () => ctx._templateSets

describe('_tsGroupUniform: when can a group be shown as ONE row?', () => {
  const uni = get('_tsGroupUniform')
  test('identical sets are uniform, with or without a top set', () => {
    assert.equal(uni([set(), set(), set()], false), true)
    assert.equal(uni([set({ isTopSet: true, repsMin: '3' }), set(), set()], true), true, 'the top set may differ from the back-offs')
  })
  test('any difference in a shared field makes it not uniform', () => {
    for (const k of ['repsMin', 'repsMax', 'weight', 'intensityMin', 'intensityMax', 'restMin', 'restMax', 'effortMin', 'effortMax', 'tempo', 'countdown']) {
      assert.equal(uni([set(), set({ [k]: '99' })], false), false, k)
    }
    assert.equal(uni([set(), set({ intensityBasis: 'topSetWeight' })], false), false, 'basis')
    assert.equal(uni([set(), set({ effortType: 'rir' })], false), false, 'effort scale')
    assert.equal(uni([set(), set({ bodyweight: true })], false), false, 'bodyweight')
  })
  test('only the LAST set of a group may be AMRAP (it has its own switch); an AMRAP set anywhere else would be hidden', () => {
    assert.equal(uni([set(), set(), set({ amrap: true })], false), true, 'the "3 x 8, then 1 x AMRAP" idiom stays in the grouped view')
    assert.equal(uni([set(), set({ amrap: true }), set()], false), false, 'a middle AMRAP set must be listed')
    assert.equal(uni([set({ amrap: true }), set()], false), false, 'so must the first')
    assert.equal(uni([set({ isTopSet: true }), set(), set({ amrap: true })], true), true, 'the last back-off set may be AMRAP')
    assert.equal(uni([set({ isTopSet: true }), set({ amrap: true }), set()], true), false)
    assert.equal(uni([set({ isTopSet: true, amrap: true }), set()], true), false, 'a top set that is AMRAP is not drawn by the grouped view')
    assert.equal(uni([set({ amrap: true })], false), true, 'a single AMRAP set')
  })
  test('unset and empty are the same, and the two defaults are spelled out (so sets built two different ways still group)', () => {
    assert.equal(uni([{ repsMin: '5' }, { repsMin: '5', weight: '', tempo: null, effortType: 'rpe', intensityBasis: 'stored' }], false), true)
    assert.equal(uni([{}, {}], false), true)
  })
  test('no sets, one set, or a top set with no back-offs yet are all trivially uniform', () => {
    assert.equal(uni([], false), true)
    assert.equal(uni([set()], false), true)
    assert.equal(uni([set({ isTopSet: true })], true), true)
  })
})

describe('_tsPropagate: the group\'s first set is copied onto the rest', () => {
  const prop = get('_tsPropagate')
  test('straight sets: every set follows set 1', () => {
    const s = [set({ repsMin: '10' }), set({ repsMin: '1' }), set({ repsMin: '2' })]
    prop(s, false)
    assert.deepEqual(s.map(x => x.repsMin), ['10', '10', '10'])
  })
  test('top set + back-offs: the back-offs follow set 2 and the top set is untouched', () => {
    const s = [set({ isTopSet: true, repsMin: '3' }), set({ repsMin: '8', intensityMin: '70', intensityBasis: 'topSetWeight' }), set({ repsMin: '1' }), set({ repsMin: '2' })]
    prop(s, true)
    assert.equal(s[0].repsMin, '3'); assert.equal(s[0].isTopSet, true)
    for (const i of [2, 3]) { assert.equal(s[i].repsMin, '8'); assert.equal(s[i].intensityMin, '70'); assert.equal(s[i].intensityBasis, 'topSetWeight'); assert.ok(!s[i].isTopSet) }
  })
  test('it clears AMRAP on every overwritten set except the LAST, which keeps its own switch, and does nothing to a lone set', () => {
    const s = [set({ repsMin: '10' }), set({ amrap: true }), set({ repsMin: '1', amrap: true })]
    prop(s, false)
    assert.deepEqual(s.map(x => x.repsMin), ['10', '10', '10'])
    assert.equal(s[1].amrap, false)
    assert.equal(s[2].amrap, true, 'the last set stays AMRAP')
    const one = [set({ repsMin: '9' })]
    assert.deepEqual(prop(one, false), one)
    assert.deepEqual(prop([], false), [])
  })
})

describe('flushTemplateSets copies a group\'s first set onto the rest ONLY while the grouped view is on screen', () => {
  const flush = () => get('flushTemplateSets')('att-sets-container')
  test('straight sets, grouped view: one box edits all three sets', () => {
    dom({ sets: [set(), set(), set()], extra: { 'ts-rmin-0': el('12'), 'ts-emin-0': el('9') } })
    els['att-sets-container'].dataset = { tsView: 'uniform', tsTop: '0' }
    flush()
    assert.deepEqual(sets().map(s => [s.repsMin, s.effortMin]), [['12', '9'], ['12', '9'], ['12', '9']])
  })
  test('top set + back-offs: set 1 and set 2 are edited, the rest follow set 2', () => {
    dom({ sets: [set({ isTopSet: true }), set(), set(), set()], extra: { 'ts-rmin-0': el('3'), 'ts-rmin-1': el('8'), 'ts-imin-1': el('70'), 'ts-basis-1': el('topSetWeight') } })
    els['att-sets-container'].dataset = { tsView: 'uniform', tsTop: '1' }
    flush()
    assert.deepEqual(sets().map(s => s.repsMin), ['3', '8', '8', '8'])
    assert.deepEqual(sets().slice(1).map(s => [s.intensityMin, s.intensityBasis]), [['70', 'topSetWeight'], ['70', 'topSetWeight'], ['70', 'topSetWeight']])
  })
  test('per-set cards: nothing is copied (every set has its own inputs)', () => {
    dom({ sets: [set(), set({ repsMin: '1' })], extra: { 'ts-rmin-0': el('12'), 'ts-rmin-1': el('4') } })
    els['att-sets-container'].dataset = { tsView: 'custom', tsTop: '0' }
    flush()
    assert.deepEqual(sets().map(s => s.repsMin), ['12', '4'])
  })
  test('a stale "uniform" from a previous type cannot survive: rendering an interval block resets it', () => {
    dom({ type: 'interval', sets: [{ workSecs: 30 }] })
    els['att-sets-container'].dataset = { tsView: 'uniform', tsTop: '1' }
    render('interval')
    assert.equal(els['att-sets-container'].dataset.tsView, 'custom')
    assert.equal(els['att-sets-container'].dataset.tsTop, '0')
  })
})

describe('what each view draws', () => {
  test('identical straight sets: ONE block, a stepper, a way to customise, and no per-set cards', () => {
    dom({ sets: [set(), set(), set()] })
    const html = render()
    assert.equal(els['att-sets-container'].dataset.tsView, 'uniform')
    assert.match(html, /id="ts-block-all"/)
    assert.match(html, /id="ts-step-n"[^>]*>3</, 'the stepper shows the number of sets')
    assert.match(html, /Customise each set \(3\)/)
    assert.match(html, /id="ts-straight-0" aria-pressed="true"/)
    assert.match(html, /id="ts-topset-0" aria-pressed="false"/)
    assert.doesNotMatch(html, /Set 2/, 'no per-set card')
    assert.deepEqual(dups(html), [], 'no element id is drawn twice')
    for (const id of ['ts-rmin-0', 'ts-rmax-0', 'ts-weight-0', 'ts-restmin-0', 'ts-emin-0', 'ts-emax-0', 'ts-imin-0', 'ts-tempo-0', 'ts-cd-0']) assert.ok(ids(html).includes(id), id + ' keeps its id')
  })

  test('top set + back-offs: a top-set block and a back-off block with the three-way "% of", the worked example and the stepper', () => {
    dom({ sets: [set({ isTopSet: true, repsMin: '4', effortMin: '7' }), set({ repsMin: '4', effortMin: '7', intensityMin: '70', intensityBasis: 'topSet' }), set({ repsMin: '4', effortMin: '7', intensityMin: '70', intensityBasis: 'topSet' })] })
    const html = render()
    assert.match(html, /id="ts-block-top"/); assert.match(html, /id="ts-block-back"/)
    assert.match(html, /id="ts-topset-0" aria-pressed="true"/)
    assert.match(html, /id="ts-step-n"[^>]*>2</, 'two back-off sets')
    const sel = /<select id="ts-basis-1"[\s\S]*?<\/select>/.exec(html)[0]
    assert.deepEqual([...sel.matchAll(/value="(\w+)"/g)].map(m => m[1]), ['topSetWeight', 'topSet', 'stored'])
    assert.match(sel, /value="topSet" selected/)
    assert.match(sel, /Today's top set weight/); assert.match(sel, /Today's estimated 1RM/); assert.match(sel, /Last saved 1RM/)
    assert.match(html, /id="ts-example-calc"[^>]*>Top set 100 kg × 4 @ RPE 7 → estimated 1RM 123\.3 kg → 70% = <b>85 kg<\/b>/)
    assert.doesNotMatch(html, /id="ts-weight-0"/, 'a top set has no prescribed weight')
    assert.doesNotMatch(html, /id="ts-imin-0"/, 'and no percentage')
    assert.deepEqual(dups(html), [], 'no element id is drawn twice')
  })

  test('the worked example follows the chosen basis', () => {
    const w = (basis) => { dom({ sets: [set({ isTopSet: true, repsMin: '4', effortMin: '7' }), set({ repsMin: '4', intensityMin: '70', intensityBasis: basis })] }); return render() }
    assert.match(w('topSetWeight'), /Top set 100 kg → 70% = <b>70 kg<\/b>/)
    assert.match(w('stored'), /A saved 1RM of 120 kg → 70% = <b>82\.5 kg<\/b>/)
  })

  test('a unilateral exercise gets the grouped view but NO structure control (the top set exists on weight_reps only)', () => {
    dom({ type: 'unilateral', sets: [set(), set()] })
    const html = render('unilateral')
    assert.match(html, /id="ts-block-all"/)
    assert.doesNotMatch(html, /ts-topset-0|ts-straight-0/)
  })

  test('sets that already differ are listed one by one, with a notice and a way to make them match', () => {
    dom({ sets: [set(), set({ repsMin: '1' }), set()] })
    const html = render()
    assert.equal(els['att-sets-container'].dataset.tsView, 'custom')
    assert.match(html, /These sets have different targets/)
    assert.match(html, /id="ts-make-same"[^>]*>Make every set the same as set 1</)
    assert.match(html, /Set 2/); assert.deepEqual(dups(html), [])
  })

  test('an AMRAP set in the MIDDLE is listed one by one (the grouped view only has a switch for the last set)', () => {
    dom({ sets: [set(), set({ amrap: true }), set()] })
    assert.equal((render(), els['att-sets-container'].dataset.tsView), 'custom')
  })

  test('the grouped view offers a labelled AMRAP switch for the last set, in both layouts (Jake, 2026-08-14: AMRAP must be a visible pill)', () => {
    dom({ sets: [set(), set(), set()] })
    let html = render()
    assert.match(html, /id="ts-amrap-last"[^>]*>AMRAP</); assert.match(html, /Last set: as many reps as possible/)
    assert.match(html, /id="ts-bw-all"[^>]*>BW</, 'and BW, which is the only control that can set the bodyweight flag')
    dom({ sets: [set({ isTopSet: true }), set(), set()] })
    html = render()
    assert.match(html, /id="ts-amrap-last"[^>]*>AMRAP</); assert.match(html, /Last back-off set: as many reps as possible/)
    assert.deepEqual(dups(html), [])
  })

  test('a last set that IS AMRAP stays in the grouped view with the switch on', () => {
    dom({ sets: [set(), set(), set({ amrap: true })] })
    const html = render()
    assert.equal(els['att-sets-container'].dataset.tsView, 'uniform')
    assert.match(html, /id="ts-amrap-last" aria-pressed="true" onclick="[^"]*" style="[^"]*background:var\(--accent\)/, 'drawn as pressed (accent fill) and announced as pressed')
    dom({ sets: [set(), set(), set()] })
    assert.match(render(), /id="ts-amrap-last" aria-pressed="false" onclick="[^"]*" style="[^"]*background:transparent/, 'and not pressed when no set is AMRAP')
  })

  test('the example weight box is stamped like every prefilled weight (data-shown and data-kg), so an untouched box cannot drift', () => {
    dom({ sets: [set({ isTopSet: true, repsMin: '4', effortMin: '7' }), set({ intensityMin: '70', intensityBasis: 'topSetWeight' })] })
    const html = render()
    assert.match(html, /id="ts-example-kg"[^>]*value="100" data-shown="100" data-kg="100"/)
  })

  test('"Customise each set" shows the per-set cards even when the sets are identical, with labelled copy buttons and a way back', () => {
    dom({ sets: [set(), set(), set()], view: { custom: true } })
    const html = render()
    assert.equal(els['att-sets-container'].dataset.tsView, 'custom')
    for (const n of [1, 2, 3]) assert.match(html, new RegExp(`Set ${n}`))
    assert.match(html, />Same as set 1</); assert.match(html, />Same as set 2</)
    assert.doesNotMatch(html, />↑</, 'the bare arrow is gone')
    assert.match(html, /onclick="copyPrevTsSet\(1,/, 'the handler the specs and the data flow use is unchanged')
    assert.match(html, /id="ts-hide-each"/, 'identical sets can go back to the grouped view')
    assert.match(html, /Copy previous set/); assert.match(html, /Add new set/)
    assert.deepEqual(dups(html), [])
  })

  test('timed holds, jumps and intervals keep the per-set cards untouched', () => {
    for (const type of ['timed_hold', 'jump_height', 'jump_distance']) {
      dom({ type, sets: [set(), set()] })
      const html = render(type)
      assert.equal(els['att-sets-container'].dataset.tsView, 'custom', type)
      assert.doesNotMatch(html, /ts-block-|ts-straight-0|ts-topset-0/, type)
      assert.match(html, /Set 2/, type)
    }
  })

  test('an orphaned top-set basis (no top set any more) can still be changed on the card, and says so', () => {
    dom({ sets: [set(), set({ intensityMin: '70', intensityBasis: 'topSetWeight' })], view: { custom: true } })
    const html = render()
    assert.match(html, /still works from today's top set/)
    assert.match(html, /<select id="ts-basis-1"/, 'there is a control to fix it')
  })
})

describe('the handlers', () => {
  const tid = 'att-sets-container'
  beforeEach(() => { run('_tsExampleKg = 0') })

  test('Top set + back-offs: set 1 becomes the top set, back-offs without a percentage point at the top set weight, none is lost', () => {
    dom({ sets: [set(), set(), set()] })
    get('tsSetStructure')('top', tid)
    assert.equal(sets()[0].isTopSet, true)
    assert.deepEqual(sets().slice(1).map(s => s.intensityBasis), ['topSetWeight', 'topSetWeight'])
    assert.equal(sets().length, 3)
    assert.equal(els[tid].dataset.tsView, 'uniform'); assert.equal(els[tid].dataset.tsTop, '1')
  })
  test('...a percentage the coach already set is left exactly as it was', () => {
    dom({ sets: [set(), set({ intensityMin: '70', intensityBasis: 'stored' }), set({ intensityMin: '70', intensityBasis: 'stored' })] })
    get('tsSetStructure')('top', tid)
    assert.deepEqual(sets().slice(1).map(s => s.intensityBasis), ['stored', 'stored'])
  })
  test('...and a lone set gets a back-off set to point at it', () => {
    dom({ sets: [set({ weight: '100', intensityMin: '50' })] })
    get('tsSetStructure')('top', tid)
    assert.equal(sets().length, 2)
    assert.equal(sets()[0].isTopSet, true)
    assert.ok(!sets()[1].isTopSet); assert.equal(sets()[1].weight, ''); assert.equal(sets()[1].intensityMin, '')
    assert.equal(sets()[1].intensityBasis, 'topSetWeight')
  })
  test('Straight sets: the top-set flag goes, the sets stay', () => {
    dom({ sets: [set({ isTopSet: true }), set({ intensityMin: '70', intensityBasis: 'topSetWeight' })] })
    get('tsSetStructure')('straight', tid)
    assert.equal(sets()[0].isTopSet, false); assert.equal(sets().length, 2)
    assert.equal(sets()[1].intensityBasis, 'topSetWeight', 'never silently rewritten (the warning says what to do)')
  })
  test('choosing the structure it already has does nothing', () => {
    dom({ sets: [set({ isTopSet: true }), set()] })
    els[tid].innerHTML = 'untouched'
    get('tsSetStructure')('top', tid)
    assert.equal(els[tid].innerHTML, 'untouched')
  })

  test('the stepper adds and removes back-off sets without touching the top set, and keeps at least one', () => {
    dom({ sets: [set({ isTopSet: true }), set({ intensityMin: '70', intensityBasis: 'topSetWeight' }), set({ intensityMin: '70', intensityBasis: 'topSetWeight' })] })
    els[tid].dataset = { tsView: 'uniform', tsTop: '1' }
    get('tsStep')(1, tid); assert.equal(sets().length, 4)
    assert.equal(sets()[3].intensityMin, '70'); assert.ok(!sets()[3].isTopSet, 'a copy of the last back-off, never a second top set')
    get('tsStep')(-1, tid); get('tsStep')(-1, tid); get('tsStep')(-1, tid)
    assert.equal(sets().length, 2, 'the top set and ONE back-off remain')
    assert.equal(sets()[0].isTopSet, true)
  })
  test('the stepper with straight sets keeps at least one set', () => {
    dom({ sets: [set(), set()] })
    els[tid].dataset = { tsView: 'uniform', tsTop: '0' }
    get('tsStep')(-1, tid); get('tsStep')(-1, tid)
    assert.equal(sets().length, 1)
  })
  test('"+" on a lone top set creates the first back-off', () => {
    dom({ sets: [set({ isTopSet: true, weight: '100' })] })
    els[tid].dataset = { tsView: 'uniform', tsTop: '1' }
    get('tsStep')(1, tid)
    assert.equal(sets().length, 2); assert.ok(!sets()[1].isTopSet); assert.equal(sets()[1].weight, ''); assert.equal(sets()[1].intensityBasis, 'topSetWeight')
  })

  test('Customise each set / Set them all the same switch the view and are remembered for this edit', () => {
    dom({ sets: [set(), set()] })
    get('tsShowEachSet')(true, tid)
    assert.equal(els[tid].dataset.tsView, 'custom')
    get('tsShowEachSet')(false, tid)
    assert.equal(els[tid].dataset.tsView, 'uniform')
  })
  test('Make every set the same overwrites the differences on a tap, from the group\'s first set (a last-set AMRAP is the one thing it keeps)', () => {
    dom({ sets: [set({ repsMin: '10' }), set({ repsMin: '1', amrap: true }), set({ repsMin: '2', amrap: true })] })
    get('tsMakeSetsSame')(tid)
    assert.deepEqual(sets().map(s => s.repsMin), ['10', '10', '10'])
    assert.deepEqual(sets().map(s => !!s.amrap), [false, false, true])
    assert.equal(els[tid].dataset.tsView, 'uniform')
  })
  test('the AMRAP switch flips the LAST set of the group, in both layouts, and does nothing when there is no back-off set', () => {
    dom({ sets: [set(), set(), set()] })
    get('tsToggleLastAmrap')(tid)
    assert.deepEqual(sets().map(s => !!s.amrap), [false, false, true])
    assert.equal(els[tid].dataset.tsView, 'uniform', 'still the grouped view')
    get('tsToggleLastAmrap')(tid)
    assert.deepEqual(sets().map(s => !!s.amrap), [false, false, false])
    dom({ sets: [set({ isTopSet: true }), set()] })
    get('tsToggleLastAmrap')(tid)
    assert.deepEqual(sets().map(s => !!s.amrap), [false, true], 'the last back-off set, never the top set')
    dom({ sets: [set({ isTopSet: true })] })
    get('tsToggleLastAmrap')(tid)
    assert.equal(sets()[0].amrap, undefined, 'a lone top set cannot be AMRAP')
  })
  test('the bodyweight switch sets every set', () => {
    dom({ sets: [set(), set(), set()] })
    get('tsToggleAllBodyweight')(tid)
    assert.deepEqual(sets().map(s => s.bodyweight), [true, true, true])
    get('tsToggleAllBodyweight')(tid)
    assert.deepEqual(sets().map(s => s.bodyweight), [false, false, false])
  })
})

describe('_tsExampleHtml (the worked example under the "% of" choice)', () => {
  const ex = get('_tsExampleHtml')
  test('each basis, with the numbers the runner would use', () => {
    assert.equal(ex({ basis: 'topSetWeight', pct: '70', topKg: 100, reps: 4 }), 'Top set 100 kg → 70% = <b>70 kg</b>')
    assert.equal(ex({ basis: 'topSet', pct: '70', topKg: 100, reps: 4, effortType: 'rpe', effortValue: '7' }), 'Top set 100 kg × 4 @ RPE 7 → estimated 1RM 123.3 kg → 70% = <b>85 kg</b>')
    assert.equal(ex({ basis: 'stored', pct: '70' }), 'A saved 1RM of 120 kg → 70% = <b>82.5 kg</b>')
  })
  test('RIR is converted, and a missing effort still gives an estimate', () => {
    assert.match(ex({ basis: 'topSet', pct: '70', topKg: 100, reps: 4, effortType: 'rir', effortValue: '3' }), /@ RIR 3 → estimated 1RM 123\.3 kg/)
    assert.match(ex({ basis: 'topSet', pct: '70', topKg: 100, reps: 4, effortType: 'rpe', effortValue: '' }), /Top set 100 kg × 4 → estimated 1RM 113\.3 kg/)   // Epley: 100 × (1 + 4/30)
  })
  test('what is missing is said, not guessed', () => {
    assert.match(ex({ basis: 'topSetWeight', pct: '', topKg: 100 }), /Enter a percentage/)
    assert.match(ex({ basis: 'topSetWeight', pct: '70', topKg: 0 }), /Enter a top set weight/)
    assert.match(ex({ basis: 'topSet', pct: '70', topKg: 100, reps: '' }), /Needs the top set's reps/)
    assert.match(ex({ basis: 'topSet', pct: '70', topKg: 100, reps: 20 }), /Needs the top set's reps/, 'past the 12-rep cap the estimate is refused, as in the runner')
  })
  test('the example uses the runner\'s own rounding (down to 2.5 kg) and never invents an HTML tag', () => {
    const html = ex({ basis: 'topSetWeight', pct: '73', topKg: 100 })
    assert.match(html, /<b>72\.5 kg<\/b>/)
    assert.equal((html.match(/</g) || []).length, 2, 'only the <b></b> pair')
  })
  test('a hostile stored effort is parsed, never echoed (review A, 2026-10-28: "8<img onerror>" parses as 8 and used to reach innerHTML)', () => {
    const html = ex({ basis: 'topSet', pct: '70', topKg: 100, reps: '5', effortType: 'rpe', effortValue: '8<img src=x onerror=alert(1)>' })
    assert.doesNotMatch(html, /<img|onerror/)
    assert.match(html, /@ RPE 8 →/, 'the number is still shown')
    assert.equal((html.match(/</g) || []).length, 2, 'only the <b></b> pair')
  })
})

describe('weightInputAttrs stamps cannot be broken out of (review A, 2026-10-28)', () => {
  test('a hostile kg string is escaped inside data-kg', () => {
    const attrs = get('weightInputAttrs')('5" autofocus onfocus="alert(1)" x="')
    assert.doesNotMatch(attrs, /" autofocus|" onfocus/)
    assert.match(attrs, /data-kg="5&quot; autofocus/)
  })
  test('an ordinary kg value is stamped unchanged', () => {
    assert.equal(get('weightInputAttrs')(100), 'value="100" data-shown="100" data-kg="100"')
  })
})

// Found by the three-angle review of the builder rebuild, 2026-10-28. None of these states had a render or a tap in the tests above.
describe('review fixes (2026-10-28)', () => {
  const tid = 'att-sets-container'
  beforeEach(() => { run('_tsExampleKg = 0') })

  test('a lone top set and an empty list draw per-set cards instead of throwing (the grouped view reads set 2 / set 1)', () => {
    dom({ sets: [set({ isTopSet: true })] })
    const html = render()
    assert.equal(els[tid].dataset.tsView, 'custom')
    assert.match(html, /id="ts-rmin-0"/)
    assert.doesNotMatch(html, /ts-hide-each/, '"Set them all the same" has nothing to group yet')
    dom({ sets: [] })
    assert.doesNotThrow(() => render())
    assert.equal(els[tid].dataset.tsView, 'custom')
    assert.doesNotMatch(els[tid].innerHTML, /ts-hide-each/)
  })
  test('the grouped flag is written only after the grouped view has been drawn', () => {
    dom({ sets: [set(), set()] })
    els[tid].dataset.tsView = 'custom'
    const draw = ctx._tsGroupedHtml
    ctx._tsGroupedHtml = () => { throw new Error('boom') }
    try { assert.throws(() => render()) } finally { ctx._tsGroupedHtml = draw }
    assert.equal(els[tid].dataset.tsView, 'custom', 'a failed draw must not leave the container claiming to be grouped')
  })
  test('the RPE/RIR switch applies to the whole group and the editor stays grouped', () => {
    dom({ sets: [set(), set(), set()] })
    els[tid].dataset = { tsView: 'uniform', tsTop: '0' }
    get('setTsEffort')(0, 'rir', tid)
    assert.deepEqual(sets().map(s => s.effortType), ['rir', 'rir', 'rir'])
    assert.equal(els[tid].dataset.tsView, 'uniform')
  })
  test('...and on the back-off group of a top set, leaving the top set\'s own scale alone', () => {
    dom({ sets: [set({ isTopSet: true }), set(), set()] })
    els[tid].dataset = { tsView: 'uniform', tsTop: '1' }
    get('setTsEffort')(1, 'rir', tid)
    assert.deepEqual(sets().map(s => s.effortType), ['rpe', 'rir', 'rir'])
    assert.equal(els[tid].dataset.tsView, 'uniform')
  })
  test('"+" on a group whose last set is AMRAP moves the AMRAP to the new last set and stays grouped', () => {
    dom({ sets: [set(), set(), set({ amrap: true })] })
    els[tid].dataset = { tsView: 'uniform', tsTop: '0' }
    get('tsStep')(1, tid)
    assert.deepEqual(sets().map(s => !!s.amrap), [false, false, false, true])
    assert.equal(els[tid].dataset.tsView, 'uniform')
  })
  test('straight -> top set -> straight leaves an untouched template as it was', () => {
    dom({ sets: [set(), set(), set()] })
    get('tsSetStructure')('top', tid)
    get('tsSetStructure')('straight', tid)
    assert.deepEqual(sets().slice(1).map(s => s.intensityBasis), ['stored', 'stored'])
    assert.equal(els[tid].dataset.tsView, 'uniform', 'no stray "different targets" notice for sets nobody changed')
  })
  test('...but a basis the coach chose with a percentage typed is never reset', () => {
    dom({ sets: [set({ isTopSet: true }), set({ intensityMin: '70', intensityBasis: 'topSetWeight' })] })
    get('tsSetStructure')('straight', tid)
    assert.equal(sets()[1].intensityBasis, 'topSetWeight')
  })
  test('straight sets marked bodyweight, then "Top set + back-offs": set 1 lets go of the flag the top block cannot show', () => {
    dom({ sets: [set({ bodyweight: true }), set({ bodyweight: true })] })
    get('tsSetStructure')('top', tid)
    assert.equal(sets()[0].bodyweight, false)
    assert.equal(els[tid].dataset.tsView, 'uniform', 'the grouped view, not a notice whose button cannot clear it')
  })
})
