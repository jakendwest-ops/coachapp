#!/usr/bin/env node
/**
 * The mutation test of the five security gates (rules 9a, 2, 9u, 9v, 9w): take ONE safeguard out of a COPY of a gate and require the gate's own self-test to go red.
 * A self-test that stays green with a safeguard deleted is not testing it. This is the harness behind the sentence "every safeguard was removed on purpose and the
 * self-test failed" in docs/decisions.md - it lives in the repo so that sentence can be re-checked, not just believed.
 *
 *   node scripts/mutate-gates.mjs                 # all five gates       (exit 0 = every mutation was caught)
 *   node scripts/mutate-gates.mjs check-secrets   # one gate
 *
 * Three outcomes are errors: the clean copy's self-test is red (every mutation below would be vacuous); a mutation's `find` text matches 0 or 2+ times (the gate
 * was edited and the mutation went stale - update it, do not delete it); a mutation is MISSED (add a self-test case that needs the safeguard). It is not a proof that
 * the gates are complete: it only shows that each safeguard it lists is exercised. Runs in the FULL check (release, CI, CHECKS_FULL=1), not on a local push.
 */
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const R = String.raw
const BT = '`'
const M = {
  'check-secrets': [
    ['role check off', R`if (role !== null && role !== 'anon')`, 'if (false)'],
    ['JWT scan off', 'for (const m of line.matchAll(JWT))', 'for (const m of [])'],
    ['known shapes off', 'for (const [re, what] of SHAPES)', 'for (const [re, what] of [])'],
    ['sb_secret shape', R`[/\bsb_secret_[A-Za-z0-9_-]{16,}/, 'Supabase secret key'],`, ''],
    ['sbp_ shape', R`[/\bsbp_[a-f0-9]{30,}/, 'Supabase personal access token'],`, ''],
    ['github shape', R`[/\bghp_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/, 'GitHub token'],`, ''],
    ['aws shape', R`[/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],`, ''],
    ['pem shape', R`[/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],`, ''],
    ['slack shape', R`[/\bxox[abp]-[A-Za-z0-9-]{20,}/, 'Slack token'],`, ''],
    ['anthropic shape', R`[/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic API key'],`, ''],
    ['connection strings off', 'for (const m of line.matchAll(CONN_STRING))', 'for (const m of [])'],
    ['credential literals off', 'for (const m of line.matchAll(CRED_QUOTED))', 'for (const m of [])'],
    ['placeholders flagged', 'if (!PLACEHOLDER.test(v) && looksSecret(v)) findings.push(' + BT + '${at}  ${m[1]}', 'if (looksSecret(v)) findings.push(' + BT + '${at}  ${m[1]}'],
    ['placeholder matches anywhere in the value', R`/^(?:<.*>|\[|`, R`/(?:<.*>|\[|`],
    ['everything long enough looks secret', R`const looksSecret = (v) => !/\s/.test(v) && ((/\d/.test(v) && /[A-Za-z]/.test(v)) || v.length >= 24)`, 'const looksSecret = (v) => true'],
    ['24+ characters rule off', 'v.length >= 24', 'v.length >= 2400'],
    ['whitespace allowed in a secret', R`!/\s/.test(v) &&`, ''],
    ['letter+digit rule off', R`(/\d/.test(v) && /[A-Za-z]/.test(v))`, 'false'],
    ['8-char floor gone', R`[^\n]){8,})\2`, R`[^\n]){1,})\2`],
    ['digit in the name defeats the match', R`[A-Za-z0-9_]*(?:password`, R`[A-Za-z_]*(?:password`],
    ['name word passwd', R`(?:password|passwd|pwd|secret|api_?key|token)`, R`(?:password|pwd|secret|api_?key|token)`],
    ['name word pwd', R`(?:password|passwd|pwd|secret|api_?key|token)`, R`(?:password|passwd|secret|api_?key|token)`],
    ['name word secret', R`(?:password|passwd|pwd|secret|api_?key|token)`, R`(?:password|passwd|pwd|api_?key|token)`],
    ['name word api key', R`(?:password|passwd|pwd|secret|api_?key|token)`, R`(?:password|passwd|pwd|secret|token)`],
    ['name word token', R`(?:password|passwd|pwd|secret|api_?key|token)`, R`(?:password|passwd|pwd|secret|api_?key)`],
    ['quoted key not matched', R`)["']?\s*[:=]\s*(['"`, R`)\s*[:=]\s*(['"`],
    ['quote inside the value not allowed', R`((?:(?!\2)[^\n]){8,})`, R`([^'"\n]{8,})`],
    ['unquoted values in config files ignored', 'if (CONFIG_STYLE.test(base)) {', 'if (false) {'],
    ['every file is config-style', R`const CONFIG_STYLE = /(^|[\\/])\.env[^\\/]*$|`, R`const CONFIG_STYLE = /./; const _UNUSED = /(^|[\\/])\.env[^\\/]*$|`],
    ['.env files not config-style', R`(^|[\\/])\.env[^\\/]*$|`, ''],
    ['Dockerfile not config-style', R`(^|[\\/])Dockerfile[^\\/]*$|`, ''],
    ['shell scripts not config-style', 'ya?ml|sh|bash|ini', 'ya?ml|ini'],
    ['batch files not config-style', 'properties|bat|cmd|ps1', 'properties'],
    ['export / set / ENV prefix not recognised', R`(?:(?:export|set|ENV)\s+)?`, ''],
    ['trailing comment hides the value', R`(?:\s+#.*)?\s*$`, R`\s*$`],
    ['# ends an unquoted value', R`,;]{8,})(?:\s+#.*)?`, R`,;#]{8,})(?:\s+#.*)?`],
    ['SQL password literals off', 'if (/\\.sql$/i.test(base)) {', 'if (false) {'],
    ['UTF-16 files skipped as binary', "if (buf[0] === 0xff && buf[1] === 0xfe) text = buf.toString('utf16le')", 'if (false) text = buf.toString()'],
    ['lockfile no longer skipped', R`(^|[\\/])package-lock\.json$|`, ''],
    ['undecodable counted as a JWT', 'catch { return null }', "catch { return '(undecodable)' }"],
    ['no-role JWT treated as anon', "(p.role ?? '(no role claim)')", "(p.role ?? 'anon')"],
    ['--since scans an empty range', ", " + BT + '${ref}..HEAD' + BT + "], { encoding", ", " + BT + 'HEAD..HEAD' + BT + "], { encoding"],
  ],
  'check-pii-logs': [
    ['reads only the first line of a call', 'const call = callText(text, openIdx)', R`const call = callText(text, openIdx).split('\n')[0] + ')'`],
    ['console.* not covered', R`|console\.(?:log|info|warn|error|debug|table|dir|trace)`, ''],
    ['console.table/dir/trace not covered', '|table|dir|trace', ''],
    ['template interpolations ignored', R`out += ' { ' + inner.slice(k + 2, j - 1) + ' } '`, `out += ' '`],
    ['interpolation braces dropped (${email} lost)', R`out += ' { ' + inner.slice(k + 2, j - 1) + ' } '`, R`out += ' ' + inner.slice(k + 2, j - 1) + ' '`],
    ['member reads ignored', '|\\\\.\\\\s*${key}\\\\b(?!\\\\s*\\\\()', ''],
    ['bare identifier value ({ mail: email }) ignored', '|:\\\\s*${key}\\\\s*[,}]', ''],
    ['bare whole-row argument allowed', 'const bare = payload.find(a => WHOLE_ROW.test(a))', 'const bare = undefined'],
    ['console payload read from the third argument only', "const payload = kind.startsWith('console') ? args : args.slice(2)", 'const payload = args.slice(2)'],
    ['currentUser / currentProfile are not rows', '|goals|currentUser|currentProfile)$/', '|goals)$/'],
    ['row spread allowed', 'if (!flagged && ROW_SPREAD.test(code))', 'if (false)'],
    ['spread of a profile allowed', R`(row|client|data|profile|user|session|payload|currentUser|currentProfile)\b/`, R`(row|client|data|user|session|payload|currentUser|currentProfile)\b/`],
    ['row under another key / shorthand / stringify allowed', 'if (!flagged && ROW_AS_VALUE.test(code))', 'if (false)'],
    ['row shorthand ({ row }) allowed', '|[{,]\\s*(?:${ROW_NAMES})\\s*[,}]', ''],
    ['x.row, allowed', R`|\.\s*(?:row|clientRow)\s*[,}]`, ''],
    ['message words flagged', `cur += '""'; code += '""'; i = k + 1; continue`, 'cur += inner.slice(i, k + 1); code += inner.slice(i, k + 1); i = k + 1; continue'],
    ['error type name flagged', R`.replace(ERROR_NAME_KEY, '').replace(ERROR_NAME, '')`, ''],
    ['comments scanned as code', 'const text = blankComments(raw0, { regex: true })', 'const text = raw0'],
    ['regex literals not blanked', '{ regex: true }', '{}'],
    ['LINT-OK not counted', "{ lintOkUsed++; continue }", '{ continue }'],
    ['LINT-OK cap raised', 'const MAX_LINT_OK = 0', 'const MAX_LINT_OK = 50'],
    ['bare weight allowed', "'weight', 'weight_kg',", "'weight_kg',"],
    ['bare name allowed', "'business_name', 'businessName', 'name',", "'business_name', 'businessName',"],
    ['token key allowed', "'password', 'token', 'access_token'", "'password', 'access_token'"],
    ['credentials allowed in logs', "'password', 'token', 'access_token', 'refresh_token', 'signedUrl', 'signed_url',", ''],
    ['health free text allowed', "'injury', 'injuries', 'medical', 'condition', 'photo', 'photo_path',", ''],
    ['email key allowed', "'email', 'phone', 'dob', 'date_of_birth', 'address',", "'phone', 'dob', 'date_of_birth', 'address',"],
  ],
  'check-query-scope': [
    ['dotted anchors refused', 'innerOk && new RegExp(', 'false && new RegExp('],
    ['dotted anchor needs no !inner', R`const innerOk = /!inner/.test(chain) || /\.select\(\s*[A-Za-z_$]/.test(chain)`, 'const innerOk = true'],
    ['dotted anchor through a select CONSTANT refused', R`const innerOk = /!inner/.test(chain) || /\.select\(\s*[A-Za-z_$]/.test(chain)`, R`const innerOk = /!inner/.test(chain)`],
    ['child-row keys removed', "'log_id', 'workout_log_id', 'log_exercise_id', 'workout_log_exercise_id', 'goal_id', 'client_program_id',", ''],
    ['child keys anchor the ORIGINAL tables too', 'const anchorsFor = (table) => ORIGINAL_TABLES.includes(table) ? BASE_ANCHORS : [...BASE_ANCHORS, ...CHILD_ANCHORS]', 'const anchorsFor = (table) => [...BASE_ANCHORS, ...CHILD_ANCHORS]'],
    ['created_by is an anchor', "const BASE_ANCHORS = [\n  'coach_id',", "const BASE_ANCHORS = [\n  'created_by', 'coach_id',"],
    ['program_id is no anchor', "'program_id', 'phase_id', 'generated_from_phase_id', 'template_id'", "'phase_id', 'generated_from_phase_id', 'template_id'"],
    ['template_id is no anchor', "'generated_from_phase_id', 'template_id'\n]", "'generated_from_phase_id'\n]"],
    ['.neq / .not anchor', BT + R`\\.(eq|in|is)\\(\\s*['"]` + '${col}' + R`['"]` + BT, BT + R`\\.(eq|in|is|neq|not)\\(\\s*['"]` + '${col}' + R`['"]` + BT],
    ['.match() is no anchor', R`\\.match\\(\\s*\\{[^}]*\\b`, R`\\.matchX\\(\\s*\\{[^}]*\\b`],
    ['upsert is not an insert', R`/\.(insert|upsert)\(/.test(chain)`, R`/\.(insert)\(/.test(chain)`],
    ['.or with an unrelated branch anchors', 'clauses.every(', 'clauses.some('],
    ['comments count as code', 'const lines = blankComments(rawText).split(/\\r?\\n/)', 'const lines = rawLines'],
    ['payload look-back off', '(isInsert && built &&', '(false && built &&'],
    ['object shorthand refused', BT + R`[{,]\\s*` + '${col}' + R`\\s*[:,}]` + BT + R`).test(chain)) ||` + '\n      // insert(rows)', BT + R`[{,]\\s*` + '${col}' + R`\\s*:` + BT + R`).test(chain)) ||` + '\n      // insert(rows)'],
    ['waivers ignored', 'if (waived && !anchored) { waiversUsed++; continue }', 'if (false) { waiversUsed++; continue }'],
    ['stale waiver allowed', 'if (waived && anchored) {', 'if (false) {'],
    ['waiver reason optional', R`SCOPE-OK:\s*\S[^\n]{10,}`, R`SCOPE-OK:\s*\S[^\n]{0,}`],
    ['waiver window widened', 'k >= Math.max(0, i - 3); k--', 'k >= Math.max(0, i - 300); k--'],
    ['waiver leaks onto the next query', R`!lines.slice(waiverAt + 1, i).some(l => /\.from\(\s*['"]/.test(l))`, 'true'],
    ['waiver cap raised', 'const MAX_WAIVERS = 1', 'const MAX_WAIVERS = 200'],
    ['unknown table ignored', 'if (!TENANT_TABLES.includes(table)) {', 'if (false) {'],
    ['table names with digits invisible', R`let m = lines[i].match(/db\s*\.\s*from\(\s*['"]([a-z_0-9]+)`, R`let m = lines[i].match(/db\s*\.\s*from\(\s*['"]([a-z_]+)`],
    ['split-line db / .from() invisible', R`if (!m && /\bdb\s*$/.test(lines[i]) && lines[i + 1]) {`, 'if (false) {'],
    ['workout_logs not covered', "'workout_log_exercises', 'workout_log_sets', 'workout_logs', 'workout_template_exercises'", "'workout_log_exercises', 'workout_log_sets', 'workout_template_exercises'"],
    ['goals not covered', "'goal_check_ins', 'goal_milestones', 'goals',", "'goal_check_ins', 'goal_milestones',"],
    ['weight_logs not covered', "'program_phase_workouts', 'program_phases', 'weight_logs',", "'program_phase_workouts', 'program_phases',"],
  ],
  'check-sql-definer': [
    ['search_path rule off', R`if (!/\bset\s+search_path\b/i.test(stmt))`, 'if (false)'],
    ['trigger exemption gone', R`const isTrigger = /returns\s+trigger\b/i.test(stmt)`, 'const isTrigger = false'],
    ['anon revoke not required', "const missing = ['public', 'anon']", "const missing = ['public']"],
    ['public revoke not required', "const missing = ['public', 'anon']", "const missing = ['anon']"],
    ['any function name satisfies a revoke', 'if (r[1].toLowerCase() === name.toLowerCase())', 'if (true)'],
    ['a blanket revoke is ignored', 'const revoked = new Set(blanket)', 'const revoked = new Set()'],
    ['comments read as SQL', 'const sql = stripComments(readFileSync(f, ' + "'utf8'))", "const sql = readFileSync(f, 'utf8')"],
    ['a revoke inside a string counts', 'const code = blankQuoted(sql)', 'const code = sql'],
    ['invoker functions flagged', R`if (!/security\s+definer/i.test(stmt)) continue`, 'if (false) continue'],
    ['procedures not read', R`(?:function|procedure)\s+((?:"?[\w]+"?\.)?`, R`(?:function)\s+((?:"?[\w]+"?\.)?`],
    ['options after the body invisible', 'const stmt = blankQuoted(sql.slice(m.index, statementEnd(sql, m.index)))', "const stmt = blankQuoted(sql.slice(m.index, sql.indexOf('$', m.index)))"],
    ['semicolons in the body end the statement', "if (c === '$') { const m = /^\\$([A-Za-z_][A-Za-z0-9_]*)?\\$/.exec(sql.slice(i, i + 40)); if (m) { q = m[0]; i += m[0].length; continue } }", ''],
    ['ALTER FUNCTION ... SECURITY DEFINER allowed', R`for (const a of code.matchAll(/alter\s+(?:function|procedure|routine)`, R`for (const a of [] || code.matchAll(/alter\s+(?:function|procedure|routine)`],
    ['grants to anon / public allowed', R`for (const g of code.matchAll(/grant\s+(?:execute|all)`, R`for (const g of [] || code.matchAll(/grant\s+(?:execute|all)`],
    ['grant on routines / procedures not read', R`all\s+(?:functions|routines|procedures)|functions|function|procedures|procedure|routines|routine`, R`all\s+functions|functions|function`],
    ['a quoted grantee hides anon', R`.trim().replace(/"/g, '').split(/\s+/)[0])`, R`.trim().split(/\s+/)[0])`],
    ['an empty script list passes', 'if (!files.length) {', 'if (false) {'],
  ],
  'check-external-surface': [
    ['unknown host allowed', 'if (!ALLOWED_HOSTS[h]) findings.push(', 'if (false) findings.push('],
    ['stale allowlist entry allowed', 'if (!seenHosts.has(h)) findings.push(', 'if (false) findings.push('],
    ['raw IPv4 host invisible', R`|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?`, R`)(?::\d+)?`],
    ['unquoted attribute (">" terminator) invisible', '#>]|$)', '#]|$)'],
    ['userinfo@ hides the real host', R`(?:[^\s\/@"'` + BT + R`]+@)?`, ''],
    ['root service worker not scanned', R`/^(sw|service-worker)\.js$/.test(p)`, 'false'],
    ['web manifest not scanned', R`/^[^/]+\.webmanifest$/.test(p)`, 'false'],
    ['function with no source allowed', 'else if (!has) findings.push(', 'else if (false) findings.push('],
    ['stale KNOWN_MISSING (committed) allowed', 'else if (KNOWN_MISSING[name]) findings.push(', 'else if (false) findings.push('],
    ['stale KNOWN_MISSING (not called) allowed', 'if (!called.has(name)) findings.push(', 'if (false) findings.push('],
    ['service key without caller allowed', 'if (who === -1) findings.push(', 'if (false) findings.push('],
    ['service key built before the caller (in the handler) allowed', 'else if (handlerAt !== -1 && svc > handlerAt && who > svc) findings.push(', 'else if (false) findings.push('],
    ['caller resolved outside the handler allowed', 'else if (handlerAt !== -1 && who !== -1 && who < handlerAt) findings.push(', 'else if (false) findings.push('],
    ['service-role detection off', 'if (svc === -1) continue', 'continue'],
    ['a bare //-stripper eats https:// URLs', "const src = blankComments(readFileSync(join(ROOT, rel), 'utf8'))", "const src = readFileSync(join(ROOT, rel), 'utf8').replace(/\\/\\/[^\\n]*/g, '')"],
    ['.js functions not scanned', R`/^supabase\/functions\/.+\.(ts|js)$/`, R`/^supabase\/functions\/.+\.ts$/`],
  ],
}

// One temp copy per mutation so they can run side by side (JOBS at a time; each self-test spawns dozens of node processes, so it is slow serially).
const JOBS = Number(process.env.MUTATE_JOBS) || 4
const only = process.argv[2]
const run = (self) => new Promise((resolve) => {
  execFile(process.execPath, [self], { windowsHide: true }, (err) => resolve(err ? (err.code || 1) : 0))
})
const makeCopy = (name, mutate) => {
  const dir = mkdtempSync(join(tmpdir(), 'mut-'))
  mkdirSync(join(dir, 'scripts'))
  cpSync(join(SCRIPTS, 'lib'), join(dir, 'scripts', 'lib'), { recursive: true })
  const check = join(dir, 'scripts', name + '.mjs')
  const self = join(dir, 'scripts', name + '.selftest.mjs')
  cpSync(join(SCRIPTS, name + '.selftest.mjs'), self)
  writeFileSync(check, mutate(readFileSync(join(SCRIPTS, name + '.mjs'), 'utf8')))
  return { dir, self }
}

const jobs = []
let errors = 0
for (const [name, muts] of Object.entries(M)) {
  if (only && only !== name) continue
  jobs.push({ name, label: '(clean copy)', clean: true })
  const orig = readFileSync(join(SCRIPTS, name + '.mjs'), 'utf8')
  for (const [label, find, repl] of muts) {
    const n = orig.split(find).length - 1
    if (n !== 1) { errors++; console.log(`  ERROR  ${name}: ${label}: find matched ${n} times (needs exactly 1)`); continue }
    jobs.push({ name, label, find, repl })
  }
}
const results = []
const queue = [...jobs]
await Promise.all(Array.from({ length: JOBS }, async () => {
  while (queue.length) {
    const j = queue.shift()
    const { dir, self } = makeCopy(j.name, (src) => j.clean ? src : src.replace(j.find, () => j.repl))
    const code = await run(self)
    rmSync(dir, { recursive: true, force: true })
    results.push({ ...j, code })
  }
}))

let total = 0, caught = 0
for (const name of Object.keys(M)) {
  if (only && only !== name) continue
  const clean = results.find(r => r.name === name && r.clean)
  console.log(`\n${name}: clean copy self-test exit=${clean.code}${clean.code ? '  <-- BASELINE RED, mutations below are VACUOUS' : ''}`)
  if (clean.code) errors++
  for (const r of results.filter(x => x.name === name && !x.clean)) {
    total++
    if (r.code !== 0) { caught++; console.log(`  caught ${r.label}`) } else { errors++; console.log(`  MISSED ${r.label}   <-- the self-test stayed green`) }
  }
}
console.log(`\n${caught} of ${total} mutations caught, ${errors} problem(s)`)
process.exit(errors ? 1 : 0)
