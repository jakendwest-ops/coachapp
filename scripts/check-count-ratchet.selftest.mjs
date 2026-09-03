#!/usr/bin/env node
/**
 * Proves check-count-ratchet.mjs refuses a RISE, tolerates a fall, and cannot be disarmed.
 *
 * A count ratchet has two quiet ways of becoming decoration, and both are cases below:
 *
 *   - the scope resolves to no files, so every count reads 0, every ratchet reads "improved", and
 *     `--write` then bakes those zeros in permanently. That is the reports-success-while-doing-nothing
 *     shape this project has shipped repeatedly, and it is the one that would be hardest to notice.
 *   - the counting regex carries `lastIndex` between files (a shared `g` regex), silently
 *     undercounting. That looks like an improvement, never like a bug. The two-file case below is
 *     built so an undercount flips the verdict from BLOCK to PASS.
 *
 * Run: node scripts/check-count-ratchet.selftest.mjs      (exit 1 = a case misbehaved)
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-count-ratchet.mjs')

function makeRepo ({ js = {}, tests = {}, counts }) {
  const repo = mkdtempSync(join(tmpdir(), 'count-selftest-'))
  mkdirSync(join(repo, 'js'))
  mkdirSync(join(repo, 'tests'))
  mkdirSync(join(repo, 'scripts'))
  for (const [n, src] of Object.entries(js)) writeFileSync(join(repo, 'js', n), src, 'utf8')
  for (const [n, src] of Object.entries(tests)) writeFileSync(join(repo, 'tests', n), src, 'utf8')
  writeFileSync(join(repo, 'index.html'),
    Object.keys(js).map(n => `<script src="js/${n}?v=1"></script>`).join('\n'), 'utf8')
  writeFileSync(join(repo, 'scripts', 'count-baseline.json'), JSON.stringify({ counts }, null, 2), 'utf8')
  return repo
}

function run (repo, args = []) {
  try {
    // stderr is PIPED, not inherited: a case that deliberately provokes an error would otherwise
    // print its stack trace straight to the terminal and read as a self-test failure when it is a
    // self-test success.
    return { out: execFileSync(process.execPath, [CHECK, ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, COUNT_REPO: repo } }), exit: 0 }
  } catch (err) {
    return { out: (err.stdout || '') + (err.stderr || ''), exit: err.status }
  }
}

const ONE = { pattern: 'needle', scope: 'js', count: 1, why: 'fixture' }

const CASES = [
  { want: 'BLOCK', why: 'a count that ROSE above its baseline',
    repo: () => makeRepo({ js: { 'a.js': 'needle needle' }, counts: { n: { ...ONE } } }) },

  { want: 'BLOCK', why: 'occurrences SPREAD ACROSS FILES are all counted -- a shared g-regex would undercount and flip this to PASS',
    repo: () => makeRepo({ js: { 'a.js': 'needle', 'b.js': 'needle' }, counts: { n: { ...ONE } } }) },

  { want: 'BLOCK', why: 'a scope matching NO files must refuse, not report a clean sweep of zeros',
    repo: () => makeRepo({ js: { 'a.js': 'needle' }, counts: { n: { ...ONE, scope: 'tests' } } }) },

  { want: 'BLOCK', why: 'an unknown scope name is a broken baseline, not a pass',
    repo: () => makeRepo({ js: { 'a.js': 'needle' }, counts: { n: { ...ONE, scope: 'nonsense' } } }) },

  { want: 'PASS', why: 'a count exactly AT its baseline',
    repo: () => makeRepo({ js: { 'a.js': 'needle' }, counts: { n: { ...ONE } } }) },

  { want: 'PASS', why: 'a count BELOW its baseline passes, with a note asking for the baseline to be lowered',
    repo: () => makeRepo({ js: { 'a.js': 'nothing here' }, counts: { n: { ...ONE, count: 5 } } }),
    expect: (out) => /down to 0 from 5/.test(out) || 'expected a lower-the-baseline note' },

  { want: 'PASS', why: 'the tests/ scope is counted separately from js/',
    repo: () => makeRepo({ js: { 'a.js': 'needle' }, tests: { 't.spec.js': 'needle needle' },
      counts: { n: { ...ONE }, t: { pattern: 'needle', scope: 'tests', count: 2, why: 'fixture' } } }) },

  { want: 'PASS', why: 'a BOM must not hide the first line from the count',
    repo: () => makeRepo({ js: { 'a.js': '﻿needle' }, counts: { n: { ...ONE } } }) },

  { want: 'PASS', why: '--write LOWERS a stale baseline',
    repo: () => makeRepo({ js: { 'a.js': 'nothing' }, counts: { n: { ...ONE, count: 5 } } }),
    args: ['--write'],
    after: (repo) => {
      const b = JSON.parse(readFileSync(join(repo, 'scripts', 'count-baseline.json'), 'utf8'))
      return b.counts.n.count === 0 || `--write should have lowered to 0, left ${b.counts.n.count}`
    } },

  { want: 'PASS', why: '--write NEVER raises a baseline -- that has to be a deliberate human edit',
    repo: () => makeRepo({ js: { 'a.js': 'needle needle needle' }, counts: { n: { ...ONE } } }),
    args: ['--write'],
    after: (repo) => {
      const b = JSON.parse(readFileSync(join(repo, 'scripts', 'count-baseline.json'), 'utf8'))
      return b.counts.n.count === 1 || `--write raised the baseline to ${b.counts.n.count}; it must stay 1`
    } }
]

let failures = 0
for (const [i, c] of CASES.entries()) {
  const repo = c.repo()
  const { out, exit } = run(repo, c.args || [])
  const got = exit === 0 ? 'PASS' : 'BLOCK'
  if (got !== c.want) {
    failures++
    console.log(`  [${i}] want ${c.want}, got ${got} -- ${c.why}`)
    console.log(out.split('\n').map(l => `      ${l}`).join('\n'))
  } else {
    for (const extra of [c.expect && c.expect(out), c.after && c.after(repo)]) {
      if (typeof extra === 'string') { failures++; console.log(`  [${i}] ${c.why}\n         ${extra}`) }
    }
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
console.log(`  check-count-ratchet self-test: ${CASES.length} cases behaved (${blocks} must-block, ${CASES.length - blocks} must-pass).`)
process.exit(0)
