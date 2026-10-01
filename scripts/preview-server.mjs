#!/usr/bin/env node
// A static server for a CoachApp checkout — the one to use when .claude/launch.json's PowerShell server is not the
// right tool (a git worktree whose launch.json points elsewhere, a non-Windows machine, a red/neuter run).
//
//   node scripts/preview-server.mjs [root] [port]        root defaults to the cwd, port to $PORT or 3001
//   PREVIEW_SERVER_CMD="node scripts/preview-server.mjs . 3001"  (what playwright.config.js starts for the suite)
//   OVERRIDE_DIR=<dir>   serve a file from <dir> INSTEAD of root when one exists at the same relative path — a red run
//                        that serves this tree's index.html over an older copy of specific modules.
//
// WHY THIS EXISTS, AND WHY IT REFUSES SO MUCH (2026-10-01). The throwaway server this replaces bound every interface
// and served any file under the root: `GET /.env` returned the test accounts' passwords to anything on the network,
// and the only reason `/.git/config` did not is that a worktree's .git is a file. It ran for hours before anyone read
// it as a server rather than as a test helper. A dev server is a network service; this one:
//   - listens on loopback only, and answers only a Host header that names loopback (a page on another origin that
//     rebinds its DNS name to 127.0.0.1 sends its own Host and is refused);
//   - refuses any path segment that starts with a dot (.env, .git, .claude), contains `:` (NTFS streams) or looks
//     like an 8.3 short name (`ENV~1` is `.env`, `GIT~1` is `.git` on a volume that makes them);
//   - serves only the file types the app uses — a plain-named secret (a .pem, a .key, a .sql dump) is not served;
//   - serves only a real file that resolves INSIDE the root (never a directory, never a glob);
//   - answers every error with a status instead of leaving the connection open.
// The same attacks are run against this and against launch.json's server by scripts/check-launch-server.selftest.mjs.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.argv[2] || process.cwd())
const PORT = Number(process.argv[3] || process.env.PORT || 3001)
const OVERRIDE = process.env.OVERRIDE_DIR ? path.resolve(process.env.OVERRIDE_DIR) : null

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error(`No index.html under ${ROOT} -- refusing to serve a directory that is not a CoachApp checkout.`)
  process.exit(1)
}

// The allowlist. Keep it in step with .claude/launch.json's `$allowed`; the self-test attacks both.
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.map': 'application/json', '.txt': 'text/plain'
}
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`])

const send = (res, code, body) => { res.statusCode = code; res.end(body) }
const inside = (base, file) => { const r = path.relative(base, file); return r !== '' && !r.startsWith('..') && !path.isAbsolute(r) }

http.createServer((req, res) => {
  try {
    if (!HOSTS.has(String(req.headers.host || '').toLowerCase())) return send(res, 403)
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405)
    let rel
    try { rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname) } catch { return send(res, 400) }
    if (rel.includes('\0')) return send(res, 400)
    rel = rel.replace(/\\/g, '/').replace(/^\/+/, '') || 'index.html'
    for (const seg of rel.split('/')) {
      if (seg.startsWith('.') || seg.includes(':') || /~[0-9]/.test(seg)) return send(res, 404)
    }
    const ext = path.extname(rel).toLowerCase()
    if (!MIME[ext]) return send(res, 404)
    for (const base of OVERRIDE ? [OVERRIDE, ROOT] : [ROOT]) {
      const file = path.resolve(base, rel)
      if (!inside(base, file)) continue
      let st
      try { st = fs.statSync(file) } catch { continue }
      if (!st.isFile()) continue
      res.setHeader('Content-Type', MIME[ext])
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      return req.method === 'HEAD' ? send(res, 200) : send(res, 200, fs.readFileSync(file))
    }
    return send(res, 404)
  } catch {
    try { send(res, 500) } catch { /* the socket is already gone */ }
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Listening on http://localhost:${PORT} serving ${ROOT}`))
