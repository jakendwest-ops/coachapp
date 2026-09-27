#!/usr/bin/env node
// A short, answerable confirmation list for Jake — added 2026-09-27.
//
// WHY. `fixed-awaiting-jake` is the ledger's bottleneck: every fix waits on one person to confirm it, and the
// rows arrive faster than they leave (95 waiting on 2026-09-27, 56 of them reported in July). os-lint already
// COUNTS the queue; nothing turned it into something Jake could answer in one message. This prints the
// oldest N as a numbered list with the row's own "how to check" text, and asks for a one-word answer each:
//
//   yes      — confirmed working  → status: confirmed
//   no       — still broken       → status: open (the row gets his note)
//   accept   — never checked, stop tracking it → status: unverified-accepted (Jake's call, never by age)
//
// It changes NOTHING by itself. Applying the answers is a separate, reviewed edit of the rows.
//
//   node scripts/ledger-batch.mjs          # oldest 10
//   node scripts/ledger-batch.mjs 20       # oldest 20
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BUGS = process.env.LEDGER_BUGS || join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'bugs')
const N = Math.max(1, Number(process.argv[2]) || 10)
const DAY = 86_400_000

const rows = []
for (const f of readdirSync(BUGS).filter(f => f.endsWith('.md'))) {
  const text = readFileSync(join(BUGS, f), 'utf8').replace(/\r\n/g, '\n')
  const fm = text.match(/^---\n([\s\S]*?)\n---/)
  if (!fm) continue
  const field = k => (fm[1].match(new RegExp(`^${k}:\\s*(.*)$`, 'm')) || [])[1]?.replace(/^"|"$/g, '').trim() || ''
  const title = (text.slice(fm[0].length).match(/^#\s+(.+)$/m) || [])[1] || f
  rows.push({ file: f, status: field('status'), reported: field('reported'), detail: field('status_detail'), title })
}

const age = r => Math.floor((Date.now() - Date.parse(r.reported)) / DAY)
const waiting = rows.filter(r => r.status === 'fixed-awaiting-jake' && r.reported).sort((a, b) => age(b) - age(a))
// Rows whose STATUS says verified while their TEXT still says it is waiting — one fact in two fields
// disagreeing. Only Jake knows which field is right, so they go on the same list.
// A row whose detail STARTS with the confirmation (written by applying a batch) is settled, even though it keeps
// its old text after "Previously:".
const mixed = rows.filter(r => r.status === 'confirmed' && /awaiting jake/i.test(r.detail) && !/^confirmed/i.test(r.detail))

console.log(`\nLEDGER — ${waiting.length} fix(es) waiting on Jake; the oldest ${Math.min(N, waiting.length)} below.`)
console.log('Reply with a number and one word each: yes (works) / no (still broken) / accept (stop tracking).\n')
waiting.slice(0, N).forEach((r, i) => {
  const how = r.detail.replace(/\s+/g, ' ').slice(0, 160)
  console.log(`${String(i + 1).padStart(2)}. ${r.title}`)
  console.log(`    ${age(r)} days old · ${r.file}${how && how !== 'fixed — awaiting Jake' ? `\n    ${how}${r.detail.length > 160 ? '…' : ''}` : ''}`)
})
if (mixed.length) {
  console.log(`\nAlso: ${mixed.length} row(s) say "confirmed" but their text still says "awaiting Jake". Which is right?`)
  for (const r of mixed.slice(0, N)) console.log(`    · ${r.file}`)
  if (mixed.length > N) console.log(`    …and ${mixed.length - N} more`)
}
console.log('')
