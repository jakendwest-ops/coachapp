// "Update all copies" overwrote each copy instead of applying only the changes
// (docs/bugs/2026-11-14-update-all-copies-overwrites-each-copy-instead-of-applying-only-the-changes.md).
//
// Pure-logic half: _exerciseEdits works out exactly what changed on one exercise (field by field, set by
// set), _applyExerciseEdits lays only that onto a COPY's own row, and _diffTemplateDraft must not count a
// set whose keys merely came back from Postgres in a different order as "changed". Loaded the same way
// template-draft-diff.test.mjs loads app-workouts.js (see that file for the two vm-sandbox gotchas).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'

const same = (actual, expected, msg) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), msg)

const context = { window: {}, console, escapeHtml: (s) => s, guardReentry: () => {} }
context.window = context
vm.createContext(context)
vm.runInContext(fs.readFileSync(new URL('../js/app-workouts.js', import.meta.url), 'utf8'), context)
const { _exerciseEdits, _applyExerciseEdits, _diffTemplateDraft, _exerciseEditsLabel } = context

const row = (o = {}) => ({
  id: 'a', exercise_id: 'ex1', exercise_name: 'Bench Press', exercise_type: 'strength', metric_type: 'weight_reps',
  sets: 3, notes: null, superset_group: null,
  sets_json: [{ repsMin: 5, weight: 100, restMin: 90 }, { repsMin: 5, weight: 100, restMin: 90 }, { repsMin: 5, weight: 100, restMin: 90 }],
  ...o,
})
// A later week: same exercise, its OWN progressed loads.
const week3 = () => row({ id: 't', sets_json: [{ repsMin: 3, weight: 110, restMin: 90 }, { repsMin: 3, weight: 110, restMin: 90 }, { repsMin: 3, weight: 110, restMin: 90 }] })

test('a rest change on one set reaches only that set\'s rest in the copy; its own weights and reps stay', () => {
  const base = row()
  const next = row({ sets_json: base.sets_json.map((s, i) => i === 1 ? { ...s, restMin: 120 } : { ...s }) })
  const patch = _applyExerciseEdits(week3(), _exerciseEdits(base, next))
  same(patch.sets_json, [{ repsMin: 3, weight: 110, restMin: 90 }, { repsMin: 3, weight: 110, restMin: 120 }, { repsMin: 3, weight: 110, restMin: 90 }])
  assert.equal(patch.exercise_name, undefined, 'nothing but the sets changes')
})

test('a rest change on every set reaches every set of the copy, even one with more sets', () => {
  const base = row()
  const next = row({ sets_json: base.sets_json.map(s => ({ ...s, restMin: 150 })) })
  const target = week3(); target.sets_json.push({ repsMin: 3, weight: 110, restMin: 90 })
  const patch = _applyExerciseEdits(target, _exerciseEdits(base, next))
  same(patch.sets_json.map(s => s.restMin), [150, 150, 150, 150])
  same(patch.sets_json.map(s => s.weight), [110, 110, 110, 110], 'the copy keeps its own loads')
})

test('swapping the exercise (same type) changes the name and id only; the copy keeps its own sets', () => {
  const base = row()
  const next = row({ exercise_id: 'ex2', exercise_name: 'Incline Press' })
  const patch = _applyExerciseEdits(week3(), _exerciseEdits(base, next))
  assert.equal(patch.exercise_name, 'Incline Press')
  assert.equal(patch.exercise_id, 'ex2')
  assert.equal(patch.sets_json, undefined, 'the copy\'s week-specific sets are not touched')
})

test('a type change cannot keep the copy\'s sets: it takes this week\'s sets, and says so', () => {
  const base = row()
  const next = row({ metric_type: 'timed', exercise_type: 'timed', sets: 1, sets_json: [{ duration: 60 }] })
  const edits = _exerciseEdits(base, next)
  const patch = _applyExerciseEdits(week3(), edits)
  same(patch.sets_json, [{ duration: 60 }])
  assert.equal(patch.sets, 1)
  assert.match(_exerciseEditsLabel('Bench Press', edits), /type/)
})

test('adding a set appends it to the copy; removing one removes the copy\'s last set', () => {
  const base = row()
  const added = _applyExerciseEdits(week3(), _exerciseEdits(base, row({ sets: 4, sets_json: [...base.sets_json, { repsMin: 8, weight: 80, restMin: 60 }] })))
  same(added.sets_json.map(s => s.weight), [110, 110, 110, 80])
  assert.equal(added.sets, 4)
  const removed = _applyExerciseEdits(week3(), _exerciseEdits(base, row({ sets: 2, sets_json: base.sets_json.slice(0, 2) })))
  same(removed.sets_json.map(s => s.weight), [110, 110])
  assert.equal(removed.sets, 2)
})

test('the same set with its keys in a different order (as Postgres jsonb returns them) is not a change', () => {
  const fromDb = row({ sets_json: [{ weight: 100, repsMin: 5, restMin: 90, amrap: false, tempo: null }] })
  const rebuilt = row({ sets_json: [{ amrap: false, repsMin: 5, weight: 100, restMin: 90 }] })
  const draft = { meta: { name: 'T', description: null }, metaBaseline: { name: 'T', description: null }, exercises: [{ ...rebuilt }], exercisesBaseline: [{ ...fromDb }] }
  same(_diffTemplateDraft(draft).toUpdate, [], 'key order and a null-vs-missing key must not count as an edit')
  assert.equal(_exerciseEdits(fromDb, rebuilt), null)
})

// Review finding (2026-11-14): an OLDER row has no flag/default keys; the cleaner writes amrap:false,
// effortType:'rpe', intensityBasis:'stored'... into every set. A rest-only edit must carry ONLY rest, or a
// copy with its own AMRAP / RIR / top-set basis loses it.
test('a rest edit on an older row (no flag keys) carries only rest, and a copy keeps its own flags', () => {
  const base = row({ sets_json: [{ repsMin: 5, weight: 100, restMin: 90 }, { repsMin: 5, weight: 100, restMin: 90 }] })
  const cleaned = (rest) => ({ amrap: false, unilateral: false, timed: false, bodyweight: false, isTopSet: false, intensityBasis: 'stored', repsMin: 5, weight: 100, restMin: rest, effortType: 'rpe', isDistanceBased: false })
  const edits = _exerciseEdits(base, row({ sets_json: [cleaned(120), cleaned(120)] }))
  same(edits.uniform, { restMin: 120 })
  assert.equal(edits.keyed, undefined)
  const copy = { sets_json: [{ repsMin: 3, weight: 110, restMin: 90, amrap: true, effortType: 'rir', intensityBasis: 'topSet' }] }
  same(_applyExerciseEdits(copy, edits).sets_json, [{ repsMin: 3, weight: 110, restMin: 120, amrap: true, effortType: 'rir', intensityBasis: 'topSet' }])
  assert.equal(_exerciseEdits(base, row({ sets_json: [cleaned(90), cleaned(90)] })), null, 'opened and saved unchanged is no edit at all')
})

test('turning a flag off, or changing RPE to RIR and back, is still an edit', () => {
  same(_exerciseEdits(row({ sets_json: [{ amrap: true }] }), row({ sets_json: [{ amrap: false }] })).uniform, { amrap: false })
  same(_exerciseEdits(row({ sets_json: [{ effortType: 'rir' }] }), row({ sets_json: [{ effortType: 'rpe' }] })).uniform, { effortType: 'rpe' })
  same(_exerciseEdits(row({ sets_json: [{}] }), row({ sets_json: [{ effortMin: 0 }] })).uniform, { effortMin: 0 })
})

test('removing a set never cuts a SHORTER copy below the exercise\'s new set count', () => {
  const base = row()   // 3 sets
  const edits = _exerciseEdits(base, row({ sets: 2, sets_json: base.sets_json.slice(0, 2) }))
  same(_applyExerciseEdits({ sets_json: [{ weight: 110 }] }, edits).sets_json, [{ weight: 110 }], 'a 1-set copy keeps its one set')
  same(_applyExerciseEdits({ sets_json: [1, 2, 3, 4].map(w => ({ weight: w })) }, edits).sets_json.length, 3, 'a 4-set copy loses one')
})

test('the label names what changed, in words', () => {
  const base = row()
  const next = row({ exercise_id: 'ex2', exercise_name: 'Incline Press', sets_json: base.sets_json.map(s => ({ ...s, restMin: 120 })) })
  assert.equal(_exerciseEditsLabel('Bench Press', _exerciseEdits(base, next)), 'Bench Press → Incline Press, rest')
})
