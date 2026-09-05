#!/usr/bin/env node
// Proves check-fixture-tagging.mjs can actually FAIL, and does not cry wolf.
//
// A checker nobody has watched fail is indistinguishable from one that does nothing — this repo has
// had gates sit GREEN for weeks while incapable of failing. checks.sh runs this BEFORE trusting the
// checker's result, so a broken checker fails the push rather than silently passing it.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'fixture-tag-'))
const write = (name, body) => { const p = join(dir, name); writeFileSync(p, body); return p }

const run = (...files) => {
  try {
    execFileSync('node', ['scripts/check-fixture-tagging.mjs', ...files], { encoding: 'utf8' })
    return 0
  } catch (e) { return e.status }
}

let failures = 0
const check = (label, actual, expected) => {
  if (actual === expected) { console.log(`    ok   ${label}`) }
  else { console.log(`    FAIL ${label} — expected exit ${expected}, got ${actual}`); failures++ }
}

try {
  // 1. MUST FAIL: inserts rows, no tag anywhere.
  const untagged = write('untagged.spec.js',
    `test('x', async () => { await db.from('clients').insert({ full_name: 'Bob' }) })`)
  check('an untagged insert is caught', run(untagged), 1)

  // 2. MUST PASS: inserts rows, tagged.
  const tagged = write('tagged.spec.js',
    `test('x', async () => { await db.from('clients').insert({ full_name: '[E2E] Bob' }) })`)
  check('a tagged insert passes', run(tagged), 0)

  // 3. MUST PASS: a suffixed variant is still the prefix. [E2E-RLS] and friends are real and in use.
  const variant = write('variant.spec.js',
    `test('x', async () => { await db.from('clients').insert({ full_name: '[E2E-RLS] Bob' }) })`)
  check('an [E2E-…] variant passes', run(variant), 0)

  // 4. MUST PASS: a spec that never inserts is not required to tag anything. Without this the rule
  //    would flag ~47 read-only specs and get switched off — the way a checker actually dies.
  const readonly = write('readonly.spec.js',
    `test('x', async () => { const { data } = await db.from('clients').select('id') })`)
  check('a read-only spec is not flagged', run(readonly), 0)

  // 5. MUST FAIL: one bad file among good ones still fails. A per-file pass that loses the overall
  //    verdict is how a batch check goes green with a violation in it.
  check('one violation among many still fails', run(tagged, untagged, readonly), 1)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

if (failures) {
  console.log(`\n  check-fixture-tagging self-test: ${failures} case(s) FAILED — the checker cannot be trusted.\n`)
  process.exit(1)
}
console.log('  check-fixture-tagging self-test: all 5 cases behaved correctly.')
