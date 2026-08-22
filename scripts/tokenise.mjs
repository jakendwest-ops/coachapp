#!/usr/bin/env node
// Rewrites style literals to var(--token, <literal>) INSIDE style="..." attributes only.
//
// The scope rule is the safety property. js/app-progress.js:2303 passes colours to
// Chart.js on a canvas, which does not resolve var() -- substituting there would
// silently strip the chart's colours. Of 176 hex in js/, 116 are CSS declarations and
// 60 are JavaScript string values; only the former are in scope.
//
// EXACT-VALUE ONLY. A value with no exactly-matching token is REPORTED, never rounded.
// That is what makes "zero visual change" a property of this script rather than a hope.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const TYPE = {
  '9px': '--text-2xs', '10px': '--text-xs', '11px': '--text-sm', '12px': '--text-md',
  '13px': '--text-base', '14px': '--text-lg', '16px': '--text-xl', '18px': '--text-2xl',
  '20px': '--text-3xl', '24px': '--text-4xl', '32px': '--text-display',
  '7px': '--legacy-text-7', '8px': '--legacy-text-8', '10.5px': '--legacy-text-10-5',
  '11.5px': '--legacy-text-11-5', '12.5px': '--legacy-text-12-5', '13.5px': '--legacy-text-13-5',
  '15px': '--legacy-text-15', '17px': '--legacy-text-17', '19px': '--legacy-text-19',
  '22px': '--legacy-text-22', '26px': '--legacy-text-26', '30px': '--legacy-text-30',
  '40px': '--legacy-text-40', '64px': '--legacy-text-64'
}
const RADIUS = {
  '4px': '--radius-xs', '8px': '--radius-sm', '10px': '--radius', '12px': '--radius-md',
  '14px': '--radius-lg', '20px': '--radius-xl',
  '99px': '--radius-full', '100px': '--radius-full', '999px': '--radius-full',
  '2px': '--legacy-radius-2', '3px': '--legacy-radius-3', '5px': '--legacy-radius-5',
  '7px': '--legacy-radius-7', '9px': '--legacy-radius-9', '16px': '--legacy-radius-16',
  '18px': '--legacy-radius-18', '24px': '--legacy-radius-24'
}
const COLOUR = {
  '#ef4444': '--danger', '#f59e0b': '--warning', '#10b981': '--success', '#6366f1': '--accent'
}
// '#22c55e' (14 uses) was in this map pointing at --success and IS NOT ANYMORE. --success's
// real value in css/main.css is #10b981 -- #22c55e was never it. That earlier entry would
// have converted every #22c55e site to var(--success, #22c55e), which resolves to #10b981 at
// runtime (the fallback only ever applies when the variable is undefined, which it never is
// here) -- a real, visible colour shift the round-trip verifier is structurally unable to
// catch, because it only proves the fallback literal matches the original, never the token's
// resolved value. Caught by reading Step 4's dry-run output, not by the map being "obviously"
// wrong. #22c55e now has no exact token and is correctly left alone by ASSERT_MAPS below and
// by the codemod itself.
//
// '#9ca3af' is deliberately NOT mapped even though it exactly equals --sidebar-text: a
// location-specific token must not silently absorb a general-purpose grey used elsewhere --
// a future sidebar-only restyle would otherwise bleed into unrelated UI. Value-identical is
// not meaning-identical.

const MAIN_CSS = join(dirname(fileURLToPath(import.meta.url)), '..', 'css', 'main.css')

// GUARD against exactly this class of bug recurring: before touching any file, resolve every
// token named in TYPE/RADIUS/COLOUR against its real declaration in css/main.css and abort if
// a map's key disagrees with what the token actually holds. A map entry that disagrees with
// the stylesheet is a guaranteed visual regression once --apply'd, so it must be impossible to
// run the codemod in that state -- warning and continuing is not enough.
//
// --radius-full is a documented, approved exception (design spec 3.4): it intentionally folds
// three different literals (99px/100px/999px, all "fully round" in practice) onto one token.
// That is a deliberate many-keys-to-one-token fold, not an accidental value mismatch, so ONLY
// --radius-full is allowed to have claimant literals that don't equal its stylesheet value,
// and even then at least one claimant (999px) still must match exactly -- catching the token
// itself drifting. Every other token, in every map including RADIUS, is claimed by exactly one
// literal and that literal must equal the stylesheet value exactly. Naming the exception by
// TOKEN rather than waiving the whole map is deliberate: a blanket per-map allowance would have
// let an accidental second claimant on, say, --radius-sm hide behind a correct one the same way
// the bad #22c55e entry hid behind the correct #10b981 one for --success the first time this
// guard was tried (caught during Step (a)'s own proof, not before).
const SANCTIONED_FOLDS = new Set(['--radius-full'])

function assertMapsMatchStylesheet () {
  let css
  try {
    css = readFileSync(MAIN_CSS, 'utf8')
  } catch (e) {
    console.error(`ABORT -- could not read ${MAIN_CSS} to verify the token maps: ${e.message}`)
    process.exit(1)
  }

  const cssTokens = new Map()
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const name = m[1].trim()
    if (!cssTokens.has(name)) cssTokens.set(name, m[2].trim()) // first declaration wins
  }
  const norm = v => v.trim().toLowerCase()

  const errors = []
  const check = (map, label) => {
    const byToken = new Map()
    for (const [literal, token] of Object.entries(map)) {
      if (!byToken.has(token)) byToken.set(token, [])
      byToken.get(token).push(literal)
    }
    for (const [token, literals] of byToken) {
      if (!cssTokens.has(token)) {
        errors.push(`${label}: ${token} is not defined anywhere in ${MAIN_CSS} (claimed by ${literals.join(', ')})`)
        continue
      }
      const cssVal = cssTokens.get(token)
      const matching = literals.filter(l => norm(l) === norm(cssVal))
      const nonMatching = literals.filter(l => norm(l) !== norm(cssVal))
      if (matching.length === 0) {
        errors.push(`${label}: ${token} = ${cssVal} in css/main.css, but its map key(s) (${literals.join(', ')}) do not include that exact value`)
      } else if (nonMatching.length && !SANCTIONED_FOLDS.has(token)) {
        errors.push(`${label}: ${token} = ${cssVal} in css/main.css, but ${nonMatching.join(', ')} also claim ${token} and that fold is not sanctioned`)
      }
    }
  }

  check(TYPE, 'TYPE')
  check(RADIUS, 'RADIUS')
  check(COLOUR, 'COLOUR')

  if (errors.length) {
    console.error('ABORT -- a token map disagrees with css/main.css. Converting with this map would')
    console.error('be a guaranteed visual regression once resolved, since the fallback literal in')
    console.error('var(--token, <literal>) only ever applies while the variable is undefined.')
    for (const e of errors) console.error(`  ${e}`)
    process.exit(1)
  }
}
assertMapsMatchStylesheet()

// SCOPE GUARD, round 2. The naive `/style="([^"]*)"/g` regex on raw source text matched three
// kinds of things that are NOT a live style attribute, all reproduced live by review:
//   FINDING A -- a JS comment or a plain quoted string that merely MENTIONS style="..." as
//   documentation (e.g. `// example: style="color:#ef4444"`) has its literal text rewritten.
//   FINDING B -- an attribute built by string concatenation across a `+`
//   (`'<div style="' + 'color:#ef4444">'`) lets `[^"]*` span the `+` into the next string
//   looking for a closing quote, merging two separate JS string literals into one on rewrite.
// Both findings are the same root problem: the regex has no notion of JS syntax, so it cannot
// tell a live style attribute from a documentation mention or a stitched-together one. The fix
// is structural, not another regex tweak: a live style="..." attribute in this codebase is
// always written as flat literal text inside a backtick template literal (never inside `${...}`
// interpolation, a comment, or a plain '...'/"..." string, and never split across two). So
// `computeTemplateLiteralTextMask` classifies every character in the file into "flat template
// literal text" or not, and `findStyleAttributes` only accepts a style="..." match when the
// ENTIRE match -- opening quote through closing quote -- stays inside one uninterrupted such
// run. Anything else is reported under SKIPPED (ambiguous scope) and left untouched. Skipping
// is always safe: an unconverted literal just stays counted as remaining work by the ratchet.
// Converting something that should not have been touched is the only unrecoverable direction.
//
// This is a small hand-rolled JS lexer, not a full parser -- it does not understand regex
// literals (`/like this/`), so a stray `/` that opens what looks like a regex containing a
// quote character could in principle misclassify a few characters. That is an accepted,
// narrow gap: it can only ever cause MORE conservatism (an attribute wrongly judged
// ambiguous and skipped), never less, because it can only make the mask flip to "not flat
// text" where it should not have -- it cannot manufacture a false "flat text" span across a
// real boundary. Skip is the safe direction, so this gap does not undermine the guarantee.
function computeTemplateLiteralTextMask (src) {
  const n = src.length
  const mask = new Uint8Array(n) // 1 = inside the flat literal text of a template literal
  const stack = []
  let i = 0
  while (i < n) {
    const top = stack[stack.length - 1]
    const c = src[i]

    if (!top) { // top-level code
      if (c === '`') { stack.push({ type: 'template', inExpr: false, braceDepth: 0 }); i++; continue }
      if (c === "'") { stack.push({ type: 'single' }); i++; continue }
      if (c === '"') { stack.push({ type: 'double' }); i++; continue }
      if (c === '/' && src[i + 1] === '/') { stack.push({ type: 'line' }); i += 2; continue }
      if (c === '/' && src[i + 1] === '*') { stack.push({ type: 'block' }); i += 2; continue }
      i++; continue
    }

    if (top.type === 'line') { if (c === '\n') stack.pop(); i++; continue }

    if (top.type === 'block') {
      if (c === '*' && src[i + 1] === '/') { stack.pop(); i += 2; continue }
      i++; continue
    }

    if (top.type === 'single' || top.type === 'double') {
      const q = top.type === 'single' ? "'" : '"'
      if (c === '\\') { i += 2; continue }
      if (c === q) { stack.pop(); i++; continue }
      i++; continue
    }

    if (top.type === 'template') {
      if (!top.inExpr) {
        if (c === '\\') { i += 2; continue }
        if (c === '`') { stack.pop(); i++; continue }
        if (c === '$' && src[i + 1] === '{') { top.inExpr = true; top.braceDepth = 1; i += 2; continue }
        mask[i] = 1; i++; continue
      } else {
        // Inside `${...}` -- behaves like top-level code, but braces are tracked so we know
        // when THIS interpolation closes back to flat literal text.
        if (c === '`') { stack.push({ type: 'template', inExpr: false, braceDepth: 0 }); i++; continue }
        if (c === "'") { stack.push({ type: 'single' }); i++; continue }
        if (c === '"') { stack.push({ type: 'double' }); i++; continue }
        if (c === '/' && src[i + 1] === '/') { stack.push({ type: 'line' }); i += 2; continue }
        if (c === '/' && src[i + 1] === '*') { stack.push({ type: 'block' }); i += 2; continue }
        if (c === '{') { top.braceDepth++; i++; continue }
        if (c === '}') { top.braceDepth--; if (top.braceDepth === 0) top.inExpr = false; i++; continue }
        i++; continue
      }
    }
    i++
  }
  return mask
}

const snippet = (src, idx) => src.slice(Math.max(0, idx - 20), idx + 50).replace(/\n/g, '\\n')

// Find every style="..." occurrence in the raw text, classify each as SAFE (opening quote
// through closing quote sits entirely inside one uninterrupted flat-template-literal run) or
// SKIPPED (anything else -- see the block comment above computeTemplateLiteralTextMask).
function findStyleAttributes (src, mask) {
  const NEEDLE = 'style="'
  const safe = []
  const skipped = []
  let searchFrom = 0
  while (true) {
    const idx = src.indexOf(NEEDLE, searchFrom)
    if (idx === -1) break
    const bodyStart = idx + NEEDLE.length

    if (mask[idx] !== 1) {
      // FINDING A shape: the "style=" text itself is not flat template-literal text at all --
      // it's in a comment, a plain '...'/"..." string, or bare code.
      skipped.push({ start: idx, reason: 'not inside a template literal (comment/string/code)', snippet: snippet(src, idx) })
      searchFrom = bodyStart
      continue
    }

    let j = bodyStart
    let closed = -1
    while (j < src.length) {
      if (mask[j] !== 1) break // left the flat-text run before finding a closing quote
      if (src[j] === '"') { closed = j; break }
      j++
    }
    if (closed === -1) {
      // FINDING B shape: opened inside flat text but the run ended (interpolation, comment,
      // string boundary, or end of the template literal) before a closing quote appeared.
      skipped.push({ start: idx, reason: 'spans a literal-boundary interruption before a closing quote', snippet: snippet(src, idx) })
      searchFrom = bodyStart
      continue
    }
    safe.push({ start: idx, end: closed + 1, body: src.slice(bodyStart, closed) })
    searchFrom = closed + 1
  }
  return { safe, skipped }
}

const file = process.argv[2]
const apply = process.argv.includes('--apply')
if (!file) { console.error('usage: tokenise.mjs <file> [--apply]'); process.exit(2) }

const src = readFileSync(file, 'utf8')
const stats = new Map()
const unmatched = new Map()
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1)

const mask = computeTemplateLiteralTextMask(src)
const { safe, skipped } = findStyleAttributes(src, mask)

// Rebuild the file by splicing only the SAFE matches; everything else -- including every
// SKIPPED span -- passes through byte-for-byte untouched.
let out = ''
let cursor = 0
for (const { start, end, body } of safe) {
  let b = body

  b = b.replace(/font-size:(\s*)([0-9.]+px)/g, (m, sp, val) => {
    const t = TYPE[val]
    if (!t) { bump(unmatched, `font-size:${val}`); return m }
    bump(stats, `font-size ${val} -> var(${t})`)
    return `font-size:${sp}var(${t}, ${val})`
  })

  b = b.replace(/border-radius:(\s*)([0-9]+px)/g, (m, sp, val) => {
    const t = RADIUS[val]
    if (!t) { bump(unmatched, `border-radius:${val}`); return m }
    bump(stats, `border-radius ${val} -> var(${t})`)
    return `border-radius:${sp}var(${t}, ${val})`
  })

  // Colour only where it follows a colour-bearing property, so a hex inside a
  // gradient string or an unrelated token is never touched.
  b = b.replace(/(background|background-color|color|border-color|fill|stroke)(:\s*)(#[0-9a-fA-F]{3,8})\b/g,
    (m, prop, sep, val) => {
      const t = COLOUR[val.toLowerCase()]
      if (!t) { bump(unmatched, `${prop}:${val}`); return m }
      bump(stats, `${prop} ${val} -> var(${t})`)
      return `${prop}${sep}var(${t}, ${val})`
    })

  out += src.slice(cursor, start) + `style="${b}"`
  cursor = end
}
out += src.slice(cursor)

// The literal-counting pattern has exactly one owner: scripts/style-count.sh (Task 3).
// An earlier draft of this file carried its own copy of the regex and it had already
// drifted stricter (case-sensitive, no space before the colon) than the shared script --
// a 7th copy, and a wrong one. Shell out instead so this count is provably the same
// count the checks.sh ratchet will use.
const styleCountSh = join(dirname(fileURLToPath(import.meta.url)), 'style-count.sh')
const count = s => {
  const tmp = join(tmpdir(), `tokenise-count-${randomBytes(6).toString('hex')}.tmp`)
  writeFileSync(tmp, s)
  try {
    return parseInt(execFileSync('sh', [styleCountSh, tmp], { encoding: 'utf8' }).trim(), 10)
  } finally {
    unlinkSync(tmp)
  }
}

console.log(`\n${file}  ${apply ? '[APPLY]' : '[DRY RUN -- nothing written]'}`)
console.log(`  literals before: ${count(src)}   after: ${count(out)}`)
console.log('  replacements:')
for (const [k, v] of [...stats].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(4)}  ${k}`)
if (unmatched.size) {
  console.log('  LEFT ALONE (no exact token -- never rounded):')
  for (const [k, v] of [...unmatched].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(4)}  ${k}`)
}
if (skipped.length) {
  // A silent skip and a silent conversion are equally bad -- always print the count and a
  // sample so a human can see what the scope guard declined to touch and why.
  console.log(`  SKIPPED (ambiguous scope -- ${skipped.length} candidate(s) not inside one flat template-literal run):`)
  const byReason = new Map()
  for (const s of skipped) bump(byReason, s.reason)
  for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${reason}`)
  console.log('  sample:')
  for (const s of skipped.slice(0, 5)) console.log(`    ...${s.snippet}...`)
}
if (apply) { writeFileSync(file, out); console.log('  written.') }
