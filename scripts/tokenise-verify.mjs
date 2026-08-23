#!/usr/bin/env node
// ROUND-TRIP PROOF. Expands every var(--token, literal) back to its literal and asserts
// the result is content-identical to the original.
//
// This is the primary verification and it is a proof over the WHOLE diff, not a sample:
// if the codemod rounded a value, touched the wrong property, or mangled a quote, the
// expansion stops matching. Deterministic, no browser, cannot flake.
//
// What it does NOT prove: that the tokens are DEFINED. A typo'd var(--text-bse, 13px)
// round-trips perfectly. tests/design-tokens-2026-08-22.spec.js covers that.
//
// TWO FORMS:
//   tokenise-verify.mjs <original> <converted>   -- reads both from disk. Used by the fixture
//     tests below (Task 4 Step 3) and any ad-hoc two-file comparison.
//   tokenise-verify.mjs <file>                    -- reads the WORKING-TREE copy of <file> and
//     its own committed HEAD blob (`git show HEAD:<file>`) as the "original". This is the form
//     the per-module conversion loop (Task 5-7) actually runs, right after `--apply`, while HEAD
//     is still the pre-conversion commit -- so no separate original snapshot ever goes stale.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const argv = process.argv.slice(2)
let origLabel, convPath, origRaw, convRaw

if (argv.length === 1) {
  convPath = argv[0]
  origLabel = `HEAD:${convPath}`
  try {
    origRaw = execFileSync('git', ['show', origLabel], { encoding: 'utf8' })
  } catch (e) {
    console.error(`ABORT -- could not read ${origLabel} via git show: ${e.message}`)
    process.exit(2)
  }
  try {
    convRaw = readFileSync(convPath, 'utf8')
  } catch (e) {
    console.error(`ABORT -- could not read ${convPath}: ${e.message}`)
    process.exit(2)
  }
} else if (argv.length === 2) {
  const [origPath, cp] = argv
  convPath = cp
  origLabel = origPath
  origRaw = readFileSync(origPath, 'utf8')
  convRaw = readFileSync(convPath, 'utf8')
} else {
  console.error('usage: tokenise-verify.mjs <file>  OR  tokenise-verify.mjs <original> <converted>')
  process.exit(2)
}

// var(--anything, LITERAL) -> LITERAL
// Not general-purpose: this regex is untested against nested var(--a, var(--b, 13px)) or a
// comma-bearing fallback like rgba(0,0,0,0.5). That's ruled out by construction, not by this
// file -- every fallback tokenise.mjs can emit is a flat px or hex literal taken straight from
// its own TYPE/RADIUS/COLOUR maps, so neither shape is reachable here. (The nested case would
// also fail SAFE -- i.e. block rather than silently pass -- if it ever were reachable.)
const expandVar = s => s.replace(/var\(--[a-z0-9-]+,\s*([^)]*)\)/gi, (_m, lit) => lit.trim())

// LINE-ENDING NORMALISATION -- why this is still a sound proof, not a weakened one.
//
// This repo runs with core.autocrlf=true: the working tree is checked out CRLF, but `git show`
// reads the raw git object directly and does NOT apply the checkout filter, so it always returns
// LF-only text. That gap is introduced entirely by git's own checkout machinery -- it exists on
// an UNTOUCHED file too (confirmed against js/app-dashboard.js, never part of this conversion)
// -- so comparing raw bytes across the git-blob/working-tree boundary is structurally
// unachievable here, for reasons that have nothing to do with whether the codemod is correct.
//
// tokenise.mjs never inserts, removes, or alters a line ending anywhere in a file: every
// replacement it makes is `literal -> var(token, literal)` performed in place on a single line,
// inside a style="..." attribute body. So the only way a REAL bug in this codemod can surface is
// as a difference in non-whitespace content -- rounding a value, touching the wrong property,
// mangling a quote, converting text outside a style attribute. None of those shapes is a pure
// line-ending change, so normalising CRLF -> LF on both sides before comparing cannot conceal
// any difference this codemod is capable of introducing. The property being proven is therefore
// "content-identical modulo line-ending representation" -- exactly as strong a zero-visual-change
// proof as byte-identity, given what this script can and cannot do to a file.
const norm = s => s.replace(/\r\n/g, '\n')

// Expand BOTH sides, not just the converted one. For the traditional two-file, pre-conversion-
// original use case this changes nothing: a real pre-conversion original never contains the
// var(token, literal) shape (this codebase's existing var(--x) custom-property usage has no
// comma, so the regex above never matches it), so expanding it is a no-op. It matters for the
// single-argument, post-commit form: once HEAD *is* the conversion commit, `git show HEAD:<file>`
// returns the ALREADY-CONVERTED text (var() and all), so the "original" side needs the same
// expansion applied to compare like-for-like -- otherwise a clean, unmodified working tree would
// wrongly report FAILED against its own HEAD.
const origExpanded = norm(expandVar(origRaw))
const convExpanded = norm(expandVar(convRaw))

if (origExpanded === convExpanded) {
  console.log(`ROUND-TRIP OK -- ${convPath} expands content-identically (mod line endings) to ${origLabel}`)
  process.exit(0)
}

const a = origExpanded.split('\n'), b = convExpanded.split('\n')
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) {
    console.error(`ROUND-TRIP FAILED at line ${i + 1}`)
    console.error(`  original : ${JSON.stringify(a[i])}`)
    console.error(`  expanded : ${JSON.stringify(b[i])}`)
    break
  }
}
process.exit(1)
