// Pure-logic tests for _diffTemplateDraft — no browser, no Supabase, no dev server.
//
// app-workouts.js is written for a browser global scope (window.X = ...); load it into a sandboxed
// context that captures those globals, same technique other tests-node files in this repo already
// use for extracting one pure function from a browser-shaped file.
//
// The minimal sandbox from the plan ({ window, console, escapeHtml }) is not quite enough on its
// own: app-workouts.js calls `guardReentry(name)` as a TOP-LEVEL statement three times (a decorator
// applied right after each guarded function's declaration — see js/app-core.js:117 for the real
// implementation). Function declarations are hoisted before any statement runs, so _diffTemplateDraft
// itself is unaffected either way, but the FIRST top-level `guardReentry(...)` call throws a
// ReferenceError and aborts the rest of the script's execution before `vm.runInContext` even returns
// — which would take the whole test file down at import time, not just fail the assertions below.
// `guardReentry` is unrelated to the diff engine, so a no-op stub is enough to let the file finish
// loading.
//
// SECOND gotcha, same family as documented in tests-node/pure.test.mjs: an object LITERAL built
// during the vm-executed function's own run (e.g. the `{ names: [...] }` / `{ name, description }`
// returned for `reorder`/`rename`) is constructed from the sandbox realm's Object.prototype, not
// Node's — so `assert.deepEqual` (which node:assert/strict aliases to deepStrictEqual, and which
// checks prototype identity) fails on it with "same structure but not reference-equal" even though
// every value matches. Arrays built via .filter()/.map() off an outer-realm array don't hit this
// (Array species creation follows the receiver's realm), which is why toDelete/toInsert/toUpdate
// compare fine with plain assert.deepEqual below — only the two freshly-literal objects need the
// structural fallback.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'

const sameShape = (actual, expected, msg) =>
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), msg)

const context = { window: {}, console, escapeHtml: (s) => s, guardReentry: () => {} }
context.window = context
vm.createContext(context)
const src = fs.readFileSync(new URL('../js/app-workouts.js', import.meta.url), 'utf8')
vm.runInContext(src, context)
const _diffTemplateDraft = context._diffTemplateDraft

const baseRow = (id, name, orderIndex, overrides = {}) => ({
  _draftKey: 'k' + id, id, exercise_id: null, exercise_name: name, exercise_type: 'strength',
  metric_type: 'weight_reps', order_index: orderIndex, sets: 1, sets_json: [{ repsMin: '5' }],
  notes: null, superset_group: null, ...overrides,
})

test('no changes produces an empty diff', () => {
  const rows = [baseRow('a', 'Bench', 0), baseRow('b', 'Row', 1)]
  const draft = { meta: { name: 'T', description: null }, metaBaseline: { name: 'T', description: null }, exercises: rows, exercisesBaseline: rows.map(r => ({ ...r })) }
  const diff = _diffTemplateDraft(draft)
  assert.deepEqual(diff.toDelete, [])
  assert.deepEqual(diff.toInsert, [])
  assert.deepEqual(diff.toUpdate, [])
  assert.equal(diff.reorder, null)
  assert.equal(diff.rename, null)
})

test('a baseline row missing from the draft is queued for delete', () => {
  const baseline = [baseRow('a', 'Bench', 0), baseRow('b', 'Row', 1)]
  const draft = { meta: { name: 'T', description: null }, metaBaseline: { name: 'T', description: null }, exercises: [baseline[0]], exercisesBaseline: baseline.map(r => ({ ...r })) }
  const diff = _diffTemplateDraft(draft)
  assert.deepEqual(diff.toDelete, ['b'])
})

test('a draft row with id:null is queued for insert, carrying its fields but no id', () => {
  const baseline = [baseRow('a', 'Bench', 0)]
  const newRow = baseRow(null, 'Squat', 1)
  const draft = { meta: { name: 'T', description: null }, metaBaseline: { name: 'T', description: null }, exercises: [...baseline, newRow], exercisesBaseline: baseline.map(r => ({ ...r })) }
  const diff = _diffTemplateDraft(draft)
  assert.equal(diff.toInsert.length, 1)
  assert.equal(diff.toInsert[0].exercise_name, 'Squat')
})

test('a changed field on a pre-existing row is queued for update, keyed by its real id', () => {
  const baseline = [baseRow('a', 'Bench', 0)]
  const edited = [baseRow('a', 'Bench', 0, { notes: 'go heavier' })]
  const draft = { meta: { name: 'T', description: null }, metaBaseline: { name: 'T', description: null }, exercises: edited, exercisesBaseline: baseline.map(r => ({ ...r })) }
  const diff = _diffTemplateDraft(draft)
  assert.equal(diff.toUpdate.length, 1)
  assert.equal(diff.toUpdate[0].id, 'a')
  assert.equal(diff.toUpdate[0].row.notes, 'go heavier')
})

test('an unchanged row that only moved position is queued as a reorder, not an update', () => {
  const baseline = [baseRow('a', 'Bench', 0), baseRow('b', 'Row', 1)]
  const reordered = [baseRow('b', 'Row', 0), baseRow('a', 'Bench', 1)]
  const draft = { meta: { name: 'T', description: null }, metaBaseline: { name: 'T', description: null }, exercises: reordered, exercisesBaseline: baseline.map(r => ({ ...r })) }
  const diff = _diffTemplateDraft(draft)
  assert.deepEqual(diff.toUpdate, [])
  sameShape(diff.reorder, { names: ['Row', 'Bench'] })
})

test('a renamed workout is queued for rename only when meta actually differs', () => {
  const rows = [baseRow('a', 'Bench', 0)]
  const draft = { meta: { name: 'New Name', description: 'new desc' }, metaBaseline: { name: 'Old Name', description: null }, exercises: rows, exercisesBaseline: rows.map(r => ({ ...r })) }
  const diff = _diffTemplateDraft(draft)
  sameShape(diff.rename, { name: 'New Name', description: 'new desc' })
})

test('a mix of every operation type in one diff', () => {
  const baseline = [baseRow('a', 'Bench', 0), baseRow('b', 'Row', 1), baseRow('c', 'Curl', 2)]
  const draft = {
    meta: { name: 'Renamed', description: null },
    metaBaseline: { name: 'Original', description: null },
    exercises: [
      baseRow('c', 'Curl', 0),               // reordered ahead
      baseRow('a', 'Bench', 1, { notes: 'x' }), // reordered + edited
      baseRow(null, 'New Exercise', 2),       // inserted
      // 'b'/Row is gone entirely -> deleted
    ],
    exercisesBaseline: baseline.map(r => ({ ...r })),
  }
  const diff = _diffTemplateDraft(draft)
  assert.deepEqual(diff.toDelete, ['b'])
  assert.equal(diff.toInsert.length, 1)
  assert.equal(diff.toUpdate.length, 1)
  assert.equal(diff.toUpdate[0].id, 'a')
  sameShape(diff.reorder, { names: ['Curl', 'Bench', 'New Exercise'] })
  sameShape(diff.rename, { name: 'Renamed', description: null })
})
