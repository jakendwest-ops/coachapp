#!/usr/bin/env node
/**
 * Proves check-pii-logs.mjs BLOCKS every shape PII reaches a log in, AND stays quiet on the log calls this
 * codebase actually writes.
 *
 * check-pii-logs.mjs had no self-test from 2026-08-22 until 2026-10-18: it had been seen to pass and, once, to miss
 * (the id-on-the-line exemption). A checker observed only passing cannot be told from a dead one, so both
 * directions are asserted. The PASS fixtures are real shapes from js/ (the multi-line ones are the four that
 * exist in the tree; `{ name: e?.name }` is the seven error-type-name sites).
 *
 * Run: node scripts/check-pii-logs.selftest.mjs      (exit 1 = a case misbehaved)
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-pii-logs.mjs')

const CASES = [
  // ── must BLOCK ────────────────────────────────────────────────────────────────
  { want: 'BLOCK', why: 'the original: a PII key and nothing else',
    src: `log.error('x', 'y', { full_name: n })` },
  { want: 'BLOCK', why: 'PII beside an id -- the shape the first shell rule was blind to',
    src: `log.error('saveClientWeight', 'failed', { clientId, full_name: n })` },
  { want: 'BLOCK', why: 'PII on a LATER LINE of the call (the first version read only the opening line)',
    src: `log.error('saveClient', 'insert failed',\n  { clientId, email })` },
  { want: 'BLOCK', why: 'a second call on the same line is dirty while the first is clean',
    src: `log.info('a', 'b', { clientId }); log.warn('c', 'd', { weight_kg: w })` },
  { want: 'BLOCK', why: 'PII interpolated into the message (it reaches the toast and the error report)',
    src: "log.error('save', `failed for ${client.full_name}`)" },
  { want: 'BLOCK', why: 'a PII member read under an innocent key',
    src: `log.warn('x', 'y', { who: client.email })` },
  { want: 'BLOCK', why: 'a whole row as the data argument',
    src: `log.error('loadClient', 'failed', client)` },
  { want: 'BLOCK', why: 'a spread of a whole row',
    src: `log.info('x', 'y', { ...row, id })` },
  { want: 'BLOCK', why: 'console.* is the same console',
    src: `console.warn('[x] failed', { email })` },
  { want: 'BLOCK', why: 'a bare weight (not just weight_kg)',
    src: `log.info('x', 'y', { weight })` },
  { want: 'BLOCK', why: 'a health free-text field',
    src: `log.error('x', 'y', { injury: i })` },
  { want: 'BLOCK', why: 'a token travelling in a log',
    src: `log.warn('auth', 'refresh', { access_token })` },
  { want: 'BLOCK', why: 'a person\'s name under the bare key `name`',
    src: `log.info('x', 'y', { name: c.name })` },
  { want: 'BLOCK', why: 'console.log of a whole row (every console argument is the payload, not just the third)',
    src: `console.log(client)` },
  { want: 'BLOCK', why: 'console.log with a message and a whole row',
    src: `console.log('saved', client)` },
  { want: 'BLOCK', why: 'console.table dumps a row',
    src: `console.table(row)` },
  { want: 'BLOCK', why: 'console.dir dumps a row',
    src: `console.dir(client)` },
  { want: 'BLOCK', why: 'a whole row hidden under an innocent property name',
    src: `log.info('x', 'y', { who: client })` },
  { want: 'BLOCK', why: 'a whole row stringified into the payload',
    src: `log.info('x', 'y', JSON.stringify(client))` },
  // a bare identifier interpolated into the message: the commonest way PII enters a log ("invite sent to ${email}"), blocked by HEAD and lost by the first rewrite
  { want: 'BLOCK', why: 'a bare PII identifier interpolated into the message',
    src: "log.error('fn', `sent to ${email}`)" },
  { want: 'BLOCK', why: 'a health value interpolated into the message',
    src: "log.error('fn', `weight ${weightKg} kg`)" },
  { want: 'BLOCK', why: 'an interpolation with spaces, beside an id',
    src: "log.error('fn', `sent to ${ email }`, { clientId })" },
  // a bare PII identifier as a VALUE under an innocent key
  { want: 'BLOCK', why: 'a PII variable as a value under an innocent key',
    src: `log.warn('x', 'y', { mail: email })` },
  { want: 'BLOCK', why: 'a health value as a value',
    src: `log.warn('x', 'y', { w: weight })` },
  { want: 'BLOCK', why: 'notes as a value',
    src: `log.warn('x', 'y', { n: notes })` },
  { want: 'BLOCK', why: 'the signed-in user object is a whole row too',
    src: `log.error('f', 'm', currentUser)` },
  { want: 'BLOCK', why: 'currentProfile under a key',
    src: `log.error('f', 'm', { u: currentProfile })` },
  { want: 'BLOCK', why: 'a spread of the signed-in user',
    src: `log.error('f', 'm', { ...currentUser, id })` },
  { want: 'BLOCK', why: 'a spread of a profile',
    src: `log.error('f', 'm', { ...profile })` },
  { want: 'BLOCK', why: 'a row read off another object, in shorthand position',
    src: `log.error('f', 'm', { a: x.row, b })` },
  { want: 'BLOCK', why: 'a token key',
    src: `log.error('f', 'm', { token: t })` },
  // regex literals and comments in front of / inside the call (the scanner reads blanked text, so none of them can desync it or hide the call)
  { want: 'BLOCK', why: 'a quote inside a regex literal in the payload must not hide the email after it',
    src: `log.error('fn', 'm', { p: s.replace(/'/g, ''), email })` },
  { want: 'BLOCK', why: 'a // inside a regex literal in the payload must not hide the email after it',
    src: `log.error('fn', 'm', { p: s.replace(/\\/\\//g, ''), email })` },
  { want: 'BLOCK', why: 'a /* */ comment at the start of the line does not make the line a comment',
    src: `/* ok */ log.error('fn', 'm', { email })` },
  { want: 'BLOCK', why: 'a regex containing // earlier on the line does not hide a later call',
    src: `const r = x.replace(/\\//g, '-'); log.error('fn', 'm', { email })` },
  { want: 'BLOCK', why: 'a row in object SHORTHAND, which the HEAD gate blocked and a rewrite once dropped',
    src: `log.error('x', 'y', { row })` },
  { want: 'BLOCK', why: 'a row in shorthand beside an id',
    src: `log.error('x', 'y', { id, clientRow })` },
  { want: 'BLOCK', why: 'a row under another key',
    src: `log.error('x', 'y', { c: row })` },
  { want: 'BLOCK', why: 'console.error with a message and a whole row',
    src: `console.error('[x] failed', client)` },
  { want: 'BLOCK', why: 'an apostrophe in a // comment inside a multi-line call must not open a phantom string that hides the PII below it',
    src: `log.error('x', 'y', {\n  clientId, // don't leak it\n  email\n})\nconst z = 'q'` },
  { want: 'BLOCK', why: 'a /* */ comment containing a quote and a paren inside a multi-line call',
    src: `log.error('x', 'y', {\n  /* it's (not) fine */ email\n})` },
  { want: 'BLOCK', why: 'LINT-OK on a CLEAN call is still refused: the exemption itself is capped at zero',
    src: `log.info('x', 'y', { clientId }) // LINT-OK nothing to see here` },
  { want: 'BLOCK', why: 'LINT-OK is capped at zero: it no longer excuses a call (rename the key instead)',
    src: `log.info('x', 'y',\n  { email }) // LINT-OK the address is the account owner's own, shown to them` },
  { want: 'BLOCK', why: 'a real call after a "//" inside an earlier string on the same line is still read',
    src: `const u = '/a//b'; log.error('x', 'y', { email })` },

  // ── must PASS: real shapes from js/ ───────────────────────────────────────────
  { want: 'PASS', why: 'ids and dates only -- the commonest shape',
    src: `log.error('saveSession', 'insert failed', { clientId, date })` },
  { want: 'PASS', why: 'exercise_name / template_name are not personal data',
    src: `log.info('x', 'y', { exercise_name, template_name })` },
  { want: 'PASS', why: "an Error's own type name (7 sites: { name: e?.name })",
    src: `log.warn('loadUserInfo', 'lookup threw', { name: e?.name })` },
  { want: 'PASS', why: 'console.warn with an error type name',
    src: `console.warn('[report] failed:', e?.name)` },
  { want: 'PASS', why: 'an error object as the data argument',
    src: `log.error('save', 'failed', error)\nlog.error('save', 'failed', err)` },
  { want: 'PASS', why: 'PII-shaped TEXT inside the message ("client.email", "weight_kg:") is documentation, not a payload',
    src: `log.info('saveWeight', 'failed reading client.email and weight_kg: skipped', { clientId })` },
  { want: 'PASS', why: 'a multi-line call that carries ids only (the four real ones)',
    src: `log.error('_deleteClientCopiesForSlots', 'client copy delete removed no rows',\n  { expected: deletable.length, programId })` },
  { want: 'PASS', why: 'a code from a Postgres error',
    src: `log.warn('x', 'read failed', { code: error.code })` },
  { want: 'PASS', why: 'console.* with an error object and a message',
    src: `console.warn('[report] not stored:', why)\nconsole.error('[x] failed', error)` },
  { want: 'PASS', why: 'an apostrophe in a // comment must not make the call swallow the code AFTER it (an unrelated { email } below is not this call\'s payload)',
    src: `log.error('x', 'y', {\n  clientId, // don't leak it\n  date\n})\nconst z = 'q'\nconst other = { email }` },
  { want: 'PASS', why: 'a quote and an unbalanced paren in a /* */ comment must not swallow the code after the call',
    src: `log.error('x', 'y', {\n  clientId, /* it's ( not fine */\n  date\n})\nconst z = 'q'\nconst other = { email }` },
  { want: 'PASS', why: 'a comment inside a multi-line call is not read as a payload',
    src: `log.error('x', 'y', {\n  clientId, // the email is not logged, see the ledger\n  date\n})` },
  { want: 'PASS', why: 'a method call .name( is not a member read',
    src: `log.info('x', 'y', { n: names.name() })` },
  { want: 'PASS', why: 'a call inside a comment describes a call, it does not make one',
    src: `// log.error('x', 'y', { email })\n/* log.info('a', 'b', client) */` },
  { want: 'PASS', why: 'a division (not a regex) before a call must not hide or blank it - and a clean call still passes',
    src: `const h = a / b; log.error('fn', 'm', { clientId, h })` },
  { want: 'PASS', why: 'a regex literal containing a quote, in a clean call',
    src: `log.error('fn', 'm', { clientId, p: s.replace(/'/g, '') })` },
]

const dir = mkdtempSync(join(tmpdir(), 'pii-selftest-'))
let failures = 0
CASES.forEach((c, i) => {
  const file = join(dir, `case${i}.js`)
  writeFileSync(file, c.src + '\n', 'utf8')
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
console.log(`  check-pii-logs self-test: ${CASES.length} cases behaved (${blocks} must-block, ${CASES.length - blocks} must-pass).`)
process.exit(0)
