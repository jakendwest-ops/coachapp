#!/usr/bin/env node
/**
 * Proves check-escaping.mjs (checks.sh rule 9d) BLOCKS the unescaped-render forms this codebase has
 * actually shipped, AND stays quiet on the correct forms it writes.
 *
 * WHY THIS EXISTS. check-escaping.mjs had no self-test, so nothing had ever shown it RED on the
 * periodization "reps" sink (bugs/2026-09-06-periodization-reps-is-an-unescaped-stored-attribute-and-
 * the-checker-is-blind): the checker exited 0 over a live stored-attribute injection for weeks and the
 * ledger row could only say "which part defeats the rule is unverified". Measured 2026-09-20: nothing
 * about the SYNTAX defeated it — `cfg.tiers?.[t]?.reps ?? repsDefault[t]` simply contains none of the
 * hand-written FREE_TEXT field names, so the interpolation was never a candidate. The lesson banked on
 * 2026-08-16 and again 2026-08-29 (CRITICAL.md) is that a class guard must be shown RED on EVERY
 * syntactic form the codebase writes before a clean run means anything; this file is that proof, kept.
 *
 * The PASS half is the point too: a checker that cries wolf gets switched off. `.reps` was deliberately
 * NOT added to FREE_TEXT — measured over js/, it flags three runner sites (number inputs and a parseInt
 * result) that are not the cross-user class. The rule is keyed on `cfg.`, the periodization config
 * object (window._pzConfig, an untyped jsonb column), which appears nowhere else in js/.
 *
 * Run: node scripts/check-escaping.selftest.mjs      (exit 1 = a case misbehaved)
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-escaping.mjs')

const CASES = [
  // -- must BLOCK: the periodization config sink (this row) and its siblings ---------------------
  { want: 'BLOCK', why: 'THE ROW: optional-chained cfg tier reps with a ?? fallback, in a plain value=""',
    src: 'function render(cfg, t, repsDefault) {\n  return `<input id="r-${t}" type="text" value="${cfg.tiers?.[t]?.reps ?? repsDefault[t]}">`\n}' },
  { want: 'BLOCK', why: 'a numeric-looking cfg field is still untyped jsonb until proven otherwise',
    src: 'function render(cfg) {\n  return `<input type="number" value="${cfg.startPct ?? 65}">`\n}' },
  { want: 'BLOCK', why: 'a cfg value with an || fallback (the deload week input)',
    src: 'function render(cfg, w) {\n  return `<input value="${cfg.deloadWeek || Math.min(w, 4)}">`\n}' },
  { want: 'BLOCK', why: 'the cfg sink as element text, not only as an attribute',
    src: 'function render(cfg) {\n  return `<span>${cfg.tiers.heavy.reps}</span>`\n}' },
  { want: 'BLOCK', why: 'a coach-typed programme name arriving as a PARAMETER (clientOverviewTab), which no member-name rule sees',
    src: 'function tab(client, programName = null) {\n  return `<span class="p">${programName}</span>`\n}' },

  // -- must BLOCK: the forms the checker already owned (pin them so extending FREE_TEXT cannot loosen) --
  { want: 'BLOCK', why: 'raw .name in markup — the original stored-XSS shape',
    src: 'function render(c) {\n  return `<div>${c.name}</div>`\n}' },
  { want: 'BLOCK', why: 'raw full_name beside an ESCAPED neighbour — per-MATCH, not per-line',
    src: 'function render(c) {\n  return `<b>${escapeHtml(c.title)}</b><i>${c.full_name}</i>`\n}' },
  { want: 'BLOCK', why: 'WRONG ESCAPER: escapeAttr in a plain value="" attribute corrupts and is then SAVED',
    src: 'function render(c) {\n  return `<input value="${escapeAttr(c.name)}">`\n}' },
  { want: 'BLOCK', why: 'one-hop indirection: free text assigned to a local, interpolated raw',
    src: 'function render(ex) {\n  const label = \'Next: \' + ex.name\n  return `<div>${label}</div>`\n}' },

  // -- must PASS: the correct forms ---------------------------------------------------------------
  { want: 'PASS', why: 'THE FIX SHAPE: escapeHtml(String(...)) around the cfg value',
    src: 'function render(cfg, t, repsDefault) {\n  return `<input id="r-${t}" type="text" value="${escapeHtml(String(cfg.tiers?.[t]?.reps ?? repsDefault[t]))}">`\n}' },
  { want: 'PASS', why: 'a constant-valued conditional computed BEFORE the template carries no cfg. in the interpolation',
    src: 'function render(cfg) {\n  const deloadOn = !!cfg.deloadWeek\n  return `<input ${deloadOn ? \'checked\' : \'\'}>`\n}' },
  { want: 'PASS', why: 'THE FIX SHAPE for the parameter form: escapeHtml(programName)',
    src: 'function tab(client, programName = null) {\n  return `<span class="p">${escapeHtml(programName)}</span>`\n}' },
  { want: 'PASS', why: 'escapeHtml on .name in markup',
    src: 'function render(c) {\n  return `<div>${escapeHtml(c.name)}</div>`\n}' },
  { want: 'PASS', why: 'escapeAttr is CORRECT inside a JS string in a handler — must not be flagged',
    src: 'function render(c) {\n  return `<button onclick="open(\'${escapeAttr(c.name)}\')">x</button>`\n}' },
  { want: 'PASS', why: 'free text on a line that builds no markup is not an HTML sink',
    src: 'function f(c) {\n  const s = `${c.name} and ${c.full_name}`\n  return s\n}' },
  { want: 'PASS', why: 'a commented-out interpolation is documentation, not code',
    src: '// e.g. `<div>${cfg.tiers.heavy.reps}</div>` — unescaped on purpose, explaining the bug\nfunction f() {}' },
  { want: 'PASS', why: '.reps is deliberately NOT a free-text field — a runner number input must not cry wolf',
    src: 'function render(s) {\n  return `<input type="number" value="${s.reps||\'\'}">`\n}' },
  { want: 'PASS', why: 'a numeric / id interpolation carries no free-text field name',
    src: 'function render(n, id) {\n  return `<div id="row-${id}">${n + 1}</div>`\n}' }
]

const dir = mkdtempSync(join(tmpdir(), 'escaping-selftest-'))
let failures = 0

CASES.forEach((c, i) => {
  const file = join(dir, `case${i}.js`)
  writeFileSync(file, c.src, 'utf8')
  let exit = 0
  let out = ''
  try {
    out = execFileSync(process.execPath, [CHECK, file], { encoding: 'utf8' })
  } catch (err) {
    exit = err.status
    out = (err.stdout || '') + (err.stderr || '')
  }
  const got = exit === 0 ? 'PASS' : 'BLOCK'
  if (got !== c.want) {
    failures++
    console.log(`  [${i}] want ${c.want}, got ${got} -- ${c.why}`)
    console.log(out.split('\n').map(l => `      ${l}`).join('\n'))
  }
})

rmSync(dir, { recursive: true, force: true })

// Non-zero denominators. A CASES array that ran nothing, or only one kind, would print "behaved" and
// exit 0 while asserting nothing -- the reports-success-while-doing-nothing shape.
const blocks = CASES.filter(c => c.want === 'BLOCK').length
if (!blocks || blocks === CASES.length) {
  console.log('  self-test is one-sided -- it must contain both BLOCK and PASS cases')
  process.exit(1)
}

if (failures) {
  console.log(`  ${failures} of ${CASES.length} self-test cases misbehaved.`)
  process.exit(1)
}
console.log(`  check-escaping self-test: ${CASES.length} cases behaved (${blocks} must-block, ${CASES.length - blocks} must-pass).`)
process.exit(0)
