// A fingerprint of the code a review looked at — added 2026-09-27.
//
// WHY. release.mjs used to prove "a review covered this release" by comparing the review marker's
// TIMESTAMP with the newest code commit. But CLAUDE.md requires ownership work to be reviewed BEFORE its
// commit, so the marker is always written first and is always older than the commit it reviewed — doing
// the right thing made the gate fail, every time (2026-09-27: the only way through was to re-stamp the
// marker by hand, which a gate cannot tell apart from skipping the review).
//
// So the review records WHAT it saw instead of WHEN: a git tree hash per review path, taken from the
// INDEX (what is staged, which equals HEAD when nothing is staged). release.mjs computes the same thing
// from HEAD. Equal = the tagged code is byte-for-byte the code that was reviewed; a docs-only commit
// afterwards changes nothing here, and any code change afterwards breaks the match.
//
// It REFUSES to record while anything under the review paths is unstaged or untracked. The first version
// hashed the whole working tree, and all three reviewers of it (2026-09-27) found the same hole: another
// session's uncommitted ownership work sat in the tree, the review covered only two tooling commits, and
// recording then would have let that work be committed unchanged and pass the release gate as "reviewed".
// A review sees a diff; only a clean-or-staged tree says unambiguously which code that diff produced.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const REVIEW_PATHS = ['js', 'css', 'tests', 'tests-node', 'scripts', 'index.html', 'playwright.config.js',
  'package.json', 'package-lock.json', '.github', 'supabase']
export const FINGERPRINT_FILE = join(homedir(), '.claude', 'state', 'review-fingerprint.json')

const git = (args, env) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env } }).trim()
const perPath = (treeish) => REVIEW_PATHS.map(p => {
  try { return `${p}:${git(['rev-parse', `${treeish}:${p}`])}` } catch { return `${p}:absent` }
}).join('|')

/** Fingerprint of the committed code at HEAD. */
export function headFingerprint () { return perPath('HEAD') }

/** Anything under the review paths that is NOT in the index: unstaged edits and untracked files. */
export function unreviewableChanges () {
  const paths = REVIEW_PATHS.filter(p => existsSync(p))
  const unstaged = git(['diff', '--name-only', '--', ...paths]).split(/\r?\n/).filter(Boolean)
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', ...paths]).split(/\r?\n/).filter(Boolean)
  return [...unstaged, ...untracked]
}

/** Fingerprint of the INDEX — staged content, which is HEAD when nothing is staged. */
export function stagedFingerprint () { return perPath(git(['write-tree'])) }

export function readRecorded () {
  try { return JSON.parse(readFileSync(FINGERPRINT_FILE, 'utf8')) } catch { return null }
}

// CLI: `node scripts/lib/review-fingerprint.mjs --record` — the last step of multi-agent-review.
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/lib/review-fingerprint.mjs')) {
  if (process.argv.includes('--record')) {
    const dirty = unreviewableChanges()
    if (dirty.length) {
      console.log(`NOT RECORDED — ${dirty.length} file(s) under the review paths are unstaged or untracked, so it is`)
      console.log('ambiguous which code this review saw. Stage exactly what was reviewed (or commit it) and re-run.')
      console.log('The release gate falls back to its timestamp rule meanwhile. First few:')
      for (const f of dirty.slice(0, 8)) console.log(`   · ${f}`)
      process.exit(1)
    }
    const fp = stagedFingerprint()
    writeFileSync(FINGERPRINT_FILE, JSON.stringify({ fingerprint: fp, at: new Date().toISOString() }, null, 2))
    console.log(`review fingerprint recorded from the index (${REVIEW_PATHS.length} paths) → ${FINGERPRINT_FILE}`)
  } else {
    const r = readRecorded()
    console.log(r && r.fingerprint === headFingerprint() ? 'MATCH — HEAD is exactly the reviewed code' : 'NO MATCH — HEAD differs from the last reviewed code (or none recorded)')
  }
}
