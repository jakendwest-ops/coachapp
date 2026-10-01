// Do the preview servers refuse what they must refuse? (2026-10-01)
//
// THE BUGS. (1) The server in .claude/launch.json is a PowerShell HttpListener with no extension allowlist and no
// dotfile rule, so `GET /.env` and `GET /.git/config` returned the files (found by the multi-agent review of the RPE
// work), and so did their 8.3 short names (`/ENV~1`, `/GIT~1/config`) on an NTFS volume that still makes them. A
// request for a DIRECTORY threw inside the handler, the empty catch swallowed it, and the response was never closed.
// (2) The throwaway Node server used for worktree runs bound EVERY interface and served `/.env` — the test accounts'
// passwords — to the network, for hours. It is now scripts/preview-server.mjs. Same attacks, both servers, one test.
//
// This starts the REAL servers — launch.json's exact `runtimeArgs` (only the port swapped) and the repo's script — over
// a temp site holding a fake .env, a fake .git/config and a secret just OUTSIDE the root, and attacks them with raw TCP
// request lines: `fetch`/URL normalise `..` and `%2e` before the server sees them, which would turn the traversal
// cases into tests of the client.
//
// POSITIVE CONTROLS: each server must still serve the ordinary files (index, css, js) with the right content type —
// otherwise "refused" could just mean "this server serves nothing". Every rule has a case that fails when ONLY that
// rule is removed (proven with mutants: LAUNCH_JSON / PREVIEW_SERVER point the test at a weakened copy).
//
// The launch.json target is Windows-only (it is a PowerShell command): [skip] elsewhere. The Node target runs anywhere.
//   LAUNCH_JSON=<path>      test only launch.json-style config at that path
//   PREVIEW_SERVER=<path>   test only the Node script at that path
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { createServer, connect } from 'node:net'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const WIN = process.platform === 'win32'
const LAUNCH = process.env.LAUNCH_JSON || join(HERE, '..', '.claude', 'launch.json')
const NODE_SERVER = process.env.PREVIEW_SERVER || join(HERE, 'preview-server.mjs')

const freePort = () => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }); s.on('error', rej) })

// One raw request. A hung response (the server never closes it) is reported as such, not as a pass.
function raw (port, target, { host = `localhost:${port}`, timeoutMs = 5000 } = {}) {
  return new Promise(resolve => {
    const s = connect(port, '127.0.0.1')
    let buf = ''
    const done = (extra = {}) => { clearTimeout(t); s.destroy(); const m = /^HTTP\/1\.[01] (\d+)/.exec(buf); const [head, ...rest] = buf.split('\r\n\r\n'); resolve({ status: m ? Number(m[1]) : null, head, body: rest.join('\r\n\r\n'), ...extra }) }
    const t = setTimeout(() => done({ hung: true }), timeoutMs)
    s.on('connect', () => s.write(`GET ${target} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`))
    s.on('data', d => { buf += d })
    s.on('close', () => done())
    s.on('error', () => done({ connectError: true }))
  })
}

let bad = 0
const say = (cond, label) => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}`) }

const shortNameOf = (kind, p) => {
  if (!WIN) return ''
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `(New-Object -ComObject Scripting.FileSystemObject).Get${kind}('${p}').ShortName`], { encoding: 'utf8', windowsHide: true })
  return (r.stdout || '').trim()
}

// ── how to start each server over a given site, on a given port ─────────────────────────────────────────────
function startLaunchJson (site, port) {
  const cfg = JSON.parse(readFileSync(LAUNCH, 'utf8').replace(/^﻿/, '')).configurations.find(c => c.name === 'CoachApp')
  if (!cfg) throw new Error(`no "CoachApp" configuration in ${LAUNCH}`)
  const args = cfg.runtimeArgs.map(a => a.replace('localhost:3001', `localhost:${port}`))
  if (!args.some(a => a.includes(`localhost:${port}`))) throw new Error('could not swap the port into the config — the test would be probing the wrong server')
  return spawn(cfg.runtimeExecutable, ['-NoProfile', '-NonInteractive', ...args], { cwd: site, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
}
const startNode = (site, port) => spawn(process.execPath, [NODE_SERVER, site, String(port)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })

const only = process.env.LAUNCH_JSON ? 'launch' : process.env.PREVIEW_SERVER ? 'node' : null
const TARGETS = [
  { key: 'launch', name: '.claude/launch.json (PowerShell)', enabled: WIN, start: startLaunchJson },
  { key: 'node', name: 'scripts/preview-server.mjs (Node)', enabled: true, start: startNode },
].filter(t => !only || t.key === only)

const tmp = mkdtempSync(join(tmpdir(), 'preview-server-'))
const site = join(tmp, 'site')
for (const d of ['css', 'js', '.git', 'sub/.hidden']) mkdirSync(join(site, d), { recursive: true })
writeFileSync(join(site, 'index.html'), '<title>CoachApp</title>OK-INDEX')
writeFileSync(join(site, 'css', 'main.css'), 'body{}/*OK-CSS*/')
writeFileSync(join(site, 'js', 'app.js'), '/*OK-JS*/')
writeFileSync(join(site, '.env'), 'SECRET_KEY=SECRET-ENV')
writeFileSync(join(site, '.git', 'config'), '[remote]\nurl=SECRET-GIT')
writeFileSync(join(site, 'sub', '.hidden', 'x.js'), '/*SECRET-NESTED*/')
writeFileSync(join(site, 'secrets.pem'), 'SECRET-PEM')
writeFileSync(join(tmp, 'outside.txt'), 'SECRET-OUTSIDE')
// A ':' in a name: on NTFS this creates an ALTERNATE DATA STREAM `secret.txt` on plain.html — a hidden payload behind an
// allowed extension that no dot rule and no allowlist would catch. (On another filesystem it is just an oddly named file.)
let adsMade = false
try { writeFileSync(join(site, 'plain.html'), 'OK-PLAIN'); writeFileSync(join(site, 'plain.html:secret.txt'), 'SECRET-ADS'); adsMade = true } catch { /* the filesystem refuses ':' — nothing to attack with */ }

async function attack (target) {
  console.log(`\n=== ${target.name} ===`)
  const port = await freePort()
  let server = null
  try {
    server = target.start(site, port)
    let started = ''
    server.stdout.on('data', d => { started += d }); server.stderr.on('data', d => { started += d })
    for (let i = 0; i < 80 && !/Listening on/.test(started); i++) await new Promise(r => setTimeout(r, 250))
    if (!/Listening on/.test(started)) { say(false, `the server did not start: ${started.slice(0, 200)}`); return }

    console.log('— it still serves what it should —')
    const idx = await raw(port, '/')
    say(idx.status === 200 && idx.body.includes('OK-INDEX'), 'GET / serves index.html')
    const css = await raw(port, '/css/main.css')
    say(css.status === 200 && css.body.includes('OK-CSS') && /text\/css/i.test(css.head), 'GET /css/main.css serves the file as text/css')
    const js = await raw(port, '/js/app.js?v=3')
    say(js.status === 200 && js.body.includes('OK-JS') && /javascript/i.test(js.head), 'GET /js/app.js?v=3 serves the file as JavaScript (the cache-bust query is ignored)')

    console.log('— it refuses what it must —')
    // body check as well as status: a 404 whose body still carries the secret would be a pass on status alone.
    const mustRefuse = [
      ['/.env', 'SECRET-ENV', 'a dotfile at the root'],
      ['/.ENV', 'SECRET-ENV', 'the same dotfile in another case'],
      ['/%2eenv', 'SECRET-ENV', 'a dotfile with the dot percent-encoded'],
      ['/./.env', 'SECRET-ENV', 'a dotfile behind a ./ segment'],
      ['/css/../.env', 'SECRET-ENV', 'a dotfile behind a .. that lands back on the root'],
      ['/.git/config', 'SECRET-GIT', 'a file inside .git'],
      ['/sub/.hidden/x.js', 'SECRET-NESTED', 'a .js file under a dot-directory nested deeper'],
      ['/%2e%2e/outside.txt', 'SECRET-OUTSIDE', 'a file OUTSIDE the root, via an encoded ..'],
      ['/../outside.txt', 'SECRET-OUTSIDE', 'a file OUTSIDE the root, via a plain ..'],
      ['/..%5coutside.txt', 'SECRET-OUTSIDE', 'a file OUTSIDE the root, via ..\\'],
      ['/secrets.pem', 'SECRET-PEM', 'a plain-named file of a type the app never serves (.pem)'],
    ]
    // The 8.3 short-name route: on an NTFS volume that still makes them `.env` is also ENV~1, `.git` is GIT~1, a
    // dot-directory has one too — names with no leading dot that a dot-segment rule alone never sees. Looked up from
    // the volume, not guessed; skipped (with a note) where the volume makes none.
    const envShort = shortNameOf('File', join(site, '.env'))
    const gitShort = shortNameOf('Folder', join(site, '.git'))
    const hiddenShort = shortNameOf('Folder', join(site, 'sub', '.hidden'))
    if (WIN) {
      if (envShort && envShort !== '.env') mustRefuse.push([`/${envShort}`, 'SECRET-ENV', `the same .env through its 8.3 short name (${envShort})`])
      else console.log('  [note] this volume makes no 8.3 short name for .env — that case cannot run here')
      if (gitShort && gitShort !== '.git') mustRefuse.push([`/${gitShort}/config`, 'SECRET-GIT', `.git/config through the short name of .git (${gitShort})`])
      else console.log('  [note] this volume makes no 8.3 short name for .git — that case cannot run here')
      // an ALLOWED type (.js) under a dot-directory, via that directory's short name: no segment starts with a dot and
      // the extension is fine, so ONLY the short-name rule stops this one.
      if (hiddenShort && hiddenShort !== '.hidden') mustRefuse.push([`/sub/${hiddenShort}/x.js`, 'SECRET-NESTED', `a .js file under a dot-directory through its 8.3 short name (${hiddenShort})`])
      else console.log('  [note] this volume makes no 8.3 short name for .hidden — that case cannot run here')
    }
    for (const [req, secret, what] of mustRefuse) {
      const r = await raw(port, req)
      say(!r.connectError && !r.hung && r.status !== 200 && !r.body.includes(secret), `${what}: GET ${req} -> ${r.hung ? 'HUNG' : r.status}, secret ${r.body.includes(secret) ? 'LEAKED' : 'not in the body'}`)
    }
    if (adsMade) {
      const plain = await raw(port, '/plain.html')
      say(plain.status === 200 && plain.body.includes('OK-PLAIN'), 'POSITIVE CONTROL: GET /plain.html serves the plain file, so the stream case below is a refusal, not a missing file')
      const ads = await raw(port, '/plain.html:secret.txt')
      say(!ads.hung && ads.status !== 200 && !ads.body.includes('SECRET-ADS'), `an alternate data stream behind an allowed extension: GET /plain.html:secret.txt -> ${ads.hung ? 'HUNG' : ads.status}, secret ${ads.body.includes('SECRET-ADS') ? 'LEAKED' : 'not in the body'}`)
    }
    const rebind = await raw(port, '/', { host: 'evil.example' })
    say(!rebind.hung && rebind.status !== 200 && !rebind.body.includes('OK-INDEX'), `a request whose Host names another origin (DNS rebinding) is refused -> ${rebind.hung ? 'HUNG' : rebind.status}`)

    console.log('— a request it cannot serve does not hang the client —')
    const dir = await raw(port, '/css')
    say(!dir.hung && dir.status !== 200, `GET /css (a directory) answers (${dir.hung ? 'HUNG' : dir.status}) instead of leaving the connection open`)
    const glob = await raw(port, '/*')
    say(!glob.hung && glob.status !== 200, `GET /* (a wildcard) answers (${glob.hung ? 'HUNG' : glob.status}) and is not treated as a pattern`)
    const after = await raw(port, '/')
    say(after.status === 200 && after.body.includes('OK-INDEX'), 'and the server is still serving afterwards (those requests did not wedge it)')
  } catch (e) {
    say(false, `could not run: ${String(e.message).slice(0, 200)}`)
  } finally {
    // the child owns the listener; kill the tree so the port is freed and no window or process is left behind
    if (server?.pid) {
      if (WIN) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      else server.kill('SIGKILL')
    }
  }
}

try {
  for (const t of TARGETS) {
    if (!t.enabled) { console.log(`\n[skip] ${t.name}: not runnable on this platform`); continue }
    await attack(t)
  }
} finally {
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* temp dir */ }
}
console.log(bad ? `\n${bad} case(s) misbehaved` : '\nall cases behaved')
process.exit(bad ? 1 : 0)
