#!/usr/bin/env node
/**
 * Proves check-sign-out-path.mjs BLOCKS a sign-out that bypasses the draft-clearing helper (the exact
 * Settings-button shape that shipped until 2026-09-27), and passes the helper itself plus prose about it.
 * Run: node scripts/check-sign-out-path.selftest.mjs      (exit 1 = a case misbehaved)
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-sign-out-path.mjs')
const HELPER = 'async function signOutAndClearDrafts () {\n  clear()\n  await db.auth.signOut()\n}\n'

const CASES = [
  { want: 'BLOCK', why: 'the real pre-fix Settings button: inline onclick calling signOut directly',
    src: HELPER + 'const h = `<button onclick="db.auth.signOut().then(()=>location.reload())">Sign out</button>`' },
  { want: 'BLOCK', why: 'a direct call in another function (the consent-gate / delete-account shape)',
    src: HELPER + 'async function leave () {\n  await db.auth.signOut()\n}\n' },
  { want: 'BLOCK', why: 'the helper deleted entirely -- nothing is left to route through',
    src: 'async function leave () { await other() }\n' },
  { want: 'BLOCK', why: 'a call AFTER the helper closes is outside it',
    src: HELPER + 'db.auth.signOut()\n' },
  { want: 'PASS', why: 'the helper itself',
    src: HELPER },
  { want: 'PASS', why: 'a comment that names the call is prose, not a sign-out',
    src: '// never call db.auth.signOut() directly\n' + HELPER + '/* db.auth.signOut( */\n' },
  { want: 'PASS', why: 'a URL with // inside a string must not hide anything or trip anything',
    src: 'const u = "https://example.dev/x"\n' + HELPER },
]

const dir = mkdtempSync(join(tmpdir(), 'signout-selftest-'))
let failures = 0
CASES.forEach((c, i) => {
  const file = join(dir, `case${i}.js`)
  writeFileSync(file, c.src, 'utf8')
  let exit = 0, out = ''
  try { out = execFileSync(process.execPath, [CHECK, file], { encoding: 'utf8' }) }
  catch (err) { exit = err.status; out = (err.stdout || '') + (err.stderr || '') }
  const got = exit === 0 ? 'PASS' : 'BLOCK'
  if (got !== c.want) { failures++; console.log(`  [${i}] want ${c.want}, got ${got} -- ${c.why}\n${out}`) }
})
rmSync(dir, { recursive: true, force: true })

const blocks = CASES.filter(c => c.want === 'BLOCK').length
if (!blocks || blocks === CASES.length) { console.log('  self-test is one-sided'); process.exit(1) }
if (failures) { console.log(`  ${failures} of ${CASES.length} self-test cases misbehaved.`); process.exit(1) }
console.log(`  check-sign-out-path self-test: ${CASES.length} cases behaved (${blocks} must-block, ${CASES.length - blocks} must-pass).`)
process.exit(0)
