#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════════════════════════
// Cut a release.  Usage:  node scripts/release.mjs v2026.09.1  [--push]
//
// WHY THIS EXISTS AS A SCRIPT AND NOT A CHECKLIST.
// Until 2026-09-05 every push to master deployed to the live site, so "a release" was whatever
// happened to be on master and "don't ship that yet" was something to remember. The deploy job is
// now gated on a `v*` tag (.github/workflows/deploy.yml), and this script is the only sane way to
// create one — because it REFUSES. This project's own measured finding is that written rules do not
// reduce errors; only checks that refuse do (~185 rules vs 51 mechanisms, 9 of 12 errors had a
// pre-existing rule).
//
// It deliberately does NOT push by itself unless --push is given. Deploying is an outward-facing act
// and stays a deliberate one.
// ════════════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const VERSION_RE = /^v\d{4}\.\d{2}\.\d+$/          // v2026.09.1 — year.month.sequence, decided 2026-09-05
const RECEIPT = '.release-receipt.json'
const RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000

// The receipt is keyed to the CODE the suite exercises, not to the commit sha.
//
// Keying it to the sha was the first attempt and it is unsatisfiable in normal use: release notes
// must exist before the tag, so writing them always creates a commit AFTER the suite run, and a
// sha-keyed receipt would demand a fresh 30-minute suite on every release forever. A gate that can
// never be satisfied honestly is a gate people route around.
//
// So: a git tree hash per path below. It changes if and only if something under that path changed,
// which is exactly the question "does the last suite run still describe this code?". Paths NOT listed
// — docs/, .github/, CLAUDE.md, .gitignore — cannot change a test outcome, so editing them does not
// invalidate the run. scripts/ IS listed: several specs shell out to scripts/check-*.mjs.
const CODE_PATHS = ['js', 'css', 'tests', 'tests-node', 'scripts',
                    'index.html', 'playwright.config.js', 'package.json', 'package-lock.json']
const REVIEW_MARKER = join(homedir(), '.claude', 'state', 'review-ran')

const version = process.argv[2]
const doPush = process.argv.includes('--push')
// --record runs the expensive verification and writes the receipt, WITHOUT tagging. It exists for a
// real ordering problem: release notes must state the suite result, but the suite is what the gate
// runs at tag time — so writing honest notes means either guessing the numbers or throwing away a
// 30-minute run. With --record you verify first, read the real numbers, write the notes (docs/ does
// not change the code fingerprint), then tag reusing the receipt. It is not a bypass: it runs
// exactly the same checks.sh and full suite, and writes exactly the same receipt.
const recordOnly = process.argv.includes('--record')

let failed = 0
const fail = (what, why, how) => {
  failed++
  console.log(`\n  ✗ ${what}`)
  console.log(`    ${why}`)
  if (how) console.log(`    → ${how}`)
}
const pass = (what) => console.log(`  ✓ ${what}`)
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

// One line per path: its git tree/blob hash at HEAD, or 'absent'. Compared verbatim.
const codeFingerprint = () => CODE_PATHS.map(p => {
  try { return `${p}:${git('rev-parse', `HEAD:${p}`)}` } catch { return `${p}:absent` }
}).join('|')

if (!version || !VERSION_RE.test(version)) {
  console.log(`\nusage: node scripts/release.mjs vYYYY.MM.N [--push]`)
  console.log(`\n  Date-based, decided 2026-09-05: year.month.sequence, e.g. v2026.09.1 then v2026.09.2.`)
  console.log(`  No judgement call about what counts as "major", and the version tells you WHEN`)
  console.log(`  something shipped — which is the question you actually ask when hunting a regression.`)
  process.exit(1)
}

console.log(`\nRelease gate for ${version}\n${'─'.repeat(60)}`)

// 1. The tag must not already exist -------------------------------------------------------------
// Re-tagging an existing version silently changes what "v2026.09.1" means for anyone who already
// has it. Always move forward to a new number instead.
const localTags = git('tag').split('\n').filter(Boolean)
if (localTags.includes(version)) {
  fail(`${version} already exists locally`, 'a released version is immutable once it exists.',
    `pick the next sequence number instead`)
} else {
  pass(`${version} is a new tag`)
}

// 2. Clean tree ---------------------------------------------------------------------------------
// A dirty tree means the tag would point at a commit that does not contain what you just tested.
const dirty = git('status', '--porcelain')
if (recordOnly && dirty) {
  // npm test runs the WORKING TREE; the receipt fingerprints HEAD. If uncommitted CODE is in play,
  // reverting it afterwards restores HEAD's fingerprint and the receipt then vouches for code the
  // suite never ran against. Docs may be dirty — they are outside the fingerprint by design.
  // Ask git which CODE paths differ, rather than parsing `status --porcelain` ourselves. The first
  // version did parse it, and a re-review broke it two ways: git QUOTES paths containing spaces, so
  // slice(3) left a leading quote and the prefix match failed; and a rename FROM outside CODE_PATHS
  // INTO one was never seen at all. Both let the receipt vouch for HEAD while real uncommitted code
  // existed — reintroducing the exact bug this check was added to close. -z removes the quoting
  // entirely, and letting git do the path matching removes the parsing.
  const zsplit = (s) => s.split('\0').filter(Boolean)
  const dirtyCode = [...new Set([
    ...zsplit(git('diff', '--name-only', '-z', 'HEAD', '--', ...CODE_PATHS)),
    ...zsplit(git('ls-files', '--others', '--exclude-standard', '-z', '--', ...CODE_PATHS))
  ])]
  if (dirtyCode.length) {
    fail('--record with uncommitted CODE changes',
      'the suite would test the working tree while the receipt describes HEAD: ' + dirtyCode.join(', '),
      'commit them first, so the receipt and the tested code are the same thing')
  } else {
    pass('tree dirty only outside the code fingerprint — allowed under --record')
  }
} else if (dirty) {
  fail('working tree is not clean', `uncommitted changes:\n      ${dirty.split('\n').join('\n      ')}`,
    'commit or revert them — the tag must describe a commit, not a desk')
} else {
  pass('working tree is clean')
}

// 3. On master ----------------------------------------------------------------------------------
const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
if (branch !== 'master') {
  fail(`on branch "${branch}", not master`, 'releases are cut from master.', 'git switch master')
} else {
  pass('on master')
}

const head = git('rev-parse', 'HEAD')

// The gates from here to the short-circuit describe the RELEASE, not the code. --record is run
// before the notes exist and often with a dirty tree, so it verifies the code and skips these.
// 4. Release notes must exist AND say something -------------------------------------------------
// The notes are the scope record — what this release contains, what it deliberately carries, and the
// evidence it was tested. A release with no notes is a tag nobody can interpret in six weeks.
const notesPath = `docs/releases/${version}.md`
if (recordOnly) {
  pass('release-shape gates skipped (--record verifies code, not the release)')
} else if (!existsSync(notesPath)) {
  fail(`no release notes at ${notesPath}`, 'a release must say what it contains.',
    `copy docs/releases/TEMPLATE.md to ${notesPath} and fill it in`)
} else {
  const notes = readFileSync(notesPath, 'utf8')
    // Was /<[A-Z][A-Z _-]+>/ and caught 8 of the template's 17 placeholders — every SUBSTANTIVE
    // prose section (Scope, What shipped, Verification, Rollback) contains lowercase or punctuation
    // and slipped through, so a 1540-character document of pure boilerplate passed both this and the
    // length floor. Verified 2026-09-05 by construction. The `s` flag matters: several placeholders
    // wrap across lines. Checked for false positives against the real v2026.09.1 notes: zero.
    const unfilled = notes.match(/<[A-Z][^>]{2,}>/gs)
  if (unfilled) {
    fail(`${notesPath} still has template placeholders`, `unfilled: ${[...new Set(unfilled)].join(', ')}`,
      'fill them in — an unfilled template is worse than no notes, it looks done')
  } else if (notes.trim().length < 400) {
    fail(`${notesPath} is too short to be a scope record`, `${notes.trim().length} characters.`,
      'say what shipped, what is deliberately carried, and how it was verified')
  } else {
    pass(`release notes present and filled (${notesPath})`)
  }
}

// 5. A review must have run AFTER the newest commit being released ------------------------------
// Not "a review happened at some point" — a review of THIS code. The marker is written by the
// multi-agent-review skill (its Step 4).
const lastCommitAt = Number(git('log', '-1', '--format=%ct')) * 1000
if (recordOnly) {
  // silent: the review gate belongs to tagging, not to verifying code
} else if (!existsSync(REVIEW_MARKER)) {
  fail('no review marker', `${REVIEW_MARKER} does not exist.`,
    'run the multi-agent-review skill, which writes it')
} else if (statSync(REVIEW_MARKER).mtimeMs < lastCommitAt) {
  fail('the review predates the code', 'the newest commit in this release landed after the last review.',
    're-run multi-agent-review against the final diff')
} else {
  pass('a review ran after the last commit')
}

// ------------------------------------------------------------------------------------------------
// STOP HERE if any cheap gate failed. The two gates below cost ~30 minutes between them, and running
// them to tell you something you already know — that the tree is dirty, or the notes are missing —
// is how a gate becomes something people route around.
if (failed) {
  console.log(`${'─'.repeat(60)}`)
  console.log(`
  ${failed} gate(s) failed before the expensive checks ran — ${version} NOT tagged.`)
  console.log(`  Fix the above, then run this again.
`)
  process.exit(1)
}

// 6. checks.sh ----------------------------------------------------------------------------------
try {
  execSync('sh scripts/checks.sh', { stdio: 'pipe' })
  pass('checks.sh green')
} catch {
  fail('checks.sh failed', 'the static gate does not pass.', 'sh scripts/checks.sh')
}

// 7. The FULL suite, on this exact commit -------------------------------------------------------
// Not the 57-test pre-push smoke gate. That gate is explicitly documented as insufficient — a spec
// outside it sat red for three days across four deploys and nothing noticed. A release runs all of
// it. The receipt exists so that a suite run you did five minutes ago is not repeated; it is keyed
// to the exact sha, so it cannot vouch for code that has changed since.
const fingerprint = codeFingerprint()
let suiteOk = false
if (existsSync(RECEIPT)) {
  try {
    const r = JSON.parse(readFileSync(RECEIPT, 'utf8'))
    if (r.ok && r.fingerprint === fingerprint && (Date.now() - new Date(r.at).getTime()) < RECEIPT_MAX_AGE_MS) {
      suiteOk = true
      pass(`full suite green on this code (receipt from ${r.at}, commit ${String(r.sha).slice(0, 7)})`)
    }
  } catch { /* a corrupt receipt is simply no receipt */ }
}
if (!suiteOk) {
  console.log('  … running the full suite (this takes ~30 minutes)')
  try {
    execSync('npm test', { stdio: 'inherit' })
    writeFileSync(RECEIPT, JSON.stringify({ sha: head, fingerprint, ok: true, at: new Date().toISOString() }, null, 2))
    pass('full suite green')
  } catch {
    fail('full suite failed', 'a release does not ship over a red suite.', 'npm test')
  }
}

// ------------------------------------------------------------------------------------------------
console.log(`${'─'.repeat(60)}`)
if (failed) {
  console.log(`\n  ${failed} gate(s) failed — ${version} NOT tagged.\n`)
  process.exit(1)
}

if (recordOnly) {
  console.log(`
  Receipt written. The code is verified; nothing was tagged.`)
  console.log(`  Now write docs/releases/${version}.md with the numbers above, then run:
`)
  console.log(`    node scripts/release.mjs ${version}
`)
  process.exit(0)
}

git('tag', '-a', version, '-m', `Release ${version}`)
console.log(`\n  Tagged ${version} at ${head.slice(0, 7)}.`)

if (doPush) {
  execFileSync('git', ['push', 'origin', 'master'], { stdio: 'inherit' })
  execFileSync('git', ['push', 'origin', version], { stdio: 'inherit' })
  console.log(`\n  Pushed. The tag triggers the deploy job — watch it:  gh run watch\n`)
} else {
  console.log(`\n  NOT pushed. Deploying is deliberate. To ship it:\n`)
  console.log(`    git push origin master && git push origin ${version}\n`)
  console.log(`  The tag is what triggers the deploy; pushing master alone only runs the checks.\n`)
}
