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
const wrongEscaper = []

for (const file of FILES) {
  let src
  try { src = readFileSync(file, 'utf8') } catch { continue }
  src.split('\n').forEach((line, i) => {
    // Point 3 of the docstring, finally implemented. It was stated as a design goal from the start
    // but never written, and ESCAPED below whitelists escapeAttr unconditionally — so every misuse
    // passed. That gap shipped this bug TWICE: commit 9d0003b (2026-08-12), and again in the Per
    // program picker (2026-08-16), where a backslashed "Farmer's Walk" stopped matching its own
    // exercise name and the tab silently claimed the exercise had no sessions.
    //
    //   Correct:  onclick="fn('<interp>escapeAttr(x)}')"   the interpolation opens inside a JS string
    //   Wrong:    value="<interp>escapeAttr(x)}"           it opens directly in an attribute
    //   (written as <interp> above so this comment does not match its own rule)
    //
    // Matched on the RAW LINE, deliberately NOT inside the ${...} walk below. That walk only sees
    // OUTERMOST interpolations, so a value attribute nested inside a bigger interpolation — which is
    // how most of this codebase's inputs are built — was invisible to it. Scanning the raw text
    // found 55 sites where the nesting-aware version found 13.
    // Runs BEFORE the BUILDS_HTML gate below, deliberately. Half this codebase builds attribute
    // fragments in helpers (mini(), row()) on lines with no literal `<` at all, so gating on `<`
    // hid them — that gate is right for the unescaped-text rule and wrong for this one. `="${` is
    // an attribute by construction; it needs no corroborating tag.
    //
    // TWO SHAPES, because there are exactly two ways this codebase writes it — established by grepping
    // the 14 characters before every escapeAttr( call, not by guessing:
    //
    //   interpolated:  value="<interp>escapeAttr(x)}"     WRONG  (the ${ opens in the attribute)
    //   concatenated:  value="' + escapeAttr(x) + '"      WRONG  (9 live sites, in mini()/gmini())
    //   handler arg:   onclick="fn('<interp>escapeAttr(x)}')"   CORRECT — must NOT match
    //
    // The concatenated form is why "the class is closed" was WRONG on 2026-08-16: the rule shipped
    // that day matched only the interpolated shape, exited 0, and nine sites stayed live. The lesson
    // banked from it is the reason both shapes are enumerated here rather than one being assumed:
    // verify a class guard against EVERY syntactic form the codebase actually uses.
    for (const re of [/=\s*"\$\{\s*escapeAttr\(/g, /=\s*"\s*'\s*\+\s*escapeAttr\(/g]) {
      for (const w of line.matchAll(re)) {
        wrongEscaper.push({ file, line: i + 1, expr: line.slice(w.index, w.index + 60).trim() })
      }
    }

    // INDIRECTION IS NOT CHECKED, deliberately — and this note exists so nobody "fixes" that.
    //
    // `const x = escapeAttr(v)` hides where the value lands, so a rule for it was written on
    // 2026-08-19 and then REMOVED the same hour: the only live instance (app-programs.js:41) turned out
    // to be CORRECT. escapeAttr round-trips cleanly through an onclick JS-string literal — verified
    // empirically, the runtime value is the original string, no backslash — so flagging the pattern
    // means blocking every push on correct code. A rule that cries wolf gets disabled, which is the
    // alarm-fatigue failure this file's own docstring warns about, so it is better to have no rule and
    // say so than a rule nobody trusts.
    //
    // The audit that rule triggered was still worth it: following that variable found `_ctx.backLabel`
    // and `_ctx.clientName` rendered RAW as text in app-workouts.js — a live stored-XSS sink, the 5th
    // instance of the client→coach pattern CRITICAL.md tracks. Fixed 2026-08-19. The lesson is that
    // indirection needs a human reading the dataflow, periodically — it is a full-file-review job, not
    // a regex one.

    if (!BUILDS_HTML.test(line)) return

    // Extract each ${...} separately so an escaped neighbour cannot mask an unescaped one.
    for (const m of line.matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
      const expr = m[1]

      // Point 3 of the docstring, finally implemented. It was described as a design goal from the
      // start but never written, and ESCAPED below whitelists escapeAttr unconditionally — so every
      // misuse passed. That gap shipped this bug TWICE: commit 9d0003b (2026-08-12) and again in the
      // Per program picker (2026-08-16), where a backslashed "Farmer's Walk" stopped matching its own
      // exercise name and the tab silently claimed the exercise had no sessions.
      //
      if (!FREE_TEXT.test(expr)) continue
      if (ESCAPED.test(expr)) continue
      if (NOT_A_SINK.test(expr)) continue
      findings.push({ file, line: i + 1, expr: expr.trim().slice(0, 90) })
    }
  })
}

if (findings.length || wrongEscaper.length) {
  for (const f of findings) console.log(`    ${f.file}:${f.line}  \${${f.expr}}   (unescaped)`)
  for (const f of wrongEscaper) console.log(`    ${f.file}:${f.line}  \${${f.expr}}   (WRONG ESCAPER: escapeAttr in a plain attribute)`)
  console.log('')
  console.log('    escapeHtml() for text content AND for plain attributes (value="", title="").')
  console.log('    escapeAttr() ONLY for a JS string inside an attribute: onclick="fn(\'${escapeAttr(x)}\')".')
  process.exit(1)
}
process.exit(0)
