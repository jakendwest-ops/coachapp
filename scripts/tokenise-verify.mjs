#!/usr/bin/env node
// ROUND-TRIP PROOF. Expands every var(--token, literal) back to its literal and asserts
// the result is BYTE-IDENTICAL to the original file.
//
// This is the primary verification and it is a proof over the WHOLE diff, not a sample:
// if the codemod rounded a value, touched the wrong property, or mangled a quote, the
// expansion stops matching. Deterministic, no browser, cannot flake.
//
// What it does NOT prove: that the tokens are DEFINED. A typo'd var(--text-bse, 13px)
// round-trips perfectly. tests/design-tokens-2026-08-22.spec.js covers that.
import { readFileSync } from 'node:fs'

const [, , origPath, convPath] = process.argv
if (!origPath || !convPath) { console.error('usage: tokenise-verify.mjs <original> <converted>'); process.exit(2) }

const orig = readFileSync(origPath, 'utf8')
const conv = readFileSync(convPath, 'utf8')

// var(--anything, LITERAL) -> LITERAL
// Not general-purpose: this regex is untested against nested var(--a, var(--b, 13px)) or a
// comma-bearing fallback like rgba(0,0,0,0.5). That's ruled out by construction, not by this
// file -- every fallback tokenise.mjs can emit is a flat px or hex literal taken straight from
// its own TYPE/RADIUS/COLOUR maps, so neither shape is reachable here. (The nested case would
// also fail SAFE -- i.e. block rather than silently pass -- if it ever were reachable.)
const expanded = conv.replace(/var\(--[a-z0-9-]+,\s*([^)]*)\)/gi, (_m, lit) => lit.trim())

if (expanded === orig) {
  console.log(`ROUND-TRIP OK -- ${convPath} expands byte-identically to ${origPath}`)
  process.exit(0)
}

const a = orig.split('\n'), b = expanded.split('\n')
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) {
    console.error(`ROUND-TRIP FAILED at line ${i + 1}`)
    console.error(`  original : ${JSON.stringify(a[i])}`)
    console.error(`  expanded : ${JSON.stringify(b[i])}`)
    break
  }
}
process.exit(1)
