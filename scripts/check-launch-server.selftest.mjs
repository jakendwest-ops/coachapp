// Does the preview server in .claude/launch.json refuse what it must refuse? (2026-10-01)
//
// THE BUG. The server is a PowerShell HttpListener with no extension allowlist and no dotfile rule, so with the repo
// root as its root `GET /.env` and `GET /.git/config` returned the files (the multi-agent review of the RPE work
// confirmed it with raw request lines). Loopback-only, so LOW — but a file full of keys is not something a dev server
// should hand to anything that can reach localhost, and "it is only localhost" is exactly the reasoning that leaves it.
// Found with it: a request for a DIRECTORY threw inside the handler, the empty catch swallowed it, and the response was
// never closed — the client hung until its own timeout.
//
// This runs the REAL server — the exact `runtimeArgs` out of launch.json, only the port swapped for a spare one — over a
// temp site that holds a fake .env, a fake .git/config and a secret sitting just OUTSIDE the root. Requests are raw TCP
// request lines, because `fetch`/URL normalise `..` and `%2e` before the server ever sees them, which would turn the
// traversal cases into tests of the client.
//
// POSITIVE CONTROLS: the same server must still serve the ordinary files (index, css, js) with the right content type —
// otherwise "refused" could just mean "this server serves nothing".
//
// Windows-only by nature (the config is a PowerShell command): exits 0 with a [skip] elsewhere.
// LAUNCH_JSON=<path> points it at another copy of the config (used to prove it goes RED on the old one).
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { createServer, connect } from 'node:net'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') { console.log('[skip] check-launch-server: the preview server is a PowerShell command; nothing to run on this platform'); process.exit(0) }

const HERE = dirname(fileURLToPath(import.meta.url))
const CONFIG = process.env.LAUNCH_JSON || join(HERE, '..', '.claude', 'launch.json')
const cfg = JSON.parse(readFileSync(CONFIG, 'utf8').replace(/^﻿/, '')).configurations.find(c => c.name === 'CoachApp')
if (!cfg) { console.log(`FAIL  no "CoachApp" configuration in ${CONFIG}`); process.exit(1) }

const freePort = () => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }); s.on('error', rej) })

// One raw request. A hung response (the server never closes it) is reported as such, not as a pass.
function raw (port, target, timeoutMs = 5000) {
  return new Promise(resolve => {
    const s = connect(port, '127.0.0.1')
    let buf = ''
    const done = (extra = {}) => { clearTimeout(t); s.destroy(); const m = /^HTTP\/1\.[01] (\d+)/.exec(buf); const [head, ...rest] = buf.split('\r\n\r\n'); resolve({ status: m ? Number(m[1]) : null, head, body: rest.join('\r\n\r\n'), ...extra }) }
    const t = setTimeout(() => done({ hung: true }), timeoutMs)
    s.on('connect', () => s.write(`GET ${target} HTTP/1.1\r\nHost: localhost:${port}\r\nConnection: close\r\n\r\n`))
    s.on('data', d => { buf += d })
    s.on('close', () => done())
    s.on('error', () => done({ connectError: true }))
  })
}

let bad = 0
const say = (cond, label) => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}`) }

const tmp = mkdtempSync(join(tmpdir(), 'launch-server-'))
const site = join(tmp, 'site')
let server = null
try {
  for (const d of ['css', 'js', '.git', 'sub/.hidden']) mkdirSync(join(site, d), { recursive: true })
  writeFileSync(join(site, 'index.html'), '<title>CoachApp</title>OK-INDEX')
  writeFileSync(join(site, 'css', 'main.css'), 'body{}/*OK-CSS*/')
  writeFileSync(join(site, 'js', 'app.js'), '/*OK-JS*/')
  writeFileSync(join(site, '.env'), 'SECRET_KEY=SECRET-ENV')
  writeFileSync(join(site, '.git', 'config'), '[remote]\nurl=SECRET-GIT')
  writeFileSync(join(site, 'sub', '.hidden', 'x.js'), '/*SECRET-NESTED*/')
  writeFileSync(join(tmp, 'outside.txt'), 'SECRET-OUTSIDE')

  const port = await freePort()
  const args = cfg.runtimeArgs.map(a => a.replace('localhost:3001', `localhost:${port}`))
  if (!args.some(a => a.includes(`localhost:${port}`))) { console.log('FAIL  could not swap the port into the config — the test would be probing the wrong server'); process.exit(1) }
  server = spawn(cfg.runtimeExecutable, ['-NoProfile', '-NonInteractive', ...args], { cwd: site, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let started = ''
  server.stdout.on('data', d => { started += d }); server.stderr.on('data', d => { started += d })
  for (let i = 0; i < 80 && !/Listening on/.test(started); i++) await new Promise(r => setTimeout(r, 250))
  if (!/Listening on/.test(started)) { console.log(`FAIL  the server did not start: ${started.slice(0, 200)}`); process.exit(1) }

  console.log('— the server still serves what it should —')
  const idx = await raw(port, '/')
  say(idx.status === 200 && idx.body.includes('OK-INDEX'), 'GET / serves index.html')
  const css = await raw(port, '/css/main.css')
  say(css.status === 200 && css.body.includes('OK-CSS') && /text\/css/i.test(css.head), 'GET /css/main.css serves the file as text/css')
  const js = await raw(port, '/js/app.js')
  say(js.status === 200 && js.body.includes('OK-JS') && /javascript/i.test(js.head), 'GET /js/app.js serves the file as JavaScript')

  console.log('— and refuses what it must —')
  // body check as well as status: a 404 whose body still carries the secret would be a pass on status alone.
  const mustRefuse = [
    ['/.env', 'SECRET-ENV', 'a dotfile at the root'],
    ['/.ENV', 'SECRET-ENV', 'the same dotfile in another case'],
    ['/%2eenv', 'SECRET-ENV', 'a dotfile with the dot percent-encoded'],
    ['/.git/config', 'SECRET-GIT', 'a file inside .git'],
    ['/sub/.hidden/x.js', 'SECRET-NESTED', 'a file under a dot-directory nested deeper'],
    ['/%2e%2e/outside.txt', 'SECRET-OUTSIDE', 'a file OUTSIDE the root, via an encoded ..'],
    ['/../outside.txt', 'SECRET-OUTSIDE', 'a file OUTSIDE the root, via a plain ..'],
    ['/..%5coutside.txt', 'SECRET-OUTSIDE', 'a file OUTSIDE the root, via ..\\'],
  ]
  // The 8.3 short-name route: on an NTFS volume that still makes them, `.env` is also reachable as ENV~1 and `.git` as
  // GIT~1, names with no leading dot that a dot-segment rule alone never sees. Looked up from the volume, not guessed.
  const shortName = (p) => {
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `(New-Object -ComObject Scripting.FileSystemObject).GetFile('${p}').ShortName`], { encoding: 'utf8', windowsHide: true })
    return (r.stdout || '').trim()
  }
  const envShort = shortName(join(site, '.env'))
  const gitDirShort = (() => { const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${join(site, '.git')}').ShortName`], { encoding: 'utf8', windowsHide: true }); return (r.stdout || '').trim() })()
  if (envShort && envShort !== '.env') mustRefuse.push([`/${envShort}`, 'SECRET-ENV', `the same .env through its 8.3 short name (${envShort})`])
  else console.log('  [note] this volume makes no 8.3 short name for .env — that case cannot run here')
  if (gitDirShort && gitDirShort !== '.git') mustRefuse.push([`/${gitDirShort}/config`, 'SECRET-GIT', `.git/config through the short name of .git (${gitDirShort})`])
  else console.log('  [note] this volume makes no 8.3 short name for .git — that case cannot run here')
  // an ALLOWED type (.js) under a dot-directory, reached through that directory's short name: no segment starts with a dot
  // and the extension is fine, so ONLY the short-name rule stops this one (and a bare dot rule + allowlist would not).
  const hiddenShort = (() => { const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${join(site, 'sub', '.hidden')}').ShortName`], { encoding: 'utf8', windowsHide: true }); return (r.stdout || '').trim() })()
  if (hiddenShort && hiddenShort !== '.hidden') mustRefuse.push([`/sub/${hiddenShort}/x.js`, 'SECRET-NESTED', `a .js file under a dot-directory through its 8.3 short name (${hiddenShort})`])
  else console.log('  [note] this volume makes no 8.3 short name for .hidden — that case cannot run here')
  // a file the app never serves, even though nothing about its NAME is hidden
  writeFileSync(join(site, 'secrets.pem'), 'SECRET-PEM')
  mustRefuse.push(['/secrets.pem', 'SECRET-PEM', 'a plain-named file of a type the app never serves (.pem)'])
  for (const [target, secret, what] of mustRefuse) {
    const r = await raw(port, target)
    say(!r.connectError && !r.hung && r.status !== 200 && !r.body.includes(secret), `${what}: GET ${target} -> ${r.hung ? 'HUNG' : r.status}, secret ${r.body.includes(secret) ? 'LEAKED' : 'not in the body'}`)
  }

  console.log('— and a request it cannot serve does not hang the client —')
  const dir = await raw(port, '/css')
  say(!dir.hung && dir.status !== 200, `GET /css (a directory) answers (${dir.hung ? 'HUNG' : dir.status}) instead of leaving the connection open`)
  const glob = await raw(port, '/*')
  say(!glob.hung && glob.status !== 200, `GET /* (a wildcard) answers (${glob.hung ? 'HUNG' : glob.status}) and is not treated as a pattern`)
  const after = await raw(port, '/')
  say(after.status === 200 && after.body.includes('OK-INDEX'), 'and the server is still serving afterwards (those requests did not wedge it)')
} catch (e) {
  bad++
  console.log(`FAIL  could not run: ${String(e.message).slice(0, 200)}`)
} finally {
  // the PowerShell child owns the listener; kill the tree so the port is freed and no window or process is left behind
  if (server?.pid) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* temp dir */ }
}
console.log(bad ? `\n${bad} case(s) misbehaved` : '\nall cases behaved')
process.exit(bad ? 1 : 0)
