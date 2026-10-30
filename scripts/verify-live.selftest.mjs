#!/usr/bin/env node
/**
 * Proves verify-live.mjs does what its header says: finds the files the app loads, compares BYTES (not lengths, not "something
 * came back"), retries only what still differs, and, run for real against a throwaway git repo and a local web server, reads the
 * TAG (not the working tree) and exits 0 / 1 / 2 correctly.
 * Run: node scripts/verify-live.selftest.mjs      (exit 1 = a case misbehaved)
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import { appFiles, manifestIcons, verify } from './verify-live.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'verify-live.mjs')
let failures = 0
const check = (label, ok, extra = '') => { if (!ok) { failures++; console.log(`  FAIL ${label}${extra ? '  -- ' + extra : ''}`) } }

// ---- appFiles: the local files index.html loads, nothing else
{
  const html = `<!doctype html>
<link rel="stylesheet" href="css/main.css?v=30">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js" integrity="sha384-x" crossorigin="anonymous"></script>
<script src="//unpkg.com/x@1/x.js"></script>
<!-- <script src="js/commented-out.js"></script> -->
<script src="js/app-core.js?v=40"></script><script src="./js/app-dashboard.js?v=32#frag"></script>
<script src="js/app-core.js?v=41"></script>
<link rel="icon" href="data:image/png;base64,AAA"><a href="#top">top</a><a href="docs/page.html">a link, not a load</a><img src="img/logo.png">`
  const got = appFiles(html)
  check('appFiles: local loads only, query/fragment stripped, deduped, comments and third-party ignored',
    JSON.stringify(got) === JSON.stringify(['index.html', 'css/main.css', 'js/app-core.js', 'js/app-dashboard.js', 'img/logo.png']), JSON.stringify(got))
}

// ---- manifestIcons: the icons a manifest lists, resolved against the manifest's folder (2026-10-30)
{
  const m = JSON.stringify({ icons: [
    { src: 'icons/a.png?v=2' }, { src: './icons/b.png#x' }, { src: 'icons/a.png' },
    { src: 'https://cdn.example/c.png' }, { src: 'data:image/png;base64,AAA' }, { src: '' }, {}
  ] })
  const root = manifestIcons(m, 'manifest.webmanifest')
  check('manifestIcons: local icons only, query/fragment stripped, deduped, third-party and data: skipped',
    JSON.stringify(root) === JSON.stringify(['icons/a.png', 'icons/b.png']), JSON.stringify(root))
  const nested = manifestIcons(m, 'app/site.webmanifest')
  check('manifestIcons: paths resolve against the manifest\'s own folder',
    JSON.stringify(nested) === JSON.stringify(['app/icons/a.png', 'app/icons/b.png']), JSON.stringify(nested))
  check('manifestIcons: a manifest that is not JSON yields nothing (and does not throw)', manifestIcons('{not json', 'm.webmanifest').length === 0)
  check('manifestIcons: a manifest with no icons yields nothing', manifestIcons('{}', 'm.webmanifest').length === 0)
}

// ---- verify(): the loop, with a fake clock and fake network
const tag = p => Buffer.from(`content of ${p}`)
const FILES = ['index.html', 'css/main.css', 'js/app.js']
const run = async (live, { waitMs = 0, intervalMs = 10_000 } = {}) => {
  // The fake sleep returns at once, so a retry loop that lost its deadline would spin for ever and starve the event loop: the self-test
  // would HANG (and block the push) instead of failing. It throws after 1000 sleeps, so that break is a red result with a message.
  let t = 0, sleeps = 0; const calls = {}
  const r = await verify({
    files: FILES, readTag: tag, waitMs, intervalMs, now: () => t, sleep: async ms => { if (++sleeps > 1000) throw new Error('the retry loop never ended (its deadline check is gone)'); t += ms },
    fetchLive: async p => { calls[p] = (calls[p] || 0) + 1; return live(p, calls[p]) }
  })
  return { r, calls, t }
}
const same = p => ({ status: 200, body: tag(p) })
const statusOf = (r, p) => r.results.find(x => x.path === p).status

{
  const { r } = await run(same)
  check('verify: every file identical -> ok on the first attempt', r.ok && r.attempts === 1 && r.results.every(x => x.status === 'identical'))
}
{
  const { r } = await run(p => p === 'js/app.js' ? { status: 200, body: Buffer.from('content of js/app.jX') } : same(p))
  check('verify: ONE byte different at the same length -> that file differs, the others do not', !r.ok && statusOf(r, 'js/app.js') === 'differs' && statusOf(r, 'index.html') === 'identical')
}
{
  const { r } = await run(p => p === 'css/main.css' ? { status: 200, body: Buffer.alloc(0) } : same(p))
  check('verify: an EMPTY live body is not "identical" (a truthy/length-only compare would pass it)', !r.ok && statusOf(r, 'css/main.css') === 'differs')
}
{
  const { r } = await run(p => p === 'index.html' ? { status: 404, body: tag(p) } : same(p))
  check('verify: a 404 fails even when the body happens to match', !r.ok && statusOf(r, 'index.html') === 'http-404')
}
{
  const { r } = await run(p => { if (p === 'index.html') throw new Error('offline'); return same(p) })
  check('verify: a network failure is a failure, not an exception', !r.ok && statusOf(r, 'index.html') === 'error: offline')
}
{
  // Pages lagging the deploy job: the first two reads of js/app.js are the OLD file, the third is right.
  const { r, calls } = await run((p, n) => p === 'js/app.js' && n < 3 ? { status: 200, body: Buffer.from('old') } : same(p), { waitMs: 60_000 })
  check('verify: converges once the live file catches up', r.ok && r.attempts === 3, `attempts ${r.attempts}`)
  check('verify: only files that still differ are fetched again', calls['index.html'] === 1 && calls['css/main.css'] === 1 && calls['js/app.js'] === 3, JSON.stringify(calls))
}
{
  const { r, t } = await run(p => p === 'js/app.js' ? { status: 200, body: Buffer.from('old') } : same(p), { waitMs: 25_000 })
  check('verify: never converging stops at the deadline, failing', !r.ok && r.attempts >= 2 && r.attempts <= 4 && t <= 25_000, `attempts ${r.attempts}, waited ${t}ms`)
}

// ---- the CLI for real: a throwaway git repo (the tag) and a local web server (the "live site")
const root = mkdtempSync(join(tmpdir(), 'verify-live-selftest-'))
const linkHolder = mkdtempSync(join(tmpdir(), 'verify-live-link-'))
const link = join(linkHolder, 'scripts-link')   // a junction/symlink to the real scripts/, made below
// No inherited GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE: checks.sh runs this from inside git's pre-push hook, where they can point at the
// REAL repo and would send the commit and tag below there (found by the 2026-10-11 review).
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
const git = (...a) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a], { cwd: root, stdio: 'pipe', env: cleanEnv })
const put = (p, text) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), text) }
put('index.html', '<link rel="stylesheet" href="css/main.css?v=1"><script src="js/app.js?v=1"></script>')
put('css/main.css', 'body{color:#111}')
put('js/app.js', 'console.log("v1")')
put('privacy-policy.html', '<p>policy</p>')
git('init', '-q'); git('add', '.'); git('commit', '-q', '-m', 'release'); git('tag', 'v-test')

// the "live site" serves the WORKING TREE, so changing a file on disk makes live differ from the tag
const server = http.createServer((req, res) => {
  let f = null
  try { f = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '')) } catch { /* a malformed %-escape: 404 below */ }
  // Only files INSIDE the temp site are ever served (a "..%2f" path must not walk out of it).
  if (f && f.startsWith(root + sep) && existsSync(f)) { res.writeHead(200); res.end(readFileSync(f)) } else { res.writeHead(404); res.end('nope') }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`
const cli = (args, script = SCRIPT) => new Promise(resolve => {
  const c = spawn(process.execPath, [script, ...args], { cwd: root, env: cleanEnv })
  let out = ''; c.stdout.on('data', d => { out += d }); c.stderr.on('data', d => { out += d })
  c.on('close', code => resolve({ code, out }))
})

try {
  let r = await cli(['v-test', '--base', base, '--wait', '0'])
  check('cli: live equals the tag -> exit 0 and says so', r.code === 0 && r.out.includes('LIVE MATCHES v-test: 4 files'), `${r.code} ${r.out}`)

  put('js/app.js', 'console.log("v2 edited after the tag")')
  r = await cli(['v-test', '--base', base, '--wait', '0'])
  check('cli: a file edited AFTER the tag is caught (so the TAG is what is read, not the working tree) -> exit 1, file named', r.code === 1 && /FAIL js\/app\.js/.test(r.out) && r.out.includes('NOT LIVE'), `${r.code} ${r.out}`)
  put('js/app.js', 'console.log("v1")')

  rmSync(join(root, 'css/main.css'))
  r = await cli(['v-test', '--base', base, '--wait', '0'])
  check('cli: a file missing from the live site -> exit 1 with its 404', r.code === 1 && /FAIL css\/main\.css\s+\(http-404\)/.test(r.out), `${r.code} ${r.out}`)
  put('css/main.css', 'body{color:#111}')

  r = await cli(['v-does-not-exist', '--base', base, '--wait', '0'])
  check('cli: an unknown tag -> exit 2', r.code === 2 && r.out.includes('no tag named'), `${r.code} ${r.out}`)
  r = await cli([])
  check('cli: no arguments -> exit 2 with usage', r.code === 2 && r.out.includes('usage:'), `${r.code} ${r.out}`)

  // Reached through a junction / symlink to scripts/ the script used to print NOTHING and exit 0 (its "am I the entry point?" test compared
  // an unresolved path with a resolved URL): a verifier that passes without verifying. Run it that way and require the usual answer.
  // The link lives OUTSIDE the temp repo, or the later `git add .` would walk into the real scripts/ through it.
  let linked = true
  try { symlinkSync(dirname(SCRIPT), link, 'junction') } catch (e) { linked = false; console.log(`  [skip] cannot create a junction/symlink here (${e.code}); the entry-point case is not run`) }
  if (linked) {
    r = await cli(['v-does-not-exist', '--base', base, '--wait', '0'], join(link, 'verify-live.mjs'))
    check('cli: run through a junction/symlink it still answers (unknown tag -> exit 2), not silence and exit 0', r.code === 2 && r.out.includes('no tag named'), `${r.code} ${JSON.stringify(r.out)}`)
  }

  put('index.html', '<link rel="stylesheet" href="css/main.css"><script src="js/never-committed.js"></script>')
  git('add', '.'); git('commit', '-q', '-m', 'broken index'); git('tag', '-f', 'v-bad-ref')
  r = await cli(['v-bad-ref', '--base', base, '--wait', '0'])
  check('cli: an index.html that loads a file the tag does not contain -> exit 2, file named', r.code === 2 && r.out.includes('js/never-committed.js'), `${r.code} ${r.out}`)
} finally {
  server.close(); rmSync(root, { recursive: true, force: true })
  // The link is removed with unlinkSync FIRST (verified on a throwaway: it deletes only the link, never what it points at), and the holder
  // is deleted recursively only once the link is gone: a recursive delete that followed it would empty the real scripts/ folder.
  try { unlinkSync(link) } catch { /* it was never created */ }
  if (!existsSync(link)) rmSync(linkHolder, { recursive: true, force: true })
}

if (failures) { console.log(`verify-live self-test: ${failures} case(s) misbehaved.`); process.exit(1) }
console.log('verify-live: finds the local files, compares bytes, retries only what differs, reads the tag, and exits 0 / 1 / 2 correctly.')
