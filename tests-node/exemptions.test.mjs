// An exemption is a CLAIM about the code, and a claim needs a check.
//
// tests/reentry-guard-2026-08-28.spec.js keeps a FROZEN_UNGUARDED list: functions that insert rows but
// are deliberately not re-entry-guarded, each with a written reason. Until now the spec asserted only
// that a reason EXISTED — never that it was true. That is how `saveWorkoutSession` sat on the list for
// months under the reason
//
//     'manual-log twin of saveRunnerSession; navigates away on success'
//
// where BOTH halves were false: the "twin" disables its button synchronously and this one has no
// disable anywhere, and `closeModal` came EIGHT awaits later. Two taps produced two workout_logs plus
// their exercises and sets. It was found by a human review reading line by line, not by any check.
//
// This file makes the mechanically-checkable claim shapes actually checked:
//
//   "internal — runs inside X"   =>  nothing user-facing may call it. If an inline handler names it,
//                                    it is an entry point and the exemption is false.
//   "confirm()-gated"            =>  a confirm() must run BEFORE the first await, or the dialog is not
//                                    the re-entry barrier it is claimed to be.
//   "one row, ..."               =>  the function must perform exactly ONE insert. This is the exact
//                                    shape that was missed: saveWorkoutSession's reason implied a
//                                    single cheap row, and it wrote three tables.
//
// The 14 "one row" reasons also carry a product judgement — that a duplicate is visible and one tap to
// delete — which is not mechanically checkable and is deliberately left to a human. The COUNT is not a
// judgement, and it is what makes the consequence small.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as acorn from 'acorn'
import * as walk from 'acorn-walk'
import { scriptOrder, REPO } from './load-app.mjs'

const SPEC = join(REPO, 'tests', 'reentry-guard-2026-08-28.spec.js')

/** name -> written reason, parsed from the spec so the two can never drift apart. */
function frozenUnguarded () {
  const src = readFileSync(SPEC, 'utf8')
  const block = /const FROZEN_UNGUARDED = \{([\s\S]*?)\n\}/.exec(src)
  if (!block) throw new Error('FROZEN_UNGUARDED not found in ' + SPEC)
  const out = new Map()
  for (const line of block[1].split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*:\s*'([^']*)'/.exec(line)
    if (m) out.set(m[1], m[2])
  }
  return out
}

/** Every top-level function in js/, by name, with its AST node and source. */
function functionIndex () {
  const byName = new Map()
  for (const rel of scriptOrder()) {
    const src = readFileSync(join(REPO, rel), 'utf8').replace(/^﻿/, '')
    const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true })
    for (const node of ast.body) {
      if (node.type === 'FunctionDeclaration' && node.id) {
        byName.set(node.id.name, { file: rel, node, line: node.loc.start.line })
      } else if (node.type === 'VariableDeclaration') {
        for (const d of node.declarations) {
          if (d.id.type === 'Identifier' && d.init &&
              (d.init.type === 'FunctionExpression' || d.init.type === 'ArrowFunctionExpression')) {
            byName.set(d.id.name, { file: rel, node: d.init, line: node.loc.start.line })
          }
        }
      }
    }
  }
  return byName
}

/** Ranges of functions nested INSIDE `fn`, so a callback's await is not mistaken for the function's own. */
function nestedRanges (fn) {
  const ranges = []
  walk.full(fn.body, (n) => {
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' ||
        n.type === 'ArrowFunctionExpression') ranges.push([n.start, n.end])
  })
  return ranges
}

const own = (ranges, node) => !ranges.some(([s, e]) => node.start >= s && node.end <= e)

/** Position of the first await the function itself performs, or Infinity. */
function firstAwaitPos (fn) {
  const ranges = nestedRanges(fn)
  let pos = Infinity
  walk.full(fn.body, (n) => {
    if (n.type === 'AwaitExpression' && own(ranges, n)) pos = Math.min(pos, n.start)
  })
  return pos
}

/** Every `.insert(` the function itself performs. */
function insertCalls (fn) {
  const ranges = nestedRanges(fn)
  const hits = []
  walk.full(fn.body, (n) => {
    if (n.type !== 'CallExpression') return
    if (n.callee.type !== 'MemberExpression' || n.callee.computed) return
    if (n.callee.property.type !== 'Identifier' || n.callee.property.name !== 'insert') return
    if (own(ranges, n)) hits.push(n.start)
  })
  return hits
}

/** Position of the first `confirm(...)` the function itself performs, or Infinity. */
function firstConfirmPos (fn) {
  const ranges = nestedRanges(fn)
  let pos = Infinity
  walk.full(fn.body, (n) => {
    if (n.type !== 'CallExpression' || !own(ranges, n)) return
    const c = n.callee
    const isConfirm = (c.type === 'Identifier' && c.name === 'confirm') ||
      (c.type === 'MemberExpression' && !c.computed && c.property.name === 'confirm')
    if (isConfirm) pos = Math.min(pos, n.start)
  })
  return pos
}

/** Every identifier called from an inline on*= handler, across index.html and js/. */
function inlineHandlerNames () {
  const ATTR = /\bon(click|change|input|submit|keyup|keydown|keypress|blur|focus|mouseenter|mouseleave|touchstart|touchend|touchmove|error|load)\s*=\s*(["'])([\s\S]*?)\2/gi
  const names = new Set()
  for (const rel of ['index.html', ...scriptOrder()]) {
    const src = readFileSync(join(REPO, rel), 'utf8').replace(/^﻿/, '')
    for (const m of src.matchAll(ATTR)) {
      const body = m[3].replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, ' ')
      for (const c of body.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) names.add(c[2])
    }
  }
  return names
}

const frozen = frozenUnguarded()
const fns = functionIndex()

describe('FROZEN_UNGUARDED — every exemption states a reason that is actually true', () => {
  test('the list is found and non-trivial', () => {
    // A regex that stopped matching would make every assertion below pass over an empty set.
    assert.ok(frozen.size >= 20, `expected 20+ exemptions, parsed ${frozen.size}`)
  })

  test('every exempted name is a function that still exists', () => {
    for (const [name] of frozen) {
      assert.ok(fns.has(name), `${name} is exempted but no top-level function by that name exists — ` +
        `the exemption is describing code that is gone`)
    }
  })

  test('"internal" exemptions are not reachable from an inline handler', () => {
    const handlers = inlineHandlerNames()
    const internal = [...frozen].filter(([, r]) => r.startsWith('internal'))
    assert.ok(internal.length >= 5, `expected several "internal" exemptions, found ${internal.length}`)
    for (const [name, reason] of internal) {
      assert.ok(!handlers.has(name),
        `${name} is exempted as "${reason}", but an inline on*= handler calls it directly — ` +
        `it IS a user-facing entry point, so the reason is false and it needs a guard`)
    }
  })

  test('the confirm-position detector can actually fire — generatePhasePeriodization is the control', () => {
    // The confirm()-gated category is EMPTY as of 2026-09-04: its only member was
    // generatePhasePeriodization, and this very check proved its reason false, so it was guarded and
    // removed. An empty category makes the assertion below vacuous, so the detector needs a live
    // control instead of a "there must be at least one" denominator — that would have forced a
    // fictional exemption back onto the list just to keep a counter happy.
    //
    // The function still exists and still has its confirm() after three awaits, so it remains a
    // perfect positive: if this stops reporting confirm-after-await, the detector is broken.
    const fn = fns.get('generatePhasePeriodization')
    assert.ok(fn, 'the control function must exist')
    const confirmAt = firstConfirmPos(fn.node)
    const awaitAt = firstAwaitPos(fn.node)
    assert.notEqual(confirmAt, Infinity, 'the control must contain a confirm() for this to mean anything')
    assert.notEqual(awaitAt, Infinity, 'the control must contain an await for this to mean anything')
    assert.ok(awaitAt < confirmAt,
      'generatePhasePeriodization should still show its confirm() AFTER its first await — if this ' +
      'flipped, either the function was restructured (good, and this control should move) or the ' +
      'position detector is broken (bad, and every confirm-gated exemption is now unchecked)')
  })

  test('"confirm()-gated" exemptions really confirm BEFORE their first await', () => {
    const gated = [...frozen].filter(([, r]) => /confirm\(\)/.test(r))
    for (const [name, reason] of gated) {
      const fn = fns.get(name)
      const confirmAt = firstConfirmPos(fn.node)
      const awaitAt = firstAwaitPos(fn.node)
      assert.notEqual(confirmAt, Infinity,
        `${name} is exempted as "${reason}" but calls no confirm() at all`)
      assert.ok(confirmAt < awaitAt,
        `${name} is exempted as "${reason}", but its confirm() is not reached SYNCHRONOUSLY from the ` +
        `gesture — an await runs first (await at ${awaitAt}, confirm at ${confirmAt}). A confirm() ` +
        `blocks the main thread only once it opens, so two rapid taps both get in flight, both reach ` +
        `their own dialog, and accepting both runs the body twice. The dialog is a barrier against a ` +
        `second CLICK, not against a second INVOCATION already past the first await.`)
    }
  })

  test('"one row" exemptions perform exactly ONE insert', () => {
    // The precise shape that was missed. saveWorkoutSession's reason implied a single cheap row while
    // it wrote workout_logs, workout_log_exercises AND workout_log_sets — so a double tap duplicated
    // an entire session, not one deletable line.
    const oneRow = [...frozen].filter(([, r]) => /one row/.test(r))
    assert.ok(oneRow.length >= 10, `expected the bulk of the list to be "one row", found ${oneRow.length}`)
    for (const [name, reason] of oneRow) {
      const fn = fns.get(name)
      const inserts = insertCalls(fn.node)
      assert.ok(inserts.length <= 1,
        `${name} (${fn.file}:${fn.line}) is exempted as "${reason}" but performs ${inserts.length} ` +
        `inserts. A double tap therefore duplicates more than the single deletable row the exemption ` +
        `claims — this is the saveWorkoutSession shape exactly.`)
    }
  })

  test('the insert counter can actually count — saveWorkoutSession really does write three tables', () => {
    // A non-zero denominator for the test above. If insertCalls() silently returned [] for everything,
    // every "one row" claim would pass vacuously. saveWorkoutSession is the known positive: it is the
    // function whose multi-insert body made the original exemption dangerous, and it is now guarded.
    const fn = fns.get('saveWorkoutSession')
    assert.ok(fn, 'saveWorkoutSession must exist for this control to mean anything')
    const n = insertCalls(fn.node).length
    assert.ok(n >= 3, `expected saveWorkoutSession to perform 3+ inserts, counted ${n} — ` +
      `if this is 0 the counter is broken and every "one row" assertion above is vacuous`)
  })
})
