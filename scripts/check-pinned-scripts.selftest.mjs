#!/usr/bin/env node
/**
 * Proves check-pinned-scripts.mjs BLOCKS the shapes index.html actually had before 2026-09-27, and stays
 * quiet on the pinned form and on local scripts.
 * Run: node scripts/check-pinned-scripts.selftest.mjs      (exit 1 = a case misbehaved)
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-pinned-scripts.mjs')
const GOOD = '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js" integrity="sha384-abc+/=" crossorigin="anonymous"></script>'

const CASES = [
  { want: 'BLOCK', why: 'the real pre-fix supabase tag: floating major, no hash',
    src: '<script src="https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js"></script>' },
  { want: 'BLOCK', why: 'floating major WITH a hash is still floating (the hash would just break on the next release)',
    src: '<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js" integrity="sha384-abc" crossorigin="anonymous"></script>' },
  { want: 'BLOCK', why: 'pinned but no integrity',
    src: '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js" crossorigin="anonymous"></script>' },
  { want: 'BLOCK', why: 'pinned + integrity but no crossorigin (SRI on a cross-origin script needs CORS mode)',
    src: '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js" integrity="sha384-abc"></script>' },
  { want: 'BLOCK', why: 'sha256 is refused -- the E2E spec requires sha384/512, and the two must agree',
    src: '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js" integrity="sha256-abc" crossorigin="anonymous"></script>' },
  { want: 'BLOCK', why: 'no version at all',
    src: '<script src="https://cdn.example.com/lib.js" integrity="sha384-abc" crossorigin="anonymous"></script>' },
  { want: 'BLOCK', why: 'one bad tag after a good one is still found',
    src: GOOD + '\n<script src="//unpkg.com/x@1/x.js"></script>' },
  { want: 'PASS', why: 'the pinned form',
    src: GOOD },
  { want: 'PASS', why: 'local scripts are not third-party',
    src: '<script src="js/app-core.js?v=39"></script>\n<script>var x = 1</script>' },
  { want: 'PASS', why: 'a floating tag inside an HTML comment is documentation, not a load',
    src: '<!-- was: <script src="https://unpkg.com/x@2/x.js"></script> -->\n' + GOOD },
]

const dir = mkdtempSync(join(tmpdir(), 'pinned-selftest-'))
let failures = 0
CASES.forEach((c, i) => {
  const file = join(dir, `case${i}.html`)
  writeFileSync(file, c.src, 'utf8')
  let exit = 0, out = ''
  try { out = execFileSync(process.execPath, [CHECK, file], { encoding: 'utf8' }) }
  catch (err) { exit = err.status; out = (err.stdout || '') + (err.stderr || '') }
  const got = exit === 0 ? 'PASS' : 'BLOCK'
  if (got !== c.want) { failures++; console.log(`  [${i}] want ${c.want}, got ${got} -- ${c.why}\n${out}`) }
})
rmSync(dir, { recursive: true, force: true })

const blocks = CASES.filter(c => c.want === 'BLOCK').length
if (!blocks || blocks === CASES.length) { console.log('  self-test is one-sided'); process.exit(1) }
if (failures) { console.log(`  ${failures} of ${CASES.length} self-test cases misbehaved.`); process.exit(1) }
console.log(`  check-pinned-scripts self-test: ${CASES.length} cases behaved (${blocks} must-block, ${CASES.length - blocks} must-pass).`)
process.exit(0)
