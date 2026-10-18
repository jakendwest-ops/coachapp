#!/usr/bin/env node
/**
 * checks.sh rule 9u: no secret in a tracked file, or in a commit being pushed. THIS REPO IS PUBLIC.
 *
 * Why it exists. scripts/seed-test-data.js carried the password of three real accounts in the live project as string
 * literals, in four commits, in a public repository, with public signup switched off -- so those logins were one of the few
 * ways into the tenant. Nothing refused it: the closest gate, rule 9p, only checks third-party <script> tags. Deleting the
 * literal does not unpublish it (git history is public too), which is why the accounts' passwords had to be rotated as
 * well. This check is what stops the next one at the push, while it can still be fixed by editing a file. (This header does
 * not quote the value it was written for, and the self-test builds its fixtures at run time, for the same reason.)
 *
 * What counts (the pre-fix seed script gave 3 findings, one per login):
 *   1. A JWT-shaped string whose payload says anything other than role=anon. js/app-core.js legitimately ships the project's
 *      public anon key (RLS is the wall, not its secrecy); a service_role key, or a signed-in user's session token, in a file
 *      is a full database takeover / a stolen login. Decoded, not pattern-matched, so the anon key is allowed and nothing
 *      else is -- and a service key is caught whatever it is named.
 *   2. Well-known secret shapes: Supabase secret/personal-access keys, GitHub/Slack/Anthropic tokens, AWS key ids, PEM
 *      private keys, and a password inside a connection string (scheme://user:<pw>@host).
 *   3. A credential assigned a literal VALUE THAT LOOKS LIKE A SECRET: a name containing password / secret / api key / token
 *      (digits and quotes in the name allowed: PT2_PASSWORD, "password") given
 *        - a quoted value, or in config-style files (.env*, .yml, .sh, .ini, Dockerfile, .bat ...) an unquoted NAME=value
 *          (also `export NAME=`, `set NAME=`, `ENV NAME=`), or in .sql files `password 'value'` (create role ... password '...'),
 *      and the value is 8+ characters with no whitespace and either a letter AND a digit, or 24+ characters. A UI label
 *      ('Password', 'Forgot password?', 'coachapp.auth.token') is not a secret and is not refused; the leaked value had both a letter
 *      and digits. A value that STARTS like a placeholder (<...>, your..., ${...}, process.env..., changeme, xxx, [YOUR-PASSWORD])
 *      is not one either, and one that merely CONTAINS such a word is still judged.
 *
 * There is deliberately NO per-line escape hatch. A literal that is not a secret can be written so it does not look like
 * one (read it from the environment, or build it from parts); an exemption that any line can claim is how a gate stops gating.
 *
 * TWO MODES. With no arguments it scans the tip of the tree (every tracked text file). With `--since <ref>` it scans the lines ADDED by the
 * commits in <ref>..HEAD - what is about to be published - so a secret committed and then deleted inside one push is still seen. checks.sh runs both.
 *
 * KNOWN LIMITS (named): a secret under a name that contains none of the words above (credentials, pw, ADMIN_PASS) is only seen if it is a JWT, a known
 * token shape or sits in a connection string; a value split across concatenated literals is not joined; a positional argument (signIn(email, 'pw')) is not
 * a named assignment; a password without a digit and under 24 characters is judged to be a label.
 *
 * Usage: node scripts/check-secrets.mjs [<file> ...]      (no arguments = every tracked file; exit 1 = findings)
 *        node scripts/check-secrets.mjs --since <ref>      (the lines added in <ref>..HEAD)
 */

import { readFileSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'

const SKIP = /(^|[\\/])package-lock\.json$|\.(png|jpe?g|gif|ico|woff2?|ttf|pdf|webp|svg)$/i
const findings = []

const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
const SHAPES = [
  [/\bsb_secret_[A-Za-z0-9_-]{16,}/, 'Supabase secret key'],
  [/\bsbp_[a-f0-9]{30,}/, 'Supabase personal access token'],
  [/\bghp_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/, 'GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\bxox[abp]-[A-Za-z0-9-]{20,}/, 'Slack token'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic API key'],
]
const NAME = String.raw`[A-Za-z0-9_]*(?:password|passwd|pwd|secret|api_?key|token)[A-Za-z0-9_]*`
// quoted: the value may contain the OTHER quote characters, and the key itself may be quoted ("password": "...")
const CRED_QUOTED = new RegExp(String.raw`\b(${NAME})["']?\s*[:=]\s*(['"` + '`' + String.raw`])((?:(?!\2)[^\n]){8,})\2`, 'gi')
// unquoted NAME=value / name: value, only in config-style files where that is how a credential is written; an inline ` # comment` may follow
const CRED_UNQUOTED = new RegExp(String.raw`^\s*(?:(?:export|set|ENV)\s+)?(${NAME})\s*[:=]\s*([^\s'"` + '`' + String.raw`,;]{8,})(?:\s+#.*)?\s*$`, 'i')
// SQL: create role app login password '...'  /  alter user x with password '...'
const CRED_SQL = /\bpassword\s+(['"])((?:(?!\1)[^\n]){8,})\1/gi
// a password inside a connection string: scheme://user:password@host
const CONN_STRING = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/[^\s:\/@'"`]+:([^\s@'"`]{4,})@/gi
const CONFIG_STYLE = /(^|[\\/])\.env[^\\/]*$|(^|[\\/])Dockerfile[^\\/]*$|\.(ya?ml|sh|bash|ini|cfg|conf|properties|bat|cmd|ps1)$/i
// A placeholder STARTS like one. A real value that merely contains the word ("MyExample-9Zq!") is not excused.
const PLACEHOLDER = /^(?:<.*>|\[|\$\{|\$[A-Za-z_]|process\.env|your|change.?me|x{3,}|\*{3,}|redacted|dummy|placeholder|example|%s|null$|undefined$)/i
// 8+ characters (the callers' regexes), no whitespace, and either a letter AND a digit, or 24+ characters: a secret, not a UI label.
const looksSecret = (v) => !/\s/.test(v) && ((/\d/.test(v) && /[A-Za-z]/.test(v)) || v.length >= 24)

function roleOf (jwt) {
  try {
    const p = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'))
    return typeof p === 'object' && p ? (p.role ?? '(no role claim)') : null
  } catch { return null }                     // not a JWT after all (a long dotted identifier)
}

/** The rules that apply to any single line, wherever the file is. */
function scanLine (line, at, file) {
  for (const m of line.matchAll(JWT)) {
    const role = roleOf(m[0])
    if (role !== null && role !== 'anon') findings.push(`${at}  a JWT with role "${role}" (only the public anon key may be committed)`)
  }
  for (const [re, what] of SHAPES) if (re.test(line)) findings.push(`${at}  looks like a ${what}`)
  for (const m of line.matchAll(CONN_STRING)) {
    if (!PLACEHOLDER.test(m[1])) findings.push(`${at}  a password inside a connection string`)
  }
  for (const m of line.matchAll(CRED_QUOTED)) {
    const v = m[3].trim()
    if (!PLACEHOLDER.test(v) && looksSecret(v)) findings.push(`${at}  ${m[1]} is assigned a string literal`)
  }
  const base = basename(file)
  if (/\.sql$/i.test(base)) {
    for (const m of line.matchAll(CRED_SQL)) {
      const v = m[2].trim()
      if (!PLACEHOLDER.test(v) && looksSecret(v)) findings.push(`${at}  an SQL password literal`)
    }
  }
  if (CONFIG_STYLE.test(base)) {
    const m = line.match(CRED_UNQUOTED)
    if (m && !PLACEHOLDER.test(m[2]) && looksSecret(m[2])) findings.push(`${at}  ${m[1]} is assigned an unquoted value`)
  }
}

const args = process.argv.slice(2)
const sinceAt = args.indexOf('--since')

if (sinceAt !== -1) {
  // ── the lines ADDED by the commits about to be published ──────────────────────────────────────────────────────────────
  const ref = args[sinceAt + 1]
  if (!ref) { console.log('  check-secrets: --since needs a ref'); process.exit(1) }
  let patch
  try { patch = execFileSync('git', ['log', '-p', '-U0', '--no-color', '--no-ext-diff', '--format=', `${ref}..HEAD`], { encoding: 'utf8', maxBuffer: 1 << 28 }) }
  catch (e) { console.log(`  check-secrets: could not read ${ref}..HEAD (${String(e.message).split('\n')[0]})`); process.exit(1) }
  let file = '', added = 0
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.slice(4).replace(/^b\//, ''); continue }
    if (!line.startsWith('+') || SKIP.test(file) || file === '/dev/null') continue
    added++
    scanLine(line.slice(1), `${file} (added in ${ref}..HEAD)`, file)
  }
  if (findings.length) {
    console.log(`  ${findings.length} possible secret(s) in the commits being pushed -- this repo is PUBLIC and history is public too:`)
    for (const x of [...new Set(findings)]) console.log(`    ${x}`)
    console.log('  A secret that was ever committed must be ROTATED: removing it in a later commit does not unpublish it.')
    process.exit(1)
  }
  console.log(`  check-secrets: ${added} added line(s) in ${ref}..HEAD, no secret found.`)
  process.exit(0)
}

// ── the tip of the tree ───────────────────────────────────────────────────────────────────────────────────────────────────
// With no arguments: every tracked text file (listed here, because ~750 paths do not fit one Windows command line).
const files = (args.length ? args : execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\0').filter(Boolean))
  .filter(f => !SKIP.test(f) && existsSync(f) && statSync(f).isFile())

for (const f of files) {
  let buf
  try { buf = readFileSync(f) } catch { continue }
  let text
  if (buf.includes(0)) {
    // UTF-16 with a byte-order mark is text (editors on Windows save it); anything else with a NUL is binary.
    if (buf[0] === 0xff && buf[1] === 0xfe) text = buf.toString('utf16le')
    else continue
  } else text = buf.toString('utf8')
  text.split(/\r?\n/).forEach((line, i) => scanLine(line, `${f}:${i + 1}`, f))
}

if (findings.length) {
  console.log(`  ${findings.length} possible secret(s) in tracked files -- this repo is PUBLIC:`)
  for (const x of [...new Set(findings)]) console.log(`    ${x}`)
  console.log('  Put the value in .env (git-ignored) and read process.env. If it was ever pushed, ROTATE it: deleting')
  console.log('  the line does not remove it from git history. There is no per-line exemption: restructure the literal.')
  process.exit(1)
}
console.log(`  check-secrets: ${files.length} tracked file(s), no secret found.`)
process.exit(0)
