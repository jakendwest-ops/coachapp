#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════════════════════════
// Reap leftover [E2E] fixture rows from the live database.
//
//   node scripts/reap-e2e-debris.mjs            → DRY RUN. Counts only. Deletes nothing.
//   node scripts/reap-e2e-debris.mjs --delete   → actually deletes.
//
// THE PROBLEM THIS SOLVES, measured 2026-09-05. 52 of 99 spec files insert rows, but only 13 have an
// afterEach/afterAll hook — the other 39 clean up inline, at the end of the test body. So cleanup
// runs only when the test PASSES. A failing test leaves debris; debris makes later tests fail; those
// failures leave more debris. It is a feedback loop, which is why flakiness "returns across unrelated
// files", gets worse deep into a long run, and disappears when a spec is run in isolation. One
// incident left 242 rows behind; 39 were reaped the day this was written.
//
// SAFETY GUARDS, because this deletes from PRODUCTION:
//   1. Dry run by default. It cannot delete unless you pass --delete.
//   2. It signs in as the E2E TEST ACCOUNT and deletes through PostgREST, so RLS applies. It is
//      incapable of touching a row that account does not own. This is the strongest guard and the
//      reason it does not use a service-role key. Since 2026-09-05 it also ASSERTS the account looks
//      like a test account before deleting — guard 2 was previously resting on an unchecked
//      assumption about what PT_EMAIL happens to contain.
//   3. Name prefix. Only rows whose name/title/full_name starts with '[E2E' or '[TEST]'.
//   4. Age cutoff (default 2h). A row this run just created is never in scope.
//
// WHAT PROTECTS AGAINST A CONCURRENT RUN — stated accurately, because the first version of this
// comment was wrong and a reviewer caught it. There is NO lock file in this repo. Two protections
// exist and neither is complete:
//   - tests/global-setup.js refuses to start a local run while a CI run is in flight. One direction
//     only; CI cannot see this machine.
//   - A Claude Code hook outside the repo (~/.claude/state/playwright-running.lock) refuses a second
//     Playwright run started through the agent harness. It does NOT stop a human typing
//     `npx playwright test` twice in two terminals.
// So: do not run two suites at once. The age cutoff is what limits the damage if you do, which is
// also why REAP_AGE_HOURS=0 (used by the teardown REPORT) must never be combined with --delete.
// ════════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const DELETE = process.argv.includes('--delete')
const AGE_HOURS = Number(process.env.REAP_AGE_HOURS ?? 2)
const PAGE = 1000

// MEASURED 2026-09-05, do not shorten this to '[E2E]'. The suite does not use one tag: 308 uses of
// '[E2E]', plus per-spec variants '[E2E-RLS]', '[E2E-PP]', '[E2E-PB]', '[E2E-2BJ]', and one file
// (ledger-fixes-2026-07-29) that used '[TEST]'. A reaper matching '[E2E]' exactly reports those
// tables CLEAN while their debris sits there — the reports-success-while-doing-nothing shape, inside
// the tool built to prevent it. '[E2E' as a prefix covers the whole family; [ and ] are literal in
// SQL LIKE (only % and _ are wildcards), so no escaping is needed. '[TEST]' is kept even though the
// convention has moved on, because rows carrying it may still exist in the database.
const PREFIXES = ['[E2E', '[TEST]']

// Child-before-parent. Deleting a client cascades, but doing the leaf tables first keeps the counts
// honest — otherwise a cascade silently removes rows this report then claims it deleted itself.
const TARGETS = [
  ['workout_logs', 'name'],
  ['workout_templates', 'name'],
  ['programs', 'name'],
  ['exercises', 'name'],
  ['goals', 'title'],
  ['events', 'title'],
  ['clients', 'full_name']
]

// Deleting a tagged client CASCADES to everything keyed on its client_id, and those rows are NOT
// re-checked against the tag or the age cutoff — an untagged row created minutes ago goes with it.
// RLS still confines that to this account's own tenant, so it cannot reach another coach's data, but
// a destructive tool whose preview understates its blast radius is exactly what this repo punishes.
// So: before deleting any client, count what the cascade will take, and print it.
const CASCADES_FROM_CLIENT = ['workout_logs', 'weight_logs', 'performance_logs', 'goals', 'events',
                              'client_1rms', 'client_programs', 'client_check_ins']

// The URL and anon key are read out of the shipped client source rather than duplicated here. They
// are public by construction — the app is a static site and every visitor has them — and a second
// copy is one more thing to drift.
const core = readFileSync('js/app-core.js', 'utf8')
const url = core.match(/const SUPABASE_URL\s*=\s*'([^']+)'/)?.[1]
const key = core.match(/const SUPABASE_KEY\s*=\s*'([^']+)'/)?.[1]
if (!url || !key) {
  console.error('Could not read SUPABASE_URL/SUPABASE_KEY out of js/app-core.js — has it been restructured?')
  process.exit(1)
}

const email = process.env.PT_EMAIL
const password = process.env.PT_PASSWORD
if (!email || !password) {
  console.error('PT_EMAIL / PT_PASSWORD are not set (.env). Refusing to run — with no session, RLS')
  console.error('would not scope anything and guard 2 would be absent.')
  process.exit(1)
}

// Guard 2, made explicit. RLS confines this script to whatever account PT_EMAIL names; nothing
// previously checked that it names a TEST account. If .env were ever pointed at a real coach, every
// other guard still passes and the name prefix becomes the only thing between this and real data.
// Token-anchored, not a bare substring. `/e2e|test/i` was the first version and a re-review pointed
// out it matches any real address that merely CONTAINS the letters — a "TestFit Gym" domain, or a
// surname like Testerman — which is a false sense of assurance rather than a check. This wants the
// marker to be its own dot/plus/underscore/hyphen-delimited token in the local part.
//
// It is a BACKSTOP, not identity. The real protection is RLS plus the name prefix; this exists so a
// mis-set .env cannot quietly turn a test tool loose on a live account. REAP_ALLOW_ANY_ACCOUNT=1 is
// the deliberate override, so an unusual-but-legitimate test address is not a dead end.
const localPart = email.split('@')[0] || ''
const looksLikeTestAccount = /(^|[.+_-])(e2e|test)([.+_-]|$)/i.test(localPart)
if (DELETE && !looksLikeTestAccount && !process.env.REAP_ALLOW_ANY_ACCOUNT) {
  console.error('Refusing to delete: PT_EMAIL does not look like a test account.')
  console.error(`  local part: ${localPart}`)
  console.error('RLS scopes this script to whatever account .env names, so pointing it at a real one')
  console.error('would leave the name prefix as the ONLY protection left. Use a test account, run the')
  console.error('dry run, or set REAP_ALLOW_ANY_ACCOUNT=1 if you are certain.')
  process.exit(1)
}

const db = createClient(url, key)
const { data: auth, error: authErr } = await db.auth.signInWithPassword({ email, password })
if (authErr || !auth?.user) {
  console.error(`Sign-in failed for the test account: ${authErr?.message || 'no user returned'}`)
  process.exit(1)
}

const cutoff = new Date(Date.now() - AGE_HOURS * 3600 * 1000).toISOString()
console.log(`\n${DELETE ? 'REAPING' : 'DRY RUN —'} ${PREFIXES.join(' / ')} rows older than ${AGE_HOURS}h (before ${cutoff})`)
console.log(`as ${auth.user.id} · RLS applies · ${DELETE ? 'ROWS WILL BE DELETED' : 'nothing will be deleted'}`)
console.log('─'.repeat(76))

let total = 0
let failedTables = 0
let capped = false

for (const [table, col] of TARGETS) {
  // One query per prefix, merged. Cheaper to read than an .or() with bracket-laden values in it.
  let rows = []
  let error = null
  let aged = true
  for (const prefix of PREFIXES) {
    // created_at is not guaranteed on every table. Ask for it, and fall back to prefix-only scoping
    // if the column does not exist — never silently skip the table, which would hide debris.
    let res = await db.from(table)
      .select(`id, ${col}, created_at`).like(col, `${prefix}%`).lt('created_at', cutoff).limit(PAGE)
    if (res.error && /created_at/.test(res.error.message || '')) {
      aged = false
      res = await db.from(table).select(`id, ${col}`).like(col, `${prefix}%`).limit(PAGE)
    }
    if (res.error) { error = res.error; break }
    // A full page means there may be more that this run will neither report nor delete. Say so —
    // otherwise a later "clean" reads as "there is nothing left" while a backlog quietly remains.
    if ((res.data || []).length === PAGE) capped = true
    rows.push(...(res.data || []))
  }

  if (error) {
    console.log(`  ${table.padEnd(22)} ERROR  ${error.message}`)
    failedTables++
    continue
  }

  // A row can only match one prefix, but de-dupe anyway so a future overlapping prefix cannot make
  // the count lie.
  rows = [...new Map(rows.map(r => [r.id, r])).values()]
  const n = rows.length
  if (!n) { console.log(`  ${table.padEnd(22)} clean`); continue }

  total += n
  const note = aged ? '' : '  (no created_at — prefix-scoped only)'
  console.log(`  ${table.padEnd(22)} ${String(n).padStart(4)} row(s)${note}`)
  for (const r of rows.slice(0, 3)) console.log(`      e.g. ${r[col]}`)
  if (n > 3) console.log(`      … and ${n - 3} more`)

  // The blast radius a name-prefix filter cannot see.
  if (table === 'clients') {
    const ids = rows.map(r => r.id)
    let cascadeTotal = 0
    for (const child of CASCADES_FROM_CLIENT) {
      const { count, error: cErr } = await db.from(child)
        .select('id', { count: 'exact', head: true }).in('client_id', ids)
      if (cErr) {
        console.log(`      cascade: ${child} unreadable (${cErr.message})`)
        failedTables++
        continue
      }
      if (count) { console.log(`      cascade: ${String(count).padStart(4)} ${child}`); cascadeTotal += count }
    }
    if (cascadeTotal) {
      console.log(`      ^ ${cascadeTotal} row(s) go with these clients by FK cascade, REGARDLESS of tag or age`)
    }
  }

  if (DELETE) {
    // .select() on the delete, then count: an RLS-refused delete resolves as { data: [], error: null },
    // so without the rowcount this would report success while removing nothing.
    const { data: gone, error: delErr } = await db.from(table)
      .delete().in('id', rows.map(r => r.id)).select('id')
    if (delErr) { console.log(`      DELETE FAILED: ${delErr.message}`); failedTables++ }
    else console.log(`      deleted ${(gone || []).length} of ${n}`)
  }
}

console.log('─'.repeat(76))
if (capped) {
  console.log(`  NOTE: a query returned a full page of ${PAGE} rows. There may be more than is reported`)
  console.log(`  here — re-run until this note stops appearing.`)
}
if (!total) {
  console.log('  No debris found.\n')
} else if (DELETE) {
  console.log(`  ${total} row(s) reaped.\n`)
} else {
  console.log(`  ${total} row(s) WOULD be reaped. Re-run with --delete to actually remove them.\n`)
}

// A table that errored means the report is incomplete, and an incomplete report that exits 0 is the
// reports-success-while-doing-nothing shape this repo exists to avoid.
process.exit(failedTables ? 1 : 0)
