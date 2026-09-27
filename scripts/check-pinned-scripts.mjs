#!/usr/bin/env node
/**
 * checks.sh rule 9p: every THIRD-PARTY <script src="http..."> must be pinned to an exact x.y.z version
 * and carry an integrity hash with crossorigin="anonymous".
 *
 * Why: deploys are gated on a release tag, but a floating `@2` / `@4` CDN URL lets a third-party release
 * change production with no tag, no test and no review, and without SRI a compromised CDN runs with the
 * user's Supabase session. Both were true of index.html until 2026-09-27 (app-code audit, W6).
 *
 * Usage: node scripts/check-pinned-scripts.mjs <file.html> ...   (exit 1 = a finding)
 */
import { readFileSync } from 'node:fs'

const files = process.argv.slice(2)
if (!files.length) { console.log('  check-pinned-scripts: no files given'); process.exit(1) }

let findings = 0
let checked = 0
for (const f of files) {
  const src = readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '))
  for (const m of src.matchAll(/<script\b[^>]*>/gi)) {
    const tag = m[0]
    const url = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]
    if (!url || !/^(https?:)?\/\//i.test(url)) continue
    checked++
    const line = src.slice(0, m.index).split('\n').length
    const problems = []
    if (!/@\d+\.\d+\.\d+(?:[-+][\w.]+)?\//.test(url)) problems.push('not pinned to an exact x.y.z version')
    if (!/\bintegrity\s*=\s*["']sha(384|512)-[A-Za-z0-9+/=]+["']/i.test(tag)) problems.push('no integrity hash')
    if (!/\bcrossorigin\s*=\s*["']anonymous["']/i.test(tag)) problems.push('no crossorigin="anonymous"')
    if (problems.length) {
      findings++
      console.log(`  ${f}:${line}  ${url}`)
      console.log(`      ${problems.join('; ')}`)
    }
  }
}
if (findings) {
  console.log('  Pin the exact version and add integrity="sha384-..." crossorigin="anonymous".')
  console.log('  Hash: curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A')
  process.exit(1)
}
console.log(`  check-pinned-scripts: ${checked} third-party script(s), all pinned with integrity.`)
process.exit(0)
