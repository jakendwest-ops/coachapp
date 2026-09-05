#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════════════════════════
// Every spec that CREATES rows must tag them, so leftovers can be found and reaped.
//
//   node scripts/check-fixture-tagging.mjs tests/*.spec.js
//
// WHY. Measured 2026-09-05: 52 of 99 specs insert rows, but only 13 have an afterEach/afterAll hook.
// The other 39 clean up inline, so cleanup runs only when the test PASSES — a failing test leaves
// debris, debris makes later tests fail, and those failures leave more debris. The reaper
// (scripts/reap-e2e-debris.mjs) breaks that loop, but it can only find rows it can RECOGNISE. An
// untagged fixture is invisible to it forever.
//
// So this rule is what keeps the reaper honest. Without it the reaper reports "clean" while untagged
// debris accumulates — a check that reports success while doing nothing, which is this project's
// single most-shipped bug class.
//
// The tag is a NAME PREFIX because that is what survives the failure mode that matters: a test that
// dies before capturing an id can still have its rows found by name.
// ════════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'

// One prefix. Variants like [E2E-RLS] and [E2E-PP] are fine — they start with it — which is why this
// is a prefix test and not an equality test.
const TAG = '[E2E'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: check-fixture-tagging.mjs <spec files...>')
  process.exit(2)
}

const violations = []
for (const f of files) {
  let src
  try { src = readFileSync(f, 'utf8') } catch { continue }
  // A BOM would make a naive ^-anchored scan miss line 1; read-and-strip, same as the other checkers.
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1)
  if (!src.includes('.insert(')) continue
  if (!src.includes(TAG)) violations.push(f)
}

if (violations.length) {
  console.log(`  ${violations.length} spec(s) create rows but never tag them "${TAG}…":`)
  for (const f of violations) console.log(`    ${f}`)
  console.log(`
    Rows a spec creates must carry "${TAG}" in a name/title/full_name, or
    scripts/reap-e2e-debris.mjs can never find them and they accumulate in the live database
    forever. Prefix the fixture name — e.g. name: \`${TAG}] my fixture \${Date.now()}\`.`)
  process.exit(1)
}

console.log(`  ${files.length} specs scanned; every spec that inserts rows tags them "${TAG}…".`)
process.exit(0)
