#!/usr/bin/env node
/**
 * checks.sh rule 9a — PII in log.* and console.* calls (the GDPR class).
 *
 * CRITICAL.md tracks UK GDPR special-category data: weights, body fat, photos, performance metrics.
 * The standing rule is IDs and dates only in logs — never names, emails, weights or health values.
 *
 * Moved out of inline grep on 2026-08-22 because the shell version could not fail on the commonest
 * log shape in this codebase. It ended:
 *
 *     | grep -v "clientId\\|userId\\|date\\|//"
 *
 * and that exclusion applied to the whole LINE, not to the PII match. So any log call carrying an id
 * ALONGSIDE PII was silently exempt. Reproduced with a positive control:
 *
 *     log.error("x","y",{ full_name: n })                      -> FIRED     (rule works)
 *     log.error("saveClientWeight","f",{ clientId, full_name }) -> MISSED    (id on the line exempts it)
 *
 * Same lesson, same fix as rule 9d (check-escaping.mjs): match PER KEY, not per line.
 *
 * WIDENED 2026-10-18 (the data-leak audit), after measuring each widening against the real tree first
 * (366 log calls + 11 console calls: the only hits were `e?.name`, an ERROR's type name, which is exempt):
 *   - a call is read to its matching close paren ACROSS LINES. The first version read only the line the call
 *     opened on, so `log.error('x', 'y',\n  { email })` was never looked at (4 such calls exist; none carries PII).
 *   - console.* is covered as well as log.*: it is the same console, and 11 calls were outside the gate.
 *   - the scan is of CODE, not of message text: a string literal's contents are dropped (so "weight saved" is not a
 *     finding) but a `${ ... }` interpolation inside a template literal is kept (so `${client.full_name}` is).
 *   - a PII member read under an innocent key ({ who: client.email }) is caught, not just a PII key name.
 *   - a bare whole-row variable as the data argument (log.error('x', 'y', client)) and a spread of one are caught:
 *     what such a payload holds cannot be reasoned about.
 *   - the key list gains the names a health value or credential travels under (weight, bodyWeight, injury,
 *     medical, photo, token, password, signedUrl, client_name, name ...).
 *   - the file is read AFTER comments and regex literals are blanked (scripts/lib/comments.mjs, offsets preserved), so a quote or a `//` inside a regex, or
 *     an apostrophe in a comment, cannot desync the scanner, and a call that follows a comment on its line is still read.
 * A call (or a line of a multi-line call) carrying LINT-OK is skipped - but the number of those is CAPPED at today's zero (MAX_LINT_OK): a legitimate
 * `{ name }` (an exercise or template name) is renamed (`templateName`), not waived; an exemption any line can claim is how a gate stops gating.
 *
 * KNOWN LIMITS (named): a row hidden in an array or a `||` expression ([row], client || {}), a string-keyed access (client['email']), and an alias of the
 * logger (const L = log) are not seen; a value is judged by its NAME, so PII under an unrecognised variable name (`const who = c.full_name_x`) is not.
 *
 * Usage: node scripts/check-pii-logs.mjs js/a.js js/b.js …   (exit 1 = findings, printed to stdout)
 */

import { readFileSync, existsSync } from 'node:fs'
import { blankComments } from './lib/comments.mjs'

// How many LINT-OK exemptions may exist across the files checked. Pinned AT today's count (zero), not above it.
const MAX_LINT_OK = 0

// Keys / members that may NEVER appear in a log payload. Matched as whole words, so `exercise_name` and
// `template_name` are unaffected — they are not personal data, and flagging them would make the rule
// fail on a clean tree, which is how a rule gets disabled.
const PII_KEYS = [
  'full_name', 'fullName', 'first_name', 'last_name', 'firstName', 'lastName', 'client_name', 'clientName',
  'business_name', 'businessName', 'name',
  'email', 'phone', 'dob', 'date_of_birth', 'address',
  'weight', 'weight_kg', 'weightKg', 'weight_lb', 'bodyWeight', 'body_weight', 'body_fat_pct', 'body_fat', 'bodyFat',
  'resting_hr', 'restingHr', 'one_rm_kg', 'oneRmKg',
  'injury', 'injuries', 'medical', 'condition', 'photo', 'photo_path',
  'notes', 'client_notes', 'clientNotes',
  'password', 'token', 'access_token', 'refresh_token', 'signedUrl', 'signed_url',
]

// `e?.name` / `err.name` is an Error's TYPE name ("TypeError"), not a person's. The one legitimate use of the word.
const ERROR_NAME = /\b(?:e|err|error|ex)\s*\??\.\s*name\b/g
const ERROR_NAME_KEY = /\bname\s*:\s*(?:e|err|error|ex)\s*\??\.\s*name\b/g

// A whole row (or anything that can hold one) handed over as the data argument.
const WHOLE_ROW = /^(client|clients|row|rows|clientRow|profile|user|session|data|payload|body|c|r|p|u|goal|goals|currentUser|currentProfile)$/
// Spreading a whole row into a log payload.
const ROW_SPREAD = /\.\.\.\s*(row|client|data|profile|user|session|payload|currentUser|currentProfile)\b/

// A whole row as a PROPERTY VALUE ({ who: client }) or stringified (JSON.stringify(client)) is the same unknowable payload as passing it directly.
// The shorthand form ({ row }, { id, clientRow }) too: the HEAD version of this gate blocked it and a rewrite had silently dropped it (found by review 2026-10-18).
const ROW_NAMES = WHOLE_ROW.source.slice(2, -2)
const ROW_AS_VALUE = new RegExp(String.raw`[:]\s*(?:${ROW_NAMES})\s*[,}]|[{,]\s*(?:${ROW_NAMES})\s*[,}]|\.\s*(?:row|clientRow)\s*[,}]|JSON\s*\.\s*stringify\s*\(\s*(?:${ROW_NAMES})\s*[,)]`)

const CALL = /\b(log\.(?:info|ok|warn|error)|console\.(?:log|info|warn|error|debug|table|dir|trace))\s*\(/g

/**
 * The text of a call from its open paren to the matching close, across lines. Parens inside strings do not count, and neither do
 * quotes inside COMMENTS: an apostrophe in `// don't leak it` between two lines of a multi-line call must not open a phantom string
 * that swallows the rest of the file (found by review 2026-10-18).
 */
function callText (text, openIdx) {
  let depth = 0, quote = null
  for (let k = openIdx; k < text.length; k++) {
    const c = text[k]
    if (quote) {
      if (c === '\\') { k++; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === '/' && text[k + 1] === '/') { while (k < text.length && text[k] !== '\n') k++; continue }
    if (c === '/' && text[k + 1] === '*') { const e = text.indexOf('*/', k + 2); k = e === -1 ? text.length : e + 1; continue }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth === 0) return text.slice(openIdx, k + 1) }
  }
  return text.slice(openIdx)
}

/** The call with its comments removed (string-aware), so nothing a comment says is read as a payload. LINT-OK is looked for before this. */
function withoutComments (call) {
  let out = '', quote = null
  for (let k = 0; k < call.length; k++) {
    const c = call[k]
    if (quote) { out += c; if (c === '\\') { out += call[++k] ?? ''; continue } if (c === quote) quote = null; continue }
    if (c === '/' && call[k + 1] === '/') { while (k < call.length && call[k] !== '\n') k++; out += '\n'; continue }
    if (c === '/' && call[k + 1] === '*') { const e = call.indexOf('*/', k + 2); k = e === -1 ? call.length : e + 1; out += ' '; continue }
    if (c === "'" || c === '"' || c === '`') quote = c
    out += c
  }
  return out
}

/**
 * The call with string-literal TEXT removed but `${ expr }` interpolations kept, and the top-level
 * argument list split out. A word inside a message is documentation; an expression inside it is a value.
 */
function codeAndArgs (call) {
  const inner = call.slice(1, call.endsWith(')') ? -1 : undefined)
  let code = '', cur = '', args = [], depth = 0, i = 0
  const flush = () => { args.push(cur.trim()); cur = '' }
  while (i < inner.length) {
    const c = inner[i]
    if (c === "'" || c === '"') {                       // plain string: drop contents
      let k = i + 1
      while (k < inner.length && inner[k] !== c) k += inner[k] === '\\' ? 2 : 1
      cur += '""'; code += '""'; i = k + 1; continue
    }
    if (c === '`') {                                    // template: drop literal text, keep ${ expr }
      let k = i + 1, out = '``'
      while (k < inner.length && inner[k] !== '`') {
        if (inner[k] === '\\') { k += 2; continue }
        if (inner[k] === '$' && inner[k + 1] === '{') {
          let d = 1, j = k + 2
          while (j < inner.length && d > 0) { if (inner[j] === '{') d++; else if (inner[j] === '}') d--; j++ }
          // keep the braces: `${email}` must still read as `{ email }` (a bare identifier as a value), which HEAD's gate matched and a first rewrite lost
          out += ' { ' + inner.slice(k + 2, j - 1) + ' } '; k = j; continue
        }
        k++
      }
      cur += out; code += out; i = k + 1; continue
    }
    if (c === '(' || c === '[' || c === '{') depth++
    if (c === ')' || c === ']' || c === '}') depth--
    if (c === ',' && depth === 0) { flush(); code += c; i++; continue }
    cur += c; code += c; i++
  }
  flush()
  return { code, args }
}

const files = process.argv.slice(2).filter(f => existsSync(f))
const hits = []

let lintOkUsed = 0
for (const file of files) {
  const raw0 = readFileSync(file, 'utf8')
  // Scan the text with comments AND regex literals blanked (same length, same lines): a call inside a comment is not a call, and a quote inside a regex is not a string.
  // LINT-OK lives in a comment, so it is looked for in the original.
  const text = blankComments(raw0, { regex: true })
  let m
  CALL.lastIndex = 0
  while ((m = CALL.exec(text)) !== null) {
    const lineStart = text.lastIndexOf('\n', m.index) + 1
    const line = text.slice(0, m.index).split('\n').length
    const openIdx = m.index + m[0].length - 1
    const call = callText(text, openIdx)
    // LINT-OK anywhere on the lines the call occupies, including a trailing comment after its closing paren.
    const lineEnd = text.indexOf('\n', openIdx + call.length)
    if (raw0.slice(lineStart, lineEnd === -1 ? raw0.length : lineEnd).includes('LINT-OK')) { lintOkUsed++; continue }
    const kind = m[1]
    const { code: raw, args } = codeAndArgs(withoutComments(call))
    const code = raw.replace(ERROR_NAME_KEY, '').replace(ERROR_NAME, '')

    let flagged = false
    for (const key of PII_KEYS) {
      // `key:` / `{ key }` / `, key,` as a property, or `.key` as a member read (but not a method call `.name(`).
      // `: key` is a bare identifier used as a VALUE ({ who: email }), which carries the PII as surely as the key would.
      const re = new RegExp(`[{,]\\s*${key}\\s*[,:}]|\\b${key}\\s*:|:\\s*${key}\\s*[,}]|\\.\\s*${key}\\b(?!\\s*\\()`)
      if (re.test(code)) { hits.push(`${file}:${line} → ${kind}(…) carries \`${key}\``); flagged = true; break }
    }
    if (!flagged && ROW_SPREAD.test(code)) { hits.push(`${file}:${line} → ${kind}(…) spreads a whole row`); flagged = true }
    if (!flagged && ROW_AS_VALUE.test(code)) { hits.push(`${file}:${line} → ${kind}(…) carries a whole row inside its payload`); flagged = true }
    if (!flagged) {
      // log.*: argument 3 onward is the data payload (1 and 2 are the tag and the message). console.*: EVERY argument is the payload.
      const payload = kind.startsWith('console') ? args : args.slice(2)
      const bare = payload.find(a => WHOLE_ROW.test(a))
      if (bare) hits.push(`${file}:${line} → ${kind}(…) passes a whole row (\`${bare}\`) as its data`)
    }
  }
}

if (lintOkUsed > MAX_LINT_OK) hits.push(`${lintOkUsed} LINT-OK exemption(s); the cap is ${MAX_LINT_OK} (MAX_LINT_OK in scripts/check-pii-logs.mjs) - rename the key instead (templateName, not name)`)
if (hits.length) {
  console.log(`  ${hits.length} PII-in-log finding(s) — IDs and dates only, never names/emails/health values:`)
  for (const h of hits) console.log(`    ${h}`)
  console.log('    CRITICAL.md tracks these as GDPR special-category data. Log the id, resolve the value at read time.')
  console.log('    (An Error\'s own type name, e?.name, is exempt. A legitimate non-person `name` is renamed, e.g. templateName.)')
  process.exit(1)
}
process.exit(0)
