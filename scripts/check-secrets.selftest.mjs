#!/usr/bin/env node
/**
 * Proves check-secrets.mjs BLOCKS the shapes that actually leaked (a password literal in the seed script) and the shapes that would be worse (a
 * service-role key, a signed-in user's session token, well-known token formats), the variants a first version missed (a digit in the name, a quoted
 * key, a quote inside the value, an unquoted value in a config file with a `#` in it or a trailing comment, a UTF-16 file, SQL `password '...'`, a
 * connection string, a refresh token, `export`/`set`/`ENV` forms, a value that merely CONTAINS a placeholder word, a secret added and deleted inside one
 * push) -- and stays quiet on what the repo legitimately holds (the public anon key, process.env reads, placeholders, and UI labels such as 'Password').
 *
 * The fixtures are assembled at run time. This file is itself scanned by the check, so it must not contain a secret-shaped literal -- the same reason rule
 * 9u's own header never quotes the password it was written for.
 *
 * Run: node scripts/check-secrets.selftest.mjs      (exit 1 = a case misbehaved)
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-secrets.mjs')

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = role => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', ref: 'abcdefghijklmnopqrst', role })}.${'s'.repeat(43)}`
const lit = (name, value, op = ' = ') => `${name}${op}${"'"}${value}${"'"}`
const WORD = 'Zx9' + 'Qw3' + 'Lm7!'
const DQ = String.fromCharCode(34)

const CASES = [
  // ── must BLOCK ────────────────────────────────────────────────────────────────
  { want: 'BLOCK', why: 'the real leak: a password literal for a login, const-assigned (seed-test-data.js before 2026-10-18)',
    src: 'const ' + lit('PT_PASSWORD', WORD).replace(' = ', '    = ') },
  { want: 'BLOCK', why: 'a DIGIT in the name: PT2_PASSWORD, the third login a first version missed',
    src: 'const ' + lit('PT2_PASSWORD', WORD) },
  { want: 'BLOCK', why: 'a password literal as an object property',
    src: 'await db.auth.signInWithPassword({ email, ' + lit('password', WORD, ': ') + ' })' },
  { want: 'BLOCK', why: 'a QUOTED key (JSON / config object)',
    src: '{ ' + DQ + 'pass' + 'word' + DQ + ': ' + DQ + WORD + DQ + ' }' },
  { want: 'BLOCK', why: 'a quote character INSIDE the value',
    src: 'const pass' + 'word = ' + DQ + WORD.replace('Qw3', "Q'w3") + DQ },
  { want: 'BLOCK', why: 'a value that merely CONTAINS a placeholder word is still a value',
    src: lit('const password', 'MyExample-' + WORD) },
  { want: 'BLOCK', why: 'a long value with no digit (24+ characters) is a secret, not a label',
    src: lit('const password', 'Correct-Horse-Battery-Staple-x') },
  { want: 'BLOCK', why: 'the name word passwd',
    src: 'const ' + lit('db_passwd', WORD) },
  { want: 'BLOCK', why: 'the name word pwd',
    src: 'const ' + lit('pwd', WORD) },
  { want: 'BLOCK', why: 'an access_token literal',
    src: 'const ' + lit('access_token', WORD) },
  { want: 'BLOCK', why: 'an auth_token literal',
    src: 'const ' + lit('auth_token', WORD) },
  { want: 'BLOCK', why: 'a refresh token (camelCase)',
    src: 'const ' + lit('refreshToken', WORD) },
  { want: 'BLOCK', why: 'a bare `token` key',
    src: 'await post({ ' + lit('token', WORD, ': ') + ' })' },
  { want: 'BLOCK', why: 'an api key literal',
    src: lit('const apiKey', 'k_live_' + 'a1b2c3d4e5f6') },
  { want: 'BLOCK', why: 'a SERVICE-ROLE key: full database takeover, whatever the variable is called',
    src: lit('const X', jwt('service_role')) },
  { want: 'BLOCK', why: "a signed-in user's session token (role authenticated) is a stolen login",
    src: lit('const t', jwt('authenticated')) },
  { want: 'BLOCK', why: 'a JWT with no role claim is not the anon key either',
    src: lit('const t', `${b64({ alg: 'HS256' })}.${b64({ sub: 'u' })}.${'s'.repeat(43)}`) },
  { want: 'BLOCK', why: 'a Supabase secret key', src: '// ' + 'sb_secret_' + 'A1b2C3d4E5f6G7h8I9j0' },
  { want: 'BLOCK', why: 'a PEM private key', src: '-----BEGIN ' + 'RSA PRIVATE KEY-----' },
  { want: 'BLOCK', why: 'a GitHub token', src: lit('const g', 'ghp_' + 'a'.repeat(36)) },
  { want: 'BLOCK', why: 'a Supabase personal access token', src: '# ' + 'sbp_' + 'a1b2c3d4'.repeat(5) },
  { want: 'BLOCK', why: 'an AWS access key id', src: '# ' + 'AKIA' + 'ABCDEFGH12345678' },
  { want: 'BLOCK', why: 'a Slack token', src: '# ' + 'xoxb-' + '1234567890-'.repeat(2) + 'abcdefghijkl' },
  { want: 'BLOCK', why: 'an Anthropic API key', src: '# ' + 'sk-ant-' + 'api03-abcdefghijklmnopqrst' },
  { want: 'BLOCK', why: 'a password inside a connection string',
    src: 'DATABASE_URL = ' + DQ + 'postgresql://postgres:' + WORD.replace('!', '') + '@db.example.supabase.co:5432/postgres' + DQ },
  { want: 'BLOCK', why: 'an UNQUOTED value in an env file (where a real password would be written)',
    name: '.env.local', src: 'PT_PASSWORD=' + WORD },
  { want: 'BLOCK', why: 'an unquoted value with a # inside it',
    name: '.env.local', src: 'PT_PASSWORD=Zx9Qw3#Lm7xyz' },
  { want: 'BLOCK', why: 'an unquoted value followed by a trailing comment',
    name: '.env', src: 'PT_PASSWORD=' + WORD + '   # the test coach' },
  { want: 'BLOCK', why: 'an unquoted value in a YAML file',
    name: 'settings.yml', src: 'db_password: ' + WORD },
  { want: 'BLOCK', why: 'export NAME=value in a shell script',
    name: 'run.sh', src: 'export DB_PASSWORD=' + WORD },
  { want: 'BLOCK', why: 'set NAME=value in a batch file',
    name: 'run.bat', src: 'set PASSWORD=' + WORD },
  { want: 'BLOCK', why: 'ENV NAME=value in a Dockerfile',
    name: 'Dockerfile', src: 'ENV DB_PASSWORD=' + WORD },
  { want: 'BLOCK', why: 'an SQL role created with a literal password',
    name: 'roles.sql', src: "create role app login password '" + WORD + "';" },
  { want: 'BLOCK', why: 'a UTF-16 file (a Windows editor default) is read, not skipped as binary',
    utf16: true, src: 'const ' + lit('PT_PASSWORD', WORD) },
  { want: 'BLOCK', why: 'one bad line after clean lines is still found',
    src: 'const a = 1\nconst b = 2\n' + lit('const secret', WORD) },
  { want: 'BLOCK', why: 'there is NO per-line exemption: the old marker no longer excuses anything',
    src: lit('const wrongPassword', WORD) + ' // SECRET-OK deliberately wrong' },
  { want: 'BLOCK', why: 'a secret ADDED in one commit and DELETED in the next of the same push is still seen (--since scans what is published)',
    diff: [{ f: 'a.js', body: 'const a = 1\n' }, { f: 'a.js', body: 'const a = 1\n' + lit('const secret', WORD) + '\n' }, { f: 'a.js', body: 'const a = 1\n' }] },

  // ── must PASS ─────────────────────────────────────────────────────────────────
  { want: 'PASS', why: 'the public anon key the app ships by design (role=anon)', src: lit('const SUPABASE_KEY', jwt('anon')) },
  { want: 'PASS', why: 'a password read from the environment', src: 'const PT_PASSWORD = process.env.PT_PASSWORD' },
  { want: 'PASS', why: 'a template reference, not a value', src: 'console.log(`PT_PASSWORD=${PT_PASSWORD}`)' },
  { want: 'PASS', why: 'an .env.example placeholder (unquoted, in a config-style file)', name: '.env.example', src: 'PT_PASSWORD=yourpassword\nPT2_PASSWORD=your-second-password' },
  { want: 'PASS', why: 'a quoted placeholder that STARTS with "your", digits and all',
    src: lit('const password', 'your-password-123') },
  { want: 'PASS', why: 'a quoted template reference with a digit',
    src: lit('const password', '${PT2_PASSWORD}') },
  { want: 'PASS', why: 'a quoted process.env reference with a digit',
    src: lit('const password', 'process.env.PT2_PASSWORD') },
  { want: 'PASS', why: 'a quoted <angle> placeholder with a digit',
    src: lit('const password', '<your-password-1>') },
  { want: 'PASS', why: 'a quoted changeme placeholder with a digit',
    src: lit('const password', 'changeme123') },
  { want: 'PASS', why: 'a placeholder in YAML', name: 'settings.yml', src: 'db_password: ${DB_PASSWORD}' },
  { want: 'PASS', why: 'the Supabase connection-string template',
    src: 'DATABASE_URL = ' + DQ + 'postgresql://postgres:[YOUR-PASSWORD]@db.example.supabase.co:5432/postgres' + DQ },
  { want: 'PASS', why: 'a short unquoted value is below the 8-character floor', name: '.env', src: 'PT_PASSWORD=short' },
  { want: 'PASS', why: 'a short literal is below the 8-character floor (a label, not a credential)', src: lit('const password', 'abc') },
  { want: 'PASS', why: 'a UI label that is just the word', src: 'const LABELS = { email: ' + lit('', 'Email', '').trim() + ', password: ' + lit('', 'Password', '').trim() + ' }' },
  { want: 'PASS', why: 'a validation message', src: '{ ' + lit('password', 'Passwords do not match', ': ') + ' }' },
  { want: 'PASS', why: 'a message with spaces AND a digit is prose, not a secret', src: '{ ' + lit('password', 'Use at least 8 characters, 1 digit', ': ') + ' }' },
  { want: 'PASS', why: 'a short letter+digit value is below the 8-character floor', src: lit('const password', 'a1b2c3') },
  { want: 'PASS', why: 'a storage key name', src: lit('const AUTH_TOKEN_KEY', 'coachapp.auth.token') },
  { want: 'PASS', why: 'a link label', src: lit('const forgotPasswordLink', 'Forgot password?') },
  { want: 'PASS', why: 'a long dotted identifier that is not a JWT', src: lit('const id', 'eyJhbGciOiJIUzI1NiJ9.notjsonnotjson.alsonotjson12') },    // all three segments long enough to be examined; the middle one does not decode
  { want: 'PASS', why: 'prose that merely mentions the words', src: '// the password is read from .env and never committed' },
  { want: 'PASS', why: 'an unquoted secret-looking value in PROSE (markdown) is not a config file', name: 'notes.md', src: 'password: Zx9Qw3Lm7xyz' },
  { want: 'PASS', why: 'package-lock.json is skipped (its integrity hashes are base64 noise, never a credential)', name: 'package-lock.json', src: '{ "x": "' + 'ghp_' + 'a'.repeat(36) + '" }' },
  { want: 'PASS', why: 'a JS variable reference, not a literal', src: 'const body = { password: document.getElementById("pw").value }' },
  { want: 'PASS', why: 'a clean range of commits',
    diff: [{ f: 'a.js', body: 'const a = 1\n' }, { f: 'a.js', body: 'const a = 1\nconst b = 2\n' }] },
]

// No inherited GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE: checks.sh runs this from inside git's pre-push hook, and from a LINKED worktree
// GIT_DIR points at the real repository, so `git init` here re-initialised it instead of the temp folder. On 2026-10-29 that set
// core.bare = true in the shared .git/config, which broke the main checkout and every worktree until it was set back by hand.
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanEnv }).trim()

const dir = mkdtempSync(join(tmpdir(), 'secrets-selftest-'))
let failures = 0
CASES.forEach((c, i) => {
  let exit = 0, out = ''
  try {
    if (c.diff) {
      // a real git repo: the secret goes in at one commit and out at the next; --since the first commit scans what a push would publish
      const repo = join(dir, `repo${i}`); mkdirSync(repo); git(repo, 'init', '-q')
      let base = null
      c.diff.forEach((step, k) => { writeFileSync(join(repo, step.f), step.body); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'c' + k); if (k === 0) base = git(repo, 'rev-parse', 'HEAD') })
      out = execFileSync(process.execPath, [CHECK, '--since', base], { cwd: repo, encoding: 'utf8', env: cleanEnv })
    } else {
      // each case in its own folder, so a config-style name (.env.example, settings.yml) keeps its real basename
      const sub = join(dir, `case${i}`); mkdirSync(sub)
      const target = join(sub, c.name || 'case.txt')
      if (c.utf16) writeFileSync(target, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(c.src + '\n', 'utf16le')]))
      else writeFileSync(target, c.src + '\n', 'utf8')
      out = execFileSync(process.execPath, [CHECK, target], { encoding: 'utf8' })
    }
  } catch (err) { exit = err.status ?? 1; out = (err.stdout || '') + (err.stderr || '') }
  const got = exit === 0 ? 'PASS' : 'BLOCK'
  if (got !== c.want) { failures++; console.log(`  [${i}] want ${c.want}, got ${got} -- ${c.why}\n${out}`) }
})
rmSync(dir, { recursive: true, force: true })

const blocks = CASES.filter(c => c.want === 'BLOCK').length
if (!blocks || blocks === CASES.length) { console.log('  self-test is one-sided'); process.exit(1) }
if (failures) { console.log(`  ${failures} of ${CASES.length} self-test cases misbehaved.`); process.exit(1) }
console.log(`  check-secrets self-test: ${CASES.length} cases behaved (${blocks} must-block, ${CASES.length - blocks} must-pass).`)
process.exit(0)
