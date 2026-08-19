// Reordering exercises never offered the propagation prompt (2026-08-19).
//
// Cause 2 of Jake's 2026-08-14 report — "when adding amending/updating a session within a program ...
// I should be asked whether I want to update all duplicated sessions" — and the only one of its four
// causes still open after the rename half was fixed. `moveTemplateExercise` never set
// `window._lastExerciseChange` and never called `_afterTemplateExerciseSave`, so the prompt was
// structurally unreachable for a reorder.
//
// The risky part is NOT the wiring, it is the permutation. A sibling copy legitimately holds a
// DIFFERENT SET of exercises — that is the whole reason propagation is per-change rather than a
// wholesale overwrite — so copying order_index values across would collide with, or displace,
// exercises the target has and the source does not. _propagateReorderToTemplates permutes only the
// SHARED names, into the source's relative order, REUSING THE SLOTS THEY ALREADY OCCUPY. Every
// assertion below is about that invariant.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Drives the REAL _propagateReorderToTemplates against an in-memory table, capturing every write.
const run = (page, sourceNames, targetRows) => page.evaluate(async ({ sourceNames, targetRows }) => {
  const rows = targetRows.map(r => ({ ...r }))
  const orig = db.from.bind(db)
  const writes = []
  db.from = (tbl) => {
    if (tbl !== 'workout_template_exercises') return orig(tbl)
    return {
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) }),
      update: (patch) => {
        const c = { _id: null,
          eq(col, v) { if (col === 'id') c._id = v; return c },
          select: () => {
            const row = rows.find(r => r.id === c._id)
            if (row) { row.order_index = patch.order_index; writes.push({ id: row.id, to: patch.order_index }) }
            return Promise.resolve({ data: row ? [{ id: row.id }] : [], error: null })
          } }
        return c
      },
    }
  }
  const origToast = window.showToast
  window.showToast = () => {}
  try {
    const failures = await _propagateReorderToTemplates({ op: 'reorder', names: sourceNames }, ['t1'])
    const sorted = [...rows].sort((a, b) => a.order_index - b.order_index)
    return { failures, writes, final: sorted.map(r => r.exercise_name), indexes: sorted.map(r => r.order_index) }
  } finally { db.from = orig; window.showToast = origToast }
}, { sourceNames, targetRows })

test.describe('Reorder propagation', () => {
  test('an identical copy ends up in the source order', async ({ page }) => {
    await loginAsPT(page)
    const r = await run(page, ['C', 'A', 'B'], [
      { id: 1, exercise_name: 'A', order_index: 0 },
      { id: 2, exercise_name: 'B', order_index: 1 },
      { id: 3, exercise_name: 'C', order_index: 2 },
    ])
    expect(r.final).toEqual(['C', 'A', 'B'])
    expect(r.failures).toBe(0)
  })

  test('an exercise the target has and the source does NOT never moves', async ({ page }) => {
    await loginAsPT(page)
    // The whole reason this cannot be a wholesale order_index copy. X is unique to the target.
    const r = await run(page, ['A', 'B'], [
      { id: 1, exercise_name: 'B', order_index: 0 },
      { id: 2, exercise_name: 'X', order_index: 1 },
      { id: 3, exercise_name: 'A', order_index: 2 },
    ])
    // Shared slots are [0, 2]; A and B swap into them. X keeps slot 1 and stays in the middle.
    expect(r.final).toEqual(['A', 'X', 'B'])
    expect(r.writes.some(w => w.id === 2), 'X must never be written').toBe(false)
  })

  test('no two exercises can end up sharing an order_index', async ({ page }) => {
    await loginAsPT(page)
    // The failure mode that looks like a completely different bug: a collision renders in arbitrary
    // order. Guaranteed impossible by construction, because the set of slots in play is unchanged.
    const r = await run(page, ['D', 'C', 'B', 'A'], [
      { id: 1, exercise_name: 'A', order_index: 0 },
      { id: 2, exercise_name: 'X', order_index: 1 },
      { id: 3, exercise_name: 'B', order_index: 2 },
      { id: 4, exercise_name: 'C', order_index: 5 },
      { id: 5, exercise_name: 'D', order_index: 9 },
    ])
    expect(r.final).toEqual(['D', 'X', 'C', 'B', 'A'])
    // Assert on the RESULTING TABLE, not on the writes. Checking only that the writes were distinct
    // passed against a deliberately-naive implementation that wrote 0,1,2,3 straight over X's slot —
    // distinct writes, colliding result. The invariant is that no two rows share an order_index.
    expect(new Set(r.indexes).size, 'no two rows may share an order_index').toBe(r.indexes.length)
    // And the slots in play must be exactly the ones that were already occupied — nothing invented.
    expect([...r.indexes].sort((a, b) => a - b)).toEqual([0, 1, 2, 5, 9])
  })

  test('a target sharing fewer than two exercises is left completely alone', async ({ page }) => {
    await loginAsPT(page)
    const r = await run(page, ['A', 'B'], [
      { id: 1, exercise_name: 'A', order_index: 0 },
      { id: 2, exercise_name: 'Y', order_index: 1 },
    ])
    expect(r.writes, 'nothing to permute — no writes at all').toEqual([])
    expect(r.final).toEqual(['A', 'Y'])
  })

  test('rows already in the right place are not rewritten', async ({ page }) => {
    await loginAsPT(page)
    const r = await run(page, ['A', 'B', 'C'], [
      { id: 1, exercise_name: 'A', order_index: 0 },
      { id: 2, exercise_name: 'B', order_index: 1 },
      { id: 3, exercise_name: 'C', order_index: 2 },
    ])
    expect(r.writes, 'an already-correct order must cost zero writes').toEqual([])
  })

  test('moveTemplateExercise captures a reorder change and hands off to propagation', async ({ page }) => {
    await loginAsPT(page)
    // The wiring half. It was absent entirely, which is what made the prompt unreachable.
    const src = await page.evaluate(() => moveTemplateExercise.toString())
    expect(src, 'must capture the change like its siblings do').toContain('_lastExerciseChange')
    expect(src, "and it must be a 'reorder' op").toMatch(/op:\s*'reorder'/)
    expect(src, 'must hand off to the propagation entry point').toContain('_afterTemplateExerciseSave')
    // Names, not ids: a sibling copy has its own row ids, so only names transfer.
    expect(src, 'the change must carry names').toMatch(/names:/)
    // And the select must actually fetch the names, or they would all be undefined, silently.
    expect(src).toContain('exercise_name')
  })

  test('the dispatcher routes reorder to its own handler', async ({ page }) => {
    await loginAsPT(page)
    const src = await page.evaluate(() => _applyChangeToTemplates.toString())
    expect(src).toContain('_propagateReorderToTemplates')
    // A reorder must NOT fall through to the by-name exercise path — it matches none of its branches,
    // writes nothing, and logs success. That is the exact hazard the rename branch was added for.
    expect(src).toMatch(/reorder/)
  })
})
