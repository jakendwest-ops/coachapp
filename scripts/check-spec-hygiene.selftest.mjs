#!/usr/bin/env node
/**
 * Proves check-spec-hygiene.mjs counts a multi-line chain correctly, refuses a rise, and cannot
 * report a clean sweep by looking at nothing.
 *
 * The multi-line case is the one that matters. A `.delete()` and its `.select()` are routinely on
 * different lines:
 *
 *     await db.from('workout_templates').delete()
 *       .eq('id', id).select('id')          <- a line grep never sees this
 *
 * A checker that missed it would report correct teardown as unchecked, and this rule covers 366 call
 * sites — a false-positive rate there would bury the real signal immediately. That case is a PASS
 * below, and it is why the chain walker is shared with rule 2 rather than reinvented.
 *
 * Run: node scripts/check-spec-hygiene.selftest.mjs      (exit 1 = a case misbehaved)
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-spec-hygiene.mjs')

function makeRepo (specs, { noTestsDir = false } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'spechyg-selftest-'))
  if (!noTestsDir) {
    mkdirSync(join(repo, 'tests'))
    for (const [n, src] of Object.entries(specs)) writeFileSync(join(repo, 'tests', n), src, 'utf8')
  }
  return repo
}

const CASES = [
  // -- must BLOCK ------------------------------------------------------------
  { want: 'BLOCK', why: 'one MORE unchecked delete than the baseline allows',
    env: { SPEC_HYGIENE_BASELINE: '0' },
    specs: { 'a.spec.js': "await db.from('clients').delete().eq('id', id)\n" } },

  { want: 'BLOCK', why: 'a scan finding NO deletes at all is a broken scan, not a clean bill of health',
    env: { SPEC_HYGIENE_BASELINE: '0' },
    specs: { 'a.spec.js': "test('nothing to clean up', () => {})\n" } },

  { want: 'BLOCK', why: 'no tests/ directory must refuse rather than report zero',
    env: { SPEC_HYGIENE_BASELINE: '0' },
    specs: {},
    opts: { noTestsDir: true } },

  { want: 'BLOCK', why: 'a non-numeric baseline must refuse -- NaN comparisons pass silently',
    env: { SPEC_HYGIENE_BASELINE: 'abc' },
    specs: { 'a.spec.js': "await db.from('clients').delete().eq('id', id)\n" } },

  // -- must PASS -------------------------------------------------------------
  { want: 'PASS', why: '.select() on the SAME line as the delete',
    env: { SPEC_HYGIENE_BASELINE: '0' },
    specs: { 'a.spec.js': "const { data } = await db.from('clients').delete().eq('id', id).select('id')\nexpect(data.length).toBe(1)\n" } },

  { want: 'PASS', why: '.select() on a CONTINUATION line -- the case a line grep cannot see',
    env: { SPEC_HYGIENE_BASELINE: '0' },
    specs: { 'a.spec.js': "const { data } = await db.from('workout_templates').delete()\n  .eq('id', id)\n  .select('id')\nexpect(data).toHaveLength(1)\n" } },

  { want: 'PASS', why: 'a chain resuming after COMMENT lines -- this codebase annotates mid-chain',
    env: { SPEC_HYGIENE_BASELINE: '0' },
    specs: { 'a.spec.js': "const { data } = await db.from('programs').delete()\n  // anchored on the id we captured at setup\n  .eq('id', id)\n  .select('id')\nexpect(data.length).toBe(1)\n" } },

  { want: 'PASS', why: 'a delete inside a COMMENT is documentation, not a delete',
    env: { SPEC_HYGIENE_BASELINE: '0' },
    specs: { 'a.spec.js': "// await db.from('clients').delete().eq('id', id)\nconst { data } = await db.from('clients').delete().eq('id', x).select('id')\nexpect(data.length).toBe(1)\n" } },

  { want: 'PASS', why: 'exactly AT the baseline -- the ratchet forbids rising, not existing',
    env: { SPEC_HYGIENE_BASELINE: '1' },
    specs: { 'a.spec.js': "await db.from('clients').delete().eq('id', id)\n" } },

  { want: 'PASS', why: 'BELOW the baseline passes, with a note asking for it to be lowered',
    env: { SPEC_HYGIENE_BASELINE: '5' },
    specs: { 'a.spec.js': "const { data } = await db.from('clients').delete().eq('id', id).select('id')\nexpect(data.length).toBe(1)\n" } },
  { want: 'PASS', why: 'a BOM must not hide the first line from the scan',
    env: { SPEC_HYGIENE_BASELINE: '0' },
    specs: { 'a.spec.js': "﻿const { data } = await db.from('clients').delete().eq('id', id).select('id')\nexpect(data.length).toBe(1)\n" } }
]

let failures = 0
for (const [i, c] of CASES.entries()) {
  const repo = makeRepo(c.specs, c.opts)
  let exit = 0
  let out = ''
  try {
    out = execFileSync(process.execPath, [CHECK], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, SPEC_REPO: repo, ...(c.env || {}) }
    })
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
console.log(`  check-spec-hygiene self-test: ${CASES.length} cases behaved (${blocks} must-block, ${CASES.length - blocks} must-pass).`)
process.exit(0)
