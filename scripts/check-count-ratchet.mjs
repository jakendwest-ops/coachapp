#!/usr/bin/env node
/**
 * Ratchets for patterns that should only ever get rarer.
 *
 * These are not defects -- 36 hand-rolled empty states and 41 inlined `role === 'solo'` tests are not
 * bugs, they are the duplication the consolidation phases exist to remove. What a ratchet buys is that
 * the number cannot go UP while that work is in progress. Without it, a phase can spend a week
 * removing twelve copies of something while three new ones are added behind it.
 *
 * THE PATTERN LIVES IN count-baseline.json, NOT HERE. That is the lesson from scripts/style-count.sh:
 * the style-literal counting pattern was duplicated six times, one copy drifted stricter than the
 * others, and once a generator and a checker run different patterns the generator can write a baseline
 * the checker disagrees with -- failing the very commit meant to lower it cleanly. One copy, in the
 * file that also holds the counts it produced.
 *
 * Rising fails. Falling prints a note asking for the baseline to be lowered, because a baseline left
 * above the real count is a permit, not a ratchet.
 *
 * Usage:  node scripts/check-count-ratchet.mjs [--write]
 *         --write lowers the baseline to the current counts (never raises it).
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { blankComments } from './lib/comments.mjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = process.env.COUNT_REPO || join(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE = process.env.COUNT_BASELINE || join(REPO, 'scripts', 'count-baseline.json')
const WRITE = process.argv.includes('--write')

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))

/** The nine modules, in index.html order -- read, never hardcoded, so a tenth module is counted too. */
function jsFiles () {
  const html = readFileSync(join(REPO, 'index.html'), 'utf8').replace(/^﻿/, '')
  const files = [...html.matchAll(/<script\s+src="(js\/[a-zA-Z0-9._-]+\.js)\?v=\d+"/g)].map(m => m[1])
  if (!files.length) throw new Error('check-count-ratchet: no <script src="js/..."> tags in index.html')
  return files
}

function testFiles () {
  const dir = join(REPO, 'tests')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f.endsWith('.js')).map(f => join('tests', f))
}

const scopes = { js: jsFiles(), tests: testFiles() }

const results = []
for (const [name, spec] of Object.entries(baseline.counts)) {
  const files = scopes[spec.scope]
  // A readable refusal, not a stack trace. A broken baseline is an ordinary mistake to make while
  // adding a ratchet, and the person reading this output is trying to fix it.
  if (!files) {
    console.log(`  '${name}' names scope '${spec.scope}', which does not exist. Valid scopes: ${Object.keys(scopes).join(', ')}.`)
    process.exit(1)
  }
  // Rebuilt per entry: a shared `g` regex carries lastIndex between files and silently undercounts.
  const re = new RegExp(spec.pattern, 'g')
  let actual = 0
  for (const f of files) {
    // COMMENTS ARE NOT CODE. On 2026-09-04 this ratchet refused a commit because a newly written code
    // comment happened to contain the literal loading string — documentation counted as a hand-rolled
    // loading state. That is the FOURTH time a checker in this repo has counted a comment as code, so
    // the stripper is shared (scripts/lib/comments.mjs) rather than reinvented a fifth time. Every
    // baseline was re-measured against stripped source in the same commit.
    const src = blankComments(readFileSync(join(REPO, f), 'utf8').replace(/^﻿/, ''))
    actual += (src.match(re) || []).length
  }
  results.push({ name, spec, actual, files: files.length })
}

// A scope that resolved to zero files would report every count as 0 -- i.e. "everything improved" --
// and then --write would happily bake those zeros in as the new baseline, permanently disarming the
// ratchet. Refuse before any of that can happen.
for (const scope of new Set(Object.values(baseline.counts).map(s => s.scope))) {
  if (!scopes[scope].length) {
    console.log(`  scope '${scope}' matched NO files -- refusing to report counts against an empty set.`)
    process.exit(1)
  }
}

if (WRITE) {
  let lowered = 0
  for (const r of results) {
    if (r.actual < r.spec.count) { baseline.counts[r.name].count = r.actual; lowered++ }
  }
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n')
  console.log(`  lowered ${lowered} baseline(s). Counts are never raised by --write; that has to be a deliberate edit.`)
  process.exit(0)
}

const risen = results.filter(r => r.actual > r.spec.count)
const fallen = results.filter(r => r.actual < r.spec.count)

console.log(`  ${results.length} ratchets checked across ${scopes.js.length} modules and ${scopes.tests.length} specs.`)

for (const r of risen) {
  console.log(`    ${r.name}: ${r.actual}, baseline ${r.spec.count} (+${r.actual - r.spec.count})`)
  console.log(`      ${r.spec.why}`)
}
for (const r of fallen) {
  console.log(`    [note] ${r.name} is down to ${r.actual} from ${r.spec.count} -- run \`node scripts/check-count-ratchet.mjs --write\` to lock it in.`)
}

if (risen.length) {
  console.log('')
  console.log('  These counts may fall but never rise. If the new occurrence is genuinely necessary, say so')
  console.log('  in the commit message and raise the baseline in scripts/count-baseline.json deliberately --')
  console.log('  a baseline nudged up quietly is how a ratchet becomes decoration.')
  process.exit(1)
}
console.log('  No ratcheted pattern has grown.')
process.exit(0)
