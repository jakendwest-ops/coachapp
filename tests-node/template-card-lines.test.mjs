// The workout page's exercise cards (Jake, 2026-10-28: "the exercise builder is looking much better").
//
// Before: every card printed ONE LINE PER SET (four identical lines for four identical sets), carried an Edit and a Remove button as wide as the card
// (Jake 2026-09-28: "edit and remove buttons are too big and force the text on the left to be on separate lines"), and a tiny arrow pair. Now: one short
// summary per GROUP of identical sets, the whole card is the Edit button, Remove lives in the editor with an Undo on the page, and the arrows appear only
// after the Reorder button.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { get, app } from './load-app.mjs'

const ctx = app()
const run = src => vm.runInContext(src, ctx)
const lines = ex => [...get('_tplExerciseLines')(ex)]   // spread: an array made inside the app's vm context is not a host-realm Array, so deepEqual would refuse it
const card = get('_tplCardHtml')
const S = (o = {}) => ({ repsMin: '5', repsMax: '8', effortType: 'rpe', effortMin: '8', effortMax: '9', restMin: '2:00', ...o })

describe('_tplExerciseLines: one line per group of identical sets', () => {
  test('identical sets collapse to one line, whatever their number', () => {
    assert.deepEqual(lines({ metric_type: 'weight_reps', sets_json: [S(), S(), S()] }), ['3 × 5–8 reps · RPE 8–9 · 2:00 rest'])
    assert.deepEqual(lines({ metric_type: 'weight_reps', sets_json: [S()] }), ['5–8 reps · RPE 8–9 · 2:00 rest'], 'a single set has no "1 ×"')
  })

  test('a top set reads first, then the back-offs, with the basis named', () => {
    const top = { isTopSet: true, repsMin: '4', repsMax: '4', effortType: 'rpe', effortMin: '7', effortMax: '7', restMin: '2:00' }
    const back = (basis) => ({ repsMin: '4', repsMax: '4', effortType: 'rpe', effortMin: '7', effortMax: '7', restMin: '2:00', intensityMin: '70', intensityMax: '70', intensityBasis: basis })
    assert.deepEqual(lines({ metric_type: 'weight_reps', sets_json: [top, back('topSet'), back('topSet'), back('topSet')] }),
      ['Top set · 4 reps · RPE 7', 'then 3 × 4 reps · 70% of e1RM · RPE 7 · 2:00 rest'])
    assert.equal(lines({ metric_type: 'weight_reps', sets_json: [top, back('topSetWeight')] })[1], 'then 4 reps · 70% of top set · RPE 7 · 2:00 rest')
    assert.equal(lines({ metric_type: 'weight_reps', sets_json: [top, back('stored')] })[1], 'then 4 reps · 70% 1RM · RPE 7 · 2:00 rest')
  })

  test('sets that differ stay separate, in order, and an AMRAP set is marked', () => {
    assert.deepEqual(lines({ metric_type: 'weight_reps', sets_json: [S({ repsMin: '8', repsMax: '8', effortMin: '', effortMax: '' }), S({ repsMin: '8', repsMax: '8', effortMin: '', effortMax: '' }), S({ repsMin: '8', repsMax: '8', effortMin: '', effortMax: '', amrap: true })] }),
      ['2 × 8 reps · 2:00 rest', 'then 8 reps (AMRAP) · 2:00 rest'])
  })

  test('a unilateral exercise says per side', () => {
    assert.match(lines({ metric_type: 'unilateral', sets_json: [S(), S()] })[0], /per side/)
  })

  test('an exercise with no sets_json falls back to its plain defaults', () => {
    assert.deepEqual(lines({ metric_type: 'weight_reps', sets: 3, reps: '8', weight_kg: 60 }), ['3 sets · 8 reps · 60kg'])
    assert.deepEqual(lines({ metric_type: 'weight_reps' }), ['No defaults set'])
    assert.deepEqual(lines({ metric_type: 'cardio', sets: 2 }), ['2 sets · Cardio'])
  })

  test('empty sets are noise and say nothing; an all-empty exercise falls back to its defaults', () => {
    assert.deepEqual(lines({ metric_type: 'weight_reps', sets: 2, sets_json: [{}, {}] }), ['2 sets'])
  })

  test('an interval block is one line, and a stray top-set flag on cardio or an interval never says "Top set"', () => {
    const l = lines({ metric_type: 'interval', sets_json: [{ isTopSet: true, workSecs: 30, restSecs: 30, sets: 8, cycles: 1 }] })
    assert.equal(l.length, 1); assert.doesNotMatch(l[0], /Top set/)
    assert.doesNotMatch(lines({ metric_type: 'cardio', sets_json: [{ isTopSet: true, duration: '10:00' }] })[0], /Top set/)
  })
})

describe('_tplCardHtml: the whole card is the Edit button', () => {
  const ex = (o = {}) => ({ _draftKey: 'k1', exercise_name: 'Bench Press', metric_type: 'weight_reps', sets_json: [S(), S()], ...o })

  test('a tap on the card opens the editor; there is NO Remove button and NO Edit button on the card', () => {
    const html = card(ex(), 0, 3, 'tmpl-9', false)
    assert.match(html, /<button type="button" class="tpl-ex-main" aria-label="Edit Bench Press" onclick="showEditTemplateExerciseModal\('k1','tmpl-9'\)"/)
    assert.doesNotMatch(html, /Remove|btn-danger|>Edit</)
    assert.doesNotMatch(html, /data-move/, 'no arrows until Reorder')
    assert.match(html, /data-draft-key="k1" data-ex-name="Bench Press"/, 'the hooks the draft code and the specs use are unchanged')
    assert.match(html, /tpl-ex-badge[^>]*>1</, 'the position number')
    assert.match(html, /2 × 5–8 reps · RPE 8–9 · 2:00 rest/)
  })

  test('Reorder mode: arrows instead of the number, disabled at the ends, and the card is not a button', () => {
    const first = card(ex(), 0, 3, 't', true), middle = card(ex(), 1, 3, 't', true), last = card(ex(), 2, 3, 't', true)
    assert.match(first, /data-move="-1"[^>]*disabled/); assert.doesNotMatch(first, /data-move="1"[^>]*disabled/)
    assert.doesNotMatch(middle, /disabled/)
    assert.match(last, /data-move="1"[^>]*disabled/)
    assert.match(first, /onclick="_stageReorderExercise\('k1',1\)"/)
    assert.doesNotMatch(first, /tpl-ex-badge|showEditTemplateExerciseModal/)
    assert.match(first, /aria-label="Move Bench Press down"/)
  })

  test('an exercise name is escaped everywhere it is printed (a client can create exercises in the coach\'s library)', () => {
    const html = card(ex({ exercise_name: '<img src=x onerror=alert(1)>', superset_group: '<b>', notes: '[Tag<] <i>x</i>' }), 0, 1, 't', false)
    assert.doesNotMatch(html, /<img|<i>|<b>x/)
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  })

  test('the chips: top set, cardio, superset, bodyweight', () => {
    const html = card(ex({ superset_group: 'A', sets_json: [S({ isTopSet: true, bodyweight: true }), S()] }), 0, 1, 't', false)
    assert.match(html, /tpl-chip">Top set</); assert.match(html, /tpl-chip-ss">SS: A</); assert.match(html, /tpl-chip-bw">BW</)
    assert.match(card(ex({ metric_type: 'cardio', sets_json: [{ duration: '10:00' }] }), 0, 1, 't', false), /tpl-chip-cardio">Cardio</)
  })

  test('coaching notes: a [Tag] becomes a tag, plain notes stay as text', () => {
    assert.match(card(ex({ notes: '[Tempo] pause at the bottom' }), 0, 1, 't', false), /tpl-ex-tag">Tempo<\/span><em>pause at the bottom<\/em>/)
    assert.match(card(ex({ notes: 'keep it tight' }), 0, 1, 't', false), /<em>keep it tight<\/em>/)
    assert.doesNotMatch(card(ex(), 0, 1, 't', false), /tpl-ex-note/)
  })
})

describe('Remove with Undo', () => {
  let host, scrolled
  const exs = () => ['a', 'b', 'c'].map((k, i) => ({ _draftKey: k, exercise_name: 'Ex ' + k, metric_type: 'weight_reps', order_index: i, sets_json: [S()] }))
  beforeEach(() => {
    host = { innerHTML: '' }
    const els = { 'template-exercise-list': host, 'tpl-reorder-btn': { style: {}, textContent: '' }, 'save-template-draft-host': { innerHTML: '' } }
    ctx.document.getElementById = id => els[id]
    scrolled = []
    // `.tpl-undo` exists only while the rendered page holds the bar; everything else (the page header lookup) is a bare stub.
    ctx.document.querySelector = sel => sel === '.tpl-undo'
      ? (host.innerHTML.includes('tpl-undo') ? { scrollIntoView: opts => scrolled.push(opts) } : null)
      : ({ querySelector: () => null })
    ctx._templateDraft = { templateId: 't', meta: { name: 'W', description: null }, metaBaseline: { name: 'W', description: null }, exercises: exs(), exercisesBaseline: exs() }
    clearTimeout(ctx._tplUndoTimer); ctx._tplRemoved = null; ctx._tplReorder = false   // window properties, not declared variables
  })
  const keys = () => ctx._templateDraft.exercises.map(e => e._draftKey)

  test('removing stages the removal, remembers the row and its place, and offers Undo', () => {
    get('_stageRemoveExercise')('b')
    assert.deepEqual(keys(), ['a', 'c'])
    assert.equal(ctx._tplRemoved.name, 'Ex b'); assert.equal(ctx._tplRemoved.index, 1)
    assert.match(host.innerHTML, /id="tpl-undo-btn"/); assert.match(host.innerHTML, /Removed Ex b/)
    clearTimeout(ctx._tplUndoTimer)
  })

  test('Undo puts the SAME row back where it was and renumbers', () => {
    get('_stageRemoveExercise')('b')
    get('_undoRemoveExercise')()
    assert.deepEqual(keys(), ['a', 'b', 'c'])
    assert.deepEqual(ctx._templateDraft.exercises.map(e => e.order_index), [0, 1, 2])
    assert.equal(ctx._tplRemoved, null)
    assert.doesNotMatch(host.innerHTML, /tpl-undo/)
  })

  test('Undo of the last exercise goes back to the end, and of the first to the start', () => {
    get('_stageRemoveExercise')('c'); get('_undoRemoveExercise')(); assert.deepEqual(keys(), ['a', 'b', 'c'])
    get('_stageRemoveExercise')('a'); get('_undoRemoveExercise')(); assert.deepEqual(keys(), ['a', 'b', 'c'])
  })

  test('a second removal replaces the first Undo (only the latest can be undone) and the bar can be dismissed', () => {
    get('_stageRemoveExercise')('a'); get('_stageRemoveExercise')('b')
    assert.equal(ctx._tplRemoved.name, 'Ex b')
    get('_undoRemoveExercise')()
    assert.deepEqual(keys(), ['b', 'c'])
    get('_stageRemoveExercise')('c'); get('_dismissRemovedExercise')()
    assert.equal(ctx._tplRemoved, null); assert.doesNotMatch(host.innerHTML, /tpl-undo/)
    clearTimeout(ctx._tplUndoTimer)
  })

  test('removing a key that is not there changes nothing and offers no Undo', () => {
    get('_stageRemoveExercise')('zzz')
    assert.deepEqual(keys(), ['a', 'b', 'c']); assert.equal(ctx._tplRemoved, null)
    assert.equal(scrolled.length, 0, 'no bar, nothing to scroll to')
  })

  test('the Undo bar is brought into view (it sits after the list, below the fold on a long workout)', () => {
    get('_stageRemoveExercise')('b')
    assert.equal(scrolled.length, 1)
    assert.equal(scrolled[0].block, 'nearest', 'moves the page only as far as needed')
    clearTimeout(ctx._tplUndoTimer)
  })

  test('the empty page still shows the Undo bar after the last exercise is removed', () => {
    ctx._templateDraft.exercises = [exs()[0]]
    get('_stageRemoveExercise')('a')
    assert.match(host.innerHTML, /No exercises yet/); assert.match(host.innerHTML, /id="tpl-undo-btn"/)
    clearTimeout(ctx._tplUndoTimer)
  })

  test('the list ends with "+ Add exercise", and Reorder appears only when there is something to reorder', () => {
    get('_renderTemplateExerciseList')()
    assert.match(host.innerHTML, /id="tpl-add-btn"[^>]*>\+ Add exercise</)
    assert.equal(ctx.document.getElementById('tpl-reorder-btn').style.display, '')
    ctx._templateDraft.exercises = [exs()[0]]
    get('_renderTemplateExerciseList')()
    assert.equal(ctx.document.getElementById('tpl-reorder-btn').style.display, 'none')
  })

  test('the Reorder button toggles the arrows and its own label', () => {
    get('_toggleTemplateReorder')()
    assert.match(host.innerHTML, /data-move/); assert.equal(ctx.document.getElementById('tpl-reorder-btn').textContent, 'Done')
    get('_toggleTemplateReorder')()
    assert.doesNotMatch(host.innerHTML, /data-move/); assert.equal(ctx.document.getElementById('tpl-reorder-btn').textContent, 'Reorder')
  })
})
