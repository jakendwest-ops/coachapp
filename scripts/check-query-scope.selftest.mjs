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
    src: `// never write db.from('clients').select('*') without a scope` }
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
