#!/usr/bin/env node
/**
 * checks.sh rule 9w: the app's EXTERNAL SURFACE is known and small.
 *
 * Two halves, both found by the 2026-10-18 data-leak audit:
 *
 * 1. Every host the shipped files mention is on an allowlist, with a reason. Every request a browser makes to a host
 *    that is not ours sends that host the visitor's IP address and user agent -- for a coach/client app holding
 *    special-category health data that is a personal-data transfer, and a script from such a host would run with the
 *    signed-in user's session. The tree had four such hosts (two pinned, hash-checked CDNs for scripts, Google Fonts for
 *    a stylesheet, and the app's own address). A fifth -- an analytics snippet, a widget, a font from somewhere else --
 *    cannot arrive without an edit to this file, which is a visible, reviewable decision.
 *      TEMPORARY: fonts.googleapis.com. It is the one host that is a leak rather than a dependency (no integrity hash is
 *      possible on a stylesheet, and every page view tells Google who loaded it). The plan is to self-host the font and
 *      DELETE that line here; when it is gone the line fails the build if it comes back.
 *
 * 2. Every server function the browser calls has its SOURCE in the repo, and any function that holds the service-role key
 *    resolves WHO IS CALLING (auth.getUser) inside its request handler before it uses that client. supabase/functions/
 *    invite-solo-user does. invite-client -- called from the same Settings code -- is deployed only, never read by anyone since
 *    2026-06; KNOWN_MISSING names it so the gap is a counted, dated debt and not an invisible one. The moment its source is
 *    committed the entry must be deleted (the check fails on a stale entry), and the caller rule then applies to it like any other.
 *
 * KNOWN LIMITS (named): the caller rule proves the caller is IDENTIFIED, not that they are AUTHORISED (invite-solo-user's real
 * guard is an email comparison the gate cannot see); only the literal SERVICE_ROLE_KEY is recognised, not the key under another
 * name; a host built by string concatenation or a URL read from a variable is invisible; a floating-major import in an Edge
 * Function (esm.sh/@supabase/supabase-js@2) is not checked here.
 *
 * Usage: node scripts/check-external-surface.mjs        (reads the tracked files; SURFACE_ROOT points it at a temp tree for the self-test)
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { blankComments } from './lib/comments.mjs'

const ROOT = process.env.SURFACE_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')

const ALLOWED_HOSTS = {
  'avilxuiacmtgeoxxhfhc.supabase.co': 'the project: database, auth, storage',
  'unpkg.com': 'supabase-js, pinned to an exact version with an integrity hash (rule 9p)',
  'cdn.jsdelivr.net': 'chart.js, pinned to an exact version with an integrity hash (rule 9p)',
  'jakendwest-ops.github.io': 'the app\'s own address (invite redirect)',
  'www.w3.org': 'an XML/SVG namespace string, never requested',
  'ico.org.uk': 'a hyperlink in the privacy policy, not a load',
  'fonts.googleapis.com': 'TEMPORARY - the Inter stylesheet; leaks every visitor\'s IP to Google; to be self-hosted and this line deleted',
}

// A function the browser calls whose source is not in the repo. Dated; delete the line when the source is committed.
const KNOWN_MISSING = {
  'invite-client': '2026-10-18: deployed from the Supabase dashboard only; holds the service-role key; never audited',
}

// The self-test builds miniature repos from these, so it can never drift from the real lists.
if (process.argv.includes('--list')) {
  console.log(JSON.stringify({ hosts: Object.keys(ALLOWED_HOSTS), knownMissing: Object.keys(KNOWN_MISSING) }))
  process.exit(0)
}

const findings = []
const notes = []

// ── 1. hosts ────────────────────────────────────────────────────────────────────
// The files that ship: in the real repo, what git TRACKS (a stray untracked scratch file must not fail a push, and an untracked one must not hide
// from it either); in the self-test, whatever is in the temp tree.
function walk (dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
const ALL = (process.env.SURFACE_ROOT
  ? walk(ROOT).map(p => relative(ROOT, p).split(sep).join('/'))
  : execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\0').filter(Boolean))
  .filter(p => !p.startsWith('.claude/') && !p.startsWith('node_modules/'))
// What ships to the browser: the modules, the stylesheets, every root page, and the files a browser fetches by name (a service worker, a web manifest).
const runtime = ALL.filter(p => /^js\/.+\.m?js$/.test(p) || /^css\/.+\.css$/.test(p) || /^[^/]+\.html$/.test(p) || /^(sw|service-worker)\.js$/.test(p) || /^[^/]+\.webmanifest$/.test(p))
const functionFiles = ALL.filter(p => /^supabase\/functions\/.+\.(ts|js)$/.test(p))
const seenHosts = new Set()
for (const rel of runtime) {
  let s = readFileSync(join(ROOT, rel), 'utf8')
  if (rel.endsWith('.js')) s = blankComments(s).split('\n').map(l => /^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l).join('\n')
  else if (rel.endsWith('.css')) s = s.replace(/\/\*[\s\S]*?\*\//g, '')
  else s = s.replace(/<!--[\s\S]*?-->/g, '')
  const lines = s.split('\n')
  lines.forEach((line, i) => {
    // a name with a TLD, or a raw IPv4 address; the URL ends at a quote, a slash, a paren, whitespace, `?`, `#`, or `>` (an unquoted <img src=...>)
    // An optional `userinfo@` is skipped first, so https://allowed.example@evil.example/ is judged by the host after the @ (the one the browser connects to).
    for (const m of line.matchAll(/(?:https?:)?\/\/(?:[^\s\/@"'`]+@)?([a-z0-9][a-z0-9.-]*\.[a-z]{2,}|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?=[\/"'`)\s?#>]|$)/gi)) {
      const h = m[1].toLowerCase()
      seenHosts.add(h)
      if (!ALLOWED_HOSTS[h]) findings.push(`${rel}:${i + 1}  talks to ${h}, which is not on the allowlist in scripts/check-external-surface.mjs`)
    }
  })
}
for (const h of Object.keys(ALLOWED_HOSTS)) {
  if (!seenHosts.has(h)) findings.push(`allowlist entry ${h} is no longer referenced anywhere -- delete it (an allowlist longer than the truth is a permit)`)
}

// ── 2. server functions ─────────────────────────────────────────────────────────
const called = new Set()
for (const rel of runtime.filter(p => p.endsWith('.js'))) {
  const s = blankComments(readFileSync(join(ROOT, rel), 'utf8'))
  for (const m of s.matchAll(/functions\/v1\/([\w-]+)|functions\.invoke\(\s*['"]([\w-]+)['"]/g)) called.add(m[1] || m[2])
}
for (const name of called) {
  const has = functionFiles.some(p => p === `supabase/functions/${name}/index.ts` || p === `supabase/functions/${name}/index.js`)
  if (!has && KNOWN_MISSING[name]) notes.push(`${name}: source not in the repo (${KNOWN_MISSING[name]})`)
  else if (!has) findings.push(`the app calls the server function "${name}" but supabase/functions/${name}/index.ts is not in the repo`)
  else if (KNOWN_MISSING[name]) findings.push(`"${name}" is committed now: delete its KNOWN_MISSING entry in scripts/check-external-surface.mjs`)
}
for (const name of Object.keys(KNOWN_MISSING)) {
  if (!called.has(name)) findings.push(`KNOWN_MISSING lists "${name}", which the app no longer calls -- delete the entry`)
}
for (const rel of functionFiles) {
  // blankComments, not a bare //-stripper: `https://...` in a string is not a comment, and eating it once hid the service key from this check
  const src = blankComments(readFileSync(join(ROOT, rel), 'utf8'))
  const svc = src.search(/SERVICE_ROLE_KEY/)
  if (svc === -1) continue
  const who = src.search(/\.auth\.getUser\s*\(|auth\.getUser\s*\(/)
  // A client built at MODULE level (before the request handler) is fine as long as the handler identifies the caller; a client built INSIDE the
  // handler must come after the caller is known.
  const handlerAt = src.search(/\b(?:Deno\.)?serve\s*\(|addEventListener\s*\(\s*['"]fetch['"]/)
  if (who === -1) findings.push(`${rel}  builds a service-role client but never resolves the caller (.auth.getUser)`)
  else if (handlerAt !== -1 && svc > handlerAt && who > svc) findings.push(`${rel}  builds the service-role client BEFORE it resolves the caller -- check who is calling first`)
  else if (handlerAt !== -1 && who !== -1 && who < handlerAt) findings.push(`${rel}  resolves the caller outside the request handler -- it must happen per request, inside it`)
}

if (findings.length) {
  console.log(`  ${findings.length} external-surface finding(s):`)
  for (const x of findings) console.log(`    ${x}`)
  process.exit(1)
}
for (const n of notes) console.log(`  [debt] ${n}`)
console.log(`  check-external-surface: ${seenHosts.size} host(s), ${called.size} server function(s) called -- all accounted for.`)
process.exit(0)
