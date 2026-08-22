#!/usr/bin/env node
/**
 * checks.sh rule 9a — PII in log.* calls (the GDPR class).
 *
 * CRITICAL.md tracks UK GDPR special-category data: weights, body fat, photos, performance metrics.
 * The standing rule is IDs and dates only in logs — never names, emails, weights or health values.
 *
 * Moved out of inline grep on 2026-08-22 because the shell version could not fail on the commonest
 * log shape in this codebase. It ended:
 *
 *     | grep -v "clientId\\|userId\\|date\\|//"
 *
 * and that exclusion applied to the whole LINE, not to the PII match. So any log call carrying an id
 * ALONGSIDE PII was silently exempt. Reproduced with a positive control:
 *
 *     log.error("x","y",{ full_name: n })                      -> FIRED     (rule works)
 *     log.error("saveClientWeight","f",{ clientId, full_name }) -> MISSED    (id on the line exempts it)
 *
 * `log.<level>(fn, msg, { clientId })` is the single commonest logging shape here, and the ~25
 * ownership guards added 2026-08-21/22 all use it — so the gate was structurally blind to exactly the
 * shape the newest code is written in. Nothing had actually shipped; the alarm simply could not ring.
 *
 * Same lesson, same fix as rule 9d (check-escaping.mjs): match PER KEY, not per line. Two shell
 * versions of THAT rule got it wrong the same way before it was moved to node.
 *
 * Usage: node scripts/check-pii-logs.mjs js/a.js js/b.js …   (exit 1 = findings, printed to stdout)
 */

import { readFileSync, existsSync } from 'node:fs'

// Keys that may NEVER appear in a log payload. Matched as whole keys, so `exercise_name` and
// `template_name` are unaffected — they are not personal data, and flagging them would make the rule
// fail on a clean tree, which is how a rule gets disabled.
const PII_KEYS = [
  'full_name', 'fullName', 'first_name', 'last_name', 'firstName', 'lastName',
  'email', 'phone', 'dob', 'date_of_birth', 'address',
  'weight_kg', 'weightKg', 'body_fat_pct', 'body_fat', 'bodyFat', 'resting_hr', 'restingHr',
  'one_rm_kg', 'oneRmKg', 'notes', 'client_notes', 'clientNotes',
]

// Spreading a whole row into a log is the other shape: `{ ...row }` / `{ row }` / `row: r` can carry
// anything the table holds, so the payload cannot be reasoned about at all.
const ROW_SPREAD = /(\.\.\.\s*(row|client|data|profile)\b|\b(row|clientRow)\s*[,}])/

const files = process.argv.slice(2).filter(f => existsSync(f))
const hits = []

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)

  lines.forEach((line, i) => {
    if (line.includes('LINT-OK')) return
    // Every log call on this line, each handled INDEPENDENTLY — a clean call must not launder a
    // dirty neighbour, which is the per-line bug this file exists to end.
    const callRe = /\blog\.(info|ok|warn|error)\s*\(/g
    let m
    while ((m = callRe.exec(line)) !== null) {
      // Walk from the call's open paren to its matching close, so we read THIS call's arguments only.
      let depth = 0, end = -1
      for (let p = m.index + m[0].length - 1; p < line.length; p++) {
        if (line[p] === '(') depth++
        else if (line[p] === ')') { depth--; if (depth === 0) { end = p; break } }
      }
      const args = line.slice(m.index, end === -1 ? line.length : end + 1)

      for (const key of PII_KEYS) {
        // `key:` (explicit) or `key` as object shorthand — both bounded so exercise_name never matches
        // full_name, and clientId never matches anything here.
        const re = new RegExp(`[{,]\\s*${key}\\s*[,:}]|\\b${key}\\s*:`)
        if (re.test(args)) {
          hits.push(`${file}:${i + 1} → log.${m[1]}(…) carries \`${key}\``)
          break
        }
      }
      if (ROW_SPREAD.test(args)) hits.push(`${file}:${i + 1} → log.${m[1]}(…) spreads a whole row`)
    }
  })
}

if (hits.length) {
  console.log(`  ${hits.length} PII-in-log finding(s) — IDs and dates only, never names/emails/health values:`)
  for (const h of hits) console.log(`    ${h}`)
  console.log('    CRITICAL.md tracks these as GDPR special-category data. Log the id, resolve the value at read time.')
  process.exit(1)
}
process.exit(0)
