#!/usr/bin/env node
/**
 * checks.sh rule 2 — unscoped queries on multi-tenant tables.
 *
 * This is the project's most-shipped bug class (four separate solo/coach_id scoping bugs), and until
 * 2026-08-25 the gate that covered it could only ever WARN. Flipping the old shell version to fail
 * was the plan; measuring it first is what stopped that being a disaster.
 *
 * WHAT THE MEASUREMENT FOUND (2026-08-25). The shell rule had three sub-checks. Run against a clean
 * tree they reported four "violations" — every one a FALSE POSITIVE — and one of them could never
 * have fired at all:
 *
 *   sub-check 1 (clients)   VACUOUS. It required `select('*')` near a from('clients') AND that NO
 *                           clients query anywhere in js/ had coach_id within 5 lines. There are 40
 *                           such occurrences, so the second condition was permanently false. The
 *                           check had never been able to fire and never would.
 *   sub-checks 2 & 3        Single-LINE greps against a codebase that chains across lines:
 *                             db.from('programs').select('id')
 *                               .eq('coach_id', currentUser.id)      <- the anchor, on the next line
 *                           Correctly-scoped code was flagged; the anchor was simply out of view.
 *
 * So flipping the shell rule to `fail` would have blocked every push with four refusals of correct
 * code — the false-refusal class this OS keeps shipping, on the rule most likely to then be disabled.
 *
 * Same lesson and same remedy as rules 9a (check-pii-logs.mjs) and 9d (check-escaping.mjs): a rule
 * whose subject spans more than one line cannot live in a line-oriented grep. Read the whole chained
 * expression, then decide.
 *
 * WHAT COUNTS AS SCOPED. Any filter that ties the row to a tenant, or to an entity whose ownership is
 * established elsewhere. Deliberately generous, because a guard's real risk here is refusing the
 * legitimate user: this fires only on a chain with NO anchor of any kind — the shape that would
 * return every coach's rows if RLS ever slipped.
 *
 * `.or(...)` is a first-class anchor, NOT a fallback. `.eq('coach_id', uid)` silently EXCLUDES the
 * solo record (solo's coach_id is NULL) and `.or('coach_id.eq.<uid>,user_id.eq.<uid>')` is the
 * project's prescribed solo-safe form. A rule that accepted only `.eq('coach_id')` would push new
 * code straight into the four-times-shipped solo bug — the gate would manufacture the class it exists
 * to prevent.
 *
 * Usage: node scripts/check-query-scope.mjs js/a.js js/b.js …   (exit 1 = findings, printed to stdout)
 */

import { readFileSync, existsSync } from 'node:fs'

// The tables the original rule covered. Deliberately NOT widened in the same change that flips this
// to a hard failure — widening the subject and raising the severity at once is how a gate becomes a
// wall, and a wall gets switched off.
const TENANT_TABLES = ['clients', 'workout_templates', 'programs']

// Columns that anchor a row to a tenant, or to an entity whose ownership is verified upstream by the
// _verifyXOwnership helpers. `id` counts: a fetch by primary key is the shape those helpers use.
const ANCHOR_COLS = [
  'coach_id', 'client_id', 'user_id', 'id',
  'program_id', 'phase_id', 'generated_from_phase_id', 'template_id'
]

// Net bracket movement on a line, ignoring brackets inside string literals — a template literal such
// as `coach_id.eq.${uid}` would otherwise leave the depth permanently open and swallow the rest of
// the file into one "chain".
function depthOf (s) {
  let d = 0, quote = null
  for (let k = 0; k < s.length; k++) {
    const c = s[k]
    if (quote) {
      if (c === '\\') { k++; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '/' && s[k + 1] === '/') break            // a trailing comment ends the code on this line
    if (c === '(' || c === '[' || c === '{') d++
    if (c === ')' || c === ']' || c === '}') d--
  }
  return d
}

const files = process.argv.slice(2).filter(f => existsSync(f))
const findings = []

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/db\s*\.\s*from\(\s*['"]([a-z_]+)['"]\s*\)/)
    if (!m || !TENANT_TABLES.includes(m[1])) continue

    // Comment lines describe queries, they do not run them. Matching them is how a rule ends up
    // refusing its own documentation.
    if (/^\s*(\/\/|\*)/.test(lines[i])) continue

    // Accumulate the whole chained expression. Two things make this more than a line read, and the
    // first draft of THIS file got both wrong before the run below caught them:
    //   1. the anchor is usually on a continuation line (`.eq('coach_id', …)` under the `.select()`);
    //   2. a payload can be a multi-line object literal, and its body lines start with a key, not a
    //      dot — so a dot-only rule stops dead at `.insert({` and never sees the filters after it.
    // Track bracket depth, and keep going while the expression is open OR the next line continues it.
    // A comment line does not end a chain. This codebase annotates heavily BETWEEN the .from() and
    // the .insert()/.eq() that follows it (app-programs.js:1772 has four such lines), so treating a
    // comment as a terminator reports correctly-anchored code as unanchored.
    const continues = (idx) => {
      for (let k = idx; k < lines.length; k++) {
        const t = (lines[k] || '').trim()
        if (!t || t.startsWith('//')) continue          // blank / comment: look past it
        return t.startsWith('.')
      }
      return false
    }

    let chain = lines[i].slice(lines[i].indexOf(m[0]))
    let depth = depthOf(chain)
    for (let j = i + 1; j < lines.length; j++) {
      const t = (lines[j] || '').trim()
      if (depth <= 0 && !t.startsWith('.') && !(!t || t.startsWith('//')) ) break
      if (depth <= 0 && (!t || t.startsWith('//')) && !continues(j)) break
      if (!t.startsWith('//')) { chain += ' ' + t; depth += depthOf(lines[j]) }
      if (depth <= 0 && !continues(j + 1)) break
    }

    // An INSERT carries no filters by design — it is anchored by the tenant column in its PAYLOAD.
    // Requiring `.eq()` on an insert would refuse every correct write in the codebase, which is
    // precisely what the first run of this checker did (11 findings, all of them legitimate).
    const isInsert = /\.insert\(/.test(chain)

    const anchored = ANCHOR_COLS.some(col =>
      // .eq('coach_id', …) / .in('id', …) / .is('program_id', null) — a filter on an anchor column
      new RegExp(`\\.(eq|in|is|neq|not)\\(\\s*['"]${col}['"]`).test(chain) ||
      // .or('coach_id.eq.x,user_id.eq.x') — PostgREST filter syntax inside a single string argument
      new RegExp(`\\.or\\([^)]*${col}\\.(eq|in|is)\\.`).test(chain) ||
      // insert({ coach_id: …, client_id: … }) — the payload IS the anchor
      (isInsert && new RegExp(`[{,]\\s*${col}\\s*:`).test(chain))
    )

    if (!anchored) {
      findings.push({ file, line: i + 1, table: m[1], chain: chain.slice(0, 160) })
    }
  }
}

if (!findings.length) {
  console.log(`  Every ${TENANT_TABLES.join('/')} query carries an ownership anchor.`)
  process.exit(0)
}

for (const f of findings) {
  console.log(`    ${f.file}:${f.line}  from('${f.table}') with no ownership anchor`)
  console.log(`      ${f.chain}`)
}
console.log('')
console.log(`  An anchor is any filter on: ${ANCHOR_COLS.join(', ')}.`)
console.log('  For anything that must also see the SOLO record, use the .or() form —')
console.log("  .or(`coach_id.eq.${uid},user_id.eq.${uid}`) — never a bare .eq('coach_id'),")
console.log("  which silently excludes solo (solo's coach_id is NULL).")
process.exit(1)
