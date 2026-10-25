#!/usr/bin/env node
/**
 * Proves check-external-surface.mjs BLOCKS a new third-party host, a server function with no source in the repo, a
 * service-role client built before the caller is known, and a stale allowlist/KNOWN_MISSING entry -- and passes the
 * repo's real shape. It builds miniature repos in a temp dir (SURFACE_ROOT) from the check's own `--list`, so the
 * fixtures cannot drift from the allowlist.
 * Run: node scripts/check-external-surface.selftest.mjs      (exit 1 = a case misbehaved)
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-external-surface.mjs')
const { hosts } = JSON.parse(execFileSync(process.execPath, [CHECK, '--list'], { encoding: 'utf8' }))
// The real KNOWN_MISSING list is empty (invite-client's source is committed), so the fixtures bring their own entry, handed to the check through the self-test-only
// SURFACE_KNOWN_MISSING variable.
const knownMissing = ['legacy-fn']

const GOOD_FN = `Deno.serve(async (req) => {\n  const caller = createClient(url, anon, { global: { headers: { Authorization: h } } })\n  const { data: { user } } = await caller.auth.getUser()\n  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))\n})\n`
const BASE = () => ({
  'index.html': `<!doctype html>\n${hosts.map(h => `<link href="https://${h}/x">`).join('\n')}\n`,
  'js/app.js': `${knownMissing.map(n => `fetch(URL + '/functions/v1/${n}')`).join('\n')}\nfetch(URL + '/functions/v1/invite-solo-user')\n`,
  'supabase/functions/invite-solo-user/index.ts': GOOD_FN,
  'css/main.css': 'body{}\n',
})
const withFiles = (extra, drop = []) => { const b = BASE(); for (const d of drop) delete b[d]; return { ...b, ...extra } }
// The key is read into a variable (as invite-client does), so where it is READ and where it is USED are different places.
const CALLER = `  const caller = createClient(url, anon, { global: { headers: { Authorization: h } } })\n  const { data: { user } } = await caller.auth.getUser()\n`
const VAR_FN = (head, between, tail) => `Deno.serve(async (req) => {\n${head}${between}${tail}})\n`
const READ = "  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!\n"
const READ_TYPED = "  const serviceKey: string = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!\n"
const BUILD = '  const admin = createClient(url, serviceKey)\n'

const CASES = [
  { want: 'PASS', why: 'the repo\'s real shape (every allowed host referenced, every function accounted for)', files: BASE() },
  { want: 'BLOCK', why: 'a new third-party host in js (an analytics beacon)',
    files: withFiles({ 'js/app.js': BASE()['js/app.js'] + "fetch('https://analytics.example.com/t')\n" }) },
  { want: 'BLOCK', why: 'a new third-party script host in html',
    files: withFiles({ 'index.html': BASE()['index.html'] + '<script src="https://cdn.other.com/x.js"></script>\n' }) },
  { want: 'BLOCK', why: 'a protocol-relative URL is still a host',
    files: withFiles({ 'index.html': BASE()['index.html'] + '<script src="//cdn.other.com/x.js"></script>\n' }) },
  { want: 'PASS', why: 'a host named only in a COMMENT is documentation',
    files: withFiles({ 'js/app.js': BASE()['js/app.js'] + '// see https://developer.mozilla.org/en-US/docs/Web\n/* https://example.org */\n' }) },
  { want: 'BLOCK', why: 'a stale allowlist entry: the host is no longer referenced anywhere',
    files: withFiles({ 'index.html': BASE()['index.html'].split('\n').filter(l => !l.includes(hosts[hosts.length - 1])).join('\n') }) },
  { want: 'BLOCK', why: 'the app calls a server function whose source is not in the repo',
    files: withFiles({ 'js/app.js': BASE()['js/app.js'] + "fetch(URL + '/functions/v1/brand-new-fn')\n" }) },
  { want: 'PASS', why: 'the same function with its source committed and the caller resolved first',
    files: withFiles({ 'js/app.js': BASE()['js/app.js'] + "fetch(URL + '/functions/v1/brand-new-fn')\n", 'supabase/functions/brand-new-fn/index.ts': GOOD_FN }) },
  { want: 'BLOCK', why: 'a function holding the service-role key that never resolves the caller',
    files: withFiles({ 'supabase/functions/invite-solo-user/index.ts': "Deno.serve(async (req) => {\n  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))\n})\n" }) },
  { want: 'BLOCK', why: 'a https:// URL beside the key must not be mistaken for a comment that hides it (a bare //-stripper once did)',
    files: withFiles({ 'supabase/functions/invite-solo-user/index.ts': "Deno.serve(async (req) => {\n  const admin = createClient('https://abc.supabase.co', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))\n})\n" }) },
  { want: 'BLOCK', why: 'a function that builds the service-role client INSIDE the handler BEFORE it resolves the caller',
    files: withFiles({ 'supabase/functions/invite-solo-user/index.ts': "Deno.serve(async (req) => {\n  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))\n  const { data } = await caller.auth.getUser()\n})\n" }) },
  { want: 'BLOCK', why: 'the caller is resolved once at module level, not per request',
    files: withFiles({ 'supabase/functions/invite-solo-user/index.ts': "const { data } = await caller.auth.getUser()\nconst admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))\nDeno.serve(async (req) => { await admin.from('x').select() })\n" }) },
  { want: 'PASS', why: 'a MODULE-level admin client is fine when each request resolves its caller first (the common Deno shape)',
    files: withFiles({ 'supabase/functions/invite-solo-user/index.ts': "const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))\nDeno.serve(async (req) => {\n  const { data } = await caller.auth.getUser()\n  await admin.from('x').select()\n})\n" }) },
  { want: 'BLOCK', why: 'a raw IPv4 address is a host too',
    files: withFiles({ 'js/app.js': BASE()['js/app.js'] + "fetch('https://203.0.113.5/collect')\n" }) },
  { want: 'BLOCK', why: 'an allowed host in the userinfo position must not hide the real host (https://allowed@evil/)',
    files: withFiles({ 'js/app.js': BASE()['js/app.js'] + `fetch('https://${hosts[0]}@evil.example.com/x')\n` }) },
  { want: 'BLOCK', why: 'a root service worker is scanned too',
    files: withFiles({ 'sw.js': "fetch('https://sw-tracker.example.com/x')\n" }) },
  { want: 'BLOCK', why: 'a web manifest is scanned too',
    files: withFiles({ 'app.webmanifest': '{ "start_url": "https://manifest-host.example.com/" }\n' }) },
  { want: 'BLOCK', why: 'an UNQUOTED attribute value is still a request',
    files: withFiles({ 'index.html': BASE()['index.html'] + '<img src=https://tracker.example.org>\n' }) },
  { want: 'BLOCK', why: 'a service-role function written in .js is judged too (only .ts used to be scanned)',
    files: withFiles({ 'supabase/functions/other/index.js': "Deno.serve(async (req) => {\n  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))\n})\n" }) },
  { want: 'PASS', why: 'invite-client\'s shape: the key is READ into a variable before the caller is known, and USED to build the client only after',
    files: withFiles({ 'supabase/functions/invite-solo-user/index.ts': VAR_FN(READ, CALLER, BUILD) }) },
  { want: 'PASS', why: 'the same with a type annotation on the variable (const serviceKey: string = ...)',
    files: withFiles({ 'supabase/functions/invite-solo-user/index.ts': VAR_FN(READ_TYPED, CALLER, BUILD) }) },
  { want: 'BLOCK', why: 'the key variable builds the client BEFORE the caller is resolved',
    files: withFiles({ 'supabase/functions/invite-solo-user/index.ts': VAR_FN(READ, BUILD, CALLER) }) },
  { want: 'BLOCK', why: 'an INLINE client (createClient(url, Deno.env.get(KEY))) built before the caller is known, even though it is first used after: the key is judged where it is written',
    files: withFiles({ 'supabase/functions/invite-solo-user/index.ts': VAR_FN('', "  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))\n" + CALLER, "  await admin.from('x').select()\n") }) },
  { want: 'BLOCK', why: 'a comma declaration (const a = 1, serviceKey = Deno.env.get(KEY)) before the caller is not a followed binding: the key is judged where it is written',
    files: withFiles({ 'supabase/functions/invite-solo-user/index.ts': VAR_FN("  const a = 1, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')\n", CALLER, BUILD) }) },
  { want: 'BLOCK', why: 'the key sits in a variable and the caller is never resolved',
    files: withFiles({ 'supabase/functions/invite-solo-user/index.ts': VAR_FN(READ, BUILD, '') }) },
  { want: 'BLOCK', why: 'the key is read into a variable and no use of it can be seen: judged where it is READ (conservative), which is before the caller',
    files: withFiles({ 'supabase/functions/invite-solo-user/index.ts': VAR_FN(READ, CALLER, '') }) },
  { want: 'BLOCK', why: 'a KNOWN_MISSING function whose source is now committed (stale entry)',
    files: withFiles({ [`supabase/functions/${knownMissing[0]}/index.ts`]: GOOD_FN }) },
  { want: 'BLOCK', why: 'a KNOWN_MISSING function the app no longer calls (stale entry)',
    files: withFiles({ 'js/app.js': "fetch(URL + '/functions/v1/invite-solo-user')\n" }) },
]

let failures = 0
CASES.forEach((c, i) => {
  const dir = mkdtempSync(join(tmpdir(), 'surface-selftest-'))
  for (const [rel, body] of Object.entries(c.files)) {
    const p = join(dir, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, body, 'utf8')
  }
  let exit = 0, out = ''
  try { out = execFileSync(process.execPath, [CHECK], { encoding: 'utf8', env: { ...process.env, SURFACE_ROOT: dir, SURFACE_KNOWN_MISSING: JSON.stringify(Object.fromEntries(knownMissing.map(n => [n, 'self-test entry']))) } }) }
  catch (err) { exit = err.status; out = (err.stdout || '') + (err.stderr || '') }
  rmSync(dir, { recursive: true, force: true })
  const got = exit === 0 ? 'PASS' : 'BLOCK'
  if (got !== c.want) { failures++; console.log(`  [${i}] want ${c.want}, got ${got} -- ${c.why}\n${out}`) }
})

const blocks = CASES.filter(c => c.want === 'BLOCK').length
if (!blocks || blocks === CASES.length) { console.log('  self-test is one-sided'); process.exit(1) }
if (failures) { console.log(`  ${failures} of ${CASES.length} self-test cases misbehaved.`); process.exit(1) }
console.log(`  check-external-surface self-test: ${CASES.length} cases behaved (${blocks} must-block, ${CASES.length - blocks} must-pass).`)
process.exit(0)
