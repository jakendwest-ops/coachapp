#!/usr/bin/env node
/**
 * Proves check-types.mjs refuses a RISE in type errors, tolerates a fall, and cannot be disarmed.
 *
 * The quiet ways a type ratchet becomes decoration, each a case below:
 *
 *   - tsc fails on its CONFIG (unknown option, missing file) and reports no per-file errors, so every
 *     count reads 0 and every file reads "improved". A config error must refuse, never pass.
 *   - tsc exits non-zero with nothing parseable (crashed, missing native binary): same zeros.
 *   - `--write` raising a count, or adding a file at its current count: a permit, not a ratchet.
 *   - jsconfig.json's file list drifting from index.html's script order: the checker would be typing a
 *     different program from the one the browser runs (a missing file = its errors silently vanish).
 *   - tsc's indented continuation lines being counted as extra errors (inflates the count, so a later
 *     real rise could hide inside the inflation).
 *
 * Fixtures: TYPES_REPO (index.html + jsconfig.json), TYPES_BASELINE, TYPES_TSC_OUTPUT + TYPES_TSC_EXIT
 * stand in for the real tsc run, so this self-test needs no TypeScript install.
 *
 * Run: node scripts/check-types.selftest.mjs      (exit 1 = a case misbehaved)
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-types.mjs')

function makeRepo ({ scripts = ['a.js', 'b.js'], configFiles = scripts, counts, tsc = '', exit }) {
  const repo = mkdtempSync(join(tmpdir(), 'types-selftest-'))
  writeFileSync(join(repo, 'index.html'),
    scripts.map(n => `<script src="js/${n}?v=1"></script>`).join('\n'), 'utf8')
  writeFileSync(join(repo, 'jsconfig.json'),
    '// header comment, as the real file has\n' +
    JSON.stringify({ compilerOptions: {}, files: ['types/globals.d.ts', ...configFiles.map(n => `js/${n}`)] }, null, 2), 'utf8')
  if (counts) writeFileSync(join(repo, 'baseline.json'), JSON.stringify({ _why: 'fixture', counts }, null, 2), 'utf8')
  writeFileSync(join(repo, 'tsc.txt'), tsc, 'utf8')
  const env = { TYPES_REPO: repo, TYPES_BASELINE: join(repo, 'baseline.json'), TYPES_TSC_OUTPUT: join(repo, 'tsc.txt') }
  env.TYPES_TSC_EXIT = String(exit ?? (tsc.includes('error TS') ? 2 : 0))
  return { repo, env }
}

function run ({ env }, args = []) {
  try {
    return { out: execFileSync(process.execPath, [CHECK, ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } }), exit: 0 }
  } catch (err) {
    return { out: (err.stdout || '') + (err.stderr || ''), exit: err.status }
  }
}

const err = (file, n, code = 'TS2339') =>
  Array.from({ length: n }, (_, i) => `js/${file}(${i + 1},1): error ${code}: Property 'x' does not exist on type 'Y'.`).join('\n') + '\n'

const baselineOf = ({ repo }) => JSON.parse(readFileSync(join(repo, 'baseline.json'), 'utf8')).counts

const CASES = [
  { why: 'a count that ROSE above its baseline blocks and names the file',
    repo: () => makeRepo({ counts: { 'js/a.js': 2 }, tsc: err('a.js', 3) }),
    want: r => r.exit === 1 && r.out.includes('js/a.js 2 -> 3') },

  { why: 'an equal count passes',
    repo: () => makeRepo({ counts: { 'js/a.js': 2 }, tsc: err('a.js', 2) }),
    want: r => r.exit === 0 },

  { why: 'a fall passes and asks for the baseline to be lowered',
    repo: () => makeRepo({ counts: { 'js/a.js': 2 }, tsc: err('a.js', 1) }),
    want: r => r.exit === 0 && r.out.includes('lower the baseline') },

  { why: 'a file with errors that is NOT in the baseline blocks',
    repo: () => makeRepo({ counts: { 'js/a.js': 0 }, tsc: err('b.js', 1) }),
    want: r => r.exit === 1 && r.out.includes('js/b.js 0 -> 1') },

  { why: 'indented continuation lines are not counted as errors',
    repo: () => makeRepo({ counts: { 'js/a.js': 1 }, tsc: err('a.js', 1) + "  Type 'A' is not assignable to type 'B'.\n    error TS9999 inside a message\n" }),
    want: r => r.exit === 0 },

  { why: 'a CONFIG error (no file prefix) refuses instead of reading as zero errors everywhere',
    repo: () => makeRepo({ counts: { 'js/a.js': 5 }, tsc: "error TS5023: Unknown compiler option 'nope'.\n" }),
    want: r => r.exit === 1 && r.out.includes('TS5023') },

  { why: 'tsc exiting non-zero with nothing parseable refuses',
    repo: () => makeRepo({ counts: { 'js/a.js': 5 }, tsc: 'Segmentation fault\n', exit: 3 }),
    want: r => r.exit === 1 && /reported no errors/.test(r.out) },

  { why: 'jsconfig files OUT OF index.html ORDER refuses',
    repo: () => makeRepo({ configFiles: ['b.js', 'a.js'], counts: { 'js/a.js': 0 } }),
    want: r => r.exit === 1 && r.out.includes('index.html') },

  { why: 'jsconfig MISSING a script refuses (its errors would silently vanish)',
    repo: () => makeRepo({ configFiles: ['a.js'], counts: { 'js/a.js': 0 } }),
    want: r => r.exit === 1 && r.out.includes('js/b.js') },

  { why: 'a missing baseline without --write refuses',
    repo: () => makeRepo({ tsc: err('a.js', 1) }),
    want: r => r.exit === 1 && r.out.includes('no baseline') },

  { why: '--write never RAISES a count (still blocks, baseline unchanged)',
    repo: () => makeRepo({ counts: { 'js/a.js': 2 }, tsc: err('a.js', 3) }), args: ['--write'],
    want: (r, fx) => r.exit === 1 && baselineOf(fx)['js/a.js'] === 2 },

  { why: '--write never ADDS a new file at its current count',
    repo: () => makeRepo({ counts: { 'js/a.js': 0 }, tsc: err('b.js', 1) }), args: ['--write'],
    want: (r, fx) => r.exit === 1 && !('js/b.js' in baselineOf(fx)) },

  { why: '--write LOWERS a fallen count and keeps _why',
    repo: () => makeRepo({ counts: { 'js/a.js': 2 }, tsc: err('a.js', 1) }), args: ['--write'],
    want: (r, fx) => r.exit === 0 && baselineOf(fx)['js/a.js'] === 1 &&
      JSON.parse(readFileSync(join(fx.repo, 'baseline.json'), 'utf8'))._why === 'fixture' },

  { why: '--write SEEDS at the measurement only when no baseline exists',
    repo: () => makeRepo({ tsc: err('a.js', 2) }), args: ['--write'],
    want: (r, fx) => r.exit === 0 && existsSync(join(fx.repo, 'baseline.json')) &&
      baselineOf(fx)['js/a.js'] === 2 && baselineOf(fx)['js/b.js'] === 0 }
]

let bad = 0
for (const c of CASES) {
  const fx = c.repo()
  const r = run(fx, c.args)
  const ok = c.want(r, fx)
  if (!ok) { bad++; console.log(`FAIL  ${c.why}\n      exit ${r.exit}\n${r.out.split('\n').map(l => '      ' + l).join('\n')}`) } else console.log(`ok    ${c.why}`)
  rmSync(fx.repo, { recursive: true, force: true })
}
console.log(bad ? `\n${bad} of ${CASES.length} cases misbehaved` : `\nall ${CASES.length} cases behaved`)
process.exit(bad ? 1 : 0)
