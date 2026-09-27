// A fingerprint of the code a review looked at — added 2026-09-27.
//
// WHY. release.mjs used to prove "a review covered this release" by comparing the review marker's
// TIMESTAMP with the newest code commit. But CLAUDE.md requires ownership work to be reviewed BEFORE its
// commit, so the marker is always written first and is always older than the commit it reviewed — doing
// the right thing made the gate fail, every time (2026-09-27: the only way through was to re-stamp the
// marker by hand, which a gate cannot tell apart from skipping the review).
//
// So the review records WHAT it saw instead of WHEN: a git tree hash per review path, taken from the
// working tree at review time (tracked + untracked, minus ignored). release.mjs computes the same thing
// from HEAD. Equal = the tagged code is byte-for-byte the code that was reviewed; a docs-only commit
// afterwards changes nothing here, and any code change afterwards breaks the match.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'

export const REVIEW_PATHS = ['js', 'css', 'tests', 'tests-node', 'scripts', 'index.html', 'playwright.config.js',
  'package.json', 'package-lock.json', '.github', 'supabase']
export const FINGERPRINT_FILE = join(homedir(), '.claude', 'state', 'review-fingerprint.json')

const git = (args, env) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env } }).trim()
const perPath = (treeish) => REVIEW_PATHS.map(p => {
  try { return `${p}:${git(['rev-parse', `${treeish}:${p}`])}` } catch { return `${p}:absent` }
}).join('|')

/** Fingerprint of the committed code at HEAD. */
export function headFingerprint () { return perPath('HEAD') }

/** Fingerprint of the WORKING TREE (what a pre-commit review looks at), via a throwaway index. */
export function workingTreeFingerprint () {
  const dir = mkdtempSync(join(tmpdir(), 'review-fp-'))
  const index = join(dir, 'index')
  try {
    const real = git(['rev-parse', '--git-path', 'index'])
    if (existsSync(real)) copyFileSync(real, index)
    const env = { GIT_INDEX_FILE: index }
    git(['add', '-A', '--', ...REVIEW_PATHS.filter(p => existsSync(p))], env)
    const tree = git(['write-tree'], env)
    return perPath(tree)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

export function readRecorded () {
  try { return JSON.parse(readFileSync(FINGERPRINT_FILE, 'utf8')) } catch { return null }
}

// CLI: `node scripts/lib/review-fingerprint.mjs --record` — the last step of multi-agent-review.
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/lib/review-fingerprint.mjs')) {
  if (process.argv.includes('--record')) {
    const fp = workingTreeFingerprint()
    writeFileSync(FINGERPRINT_FILE, JSON.stringify({ fingerprint: fp, at: new Date().toISOString() }, null, 2))
    console.log(`review fingerprint recorded (${REVIEW_PATHS.length} paths) → ${FINGERPRINT_FILE}`)
  } else {
    const r = readRecorded()
    console.log(r && r.fingerprint === headFingerprint() ? 'MATCH — HEAD is exactly the reviewed code' : 'NO MATCH — HEAD differs from the last reviewed code (or none recorded)')
  }
}
