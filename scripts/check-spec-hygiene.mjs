#!/usr/bin/env node
/**
 * A cleanup `.delete()` in a spec must ask what it actually deleted.
 *
 * WHY. A Supabase delete that RLS refuses does not throw and does not set `error`. It resolves as
 * `{ data: [], error: null }` — indistinguishable, to code that does not look, from a delete that
 * removed the row. So a teardown written as
 *
 *     await db.from('workout_templates').delete().eq('id', id)
 *
 * reports success whether it worked or not. The only way to know is `.select('id')` and then look at
 * how many rows came back.
 *
 * This is not hypothetical here. 242 `[E2E]` rows were reaped from the live test account on
 * 2026-08-30 — 96% of the workout_templates on it — left behind by teardown that had been "passing"
 * for months. Two specs turned out to be silently DEPENDING on that debris as their fixture. There is
 * an open ledger row for it: 2026-08-22-cleanup-deletes-without-rowcount-across-four-probe-specs.
 *
 * MEASURED BEFORE IT WAS GIVEN TEETH, 2026-09-04: 366 `.delete()` calls in tests/, of which 348 (95%)
 * have no `.select()` in the chain at all. So this CANNOT be a blocking rule — it would refuse
 * essentially every spec in the suite, which is how a gate gets switched off rather than satisfied.
 * It is a RATCHET pinned at the measurement: the count may fall, and may never rise. The refactor plan
 * says these get converted as their specs are touched, not as a sweep.
 *
 * WHAT IS DELIBERATELY NOT ENFORCED. Having `.select()` is only half the fix — the result still has to
 * be inspected. Proving that reliably needs data-flow analysis, and guessing at it with a regex would
 * produce exactly the false refusals this project has a scar from. So the select-but-never-inspected
 * count is REPORTED, not enforced, and it is honest about being a lower bound.
 *
 * Usage:  node scripts/check-spec-hygiene.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectChain, isCommentLine } from './lib/chains.mjs'
import { readBaseline } from './lib/baseline.mjs'

const REPO = process.env.SPEC_REPO || join(dirname(fileURLToPath(import.meta.url)), '..')
const TESTS = join(REPO, 'tests')

// Pinned AT the 2026-09-04 measurement, never above it.
const BASELINE = readBaseline('SPEC_HYGIENE_BASELINE', 348)

if (!existsSync(TESTS)) {
  console.log('  no tests/ directory — refusing to report a count against nothing.')
  process.exit(1)
}

const files = readdirSync(TESTS).filter(f => f.endsWith('.js')).map(f => join('tests', f))

let total = 0
let uninspected = 0
const unchecked = []

for (const rel of files) {
  const lines = readFileSync(join(REPO, rel), 'utf8').replace(/^﻿/, '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (!/\.delete\(\s*\)/.test(lines[i])) continue
    if (isCommentLine(lines[i])) continue              // a comment describing a delete is not one
    total++
    const chain = collectChain(lines, i)
    if (!/\.select\(/.test(chain)) { unchecked.push(`${rel}:${i + 1}`); continue }
    // Has .select() — is the result looked at anywhere nearby? Reported only, see the header.
    const window = lines.slice(i, i + 8).join(' ')
    if (!/\.length|toHaveLength|toEqual|expect\(/.test(window)) uninspected++
  }
}

// Non-zero denominator. A glob that matched no specs, or a regex that stopped matching, would report
// "0 unchecked deletes" — a perfect score produced by looking at nothing.
if (!total) {
  console.log(`  scanned ${files.length} spec files and found NO .delete() calls at all.`)
  console.log('  That is not a clean bill of health, it is a broken scan. Refusing to report a pass.')
  process.exit(1)
}

console.log(`  ${total} .delete() calls across ${files.length} specs; ${unchecked.length} without .select() (baseline ${BASELINE}).`)
if (uninspected) {
  console.log(`    [note] ${uninspected} more DO call .select() but nothing nearby reads the result — a lower bound, not enforced.`)
}

if (unchecked.length > BASELINE) {
  console.log('')
  console.log(`    ${unchecked.length - BASELINE} new unchecked delete(s).`)

  // The count alone cannot say WHICH one is new. The first version printed the last six in file
  // order under the heading "Most recent", which is simply alphabetically last — it pointed at
  // workout-picker when the new delete was in solo-account. A gate that names the wrong file is worse
  // than one that names none, so: narrow to the files this change actually touches, and when that is
  // not knowable, say so instead of guessing.
  let touched = []
  try {
    const { execFileSync } = await import('node:child_process')
    const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    touched = [...new Set(
      (git('diff', '--name-only', 'HEAD') + '\n' + git('diff', '--name-only', '--cached'))
        .split('\n').map(s => s.trim()).filter(Boolean)
    )]
  } catch {
    touched = []                                       // not a git repo (the self-test fixtures), or git unavailable
  }

  const norm = (p) => p.replace(/\\/g, '/')
  const inTouched = unchecked.filter(u => touched.some(t => norm(u).startsWith(norm(t) + ':')))

  if (inTouched.length) {
    console.log('    In files you have changed:')
    for (const u of inTouched.slice(0, 10)) console.log(`      ${u}`)
  } else {
    console.log('    None of them are in a file you have changed, so this checker cannot tell you')
    console.log('    which is new — compare against your own diff.')
  }
  console.log('')
  console.log('    An RLS-refused delete resolves as { data: [], error: null } — it looks exactly like')
  console.log('    a delete that worked. Add .select(\'id\') and assert on the rows returned, or the')
  console.log('    teardown will report success while leaving rows in the live test account.')
  process.exit(1)
}

if (unchecked.length < BASELINE) {
  console.log(`    [note] down to ${unchecked.length} from ${BASELINE} — lower SPEC_HYGIENE_BASELINE in this file.`)
}
process.exit(0)
