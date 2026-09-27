#!/usr/bin/env node
// Refuses a push while an OPEN security bug is written up in the public repo — added 2026-09-27.
//
// WHY. The GitHub repo is PUBLIC (checked 2026-09-26), and the bug ledger lives in it. On 2026-09-26 the
// write-up of an open hole (a client could re-point their own clients.coach_id — the policy name and the
// exact probe included) sat in a local commit that the normal workflow would have pushed before the fix
// was live; it was held back by hand. Making the repo private is not an option: GitHub Pages on a free
// plan only serves public repos, so it would take the live site down.
//
// So: a bug row whose frontmatter says `security: true` must not reach the remote while its status is
// `open`. Keep the write-up in docs/bugs/embargo/ (git-ignored) until the fix is live, then move it into
// docs/bugs/. Rows without the field are untouched — this opts IN, so it cannot refuse a legitimate push
// that has no security row in it.
//
//   node scripts/check-security-embargo.mjs     # exit 0 = nothing embargoed is tracked; 1 = refuse the push
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BUGS = process.env.EMBARGO_BUGS || join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'bugs')
if (!existsSync(BUGS)) { console.log(`  no bug directory at ${BUGS}`); process.exit(0) }

const offenders = []
let scanned = 0
for (const f of readdirSync(BUGS).filter(f => f.endsWith('.md'))) {
  const text = readFileSync(join(BUGS, f), 'utf8').replace(/\r\n/g, '\n')
  const fm = text.match(/^---\n([\s\S]*?)\n---/)
  if (!fm) continue
  scanned++
  const security = /^security:\s*true\s*$/m.test(fm[1])
  const status = (fm[1].match(/^status:\s*(\S+)/m) || [])[1]
  if (security && status === 'open') offenders.push(f)
}

if (offenders.length) {
  console.log(`  ${offenders.length} OPEN security bug(s) are written up in docs/bugs/ — this repo is PUBLIC:`)
  for (const f of offenders) console.log(`    · ${f}`)
  console.log('  Move each to docs/bugs/embargo/ (git-ignored) until the fix is live, then move it back and')
  console.log('  set its status. If a row is not actually sensitive, remove its `security: true` line.')
  process.exit(1)
}
console.log(`  No open security write-up is tracked (${scanned} bug files scanned).`)
process.exit(0)
