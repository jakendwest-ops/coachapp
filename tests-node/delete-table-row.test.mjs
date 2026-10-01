// Deleting a row in the runner's strength table keeps every prescription attached to ITS row (2026-10-01).
//
// THE BUG. deleteTableRow spliced `tableRows` and left `sets_json` alone. Prescriptions are keyed by row POSITION
// (the ghost/target lookups, the top set at index 0, the effort scale a logged set is saved under), so after deleting
// row k every later row inherited the prescription of the row ABOVE it. Before the RPE work that only mis-ghosted a
// placeholder. Now index 0 is the TOP SET: delete it, and the old row 1 was crowned the top set — a live e1RM computed
// from a backoff set, backoff targets resolved from it, and an effort_type read at a shifted index on save.
//
// The fix removes the deleted row's own prescription, on a COPY (the runner's sets_json comes from the fetched template
// row; the array is never mutated in place). Deleting the top-set row therefore leaves NO top set — the honest state —
// rather than promoting the next row.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { get, app } from './load-app.mjs'

const ctx = app()
const run = src => vm.runInContext(src, ctx)

// renderRunner needs a real DOM; what is under test is the DATA it is called with, so it is stubbed out.
beforeEach(() => { run('renderRunner = function () {}') })

const TOP = { isTopSet: true, repsMin: '3', effortType: 'rpe', effortMin: '8', intensityBasis: 'stored' }
const BACKOFF_A = { repsMin: '8', intensityMin: '70', intensityBasis: 'topSet', effortType: 'rpe' }
const BACKOFF_B = { repsMin: '10', intensityMin: '60', intensityBasis: 'topSet', effortType: 'rir', effortMin: '2' }

function setup ({ sets, rows }) {
  const ex = { name: 'Bench', type: 'strength', metricType: 'weight_reps', sets_json: sets, tableRows: rows, loggedSets: [], targetSets: rows.length }
  // `_runner` is a lexical `let` that is null until a workout starts; assign it from inside the context.
  ctx.__ex = ex
  run('_runner = { exercises: [__ex], exIdx: 0 }')
  return ex
}
const row = (o = {}) => ({ ...get('_blankTableRow')({ metricType: 'weight_reps' }), ...o })
const done = (weight, reps, effort) => row({ done: true, weight, reps, effort })

describe('deleteTableRow keeps sets_json aligned with tableRows', () => {
  test('deleting the TOP-SET row leaves no top set — the next row is not crowned', () => {
    const ex = setup({ sets: [TOP, BACKOFF_A, BACKOFF_B], rows: [done('100', '3', '8'), done('80', '8'), row()] })
    ex._liveE1RM = 115.9
    get('deleteTableRow')(0)
    assert.equal(ex.tableRows.length, 2)
    assert.equal(ex.sets_json.length, 2, 'the deleted row\'s prescription went with it')
    assert.ok(!ex.sets_json[0].isTopSet, 'row 0 is now the old backoff — it must not be a top set')
    assert.equal(ex._liveE1RM, null, 'no top set, so no estimate — a stale chip would keep showing the deleted set\'s e1RM')
  })

  test('deleting a MIDDLE row: later rows keep their own prescription, the top set stays row 0', () => {
    const ex = setup({ sets: [TOP, BACKOFF_A, BACKOFF_B], rows: [done('100', '3', '8'), row(), row()] })
    get('deleteTableRow')(1)
    assert.equal(ex.sets_json[0].isTopSet, true)
    assert.deepEqual({ ...ex.sets_json[1] }, { ...BACKOFF_B }, 'the old row 2 now sits at index 1 WITH its own prescription')
    assert.ok(ex._liveE1RM > 0, 'the top set was not touched, so its estimate stands')
  })

  test('the effort scale a logged set is saved under follows its row (RIR row stays RIR after the row above is deleted)', () => {
    const ex = setup({ sets: [TOP, BACKOFF_A, BACKOFF_B], rows: [row(), row(), done('60', '10', '2')] })
    get('deleteTableRow')(1)
    assert.equal(ex.loggedSets.length, 1)
    assert.equal(ex.loggedSets[0].effortType, 'rir', 'it was read at the shifted index and came out RPE before the fix')
  })

  test('the runner\'s ORIGINAL sets_json array is not mutated (it comes from the fetched template row)', () => {
    const original = [TOP, BACKOFF_A, BACKOFF_B]
    setup({ sets: original, rows: [row(), row(), row()] })
    get('deleteTableRow')(0)
    assert.equal(original.length, 3, 'a splice in place would corrupt whatever else holds this array')
  })

  test('an appended row past the prescription: nothing to remove from sets_json', () => {
    const ex = setup({ sets: [TOP, BACKOFF_A], rows: [row(), row(), row()] })   // row 2 was added by "+ Add set"
    get('deleteTableRow')(2)
    assert.equal(ex.sets_json.length, 2)
    assert.equal(ex.tableRows.length, 2)
  })

  test('a single prescription for the whole exercise is left alone', () => {
    const ex = setup({ sets: [BACKOFF_A], rows: [row(), row(), row()] })
    get('deleteTableRow')(0)
    assert.equal(ex.sets_json.length, 1)
  })

  test('the last remaining row cannot be deleted (unchanged behaviour)', () => {
    const ex = setup({ sets: [TOP], rows: [row()] })
    get('deleteTableRow')(0)
    assert.equal(ex.tableRows.length, 1)
    assert.equal(ex.sets_json.length, 1)
  })
})
