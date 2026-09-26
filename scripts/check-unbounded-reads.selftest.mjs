#!/usr/bin/env node
/**
 * Proves check-unbounded-reads.mjs BLOCKS an unbounded read of a growing table AND stays quiet on every bound
 * this codebase actually writes.
 *
 * Both directions are asserted because a checker seen only passing is indistinguishable from a dead one — the
 * lesson of rule 2's vacuous sub-check. The BLOCK cases include the two shapes the FIRST draft of this checker
 * waved through (found by auditing what it had exempted, 2026-09-21): a `.limit(500)` and a `.range(0, 999)`,
 * both of which read as bounds and return 200, silently. The PASS cases are real shapes from js/.
 *
 * Every fixture is run in a throwaway repo with the baseline set to 0, so ONE unexplained read is a failure.
 *
 * Run: node scripts/check-unbounded-reads.selftest.mjs      (exit 1 = a case misbehaved)
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-unbounded-reads.mjs')

// Every PASS fixture also holds one bounded read, so the checker has something to examine — with none it
// (rightly) refuses to report a count against nothing, and that refusal would read as a failure here.
const CONTROL = `\nawait db.from('weight_logs').select('id').limit(5)\n`

const CASES = [
  // ── must BLOCK: the class this gate exists for ─────────────────────────────────────────────────────────
  { want: 'BLOCK', why: 'a bare read of a growing table, filtered only by client',
    src: `const { data } = await db.from('workout_logs').select('*').eq('client_id', id)` },
  { want: 'BLOCK', why: 'the weight-history shape: .in() plus an order, no bound (the R2a bug)',
    src: `const { data } = await db.from('weight_logs').select('*').in('client_id', ids).order('date')` },
  { want: 'BLOCK', why: 'select and filters on CONTINUATION lines, as this codebase writes them',
    src: `const { data } = await db.from('weight_logs')\n    .select('date, weight_kg')\n    .eq('client_id', c)\n    .order('date')` },
  { want: 'BLOCK', why: 'a date window is not a bound: a busy month is still over 200',
    src: `const r = await db.from('events').select('*').gte('date', from).lte('date', to).order('date')` },
  { want: 'BLOCK', why: '.limit(500) is wider than the cap — it returns 200 (js/app-workouts.js:936)',
    src: `const { data } = await db.from('workout_logs').select('template_id, date').order('date', { ascending: false }).limit(500)` },
  { want: 'BLOCK', why: '.limit(1000) — the exact call measured returning 200 on a 5,564-row table',
    src: `const { data } = await db.from('performance_logs').select('*').eq('client_id', c).limit(1000)` },
  { want: 'BLOCK', why: '.range(0, 999) is wider than the cap too',
    src: `const { data } = await db.from('workout_log_sets').select('*').range(0, 999)` },
  { want: 'BLOCK', why: 'a function that merely happens to be called all() is NOT the paging helper',
    src: `const all = (q) => q()\nconst rows = await all(() => db.from('weight_logs').select('*').eq('client_id', c))` },
  { want: 'BLOCK', why: '_fetchAllRows nearby does not exempt a DIFFERENT read below it',
    src: `const a = await _fetchAllRows(() => db.from('goal_check_ins').select('*', { count: 'exact' }).order('id'))\nconst { data } = await db.from('weight_logs').select('*').eq('client_id', c)` },
  { want: 'BLOCK', why: 'an unbounded-ok note with no reason is a way to silence the gate, not to explain a read',
    src: `// unbounded-ok:\nconst { data } = await db.from('weight_logs').select('*').eq('client_id', c)` },
  { want: 'BLOCK', why: 'an unbounded-ok note with a token reason ("x") is not a reason either',
    src: `// unbounded-ok: x\nconst { data } = await db.from('weight_logs').select('*').eq('client_id', c)` },
  { want: 'BLOCK', why: 'an unbounded-ok note four lines up belongs to some other statement',
    src: `// unbounded-ok: bounded by a single session, a few dozen rows at most\n\n\n\nconst { data } = await db.from('workout_log_sets').select('*').in('workout_log_exercise_id', ids)` },
  { want: 'BLOCK', why: 'a read inside a template literal or another table name does not matter — the read itself is unbounded',
    src: `const x = await db\n    .from('client_check_ins').select('*').eq('client_id', c).order('created_at')` },
  { want: 'BLOCK', why: 'REFUSES to report a count against nothing: no reads of any growing table at all',
    src: `const { data } = await db.from('programs').select('*')`, control: false },

  // ── must BLOCK: shapes a reviewer showed would have slipped through the first version (2026-09-21) ────────
  { want: 'BLOCK', why: 'a TRAILING comment that mentions a bound is not a bound: `// .limit(20) removed`',
    src: `const { data } = await db.from('weight_logs').select('*').eq('client_id', c) // .limit(20) removed` },
  { want: 'BLOCK', why: 'the same on a CONTINUATION line: `// .single() comes later`',
    src: `const { data } = await db.from('weight_logs')\n    .select('*')\n    .eq('client_id', c) // .single() comes later` },
  { want: 'BLOCK', why: '.limit(n, { foreignTable }) bounds an EMBEDDED resource, not the rows read',
    src: `const { data } = await db.from('workout_logs').select('*, workout_log_exercises(*)').eq('client_id', c).limit(5, { foreignTable: 'workout_log_exercises' })` },
  { want: 'BLOCK', why: 'an unbounded-ok note above one read does NOT silence the read on the next line (one read per line, as in Promise.all)',
    src: `// unbounded-ok: one session's sets, never more than a few dozen\nawait db.from('workout_log_sets').select('*').in('workout_log_exercise_id', ids)\nawait db.from('weight_logs').select('*').eq('client_id', c)` },
  { want: 'BLOCK', why: 'a TRAILING note on the previous read does not leak to the next one either',
    src: `await db.from('workout_log_sets').select('*').in('workout_log_exercise_id', ids) // unbounded-ok: one session's sets, at most a few dozen\nawait db.from('weight_logs').select('*').eq('client_id', c)` },
  { want: 'BLOCK', why: '.range(a, b, { referencedTable }) bounds an EMBEDDED resource, not the rows read',
    src: `const { data } = await db.from('workout_logs').select('*, workout_log_exercises(*)').eq('client_id', c).range(0, 9, { referencedTable: 'workout_log_exercises' })` },
  { want: 'BLOCK', why: 'a paging alias that exists only inside a BLOCK COMMENT is not an alias (its line starts with `const`, so a raw-text scan would find it)',
    src: `/*\nconst all = (q) => _fetchAllRows(q)\n*/\nconst rows = await all(() => db.from('weight_logs').select('*').eq('client_id', c))` },

  // ── must PASS: bounds the codebase really writes ───────────────────────────────────────────────────────
  { want: 'PASS', why: 'the newest few: order + limit(20)',
    src: `const { data } = await db.from('workout_logs').select('id').eq('client_id', c).order('date', { ascending: false }).limit(20)` },
  { want: 'PASS', why: '.limit(200) is exactly the cap: it IS the bound (the app_errors list)',
    src: `const { data } = await db.from('app_errors').select('id').order('created_at', { ascending: false }).limit(200)` },
  { want: 'PASS', why: 'a narrow numeric range',
    src: `const { data } = await db.from('weight_logs').select('*').eq('client_id', c).range(0, 49)` },
  { want: 'PASS', why: 'a limit that is not a literal cannot be judged, so it is trusted',
    src: `const { data } = await db.from('weight_logs').select('*').eq('client_id', c).limit(pageSize)` },
  { want: 'PASS', why: 'one row: .single()',
    src: `const { data } = await db.from('workout_logs').select('*').eq('client_id', c).order('date', { ascending: false }).limit(1).single()` },
  { want: 'PASS', why: 'one row: .maybeSingle()',
    src: `const { data } = await db.from('client_check_ins').select('*').eq('client_id', c).maybeSingle()` },
  { want: 'PASS', why: 'a count: head: true returns no rows',
    src: `const { count } = await db.from('workout_logs').select('*', { count: 'exact', head: true }).eq('client_id', c)` },
  { want: 'PASS', why: 'one row by primary key',
    src: `const { data } = await db.from('workout_logs').select('*').eq('id', logId)` },
  { want: 'PASS', why: 'handed to the paging helper, on the same line',
    src: `const { data } = await _fetchAllRows(() => db.from('performance_logs').select('name, value', { count: 'exact' }).eq('client_id', c).order('date').order('id'))` },
  { want: 'PASS', why: 'handed to the paging helper with `db` and `.from(` on later lines and a comment between',
    src: `const { data } = await _fetchAllRows(() => db\n    // paged: one query returns the OLDEST 200 and drops the rest\n    .from('weight_logs').select('*', { count: 'exact' }).eq('client_id', c).order('date').order('id'))` },
  { want: 'PASS', why: 'handed to a LOCAL ALIAS of the paging helper, as the data export does',
    src: `const all = async (makeQuery) => { const { data, error } = await _fetchAllRows(makeQuery, { maxPages: 500 }); if (error) throw error; return data }\nconst w = await all(() => db.from('weight_logs').select('*', { count: 'exact' }).in('client_id', ids).order('date').order('id'))` },
  { want: 'PASS', why: 'writes: an insert / update / delete is not a read, whatever it selects back',
    src: `await db.from('workout_logs').insert({ client_id: c, name: n }).select('id').single()\nawait db.from('weight_logs').update({ notes: n }).eq('client_id', c)\nawait db.from('workout_log_sets').delete().in('workout_log_exercise_id', ids).select('id')\nawait db.from('events').upsert({ title: t }).select()` },
  { want: 'PASS', why: 'a table that grows with authoring, not with use, is out of scope',
    src: `const { data } = await db.from('programs').select('*').eq('coach_id', u)` },
  { want: 'PASS', why: 'a COMMENT describing an unbounded read is documentation, not a read',
    src: `// never write db.from('weight_logs').select('*') without a bound` },
  { want: 'PASS', why: 'a BLOCK comment quoting a read is not a read either',
    src: `/* was: db.from('weight_logs').select('*').eq('client_id', c)\n   and it read every row */` },
  { want: 'PASS', why: 'a `//` inside a STRING in a bounded chain is not a comment (the blanker must not eat the rest of the line)',
    src: `const { data } = await db.from('weight_logs').select('*').eq('notes', 'see http://x.example/y').limit(5)` },
  { want: 'PASS', why: 'an unbounded-ok note WITH a reason, as a TRAILING comment on the read\'s own line',
    src: `const { data } = await db.from('workout_log_sets').select('*').in('workout_log_exercise_id', exIds) // unbounded-ok: one session's sets, never more than a few dozen` },
  { want: 'PASS', why: 'an unbounded-ok note WITH a reason, on the line above',
    src: `// unbounded-ok: one session's sets, never more than a few dozen\nconst { data } = await db.from('workout_log_sets').select('*').in('workout_log_exercise_id', exIds)` },
  { want: 'PASS', why: 'an unbounded-ok note WITH a reason, two lines above, past a comment',
    src: `// unbounded-ok: ids come from a query capped at twenty logs\n// (see fetchRunnerLastSession)\nconst { data } = await db.from('workout_log_exercises').select('*').in('log_id', logIds)` },
]

// ── the baseline arithmetic, on one fixture holding exactly TWO unbounded reads ────────────────────────
const TWO = `await db.from('weight_logs').select('*').eq('client_id', a)\nawait db.from('workout_logs').select('*').eq('client_id', b)\nawait db.from('weight_logs').select('id').limit(5)\n`
const BASELINES = [
  { want: 'BLOCK', baseline: '1', why: 'two unbounded reads against a baseline of 1: the count ROSE' },
  { want: 'PASS',  baseline: '2', why: 'two against a baseline of 2: at the pin, nothing new' },
  { want: 'PASS',  baseline: '5', why: 'two against a baseline of 5: fewer than pinned (a note asks to lower it)' },
  { want: 'BLOCK', baseline: '',  why: 'an EMPTY baseline is refused, not read as 0 or NaN (a silently disarmed gate)' },
  { want: 'BLOCK', baseline: 'abc', why: 'a non-numeric baseline is refused, not read as NaN' },
]

const dir = mkdtempSync(join(tmpdir(), 'ub-'))
let failures = 0

function run (src, baseline) {
  mkdirSync(join(dir, 'js'), { recursive: true })
  writeFileSync(join(dir, 'js', 'fixture.js'), src)
  const r = spawnSync(process.execPath, [CHECK], {
    env: { ...process.env, UNBOUNDED_REPO: dir, UNBOUNDED_READS_BASELINE: baseline }, encoding: 'utf8'
  })
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') }
}

try {
  CASES.forEach((c, i) => {
    const src = c.control === false ? c.src : c.src + CONTROL
    const r = run(src, '0')
    const got = r.status === 0 ? 'PASS' : 'BLOCK'
    if (got !== c.want) {
      failures++
      console.log(`  FAIL case ${i + 1} — wanted ${c.want}, got ${got}: ${c.why}`)
      console.log('    ' + r.out.trim().split('\n').slice(0, 6).join('\n    '))
    }
  })
  BASELINES.forEach((b, i) => {
    const r = run(TWO, b.baseline)
    const got = r.status === 0 ? 'PASS' : 'BLOCK'
    if (got !== b.want) {
      failures++
      console.log(`  FAIL baseline case ${i + 1} — wanted ${b.want}, got ${got}: ${b.why}`)
      console.log('    ' + r.out.trim().split('\n').slice(0, 6).join('\n    '))
    }
  })
} finally {
  rmSync(dir, { recursive: true, force: true })
}

if (failures) {
  console.log(`  check-unbounded-reads self-test: ${failures} case(s) misbehaved.`)
  process.exit(1)
}
console.log(`  check-unbounded-reads self-test: all ${CASES.length + BASELINES.length} cases behaved (${CASES.filter(c => c.want === 'BLOCK').length + BASELINES.filter(c => c.want === 'BLOCK').length} block, ${CASES.filter(c => c.want === 'PASS').length + BASELINES.filter(c => c.want === 'PASS').length} pass).`)
