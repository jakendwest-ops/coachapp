#!/usr/bin/env node
/**
 * Bumps the `?v=N` cache-bust in index.html for every js/ or css/ file staged in this commit.
 *
 * WHY THIS IS AUTOMATED. The rule -- change a module, raise its ?v= in the same commit -- was written
 * down, and it was broken anyway. On 2026-08-22 three modules shipped their ownership guards with no
 * bump at all, so a returning browser ran the OLD, UNGUARDED code while index.html said nothing had
 * changed. checks.sh rule 3 was strengthened afterwards to catch that, but a gate that refuses at
 * PUSH time still costs a whole commit cycle. Measured over the last 60 commits: 32 carry a hand-edit
 * to index.html that is 100% ?v= churn, and 7 exist only for bump bookkeeping.
 *
 * A written rule does not reduce errors; a mechanism does. This is the mechanism, and checks.sh rule 3
 * remains the verifier -- deliberately not replaced by it. If this hook is skipped (--no-verify, a
 * fresh clone with no hook installed, a commit made from a GUI that ignores hooks) rule 3 still
 * refuses the push. Two independent layers, neither trusting the other.
 *
 * WHAT IT WILL NOT DO. It never lowers a version, and it never bumps one that is already ahead of
 * HEAD: if you raised the number by hand, or an earlier commit in this same push already raised it,
 * the value is left exactly as you wrote it. `desired = max(current, head + 1)` and nothing else.
 *
 * Usage:  node scripts/bump-versions.mjs [--dry-run]
 *         Called by scripts/pre-commit.sh. Stages index.html itself when it changes something.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = process.env.BUMP_REPO || join(dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry-run')
const INDEX = join(REPO, 'index.html')

const git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim()

// Mid-merge / mid-rebase, the staged set is not "what the author is changing" -- it is whatever the
// merge produced. Bumping there would rewrite someone else's resolution behind their back.
for (const marker of ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD']) {
  if (existsSync(join(REPO, '.git', marker))) {
    console.log(`  [skip] ${marker} present -- not touching cache-busts mid-merge/rebase.`)
    process.exit(0)
  }
}

let headIndex
try {
  headIndex = git('show', 'HEAD:index.html')
} catch {
  console.log('  [skip] no HEAD:index.html to compare against (first commit?).')
  process.exit(0)
}

const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR')
  .split('\n').map(s => s.trim()).filter(Boolean)

const assets = staged.filter(f => /^(js|css)\/[^/]+\.(js|css)$/.test(f))
if (!assets.length) process.exit(0)

/** asset path -> version, as index.html currently states it. */
function versions (html) {
  const out = new Map()
  for (const m of html.matchAll(/(?:href|src)="((?:js|css)\/[a-zA-Z0-9._-]+\.(?:js|css))\?v=(\d+)"/g)) {
    out.set(m[1], Number(m[2]))
  }
  return out
}

let html = readFileSync(INDEX, 'utf8')
const head = versions(headIndex)
const now = versions(html)

const bumped = []
const missing = []

for (const f of assets) {
  if (!now.has(f)) { missing.push(f); continue }
  const desired = Math.max(now.get(f), (head.get(f) ?? 0) + 1)
  if (desired === now.get(f)) continue                  // already ahead of HEAD -- leave it alone
  const before = html
  html = html.replace(new RegExp(`(["'])${f.replace('.', '\\.')}\\?v=${now.get(f)}\\1`), `$1${f}?v=${desired}$1`)
  if (html === before) { missing.push(f); continue }    // never claim a bump that did not land
  bumped.push(`${f} v${now.get(f)} -> v${desired}`)
}

// A staged module with no ?v= tag in index.html is not a no-op: it means the module ships uncached,
// or the tag was renamed. Say so rather than passing silently.
for (const f of missing) {
  console.log(`  [warn] ${f} is staged but has no ?v= entry in index.html -- bump it by hand or add the tag.`)
}

if (!bumped.length) process.exit(0)

if (DRY) {
  console.log(`  [dry-run] would bump: ${bumped.join(', ')}`)
  process.exit(0)
}

writeFileSync(INDEX, html)
git('add', 'index.html')
// Loud, never silent: this rewrote the commit's content. The author must be able to see it happened
// without going looking, or the automation becomes a thing that edits their work invisibly.
console.log(`  [bump] ${bumped.join(', ')}  (index.html staged)`)
process.exit(0)
