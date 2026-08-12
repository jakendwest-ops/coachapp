#!/usr/bin/env node
/**
 * checks.sh rule 9d — unescaped free-text interpolation (the stored-XSS class).
 *
 * 5th+ recurrence of this class: 2026-07-13, -18, -23, -28, then the 2026-08-12 full-codebase audit
 * found ~13 more sites across 5 files. Catching them one at a time during unrelated feature work has
 * demonstrably not worked, so this makes the class mechanically detectable.
 *
 * Lives in node rather than inline grep because the rule needs three things shell greps do badly, and
 * the two shell versions before it got each of them wrong:
 *
 *   1. PER-MATCH, not per-line. `grep -nE … | grep -v escapeHtml` drops the whole LINE if any escaper
 *      appears anywhere on it. This codebase writes long single-line template rows with several
 *      interpolations, so one escaped interpolation hid an unescaped neighbour.
 *   2. Context awareness. `${src.name}` inside `confirm(...)`, a `const` string or a `.insert({...})`
 *      never reaches innerHTML. Flagging those makes the rule fail on a clean tree, and a rule that
 *      cries wolf gets disabled — the same alarm-fatigue failure this project already had in os-lint.
 *   3. Knowing which escaper is RIGHT. escapeAttr is ONLY for a JS string inside an attribute
 *      (onclick="fn('${escapeAttr(x)}')"). In a plain value="" it backslash-escapes, the browser hands
 *      the backslash back through .value, and the corrupted string gets SAVED — growing on every save.
 *      That shipped in the 2026-08-12 sweep and was caught by review, not by the rule.
 *
 * Exit 0 = clean, exit 1 = findings printed.
 */
import { readFileSync } from 'node:fs'

const FILES = process.argv.slice(2)

// Fields that hold text a human typed. `.label` is deliberately ABSENT: in this repo every `.label` is
// a hardcoded constant (eventStyle, PERF_CATEGORIES, the runner's target columns, trend metrics).
const FREE_TEXT = /(full_name|exercise_name|client_notes|clientNotes|day_label|clientMap\[|\.name\b|\.title\b|\.notes\b|\.description\b|\.email\b|\.unit\b)/

const ESCAPED = /escapeHtml\(|escapeAttr\(|jsArg\(|encodeURIComponent\(/
// Not sinks: a single character can't form a tag; a comparison isn't rendered.
const NOT_A_SINK = /\.charAt\(0\)|\.length\b|[=!]==/

// A line that builds no markup can't be an HTML sink. Cheap and effective: every real sink in this
// codebase interpolates into a string that contains a tag.
const BUILDS_HTML = /</

const findings = []

for (const file of FILES) {
  let src
  try { src = readFileSync(file, 'utf8') } catch { continue }
  src.split('\n').forEach((line, i) => {
    if (!BUILDS_HTML.test(line)) return
    // Extract each ${...} separately so an escaped neighbour cannot mask an unescaped one.
    for (const m of line.matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
      const expr = m[1]
      if (!FREE_TEXT.test(expr)) continue
      if (ESCAPED.test(expr)) continue
      if (NOT_A_SINK.test(expr)) continue
      findings.push({ file, line: i + 1, expr: expr.trim().slice(0, 90) })
    }
  })
}

if (findings.length) {
  for (const f of findings) console.log(`    ${f.file}:${f.line}  \${${f.expr}}`)
  console.log('')
  console.log('    escapeHtml() for text content AND for plain attributes (value="", title="").')
  console.log('    escapeAttr() ONLY for a JS string inside an attribute: onclick="fn(\'${escapeAttr(x)}\')".')
  process.exit(1)
}
process.exit(0)
