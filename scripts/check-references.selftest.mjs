#!/usr/bin/env node
/**
 * Proves check-references.mjs can produce a DIFFERENT answer than the one the real tree gives.
 *
 * Without the REFS_REPO seam this self-test would be a tautology -- running the checker against the
 * repo it already passes on, and calling that a proof. Every case below builds a throwaway tree with
 * its own index.html and js/ files, so both directions are driven deliberately.
 *
 * The PASS half carries the weight. The distinction the checker turns on is subtle and easy to get
 * backwards: a top-level `function` or `var` read from an EARLIER file is completely fine (both become
 * properties of the global object while that script evaluates), while a top-level `const`/`let` is
 * not (it is a lexical binding in the script's own scope). A checker that flagged the safe shapes
 * would report the whole codebase and be switched off within a day.
 *
 * Run: node scripts/check-references.selftest.mjs      (exit 1 = a case misbehaved)
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-references.mjs')

// Each case is { want, why, files: { 'a.js': src, 'b.js': src } } in LOAD ORDER, plus optional env.
const CASES = [
  // -- must BLOCK -------------------------------------------------------------
  { want: 'BLOCK', why: 'a name nothing declares anywhere -- a typo, or a deleted function',
    files: { 'a.js': 'function go(){ return ghostHelper() }' } },
  { want: 'BLOCK', why: 'the backward const read: an EARLIER file reads a const declared LATER',
    env: { REFS_BACKWARD_BASELINE: '0' },
    files: { 'a.js': 'function go(){ return LATER_CONST }', 'b.js': 'const LATER_CONST = 1' } },
  { want: 'BLOCK', why: 'backward `let` is the same hazard as backward `const`',
    env: { REFS_BACKWARD_BASELINE: '0' },
    files: { 'a.js': 'function go(){ return laterLet }', 'b.js': 'let laterLet = 1' } },
  { want: 'BLOCK', why: 'a typeof shield does NOT make it safe -- it makes the failure silent',
    env: { REFS_BACKWARD_BASELINE: '0' },
    files: { 'a.js': "function go(){ return typeof L !== 'undefined' ? L : [] }", 'b.js': 'const L = 1' } },
  { want: 'BLOCK', why: 'one MORE backward read than the baseline allows -- the ratchet',
    env: { REFS_BACKWARD_BASELINE: '1' },
    files: { 'a.js': 'function go(){ return C1 + C2 }', 'b.js': 'const C1 = 1\nconst C2 = 2' } },

  // -- must PASS: the shapes this codebase legitimately writes -----------------
  { want: 'PASS', why: 'FORWARD read -- a later file reading an earlier const is the normal case',
    files: { 'a.js': 'const EARLY = 1', 'b.js': 'function go(){ return EARLY }' } },
  { want: 'PASS', why: 'backward read of a FUNCTION -- hoisted onto the global object, safe',
    files: { 'a.js': 'function go(){ return laterFn() }', 'b.js': 'function laterFn(){ return 1 }' } },
  { want: 'PASS', why: 'backward read of a `var` -- also a global property, also safe',
    files: { 'a.js': 'function go(){ return laterVar }', 'b.js': 'var laterVar = 1' } },
  { want: 'PASS', why: 'window.x = … registered at runtime -- app-progress.js:944 does exactly this',
    files: { 'a.js': 'function go(){ return weightChartRange(1) }',
      'b.js': 'function r(){ window.weightChartRange = (n) => n }' } },
  { want: 'PASS', why: 'a locally bound name is not a cross-module reference',
    files: { 'a.js': 'function go(){ const tmp = 1; return tmp }' } },
  { want: 'PASS', why: 'a member PROPERTY is not an identifier to resolve -- obj.ghost is fine',
    files: { 'a.js': 'function go(obj){ return obj.ghostProperty }' } },
  { want: 'PASS', why: 'an object-literal KEY is not a reference either',
    files: { 'a.js': 'function go(){ return { ghostKey: 1 } }' } },
  { want: 'PASS', why: 'browser globals need no declaration',
    files: { 'a.js': 'function go(){ document.getElementById("x"); return JSON.stringify(localStorage) }' } },
  { want: 'PASS', why: 'destructured and defaulted parameters count as bindings',
    files: { 'a.js': 'function go({ a, b = 2 }, [c], ...rest){ return a + b + c + rest.length }' } },
  { want: 'PASS', why: 'a catch parameter is a binding',
    files: { 'a.js': 'function go(){ try { return 1 } catch (err) { return err } }' } },
  { want: 'PASS', why: 'backward reads AT the baseline pass -- the ratchet forbids rising, not existing',
    env: { REFS_BACKWARD_BASELINE: '1' },
    files: { 'a.js': 'function go(){ return C1 }', 'b.js': 'const C1 = 1' } },
  { want: 'PASS', why: 'a BOM before a column-0 declaration must not hide it',
    files: { 'a.js': 'function go(){ return laterFn() }', 'b.js': '﻿function laterFn(){ return 1 }' } }
]

let failures = 0

CASES.forEach((c, i) => {
  const repo = mkdtempSync(join(tmpdir(), 'refs-selftest-'))
  mkdirSync(join(repo, 'js'))
  const names = Object.keys(c.files)
  for (const n of names) writeFileSync(join(repo, 'js', n), c.files[n], 'utf8')
  // Script order is read from index.html by design, so the fixture must carry a real one -- including
  // the ?v= cache-bust, which the order regex requires.
  writeFileSync(join(repo, 'index.html'),
    names.map(n => `<script src="js/${n}?v=1"></script>`).join('\n'), 'utf8')

  let exit = 0
  let out = ''
  try {
    out = execFileSync(process.execPath, [CHECK],
      { encoding: 'utf8', env: { ...process.env, REFS_REPO: repo, ...(c.env || {}) } })
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
})

// Non-zero denominator, and both directions present. A one-sided self-test is indistinguishable from
// a dead one -- the exact failure this project shipped in three shell sub-checks.
const blocks = CASES.filter(c => c.want === 'BLOCK').length
if (!blocks || blocks === CASES.length) {
  console.log('  self-test is one-sided -- it must contain both BLOCK and PASS cases')
  process.exit(1)
}

if (failures) {
  console.log(`  ${failures} of ${CASES.length} self-test cases misbehaved.`)
  process.exit(1)
}
console.log(`  check-references self-test: ${CASES.length} cases behaved (${blocks} must-block, ${CASES.length - blocks} must-pass).`)
process.exit(0)
