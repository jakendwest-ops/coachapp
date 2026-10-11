#!/usr/bin/env node
/**
 * verify-live: after a release tag is pushed, prove the LIVE site serves what that tag contains.
 *
 *   node scripts/verify-live.mjs <tag> [--base <url>] [--wait <seconds>] [--interval <seconds>]
 *
 * "Pushed" is not "deployed", and a green deploy job is not "serving it": GitHub Pages can lag the job, and nothing in the job
 * looks at the bytes a phone fetches. This compares, byte for byte, every file the app loads (index.html plus every local
 * script / stylesheet / icon it references, plus privacy-policy.html) with that file's blob in the tag (`git show <tag>:<path>`),
 * and retries the ones that differ until --wait runs out (default 180 s, every 10 s) while Pages catches up.
 *
 * Exit 0 = every file identical. 1 = a file differs or is missing at the deadline. 2 = usage / unknown tag / git failure.
 * Done by hand after each release until 2026-10-05 (docs/releases/v2026.09.14.md and .15 describe the manual version).
 * Run from inside the checkout; the files are read from the tag, never from the working tree.
 */
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import https from 'node:https'

const DEFAULT_BASE = 'https://jakendwest-ops.github.io/coachapp'
// Served files that index.html does not reference (reached from JS or from the consent text), included only if the tag has them.
const EXTRA_FILES = ['privacy-policy.html', '404.html']

// index.html + every LOCAL file it loads, query strings and fragments stripped, in first-seen order. Third-party URLs are not ours to compare.
export function appFiles (indexHtml) {
  const noComments = indexHtml.replace(/<!--[\s\S]*?-->/g, '')
  const out = ['index.html']
  for (const m of noComments.matchAll(/<(?:script|link|img|source)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const ref = m[1].trim()
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) continue          // http(s):, data:, mailto:, javascript:, protocol-relative, fragment-only
    const path = ref.split('#')[0].split('?')[0].replace(/^\.?\//, '')
    if (path && !out.includes(path)) out.push(path)
  }
  return out
}

/**
 * The loop, with every outside effect injected so the self-test can drive it without a network or a clock.
 *   readTag(path) -> Buffer          fetchLive(path) -> { status, body: Buffer }          sleep(ms)          now() -> ms
 * Returns { ok, attempts, results: [{ path, status }] } where status is 'identical' | 'differs' | 'http-<n>' | 'error: <message>'.
 */
export async function verify ({ files, readTag, fetchLive, sleep, now, waitMs, intervalMs }) {
  const results = new Map(files.map(p => [p, 'pending']))
  const tagBytes = new Map(files.map(p => [p, readTag(p)]))
  const deadline = now() + waitMs
  let attempts = 0
  for (;;) {
    attempts++
    for (const p of files) {
      if (results.get(p) === 'identical') continue
      try {
        const { status, body } = await fetchLive(p)
        results.set(p, status !== 200 ? `http-${status}` : (Buffer.compare(tagBytes.get(p), body) === 0 ? 'identical' : 'differs'))
      } catch (e) { results.set(p, `error: ${e.message}`) }
    }
    const open = [...results.values()].filter(s => s !== 'identical').length
    if (open === 0 || now() + intervalMs > deadline) break
    await sleep(intervalMs)
  }
  return { ok: [...results.values()].every(s => s === 'identical'), attempts, results: [...results].map(([path, status]) => ({ path, status })) }
}

// A plain GET with no keep-alive connection. Not `fetch`: on Windows, ending the process while fetch's pooled sockets are still
// closing aborts Node itself (Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), exit 3221226505), so a PASS would look like a crash.
function get (url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http
    const req = lib.get(url, { agent: false, headers: { 'cache-control': 'no-cache', connection: 'close' } }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(30_000, () => req.destroy(new Error('timed out after 30s')))
  })
}

function parseArgs (argv) {
  const a = { tag: null, base: DEFAULT_BASE, wait: 180, interval: 10 }
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i]
    if (v === '--base') a.base = argv[++i]
    else if (v === '--wait') a.wait = Number(argv[++i])
    else if (v === '--interval') a.interval = Number(argv[++i])
    else if (v.startsWith('--')) return null
    else if (!a.tag) a.tag = v
    else return null
  }
  if (!a.tag || !a.base || !(a.wait >= 0) || !(a.interval > 0)) return null
  a.base = a.base.replace(/\/+$/, '')
  return a
}

async function main () {
  const args = parseArgs(process.argv.slice(2))
  if (!args) { console.error('usage: node scripts/verify-live.mjs <tag> [--base <url>] [--wait <seconds>] [--interval <seconds>]'); process.exit(2) }
  const git = (...a) => execFileSync('git', a, { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  try { git('rev-parse', '--verify', '--quiet', `refs/tags/${args.tag}^{commit}`) } catch { console.error(`verify-live: no tag named ${args.tag} in this checkout (git fetch --tags?)`); process.exit(2) }
  // refs/tags/ spelled out: a bare name could be read as an option, or resolve to a branch or FETCH_HEAD instead of the tag.
  const rev = `refs/tags/${args.tag}`
  const inTag = p => { try { git('cat-file', '-e', `${rev}:${p}`); return true } catch { return false } }
  let files
  try {
    files = appFiles(git('show', `${rev}:index.html`).toString('utf8'))
    for (const p of EXTRA_FILES) if (inTag(p) && !files.includes(p)) files.push(p)
  } catch (e) { console.error(`verify-live: cannot read index.html from ${args.tag}: ${e.message}`); process.exit(2) }
  const missingInTag = files.filter(p => !inTag(p))
  if (missingInTag.length) { console.error(`verify-live: index.html in ${args.tag} references files the tag does not contain: ${missingInTag.join(', ')}`); process.exit(2) }

  console.log(`Comparing ${files.length} files of ${args.tag} with ${args.base} (waiting up to ${args.wait}s)...`)
  const r = await verify({
    files,
    readTag: p => git('show', `${rev}:${p}`),
    // A unique query string steps round any CDN copy; GitHub Pages ignores it.
    fetchLive: p => get(`${args.base}/${p}?verify=${Date.now()}`),
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    now: Date.now,
    waitMs: args.wait * 1000,
    intervalMs: args.interval * 1000
  })
  for (const { path, status } of r.results) console.log(`  ${status === 'identical' ? 'ok  ' : 'FAIL'} ${path}${status === 'identical' ? '' : '  (' + status + ')'}`)
  // exitCode, not process.exit(): let the event loop drain on its own (see get()).
  if (r.ok) { console.log(`LIVE MATCHES ${args.tag}: ${r.results.length} files byte-identical (${r.attempts} attempt${r.attempts === 1 ? '' : 's'}).`); process.exitCode = 0; return }
  const bad = r.results.filter(x => x.status !== 'identical').length
  console.error(`NOT LIVE: ${bad} of ${r.results.length} files differ from ${args.tag} after ${r.attempts} attempt${r.attempts === 1 ? '' : 's'}.`)
  process.exitCode = 1
}

// Run only when executed, not when the self-test imports appFiles/verify. Compared by REAL path, with a basename fallback: a bare
// URL comparison is false when the script is reached through a symlink or an NTFS junction, and then the file would print nothing and
// exit 0, a verifier that "passes" without verifying (found by the 2026-10-11 review; the self-test now runs it through a junction).
const isMain = (() => {
  const arg = process.argv[1]
  if (!arg) return false
  try { if (realpathSync.native(arg) === realpathSync.native(fileURLToPath(import.meta.url))) return true } catch { /* fall through */ }
  return /[\\/]verify-live\.mjs$/i.test(arg)
})()
// An unexpected failure is exit 2 ("could not check"), never exit 1, which means "checked, and the live site differs".
if (isMain) main().catch(e => { console.error(`verify-live: unexpected failure: ${e?.message || e}`); process.exitCode = 2 })
