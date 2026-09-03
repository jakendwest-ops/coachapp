#!/usr/bin/env node
/**
 * Proves check-handler-targets.mjs BLOCKS a handler naming a function that does not exist, AND stays
 * quiet on every legitimate shape this codebase actually writes.
 *
 * The second half is the whole point, and it is not hypothetical here. Two drafts of the checker got
 * this wrong before it was allowed near the gate:
 *
 *   - draft 1 knew only `function x()` and `const x = …`, so it reported app-progress.js:845 as a dead
 *     handler. That handler is correct: `window.weightChartRange` is assigned at RUNTIME (:944).
 *   - draft 1 also scanned raw source, so it reported `fn` from app-progress.js:2038, which is inside
 *     a COMMENT explaining escapeAttr. A checker that refuses correct, well-documented code is a
 *     checker that gets switched off -- this project has that scar, and has counted a comment as code
 *     twice.
 *
 * Both are PASS cases below, taken from the real files.
 *
 * Run: node scripts/check-handler-targets.selftest.mjs      (exit 1 = a case misbehaved)
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-handler-targets.mjs')

const CASES = [
  // -- must BLOCK: the class this gate exists for -----------------------------
  { want: 'BLOCK', why: 'onclick names a function that was never declared',
    src: 'function realOne(){}\nconst h = `<button onclick="ghostFunction()">x</button>`' },
  { want: 'BLOCK', why: 'the RENAME shape -- function renamed, the onclick string left behind',
    src: 'function saveNewThing(){}\nconst h = `<button onclick="saveThing()">x</button>`' },
  { want: 'BLOCK', why: 'a non-click event is covered too, not just onclick',
    src: 'const h = `<select onchange="noSuchHandler(this.value)"></select>`' },
  { want: 'BLOCK', why: 'second call in a compound handler -- the scan must not stop at the first',
    src: 'function realOne(){}\nconst h = `<button onclick="realOne(); ghostFunction()">x</button>`' },
  { want: 'BLOCK', why: 'a regex holding QUOTE characters must not derail the scanner past the handler',
    // If /['"]/ were parsed as an opening string the rest of the file is swallowed and the bad handler
    // below becomes invisible -- a false PASS, which is the worst outcome for a gate.
    src: 'const RE = /[\'"]/\nfunction realOne(){}\nconst h = `<button onclick="ghostFunction()">x</button>`' },
  { want: 'BLOCK', why: 'a // inside a string (every https:// URL) must not blank the rest of the line',
    src: 'const u = "https://example.dev/x" // trailing note\nconst h = `<button onclick="ghostFunction()">x</button>`' },
  { want: 'BLOCK', why: 'dynamic sites ABOVE the baseline -- each one is a handler this cannot verify',
    env: { HANDLER_DYNAMIC_BASELINE: '0' },
    src: 'const a = "x"\nconst h = `<button onclick="${a}">x</button>`' },

  // -- must PASS: real shapes from js/ ---------------------------------------
  { want: 'PASS', why: 'plain function declaration at column 0',
    env: { HANDLER_DYNAMIC_BASELINE: '0' },
    src: 'function saveThing(){}\nconst h = `<button onclick="saveThing()">x</button>`' },
  { want: 'PASS', why: 'const arrow at column 0 -- a lexical binding, still a legitimate handler',
    env: { HANDLER_DYNAMIC_BASELINE: '0' },
    src: 'const _togglePerfSession = (id) => {}\nconst h = `<button onclick="_togglePerfSession(1)">x</button>`' },
  { want: 'PASS', why: 'RUNTIME registration -- the real app-progress.js:944 / :845 pair',
    env: { HANDLER_DYNAMIC_BASELINE: '0' },
    src: 'function r(){ window.weightChartRange = (range) => {} }\nconst h = `<button onclick="weightChartRange(\'3M\')">x</button>`' },
  { want: 'PASS', why: 'interpolated ARGUMENT is not an interpolated handler NAME',
    env: { HANDLER_DYNAMIC_BASELINE: '0' },
    src: 'function openThing(){}\nconst id = 1\nconst h = `<button onclick="openThing(\'${id}\')">x</button>`' },
  { want: 'PASS', why: 'a handler inside a COMMENT is documentation, not code -- app-progress.js:2038',
    env: { HANDLER_DYNAMIC_BASELINE: '0' },
    src: '// e.g. onclick="fn(\'${escapeAttr(name)}\')" -- explains why escapeAttr is used here\nconst h = `<div></div>`' },
  { want: 'PASS', why: 'member calls (event.stopPropagation) are not identifiers to resolve',
    env: { HANDLER_DYNAMIC_BASELINE: '0' },
    src: 'function saveThing(){}\nconst h = `<button onclick="event.stopPropagation(); saveThing()">x</button>`' },
  { want: 'PASS', why: 'browser globals and keywords in a handler -- if (confirm(…)) is written 5 times in js/',
    env: { HANDLER_DYNAMIC_BASELINE: '0' },
    src: 'function saveThing(){}\nconst h = `<button onclick="if (confirm(\'sure?\')) saveThing()">x</button>`' },
  { want: 'PASS', why: 'dynamic sites AT the baseline pass -- the ratchet forbids rising, not existing',
    env: { HANDLER_DYNAMIC_BASELINE: '1' },
    src: 'const a = "x"\nconst h = `<button onclick="${a}">x</button>`' },
  { want: 'PASS', why: 'a BOM before a column-0 function must not hide the declaration',
    env: { HANDLER_DYNAMIC_BASELINE: '0' },
    src: '﻿function saveThing(){}\nconst h = `<button onclick="saveThing()">x</button>`' }
]

const dir = mkdtempSync(join(tmpdir(), 'handler-selftest-'))
let failures = 0

CASES.forEach((c, i) => {
  const file = join(dir, `case${i}.js`)
  writeFileSync(file, c.src, 'utf8')
  let exit = 0
  let out = ''
  try {
    out = execFileSync(process.execPath, [CHECK, file],
      { encoding: 'utf8', env: { ...process.env, ...(c.env || {}) } })
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
})

rmSync(dir, { recursive: true, force: true })

// Non-zero denominator. A CASES array that somehow ran nothing would print "all cases behaved" and
// exit 0 while asserting nothing -- the reports-success-while-doing-nothing shape.
const blocks = CASES.filter(c => c.want === 'BLOCK').length
if (!blocks || blocks === CASES.length) {
  console.log('  self-test is one-sided -- it must contain both BLOCK and PASS cases')
  process.exit(1)
}

if (failures) {
  console.log(`  ${failures} of ${CASES.length} self-test cases misbehaved.`)
  process.exit(1)
}
console.log(`  check-handler-targets self-test: ${CASES.length} cases behaved (${blocks} must-block, ${CASES.length - blocks} must-pass).`)
process.exit(0)
