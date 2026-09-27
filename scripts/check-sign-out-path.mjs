#!/usr/bin/env node
/**
 * checks.sh rule 9q: `db.auth.signOut(` may appear ONLY inside signOutAndClearDrafts() (app-core.js).
 *
 * Why: the 2026-07-10 fix that wipes PII runner drafts at sign-out was wired to ONE of four sign-out
 * routes, the desktop sidebar button, which is hidden on phones. Phone users sign out from Settings,
 * so the fix never ran on the shared gym devices it was written for (docs/bugs/
 * 2026-09-27-settings-sign-out-leaves-runner-drafts-on-the-phone.md). One path, enforced.
 *
 * Usage: node scripts/check-sign-out-path.mjs <file.js> ...   (exit 1 = a finding)
 */
import { readFileSync } from 'node:fs'

const HELPER = 'signOutAndClearDrafts'
const files = process.argv.slice(2)
if (!files.length) { console.log('  check-sign-out-path: no files given'); process.exit(1) }

// Blank out // line comments and /* */ blocks (keeping line numbers), so prose that NAMES the call is
// not counted. A // preceded by ':' is a URL inside a string, not a comment.
const stripComments = s => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, pre) => pre + ' '.repeat(m.length - pre.length))

let findings = 0
let helperFound = 0
for (const f of files) {
  const src = stripComments(readFileSync(f, 'utf8'))
  // The helper's body: from its declaration to the first `}` at column 0 after it.
  let lo = -1, hi = -1
  const decl = src.search(new RegExp(`^(async\\s+)?function\\s+${HELPER}\\s*\\(`, 'm'))
  if (decl !== -1) {
    helperFound++
    lo = decl
    const end = src.indexOf('\n}', decl)
    hi = end === -1 ? src.length : end + 2
  }
  for (const m of src.matchAll(/\bdb\.auth\.signOut\s*\(/g)) {
    if (m.index >= lo && m.index < hi) continue
    findings++
    const line = src.slice(0, m.index).split('\n').length
    console.log(`  ${f}:${line}  db.auth.signOut() outside ${HELPER}() -- call ${HELPER}() instead`)
  }
}
if (helperFound !== 1) {
  console.log(`  expected exactly one ${HELPER}() declaration, found ${helperFound}`)
  process.exit(1)
}
if (findings) process.exit(1)
console.log(`  check-sign-out-path: every sign-out goes through ${HELPER}().`)
process.exit(0)
