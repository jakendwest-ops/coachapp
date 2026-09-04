#!/usr/bin/env node
/**
 * Two questions no tool in this repo could answer before: does every name a module reads actually
 * exist, and does any module read a `const`/`let` that is declared in a file loading AFTER it?
 *
 * WHY. Nine files share one global scope with no module system, loaded as classic scripts in a fixed
 * order from index.html. Twenty bindings cross file boundaries. Five of those are mutable and written
 * from a file other than the one that declares them (`_runner` is declared in app-workouts.js and
 * referenced 259 times in app-runner.js). Three backward reads are unguarded, and four `typeof x !==
 * 'undefined'` shields already exist elsewhere in the source -- which is the proof that this has bitten
 * before. It fails silently: an empty <select>, a chart that never draws, no error anywhere.
 *
 * A top-level `function` is fine to read backwards: it becomes a property of the global object during
 * that script's evaluation, and the call happens later, from an event handler. A top-level `const` or
 * `let` is NOT -- it is a lexical binding in the script's own scope, and an earlier script that touches
 * it at LOAD time hits the temporal dead zone. Even read from inside a function it is fragile, because
 * nothing records the ordering constraint anywhere but index.html.
 *
 * SCOPE ANALYSIS IS DELIBERATELY APPROXIMATE, and errs toward silence.
 *
 *   Every name bound ANYWHERE in a file -- top-level, function parameter, loop variable, catch param,
 *   destructured property -- is treated as declared for the WHOLE of that file. That over-counts
 *   declarations, so this checker UNDER-reports: a genuine undeclared reference is missed if some
 *   unrelated function in the same file happens to bind that name.
 *
 * That is the correct direction to be wrong in. A checker that flags correct code gets switched off,
 * and this project has that scar -- three shell sub-checks guarding its most-shipped bug class turned
 * out to report four violations on a clean tree, every one a false positive. Silence on a real problem
 * costs one missed finding; a false refusal costs the gate.
 *
 * Usage:  node scripts/check-references.mjs [--verbose]
 *         Reads script order from index.html. exit 0 = clean, exit 1 = findings.
 */

import { readFileSync } from 'node:fs'
import { readBaseline } from './lib/baseline.mjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as acorn from 'acorn'
import * as walk from 'acorn-walk'

// REFS_REPO exists ONLY so the self-test can point this at a throwaway fixture tree with its own
// index.html and js/ files. The same seam the guardrails self-test uses (GUARDRAILS_REPO) -- without
// it the self-test would have to run against the real repo, which makes it a tautology: it could only
// ever confirm today's answer, never prove the checker can produce a different one.
const REPO = process.env.REFS_REPO || join(dirname(fileURLToPath(import.meta.url)), '..')
const VERBOSE = process.argv.includes('--verbose')

/** Script order from index.html -- never hardcoded, because the order IS the fact under test. */
function scriptOrder () {
  const html = readFileSync(join(REPO, 'index.html'), 'utf8').replace(/^﻿/, '')
  const files = [...html.matchAll(/<script\s+src="(js\/[a-zA-Z0-9._-]+\.js)\?v=\d+"/g)].map(m => m[1])
  if (!files.length) throw new Error('check-references: no <script src="js/..."> tags found in index.html')
  return files
}

// Names available without being declared in js/. Kept explicit rather than pulled from a package,
// so that adding one is a visible decision in a diff.
const GLOBALS = new Set([
  // language
  'undefined', 'NaN', 'Infinity', 'globalThis', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Symbol', 'BigInt', 'Math', 'JSON', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError',
  'SyntaxError', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'Function',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'escape', 'unescape', 'structuredClone', 'queueMicrotask',
  'Intl', 'ArrayBuffer', 'Uint8Array', 'Int32Array', 'Float64Array', 'DataView', 'TextEncoder',
  'TextDecoder', 'AbortController', 'AbortSignal', 'URL', 'URLSearchParams', 'Blob', 'File',
  'FileReader', 'FormData', 'Headers', 'Request', 'Response', 'Image', 'Audio', 'Option',
  // DOM / BOM
  'window', 'document', 'navigator', 'location', 'history', 'screen', 'localStorage',
  'sessionStorage', 'console', 'alert', 'confirm', 'prompt', 'fetch', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle',
  'matchMedia', 'performance', 'crypto', 'CustomEvent', 'Event', 'MutationObserver',
  'IntersectionObserver', 'ResizeObserver', 'DOMParser', 'HTMLElement', 'Node', 'NodeList', 'Element',
  'atob', 'btoa', 'open', 'close', 'print', 'scrollTo', 'addEventListener', 'removeEventListener',
  // third-party globals loaded by <script> in index.html, not by js/
  'supabase', 'Chart',
  // Web Speech API -- app-runner.js uses it for the rest-timer announcements.
  'SpeechSynthesisUtterance', 'speechSynthesis'
])

const files = scriptOrder()
const order = new Map(files.map((f, i) => [f, i]))

/** Names bound anywhere in a file (see the approximation note in the header). */
function collectBindings (ast, out) {
  const addPattern = (node) => {
    if (!node) return
    switch (node.type) {
      case 'Identifier': out.add(node.name); break
      case 'ObjectPattern': node.properties.forEach(p =>
        addPattern(p.type === 'RestElement' ? p.argument : p.value)); break
      case 'ArrayPattern': node.elements.forEach(addPattern); break
      case 'AssignmentPattern': addPattern(node.left); break
      case 'RestElement': addPattern(node.argument); break
    }
  }
  walk.full(ast, (node) => {
    switch (node.type) {
      case 'VariableDeclarator': addPattern(node.id); break
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        if (node.id) out.add(node.id.name)
        node.params.forEach(addPattern)
        break
      case 'ClassDeclaration':
      case 'ClassExpression':
        if (node.id) out.add(node.id.name)
        break
      case 'CatchClause': addPattern(node.param); break
    }
  })
  return out
}

/** Top-level declarations only -- what is actually visible to the other eight files. */
function collectTopLevel (ast) {
  const funcs = new Set()
  const lexical = new Set()
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration' && node.id) funcs.add(node.id.name)
    else if (node.type === 'ClassDeclaration' && node.id) funcs.add(node.id.name)
    else if (node.type === 'VariableDeclaration') {
      for (const d of node.declarations) {
        if (d.id.type !== 'Identifier') continue
        if (node.kind === 'var') funcs.add(d.id.name)     // var IS a global property, like function
        else lexical.add(d.id.name)
      }
    }
  }
  return { funcs, lexical }
}

/** `window.foo = …` anywhere -- a runtime registration, globally visible from then on. */
function collectWindowAssignments (ast, out) {
  walk.full(ast, (node) => {
    if (node.type !== 'AssignmentExpression') return
    const l = node.left
    if (l.type === 'MemberExpression' && !l.computed &&
        l.object.type === 'Identifier' && (l.object.name === 'window' || l.object.name === 'globalThis') &&
        l.property.type === 'Identifier') out.add(l.property.name)
  })
  return out
}

/** Identifiers in REFERENCE position -- not property keys, not binding sites, not labels.
 *  Also records which names appear as the operand of `typeof`, because
 *  `typeof PERF_CATEGORIES !== 'undefined' ? PERF_CATEGORIES : []` is the shield this codebase
 *  already writes in three places, and a shielded backward read behaves very differently from a bare
 *  one: it does not throw, it quietly yields the fallback. That is WORSE to debug, not better --
 *  an empty <select> with no error anywhere -- so both are reported, but labelled apart. */
function collectReferences (ast) {
  const refs = new Map()                                  // name -> first line seen
  const shielded = new Set()
  walk.ancestor(ast, {
    Identifier (node, _state, ancestors) {
      const parent = ancestors[ancestors.length - 2]
      if (!parent) return
      if (parent.type === 'UnaryExpression' && parent.operator === 'typeof') shielded.add(node.name)
      switch (parent.type) {
        case 'MemberExpression':
          if (parent.property === node && !parent.computed) return
          break
        case 'Property':
          // Object-literal / pattern key. Shorthand `{ a }` has key === value === node, so this also
          // skips shorthand VALUE references -- part of the deliberate under-reporting.
          if (parent.key === node) return
          break
        case 'MethodDefinition':
        case 'PropertyDefinition':
          if (parent.key === node && !parent.computed) return
          break
        case 'VariableDeclarator':
          if (parent.id === node) return
          break
        case 'FunctionDeclaration':
        case 'FunctionExpression':
        case 'ArrowFunctionExpression':
          if (parent.id === node || parent.params.includes(node)) return
          break
        case 'ClassDeclaration':
        case 'ClassExpression':
          if (parent.id === node) return
          break
        case 'LabeledStatement':
        case 'BreakStatement':
        case 'ContinueStatement':
          if (parent.label === node) return
          break
        case 'CatchClause':
          if (parent.param === node) return
          break
        case 'AssignmentPattern':
        case 'RestElement':
        case 'ArrayPattern':
        case 'ObjectPattern':
          return
      }
      if (!refs.has(node.name)) refs.set(node.name, node.loc.start.line)
    }
  })
  return { refs, shielded }
}

const parsed = new Map()
for (const f of files) {
  const src = readFileSync(join(REPO, f), 'utf8').replace(/^﻿/, '')
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true })
  const { refs, shielded } = collectReferences(ast)
  parsed.set(f, {
    ast,
    bindings: collectBindings(ast, new Set()),
    top: collectTopLevel(ast),
    windowed: collectWindowAssignments(ast, new Set()),
    refs,
    shielded
  })
}

const globallyDeclared = new Set()
for (const { top, windowed } of parsed.values()) {
  top.funcs.forEach(n => globallyDeclared.add(n))
  top.lexical.forEach(n => globallyDeclared.add(n))
  windowed.forEach(n => globallyDeclared.add(n))
}

const undeclared = []
const backward = []

for (const f of files) {
  const { bindings, refs, shielded } = parsed.get(f)
  for (const [name, line] of refs) {
    if (bindings.has(name) || GLOBALS.has(name)) continue
    if (!globallyDeclared.has(name)) { undeclared.push({ f, line, name }); continue }
    for (const [g, p] of parsed) {
      if (order.get(g) <= order.get(f)) continue          // declared in this file or an earlier one
      if (p.top.lexical.has(name)) {
        backward.push({ f, line, name, declaredIn: g, shielded: shielded.has(name) })
        break
      }
    }
  }
}

const totalRefs = [...parsed.values()].reduce((n, p) => n + p.refs.size, 0)
console.log(`  ${files.length} modules parsed, ${totalRefs} distinct identifier references, ${globallyDeclared.size} top-level names.`)

if (VERBOSE) {
  for (const f of files) {
    const p = parsed.get(f)
    console.log(`    ${f}: ${p.top.funcs.size} fn/var, ${p.top.lexical.size} const/let, ${p.windowed.size} window.*`)
  }
}

for (const u of undeclared) {
  console.log(`    ${u.f}:${u.line}  reads '${u.name}' -- nothing declares it in any module`)
}
for (const b of backward) {
  const tag = b.shielded ? '[typeof-shielded]' : '[UNGUARDED]'
  console.log(`    ${b.f}:${b.line}  ${tag} reads '${b.name}', a const/let declared LATER in ${b.declaredIn}`)
}

let failed = false

// An undeclared reference is ALWAYS a failure -- there are none today, so this can only ever fire on
// a regression, which is the only kind of teeth worth having on a clean class.
if (undeclared.length) {
  console.log('')
  console.log('  A name nothing declares is a typo or a deleted function. It throws at the moment the')
  console.log('  line runs -- which, in an event handler, may be weeks after the commit that broke it.')
  failed = true
}

// Backward reads are a RATCHET, not a cleanup. Six exist today and Phase 5 of the refactor programme
// hoists all six into app-core.js; blocking on them now would block every push until then, which is
// how a gate gets bypassed rather than fixed. Pinned AT six, never above: a threshold set above
// current is a permit. Adding a seventh is refused today.
// readBaseline VALIDATES rather than just parsing. `Number(env ?? 6)` was the first version, and both
// comparisons below are false against NaN, so neither the refusal nor the lower-the-baseline note
// fired -- it printed "(baseline NaN)" and exited 0. See scripts/lib/baseline.mjs.
const BACKWARD_BASELINE = readBaseline('REFS_BACKWARD_BASELINE', 6)
if (backward.length > BACKWARD_BASELINE) {
  console.log('')
  console.log(`  ${backward.length} backward const/let reads, baseline is ${BACKWARD_BASELINE}. A backward read works only`)
  console.log('  because nothing touches it during load. Hoist the declaration into js/app-core.js (it')
  console.log('  loads first), or make it a `function`/`var`, which becomes a global property during')
  console.log('  evaluation and is safe to name from anywhere.')
  console.log('  A [typeof-shielded] one does not throw -- it quietly yields the fallback, so the symptom')
  console.log('  is an empty list or a missing colour with no error anywhere. That is harder to debug,')
  console.log('  not safer.')
  failed = true
} else if (backward.length < BACKWARD_BASELINE) {
  console.log(`    [note] backward reads are down to ${backward.length} from ${BACKWARD_BASELINE} -- lower BACKWARD_BASELINE.`)
}

if (failed) process.exit(1)
console.log(`  Every cross-module reference resolves; ${backward.length} backward const/let reads (baseline ${BACKWARD_BASELINE}).`)
process.exit(0)
