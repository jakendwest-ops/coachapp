#!/usr/bin/env node
/**
 * Proves check-single-source.mjs catches all THREE ways a single-sourced fact stops being one:
 * a second copy appears, the definition moves, or it disappears entirely.
 *
 * The third is the one that is easy to leave out and is the most dangerous, because a pattern that
 * matches nothing looks identical to a pattern that is satisfied. A registry entry whose pattern
 * silently stopped matching -- a rename, a reformat, a `1 + r/30` losing its spaces -- would report
 * "single-sourced" forever while checking nothing at all. That must be a REFUSAL, not a pass.
 *
 * Also proves the empty registry refuses. A checker with nothing registered reads as protection while
 * providing none, and this project's most-shipped OS bug is a safeguard reporting success while doing
 * nothing.
 *
 * Run: node scripts/check-single-source.selftest.mjs      (exit 1 = a case misbehaved)
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-single-source.mjs')

function makeRepo (js, facts) {
  const repo = mkdtempSync(join(tmpdir(), 'single-selftest-'))
  mkdirSync(join(repo, 'js'))
  mkdirSync(join(repo, 'scripts'))
  for (const [n, src] of Object.entries(js)) writeFileSync(join(repo, 'js', n), src, 'utf8')
  writeFileSync(join(repo, 'index.html'),
    Object.keys(js).map(n => `<script src="js/${n}?v=1"></script>`).join('\n'), 'utf8')
  writeFileSync(join(repo, 'scripts', 'single-source.json'), JSON.stringify({ facts }, null, 2), 'utf8')
  return repo
}

const OWNED = { pattern: 'MAGIC_VALUE', scope: 'js', file: 'js/a.js', why: 'fixture' }

const CASES = [
  { want: 'BLOCK', why: 'a SECOND copy appears in another file',
    repo: () => makeRepo({ 'a.js': 'const x = MAGIC_VALUE', 'b.js': 'const y = MAGIC_VALUE' }, { f: OWNED }) },

  { want: 'BLOCK', why: 'a second copy in the SAME file -- one file is not the same as one definition',
    repo: () => makeRepo({ 'a.js': 'const x = MAGIC_VALUE\nconst y = MAGIC_VALUE' }, { f: OWNED }) },

  { want: 'BLOCK', why: 'the definition MOVED to a different file, still exactly one of them',
    repo: () => makeRepo({ 'a.js': 'const x = 1', 'b.js': 'const y = MAGIC_VALUE' }, { f: OWNED }) },

  { want: 'BLOCK', why: 'the pattern matches NOTHING -- a silently dead entry must refuse, not pass',
    repo: () => makeRepo({ 'a.js': 'const x = 1' }, { f: OWNED }) },

  { want: 'BLOCK', why: 'an EMPTY registry is a checker with nothing to check',
    repo: () => makeRepo({ 'a.js': 'const x = MAGIC_VALUE' }, {}) },

  { want: 'BLOCK', why: 'a registry entry naming a file that is not in scope is a broken registry',
    repo: () => makeRepo({ 'a.js': 'const x = MAGIC_VALUE' }, { f: { ...OWNED, file: 'js/ghost.js' } }) },

  { want: 'BLOCK', why: 'an unknown scope is a broken registry, not a pass',
    repo: () => makeRepo({ 'a.js': 'const x = MAGIC_VALUE' }, { f: { ...OWNED, scope: 'nonsense' } }) },

  { want: 'PASS', why: 'exactly one definition, in the file that owns it',
    repo: () => makeRepo({ 'a.js': 'const x = MAGIC_VALUE', 'b.js': 'const y = 1' }, { f: OWNED }) },

  { want: 'PASS', why: 'several facts, each single-sourced in its own file',
    repo: () => makeRepo({ 'a.js': 'MAGIC_VALUE', 'b.js': 'OTHER_VALUE' },
      { f: OWNED, g: { pattern: 'OTHER_VALUE', scope: 'js', file: 'js/b.js', why: 'fixture' } }) },

  { want: 'PASS', why: 'a BOM must not hide a definition on line 1 and turn it into a NOT FOUND',
    repo: () => makeRepo({ 'a.js': '﻿MAGIC_VALUE' }, { f: OWNED }) },

  { want: 'PASS', why: 'a regex pattern with escapes works, not just a literal',
    repo: () => makeRepo({ 'a.js': 'return w * (1 + r / 30)' },
      { f: { pattern: '1 \\+ r / 30', scope: 'js', file: 'js/a.js', why: 'fixture' } }) }
]

let failures = 0
for (const [i, c] of CASES.entries()) {
  const repo = c.repo()
  let exit = 0
  let out = ''
  try {
    out = execFileSync(process.execPath, [CHECK],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SINGLE_REPO: repo } })
  } catch (err) {
    exit = err.status
    out = (err.stdout || '') + (err.stderr || '')
  }
  const got = exit === 0 ? 'PASS' : 'BLOCK'
  if (got !== c.want) {
    failures++
    console.log(`  [${i}] want ${c.want}, got ${got} -- ${c.why}`)
    console.log(out.split('\n').map(l => `      ${l}`).join('\n'))
  }
  rmSync(repo, { recursive: true, force: true })
}

const blocks = CASES.filter(c => c.want === 'BLOCK').length
if (!blocks || blocks === CASES.length) {
  console.log('  self-test is one-sided -- it must contain both BLOCK and PASS cases')
  process.exit(1)
}
if (failures) {
  console.log(`  ${failures} of ${CASES.length} self-test cases misbehaved.`)
  process.exit(1)
}
console.log(`  check-single-source self-test: ${CASES.length} cases behaved (${blocks} must-block, ${CASES.length - blocks} must-pass).`)
process.exit(0)
