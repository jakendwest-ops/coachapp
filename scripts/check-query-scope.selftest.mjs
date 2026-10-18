#!/usr/bin/env node
/**
 * Proves check-query-scope.mjs BLOCKS an unanchored tenant query AND stays quiet on every legitimate
 * shape this codebase actually writes.
 *
 * The second half is the point. The shell rule this replaces had a sub-check that could never fire
 * (it required that NO clients query anywhere carried coach_id, and 40 do) — it read as protection
 * for months while being structurally incapable of refusing anything. A checker observed only passing
 * is indistinguishable from a dead one, so both directions are asserted here.
 *
 * The PASS fixtures are not invented: each is a real shape taken from js/, and each one was reported
 * as a violation by an earlier draft of the checker before the walker was fixed.
 *
 * Run: node scripts/check-query-scope.selftest.mjs      (exit 1 = a case misbehaved)
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-query-scope.mjs')

const CASES = [
  // ── must BLOCK: the class this gate exists for ──────────────────────────────
  { want: 'BLOCK', why: 'bare select on clients, no anchor at all',
    src: `const { data } = await db.from('clients').select('*')` },
  { want: 'BLOCK', why: 'programs select filtered only by a non-ownership column',
    src: `const { data } = await db.from('programs').select('id').eq('name', n)` },
  { want: 'BLOCK', why: 'DELETE on a tenant table with no anchor — the deleteProgram data-loss shape',
    src: `await db.from('workout_templates').delete().eq('name', n)` },
  { want: 'BLOCK', why: 'insert whose payload carries no tenant column',
    src: `await db.from('programs').insert({ name: n, description: d })` },
  { want: 'BLOCK', why: 'anchor-looking column that is NOT an anchor (is_personal is a display flag)',
    src: `const { data } = await db.from('clients').select('*').eq('is_personal', true)` },

  // ── must PASS: real shapes from js/, every one flagged by an earlier draft ──
  { want: 'PASS', why: 'anchor on the CONTINUATION line — what broke the single-line shell grep',
    src: `const { data: existing } = await db.from('programs').select('id')\n    .eq('coach_id', currentUser.id).eq('name', newName)` },
  { want: 'PASS', why: 'the SOLO-SAFE .or() form must be a first-class anchor, never a violation',
    src: 'const { data } = await db.from(\'clients\').select(\'*\').or(`coach_id.eq.${uid},user_id.eq.${uid}`)' },
  { want: 'PASS', why: 'insert anchored by coach_id in the PAYLOAD — inserts carry no filters',
    src: `await db.from('clients').insert({\n    coach_id: currentUser.id,\n    full_name: n\n  })` },
  { want: 'PASS', why: 'chain resuming after comment lines (app-programs.js:1772 has four)',
    src: `const { data } = await db.from('workout_templates')\n    // family_id inherited\n    // second comment line\n    .insert({ coach_id: currentUser.id, name: n })\n    .select('id').single()` },
  { want: 'PASS', why: 'multi-line update object followed by the anchoring filter',
    src: `await db.from('clients').update({\n    full_name: n,\n    notes: x\n  }).eq('id', clientId)` },
  { want: 'PASS', why: '.in() on an id set plus .or() on owned parents',
    src: `const { data: owned } = await db.from('workout_templates').select('id').in('id', ids).or(clauses.join(','))` },
  { want: 'PASS', why: 'a NON-tenant table is out of scope and must never be flagged',
    src: `const { data } = await db.from('exercises').select('*')` },
  { want: 'PASS', why: 'a COMMENT describing an unscoped query is documentation, not a query',
    src: `// never write db.from('clients').select('*') without a scope` },

  // ── WIDENED 2026-10-18: the other tenant tables. Each BLOCK is a shape the new tables could fall into; each PASS
  //    is a real shape from js/ that the first widened draft reported (45 findings on the clean tree before the three
  //    rule gaps below were closed: dotted anchors, child-row keys, insert payloads built in a variable). ──────────
  { want: 'BLOCK', why: 'WIDENED: an unscoped read of the largest health table',
    src: `const { data } = await db.from('workout_logs').select('*')` },
  { want: 'BLOCK', why: 'WIDENED: goals filtered only by status -- the coach dashboard shape fixed 2026-10-18',
    src: `const r = await db.from('goals').select('id').eq('status', 'active').limit(5)` },
  { want: 'BLOCK', why: 'WIDENED: an insert of a variable payload that carries no tenant key',
    src: `const row = { weight_kg: w, date: d }\nawait db.from('weight_logs').insert(row)` },
  { want: 'BLOCK', why: 'WIDENED: a delete on a child table by a non-anchor column',
    src: `await db.from('workout_log_sets').delete().eq('set_number', 1)` },
  { want: 'BLOCK', why: 'a waiver with no reason is not a waiver',
    src: `// SCOPE-OK: x\nconst { data } = await db.from('events').select('*')` },
  { want: 'BLOCK', why: 'a waiver far above the query does not cover it',
    src: `// SCOPE-OK: the coach calendar spans every client\n\n\n\n\nconst { data } = await db.from('events').select('*')` },
  { want: 'PASS', why: 'WIDENED: a dotted anchor through an !inner embed (app-runner, app-progress)',
    src: `const r = await db.from('workout_log_exercises').select('id, workout_logs!inner(client_id)')\n    .eq('workout_logs.client_id', cid).order('id')` },
  { want: 'PASS', why: 'WIDENED: a child-row key (sets of exercises already fetched under a scoped parent)',
    src: `const { data } = await db.from('workout_log_sets').select('*').in('workout_log_exercise_id', exIds).order('set_number')` },
  { want: 'PASS', why: 'WIDENED: insert(rows) where rows was built just above with the tenant key in it',
    src: `const rows = items.map(i => ({ client_id: cid, weight_kg: i }))\nawait db.from('weight_logs').insert(rows)` },
  { want: 'PASS', why: 'WIDENED: object-shorthand payload ({ client_id, ... })',
    src: `await db.from('weight_logs').insert({ client_id, weight_kg })` },
  { want: 'PASS', why: 'WIDENED: a read deliberately left to RLS, with its reason on the line above',
    src: `// SCOPE-OK: the coach calendar spans every client, so there is no single id to filter on\nconst { data } = await db.from('events').select('*').gte('date', from)` },
  { want: 'BLOCK', why: 'a SECOND waiver is over the cap of one -- a permit must not become a habit',
    src: ['events', 'goals'].map(t => `// SCOPE-OK: this read spans every client on purpose, RLS scopes it\nconst a${t} = await db.from('${t}').select('*')`).join('\n') },
  { want: 'BLOCK', why: 'a waiver on a query that IS anchored is stale and must be deleted (the permit shrinks when the read is fixed)',
    src: `// SCOPE-OK: this read spans every client on purpose, RLS scopes it\nconst { data } = await db.from('events').select('*').eq('client_id', cid)` },
  { want: 'PASS', why: 'a waiver belongs to the FIRST query after it and does not leak onto the anchored query two lines down',
    src: `const [a, b] = await Promise.all([\n  // SCOPE-OK: this read spans every client on purpose, RLS scopes it\n  db.from('events').select('*').gte('date', from),\n  db.from('client_programs').select('id').eq('client_id', cid)\n])` },
  { want: 'BLOCK', why: 'a table in NEITHER list must be decided, not silently ignored (even when the query happens to carry a client filter)',
    src: `const { data } = await db.from('brand_new_table').select('*').eq('client_id', cid)` },
  { want: 'BLOCK', why: '.neq on an anchor column excludes one value, it does not scope to a tenant',
    src: `const { data } = await db.from('goals').select('*').neq('client_id', x)` },
  { want: 'BLOCK', why: '.not on an anchor column does not scope to a tenant either',
    src: `const r = await db.from('weight_logs').select('*').not('client_id', 'is', null)` },
  { want: 'BLOCK', why: 'a trailing COMMENT mentioning an anchor is not an anchor',
    src: `const { data } = await db.from('clients').select('*') // .eq('coach_id', uid)` },
  { want: 'BLOCK', why: 'a { client_id } named in a COMMENT between a payload variable and its insert does not anchor it',
    src: `const row = { weight_kg: w }\n// the row should carry { client_id: cid } but does not\nawait db.from('weight_logs').insert(row)` },
  { want: 'BLOCK', why: 'a dotted filter on a PLAIN embed filters only the embedded object, not the parent rows',
    src: `const r = await db.from('goals').select('id, clients(full_name)').eq('clients.coach_id', uid)` },
  { want: 'PASS', why: 'a dotted filter through an !inner embed (the dashboard goals read)',
    src: `const r = await db.from('goals').select('id, clients!inner(full_name)').eq('clients.coach_id', uid)` },
  { want: 'PASS', why: 'a dotted filter with the select built from a constant (the real runner / progress shapes)',
    src: `const r = await db.from('workout_log_exercises').select(_HISTORY_SELECT).eq('workout_logs.client_id', cid)` },
  { want: 'PASS', why: 'the object form of the filters, .match({ client_id })',
    src: `const r = await db.from('weight_logs').select('*').match({ client_id: cid })` },
  { want: 'PASS', why: 'an upsert carries its anchor in the payload like an insert',
    src: `await db.from('weight_logs').upsert({ client_id: cid, date: d, weight_kg: w })` },
  { want: 'BLOCK', why: 'an upsert with no anchor in its payload',
    src: `await db.from('weight_logs').upsert({ date: d, weight_kg: w })` },
  { want: 'PASS', why: 'program_id anchors a program phase read',
    src: `const r = await db.from('program_phases').select('*').eq('program_id', pid)` },
  { want: 'PASS', why: 'template_id anchors a template-exercises read',
    src: `const r = await db.from('workout_template_exercises').select('*').eq('template_id', tid)` },
  { want: 'BLOCK', why: 'a table whose name has a digit is still covered (client_1rms)',
    src: `const r = await db.from('client_1rms').select('*')` },
  { want: 'BLOCK', why: 'created_by is not an anchor (it is not needed, and was a way past the gate)',
    src: `const { data } = await db.from('goals').select('*').eq('created_by', uid)` },
  { want: 'BLOCK', why: 'the CHILD-row keys do not anchor the original three tables',
    src: `const { data } = await db.from('clients').select('*').eq('goal_id', g)` },
  { want: 'BLOCK', why: 'an .or() with an unrelated branch matches rows outside the tenant',
    src: `const { data } = await db.from('goals').select('*').or('client_id.eq.x,status.eq.active')` },
  { want: 'PASS', why: 'an .or() whose every clause is an anchor (the solo-safe form)',
    src: 'const { data } = await db.from(\'goals\').select(\'*\').or(`client_id.eq.${a},client_id.eq.${b}`)' },
  { want: 'BLOCK', why: '`db` at the end of one line and .from() at the start of the next is still a query',
    src: `const { data } = await db\n  .from('workout_logs')\n  .select('*')` },
  { want: 'PASS', why: 'the same split-line shape WITH an anchor',
    src: `const { data } = await db\n  .from('workout_logs')\n  .select('*')\n  .eq('client_id', cid)` },
  { want: 'PASS', why: 'a view that RLS scopes (security_invoker) is out of scope',
    src: `const { data } = await db.from('coach_client_summary').select('client_id')` }
]

const dir = mkdtempSync(join(tmpdir(), 'qs-'))
let failures = 0
try {
  CASES.forEach((c, i) => {
    const f = join(dir, `case${i}.js`)
    writeFileSync(f, c.src + '\n')
    let got = 'PASS'
    try { execFileSync(process.execPath, [CHECK, f], { encoding: 'utf8' }) }
    catch { got = 'BLOCK' }
    if (got !== c.want) failures++
    console.log(`${got === c.want ? 'ok  ' : 'FAIL'}  want=${c.want.padEnd(5)} ${c.why}${got === c.want ? '' : `  (got ${got})`}`)
  })
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log(failures ? `\n${failures} case(s) misbehaved` : `\nall ${CASES.length} cases behaved — the rule refuses AND allows`)
process.exit(failures ? 1 : 0)
