#!/usr/bin/env node
/**
 * Every inline handler must name a function that actually exists.
 *
 * WHY THIS EXISTS. This app pins 202 of its 457 functions to global scope through 402 inline
 * `onclick="saveThing(...)"` strings. That is a deliberate, accepted choice -- on a stack with no
 * module system there is no privacy to gain, and none of the bug classes this project has shipped were
 * caused by globals. But it has one real cost, and this checker is the price of keeping it:
 *
 *   a handler name inside an HTML attribute is a STRING. Rename or delete the function and nothing
 *   anywhere complains. No parser, no linter, no test. The button simply does nothing when pressed.
 *
 * The consolidation phases ahead delete duplicate functions by design, so this moves from a
 * theoretical risk to the most likely way those commits break the app. A rule saying "remember to grep
 * the onclick strings" is not a mechanism; measured on this project, 9 of 12 recent errors already had
 * a written rule against them. This refuses instead.
 *
 * WHAT COUNTS AS DECLARED. Three shapes, because all three are real here:
 *   1. `function name(...)` / `async function name(...)` at column 0.
 *   2. `const name = ...` / `let` / `var` at column 0, bound to a function or arrow.
 *   3. `window.name = ...` anywhere -- a RUNTIME registration. app-progress.js:944 does exactly this
 *      (`window.weightChartRange = (range) => {...}`) and the handler at :845 calls it. An earlier
 *      draft that knew only shapes 1 and 2 reported it as a missing handler; it is correct code.
 *
 * COMMENTS ARE NOT CODE, and this file scans with a state machine rather than a line grep for exactly
 * that reason. app-progress.js:2038 carries `onclick="fn('${escapeAttr(x)}')"` inside a comment
 * explaining escapeAttr vs escapeHtml. A naive scan reports `fn` as a missing handler -- a false
 * refusal on correct, well-documented code, which is how a checker gets switched off. This project has
 * counted a comment as code twice already.
 *
 * Usage:  node scripts/check-handler-targets.mjs index.html js/app-core.js ...
 *         exit 0 = every handler resolves; exit 1 = at least one does not.
 */

import { readFileSync } from 'node:fs'

const files = process.argv.slice(2)
if (!files.length) {
  console.log('  usage: check-handler-targets.mjs <files...>')
  process.exit(1)
}

// Dynamic handler sites: `onclick="${expr}"`, where the handler NAME is computed at render time and
// therefore cannot be resolved by reading the source. Seven of them, measured 2026-09-03:
//   app-dashboard.js:425, app-calendar-goals.js:134, app-workouts.js:602/1521/1894,
//   app-runner.js:685/1578 -- hero-card actions, a pill builder, and two confirm buttons.
// Pinned AT the measurement, never above it: a threshold set above current is a permit, not a ratchet.
// The count may FALL (a consolidation that removes one is a good thing and prints a note); it may not
// RISE, because each new one is another handler this checker cannot verify.
// Overridable ONLY so the self-test can drive both sides of the comparison against its own small
// fixtures. checks.sh never sets it, so the real run always uses the measured 7.
const DYNAMIC_BASELINE = Number(process.env.HANDLER_DYNAMIC_BASELINE ?? 7)

// Placeholder for a `${...}` interpolation. A SPACE was tried first and is wrong: it is
// indistinguishable from ordinary spacing inside the attribute, so the dynamic test would be keying on
// whitespace rather than on an interpolation. This character cannot occur in the source.
const MARK = "\u0000"

// Callable from a handler without being one of this app's functions.
const BROWSER_GLOBALS = new Set([
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame',
  'alert', 'confirm', 'prompt', 'fetch', 'Number', 'String', 'Boolean', 'Array', 'Object',
  'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent', 'Date', 'Math', 'JSON'
])

// `if (...)`, `return (...)`, `typeof (...)` all look like a call to an identifier-followed-by-paren
// scan. Excluded as KEYWORDS rather than smuggled into the globals list, so a real finding is never
// explained to the reader as "a browser global".
const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'new', 'do', 'else', 'function',
  'delete', 'void', 'in', 'of', 'await', 'yield', 'throw', 'case'
])

const HANDLER_ATTR =
  /\bon(click|change|input|submit|keyup|keydown|keypress|blur|focus|mouseenter|mouseleave|touchstart|touchend|touchmove|error|load)\s*=\s*(["'])([\s\S]*?)\2/gi

/**
 * Blank out comments, preserving every other byte and all offsets so line numbers stay exact.
 *
 * Tracks string, template-literal and regex-literal state, because the naive version is worse than
 * useless here: `//` appears inside every https:// URL in the source, and a regex like /['"]/ would
 * open a phantom string that swallows the rest of the file. The regex-vs-division call uses the
 * standard "what was the last meaningful character" heuristic -- a `/` right after ( , = : [ ! & | ?
 * { } ; or an operator starts a regex; after an identifier or `)` it is division.
 *
 * Strings and template literals are SKIPPED, not blanked: the handler attributes this file is looking
 * for live inside template literals, so blanking them would leave nothing to scan.
 */
function blankComments (src) {
  const out = src.split('')
  const n = src.length
  let i = 0
  let prev = ''
  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') { out[i] = ' '; i++ }
      continue
    }
    if (c === '/' && c2 === '*') {
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] !== '\n') out[i] = ' '; i++ }
      if (i < n) { out[i] = ' '; out[i + 1] = ' '; i += 2 }
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      i++
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === c) { i++; break }
        i++
      }
      prev = c
      continue
    }
    if (c === '/' && /[(,=:[!&|?{};+\-*%~^\n]/.test(prev || '\n')) {
      i++
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === '[') { while (i < n && src[i] !== ']') { if (src[i] === '\\') i++; i++ } }
        if (src[i] === '/' || src[i] === '\n') { i++; break }
        i++
      }
      continue
    }
    if (!/\s/.test(c)) prev = c
    i++
  }
  return out.join('')
}

const declared = new Set()
const sources = new Map()

for (const f of files) {
  // BOM-stripped: three of the nine modules open with a `function` on line 1 behind a BOM, and a
  // ^-anchored scan misses every declaration in them otherwise.
  const raw = readFileSync(f, 'utf8').replace(/^﻿/, '')
  const code = blankComments(raw)
  sources.set(f, code)
  for (const m of code.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/gm)) declared.add(m[1])
  for (const m of code.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:function\b|\(|[A-Za-z_$][A-Za-z0-9_$]*\s*=>)/gm)) declared.add(m[1])
  for (const m of code.matchAll(/\bwindow\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g)) declared.add(m[1])
}

const DYNAMIC_RE = new RegExp(`(^|[;\\s])${MARK}\\s*(\\(|;|$)`)
const CALL_RE = new RegExp(`(^|[^.\\w$${MARK}])([A-Za-z_$][A-Za-z0-9_$]*)\\s*\\(`, 'g')

const findings = []
const dynamic = []
let attrCount = 0

for (const [f, code] of sources) {
  const lineOf = (o) => code.slice(0, o).split('\n').length
  for (const m of code.matchAll(HANDLER_ATTR)) {
    attrCount++
    const body = m[3]
    // Collapse `${...}` (one level of nesting, which covers every case here) so an interpolated
    // ARGUMENT -- onclick="openThing('${id}')" -- is never mistaken for an interpolated HANDLER NAME.
    const stripped = body.replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, MARK)
    if (DYNAMIC_RE.test(stripped.trim())) { dynamic.push(`${f}:${lineOf(m.index)}`); continue }
    for (const c of stripped.matchAll(CALL_RE)) {
      const name = c[2]
      if (KEYWORDS.has(name) || BROWSER_GLOBALS.has(name) || declared.has(name)) continue
      findings.push({ file: f, line: lineOf(m.index), name, snippet: body.slice(0, 110) })
    }
  }
}

// A scan that matched nothing would report "all clear" while checking nothing -- the failure mode this
// project has shipped repeatedly. Say the denominator out loud so a silent regex break is visible.
console.log(`  ${attrCount} inline handler attributes scanned, ${declared.size} declared names, ${dynamic.length} dynamic.`)

let failed = false

if (dynamic.length > DYNAMIC_BASELINE) {
  console.log(`    ${dynamic.length} dynamic handler sites, baseline is ${DYNAMIC_BASELINE}:`)
  for (const d of dynamic) console.log(`      ${d}`)
  console.log('    A dynamic handler name cannot be resolved from source, so this checker cannot')
  console.log('    verify it. Use a literal name, or lower the baseline deliberately with a reason.')
  failed = true
} else if (dynamic.length < DYNAMIC_BASELINE) {
  console.log(`    [note] dynamic sites are down to ${dynamic.length} from ${DYNAMIC_BASELINE} -- lower DYNAMIC_BASELINE in this file.`)
}

for (const f of findings) {
  console.log(`    ${f.file}:${f.line}  handler calls ${f.name}() -- no such top-level function`)
  console.log(`      ${f.snippet}`)
}

if (findings.length) {
  console.log('')
  console.log('  A handler name in an HTML attribute is a string: nothing checks it but this. The button')
  console.log('  is dead when pressed. Usual cause is a function renamed or deleted while an onclick=')
  console.log('  string still names the old one. If it is registered at runtime, assign it to window.<name>.')
  failed = true
}

if (!failed) console.log('  Every inline handler resolves to a declared function.')
process.exit(failed ? 1 : 0)
