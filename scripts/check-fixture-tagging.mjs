#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════════════════════════
// Every spec that CREATES rows must tag them, so leftovers can be found and reaped.
//
//   node scripts/check-fixture-tagging.mjs tests/*.spec.js
//
// WHY. Measured 2026-09-05: 52 of 99 specs insert rows, but only 13 have an afterEach/afterAll hook.
// The other 39 clean up inline, so cleanup runs only when the test PASSES — a failing test leaves
// debris, debris makes later tests fail, and those failures leave more. scripts/reap-e2e-debris.mjs
// breaks the loop, but it can only delete rows it can RECOGNISE. An untagged fixture is invisible to
// it forever.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS CAN AND CANNOT PROVE. Read this before trusting it.
//
// It proves: a spec that inserts rows mentions the tag SOMEWHERE IN ITS CODE. That is a real filter —
// it catches a spec written with no tagging discipline at all, which is how the two violations found
// on 2026-09-05 got in.
//
// It does NOT prove every individual insert is tagged. A file with two inserts, one tagged and one
// not, passes. That hole is deliberate rather than lazy: fixture names routinely flow through
// variables (`const tag = `[E2E] thing ${Date.now()}`` … `name: tag`), so a checker demanding the
// literal inside each `.insert(...)` argument would flag correct code constantly — and a checker that
// refuses correct code is one that gets switched off. This project has that scar.
//
// The mechanism that catches the residue is not static at all: tests/global-teardown.js reports how
// many tagged rows each run actually leaked, which is ground truth rather than inference. If that
// number stops matching what the specs claim, the gap is there.
//
// The one hole that IS closed here: a tag appearing only inside a COMMENT no longer satisfies the
// check. Comments are blanked first, via the same helper check-handler-targets and check-count-ratchet
// use — an "// we used to use [E2E] tags" line would otherwise wave a wholly untagged spec through,
// verified 2026-09-05 against the first version of this file.
// ════════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { blankComments } from './lib/comments.mjs'

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
  // A BOM would make a naive ^-anchored scan miss line 1; strip on read, same as the other checkers.
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1)
  const code = blankComments(src)
  if (!code.includes('.insert(')) continue
  if (!code.includes(TAG)) violations.push(f)
}

if (violations.length) {
  console.log(`  ${violations.length} spec(s) create rows but never tag them "${TAG}…":`)
  for (const f of violations) console.log(`    ${f}`)
  console.log(`
    Rows a spec creates must carry "${TAG}" in a name/title/full_name, or
    scripts/reap-e2e-debris.mjs can never find them and they accumulate in the live database
    forever. Prefix the fixture name — e.g. name: \`${TAG}] my fixture \${Date.now()}\`.
    A tag inside a comment does not count.`)
  process.exit(1)
}

console.log(`  ${files.length} specs scanned; every spec that inserts rows tags them "${TAG}…" in code.`)
process.exit(0)
