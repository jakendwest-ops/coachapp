#!/usr/bin/env node
/**
 * REPORT ONLY. Finds top-level functions that are near-duplicates of each other.
 *
 * It is not wired into checks.sh and it never fails a push. Phase 1 item 7 of the refactor programme
 * says so explicitly, and the reason is a scar: this project once shipped three shell sub-checks
 * guarding its most-shipped bug class which, when finally measured, reported four violations on a
 * clean tree -- every one a false positive. A near-duplicate detector is far more prone to that than a
 * grep, because "similar" is a judgement, not a fact. It earns teeth only if its false-positive rate
 * is measured and low, and never before.
 *
 * HOW IT COMPARES. Not text. Each top-level function is reduced to a token stream drawn from its AST:
 *
 *   - every node's TYPE (IfStatement, AwaitExpression, TemplateLiteral, ...) -- the shape;
 *   - every literal VALUE ('clients', 'coach_id', 12, ...) -- the vocabulary;
 *   - every member PROPERTY name (.from, .eq, .select, .full_name) -- the API surface;
 *   - identifiers are deliberately EXCLUDED, because a hand-copied function is renamed. Comparing
 *     names would mostly measure how similar two names are.
 *
 * Shape alone over-matches badly: on a codebase of render functions, everything resembles everything.
 * Adding literals and property names makes it "the same shape AND the same tables, columns and calls",
 * which is what a copy-paste sibling actually is.
 *
 * Then 4-gram shingles and Jaccard similarity. Functions below MIN_NODES are skipped -- two six-node
 * getters are identical in structure and that means nothing.
 *
 * CALIBRATION, 2026-09-03 -- 414 functions of 30+ nodes, 85,491 pairs compared, 13 pairs at >= 0.6.
 * Every one of the 13 was opened and read. Two measurements, because they give different answers:
 *
 *   Are the pairs really similar?   13 of 13, yes. ZERO false positives by that measure.
 *   Are they worth consolidating?   10 of 13. The other 3 are the show*Modal family, which the
 *                                   refactor plan deliberately leaves alone -- they genuinely do
 *                                   resemble each other, because they are all "build a form, fetch,
 *                                   toast". Correct detection, not actionable. 23% by this measure.
 *
 * The plan's condition for giving this teeth is a false-positive rate under ~10% after Phase 4. On the
 * stricter measure it is 23%, so it stays report-only -- as designed, and stated rather than quietly
 * skipped.
 *
 * Of the 10 actionable pairs, 7 are already named in the plan (four unit-conversion pairs, the picker
 * height pair, the PB/weight form pair, and one of the 1RM preview triples). THREE ARE NEW, and all
 * three are near-identical bodies differing only in element ids:
 *
 *   _toggleArchivedExerciseLibrary (app-workouts.js:907) / _toggleArchivedExercisePicks (:2046)
 *   toggleClientPhase (app-programs.js:236)              / _toggleBuilderSlot (:2159)
 *   toggleTsSet (app-workouts.js:1484)                   / setTsEffort (:1510)
 *
 * Usage:  node scripts/near-dup.mjs [--threshold 0.6] [--top 40]
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as acorn from 'acorn'
import * as walk from 'acorn-walk'

const REPO = process.env.NEARDUP_REPO || join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? dflt : Number(process.argv[i + 1])
}
const THRESHOLD = arg('--threshold', 0.6)
const TOP = arg('--top', 40)
const MIN_NODES = 30
const K = 4

function jsFiles () {
  const html = readFileSync(join(REPO, 'index.html'), 'utf8').replace(/^﻿/, '')
  const files = [...html.matchAll(/<script\s+src="(js\/[a-zA-Z0-9._-]+\.js)\?v=\d+"/g)].map(m => m[1])
  if (!files.length) throw new Error('near-dup: no <script src="js/..."> tags in index.html')
  return files
}

/** Token stream for one function node. See the header for what is in it and what is deliberately not. */
function tokenise (node) {
  const toks = []
  walk.full(node, (n) => {
    toks.push(n.type)
    if (n.type === 'Literal') toks.push(`L:${String(n.value).slice(0, 40)}`)
    if (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier') {
      toks.push(`P:${n.property.name}`)
    }
  })
  return toks
}

function shingles (toks) {
  const s = new Set()
  for (let i = 0; i + K <= toks.length; i++) s.add(toks.slice(i, i + K).join(''))
  return s
}

function jaccard (a, b) {
  let inter = 0
  const [small, large] = a.size < b.size ? [a, b] : [b, a]
  for (const x of small) if (large.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

const fns = []
for (const f of jsFiles()) {
  const src = readFileSync(join(REPO, f), 'utf8').replace(/^﻿/, '')
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true })
  for (const node of ast.body) {
    let name = null
    let body = null
    if (node.type === 'FunctionDeclaration' && node.id) { name = node.id.name; body = node }
    else if (node.type === 'VariableDeclaration') {
      for (const d of node.declarations) {
        if (d.id.type === 'Identifier' && d.init &&
            (d.init.type === 'FunctionExpression' || d.init.type === 'ArrowFunctionExpression')) {
          name = d.id.name; body = d.init
        }
      }
    }
    if (!name || !body) continue
    const toks = tokenise(body)
    if (toks.length < MIN_NODES) continue
    fns.push({ name, file: f, line: node.loc.start.line, nodes: toks.length, sh: shingles(toks) })
  }
}

const pairs = []
for (let i = 0; i < fns.length; i++) {
  for (let j = i + 1; j < fns.length; j++) {
    const score = jaccard(fns[i].sh, fns[j].sh)
    if (score >= THRESHOLD) pairs.push({ a: fns[i], b: fns[j], score })
  }
}
pairs.sort((x, y) => y.score - x.score)

console.log(`  ${fns.length} top-level functions of ${MIN_NODES}+ nodes compared (${fns.length * (fns.length - 1) / 2} pairs).`)
console.log(`  ${pairs.length} pairs at Jaccard >= ${THRESHOLD}. Showing up to ${TOP}.`)
console.log('')
for (const p of pairs.slice(0, TOP)) {
  console.log(`  ${p.score.toFixed(2)}  ${p.a.name} (${p.a.file}:${p.a.line})`)
  console.log(`        ${p.b.name} (${p.b.file}:${p.b.line})`)
}
console.log('')
console.log('  REPORT ONLY -- this never fails a push. Read a pair before believing it: two functions can')
console.log('  score high because they genuinely are copies, or because they are both a form, a fetch and')
console.log('  a toast. Only the first kind is worth consolidating.')
process.exit(0)
