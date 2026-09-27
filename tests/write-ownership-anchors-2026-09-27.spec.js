const { test, expect } = require('./fixtures')
const fs = require('fs')
const path = require('path')

// Ledger row 2026-07-30-6-more-unanchored-writes: six writes keyed only on a row id, with no ownership
// column — toggleExerciseArchived / saveEditExercise / deleteExercise / _rememberExerciseMetricType
// (exercises, now anchored on coach_id) and deleteEvent / deleteGoal (events / goals, anchored on created_by).
//
// WHY A SOURCE TEST, not a cross-tenant probe: a live probe on 2026-07-30 found RLS was ALREADY refusing
// these writes before the anchors were added, so a behavioural refusal test passes with or without the
// fix and proves nothing (the project's "over RLS that already refuses" lesson). What the fix added is the
// APP-level anchor — defence in depth if a policy is ever loosened — and that is what this pins.
// Same shape as the structural test in tests/modal-stacking-2026-08-12.spec.js.
//
// Written 2026-09-27; neuter-proven the same day (removing any one anchor turns it red).
const WRITES = [
  { file: 'js/app-workouts.js', fn: 'toggleExerciseArchived', table: 'exercises', anchor: "eq('coach_id', currentUser.id)" },
  { file: 'js/app-workouts.js', fn: 'saveEditExercise', table: 'exercises', anchor: "eq('coach_id', currentUser.id)" },
  { file: 'js/app-workouts.js', fn: 'deleteExercise', table: 'exercises', anchor: "eq('coach_id', currentUser.id)" },
  { file: 'js/app-workouts.js', fn: '_rememberExerciseMetricType', table: 'exercises', anchor: "eq('coach_id', currentUser.id)" },
  { file: 'js/app-calendar-goals.js', fn: 'deleteEvent', table: 'events', anchor: "eq('created_by', currentUser.id)" },
  { file: 'js/app-calendar-goals.js', fn: 'deleteGoal', table: 'goals', anchor: "eq('created_by', currentUser.id)" },
]

// The body of a top-level `function name(` / `async function name(`, up to its closing brace at column 0.
function bodyOf (src, fn) {
  const m = src.match(new RegExp(`^(async )?function ${fn}\\(`, 'm'))
  if (!m) return null
  const start = m.index
  const end = src.indexOf('\n}', start)
  return src.slice(start, end < 0 ? undefined : end)
}

test('every one of the six writes carries its ownership anchor, not just the row id', () => {
  const missing = []
  for (const w of WRITES) {
    const src = fs.readFileSync(path.join(__dirname, '..', w.file), 'utf8')
    const body = bodyOf(src, w.fn)
    if (!body) { missing.push(`${w.fn}: function not found in ${w.file}`); continue }
    // Every write to the table inside the function must carry the anchor in the same statement.
    const writes = body.split(`from('${w.table}')`).slice(1).filter(seg => /^\s*\.(update|delete)\(/.test(seg))
    if (!writes.length) { missing.push(`${w.fn}: no ${w.table} update/delete found (renamed? then update this list)`); continue }
    for (const seg of writes) {
      const statement = seg.split(/\n\s*\n|;\s*\n/)[0]
      if (!statement.includes(w.anchor)) missing.push(`${w.fn}: a ${w.table} write without .${w.anchor}`)
    }
  }
  expect(missing, 'writes keyed only on an id rely on RLS alone:\n' + missing.join('\n')).toEqual([])
})
