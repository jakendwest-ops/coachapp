#!/usr/bin/env node
/**
 * Type-error ratchet: tsc's error count per js/ file may fall, never rise.
 *
 * jsconfig.json type-checks the nine js/ files as the browser runs them - classic scripts, one shared
 * global, index.html order, nothing emitted. On 2026-10-29 that reported 994 errors, most of them
 * window._x state and `.value` on a plain HTMLElement that nobody has declared yet. Requiring zero
 * first would mean no gate for weeks; a ratchet is a gate from day one. A NEW error in any file - a
 * typo'd function, a wrong column name, a missing argument - pushes that file's count up and fails.
 *
 * Same contract as check-count-ratchet.mjs: rising fails, falling prints a note asking for the
 * baseline to be lowered (a baseline left above the real count is a permit, not a ratchet).
 *
 * It refuses, rather than passes, when it cannot trust the run: a tsc CONFIG error, a non-zero exit
 * with nothing parseable, jsconfig's file list drifting from index.html (a dropped file's errors
 * would simply vanish), the canary (types/type-gate-canary.js) not reporting exactly its one error
 * (tsc checked nothing: checkJs off, noCheck on, an empty run), or a @ts-nocheck in js/. Each of
 * those would otherwise read as "every file improved to 0". Each @ts-ignore / @ts-expect-error in
 * js/ counts as an error, so suppressing a new error cannot keep a file's count level.
 *
 * Usage:  node scripts/check-types.mjs [--write]
 *         --write lowers fallen counts (never raises, never adds a file). With NO baseline file it
 *         seeds one AT the current measurement - the only time a count can go in above zero.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = process.env.TYPES_REPO || join(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE = process.env.TYPES_BASELINE || join(REPO, 'scripts', 'type-baseline.json')
const WRITE = process.argv.includes('--write')

const refuse = msg => { console.log(`  [FAIL] check-types: ${msg}`); process.exit(1) }

/** js/ files in index.html order -- read, never hardcoded. */
function scriptOrder () {
  const html = readFileSync(join(REPO, 'index.html'), 'utf8').replace(/^﻿/, '')
  return [...html.matchAll(/<script\s+src="(js\/[a-zA-Z0-9._-]+\.js)\?v=\d+"/g)].map(m => m[1])
}

/** jsconfig.json's files list. Strips whole-line // comments only (jsconfig allows them, JSON does not). */
function configFiles () {
  const raw = readFileSync(join(REPO, 'jsconfig.json'), 'utf8').replace(/^﻿/, '').replace(/^\s*\/\/.*$/gm, '')
  return JSON.parse(raw).files || []
}

// The canary: a file with exactly ONE deliberate type error. tsc can be told to check nothing and
// still exit 0 -- `"checkJs": false`, `"noCheck": true`, an empty run -- and then every file reads
// "improved to 0" (review, 2026-10-29: all three passed before this). A real check always reports the
// canary's one error, so its absence means tsc did not check, whatever the reason.
const CANARY = 'types/type-gate-canary.js'

function runTsc () {
  if (process.env.TYPES_TSC_OUTPUT) {
    return { out: readFileSync(process.env.TYPES_TSC_OUTPUT, 'utf8'), exit: Number(process.env.TYPES_TSC_EXIT || 0) }
  }
  const bin = join(REPO, 'node_modules', 'typescript', 'bin', 'tsc')
  if (!existsSync(bin)) refuse('typescript is not installed -- run `npm ci`.')
  const r = spawnSync(process.execPath, [bin, '-p', 'jsconfig.json', '--pretty', 'false'], { cwd: REPO, encoding: 'utf8' })
  return { out: (r.stdout || '') + (r.stderr || ''), exit: r.status ?? 1 }
}

const order = scriptOrder()
if (!order.length) refuse('no <script src="js/..."> tags found in index.html.')
const allListed = configFiles()
if (!allListed.includes(CANARY)) refuse(`jsconfig.json "files" must include the canary ${CANARY} -- without it a check that checks nothing cannot be told from a clean one.`)
const listed = allListed.filter(f => f.startsWith('js/'))
if (order.join('\n') !== listed.join('\n')) {
  refuse(`jsconfig.json "files" must list index.html's scripts in the same order.\n` +
    `    index.html:    ${order.join(', ')}\n    jsconfig.json: ${listed.join(', ')}`)
}

// The supabase-js TYPES (devDependency) must be the exact version index.html's CDN tag runs, or the
// checker validates queries against a different client from the one the browser loads.
const cdn = readFileSync(join(REPO, 'index.html'), 'utf8').match(/@supabase\/supabase-js@(\d+\.\d+\.\d+)\//)
if (!cdn) refuse('no versioned supabase-js CDN <script> in index.html (expected .../@supabase/supabase-js@X.Y.Z/...).')
const typesVer = (JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).devDependencies || {})['@supabase/supabase-js']
if (!typesVer) refuse('@supabase/supabase-js is missing from package.json devDependencies (it supplies the db types).')
if (typesVer !== cdn[1]) refuse(`package.json pins @supabase/supabase-js "${typesVer}" but index.html's CDN tag loads ${cdn[1]} -- they must be the same exact version.`)

const { out, exit } = runTsc()
const counts = Object.fromEntries(order.map(f => [f, 0]))
const linesByFile = {}
const unattributed = []
for (const line of out.split(/\r?\n/)) {
  if (/^\s/.test(line)) continue                       // tsc's indented continuation of the previous message
  const m = line.match(/^(.+?)\(\d+,\d+\): error TS\d+/)
  if (m) {
    const file = m[1].replace(/\\/g, '/')
    counts[file] = (counts[file] || 0) + 1
    ;(linesByFile[file] ||= []).push(line)
  } else if (/error TS\d+/.test(line)) unattributed.push(line)
}
if (unattributed.length) refuse(`tsc reported errors not tied to a file (config?) -- the counts cannot be trusted:\n    ${unattributed.slice(0, 10).join('\n    ')}`)
const canaryErrors = counts[CANARY] || 0
delete counts[CANARY]
if (exit !== 0 && canaryErrors === 0 && Object.values(counts).every(n => n === 0)) {
  refuse(`tsc exited ${exit} but reported no errors -- it did not run cleanly:\n    ${out.trim().split('\n').slice(0, 10).join('\n    ')}`)
}
if (canaryErrors !== 1) {
  refuse(`the canary ${CANARY} reported ${canaryErrors} errors, not exactly 1 -- tsc is not checking ` +
    `(checkJs off? noCheck? an empty run?) or the canary was edited. The counts cannot be trusted.`)
}

// Suppression comments. @ts-nocheck silences a whole file (one line turned app-runner's 115 into 0 in
// review), so it is refused outright. Each @ts-ignore / @ts-expect-error COUNTS as an error: hiding a
// new error behind one keeps the count where it was instead of letting it sit level with a new bug.
for (const file of order) {
  const src = readFileSync(join(REPO, file), 'utf8')
  if (/@ts-nocheck\b/.test(src)) refuse(`${file} contains @ts-nocheck, which silences the type check for the whole file. Remove it.`)
  counts[file] += (src.match(/@ts-(ignore|expect-error)\b/g) || []).length
}
const total = Object.values(counts).reduce((a, b) => a + b, 0)

if (!existsSync(BASELINE)) {
  if (!WRITE) refuse(`no baseline at ${BASELINE} -- seed it with --write.`)
  writeFileSync(BASELINE, JSON.stringify({ _why: 'tsc errors per js/ file; may only fall. See scripts/check-types.mjs.', counts }, null, 2) + '\n', 'utf8')
  console.log(`  check-types: seeded baseline at ${total} errors across ${order.length} files.`)
  process.exit(0)
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
const rose = []; const fell = []
for (const file of new Set([...Object.keys(base.counts), ...Object.keys(counts)])) {
  const was = base.counts[file] ?? 0; const now = counts[file] ?? 0
  if (now > was) rose.push({ file, was, now })
  else if (now < was) fell.push({ file, was, now })
}

if (WRITE && fell.length) {
  for (const { file, now } of fell) base.counts[file] = now
  writeFileSync(BASELINE, JSON.stringify(base, null, 2) + '\n', 'utf8')
  console.log(`  check-types: lowered ${fell.map(f => `${f.file} ${f.was} -> ${f.now}`).join(', ')}`)
} else if (fell.length) {
  console.log(`  check-types: improved -- ${fell.map(f => `${f.file} ${f.was} -> ${f.now}`).join(', ')}; lower the baseline: node scripts/check-types.mjs --write`)
}

if (rose.length) {
  for (const { file, was, now } of rose) {
    console.log(`  [FAIL] check-types: ${file} ${was} -> ${now} type errors. Its current errors (the new one is among them; \`npm run typecheck\` lists all):`)
    for (const l of (linesByFile[file] || []).slice(0, 15)) console.log(`      ${l}`)
  }
  process.exit(1)
}
console.log(`  check-types: ${total} type errors, none above baseline.`)
