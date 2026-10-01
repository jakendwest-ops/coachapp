// Does os-lint lint the working tree it is RUN IN? (2026-10-01)
//
// THE BUG. os-lint.mjs named the main checkout in a constant, so a session started in a git worktree linted the
// MAIN ledger: it could not see a bug row written in the worktree (nine of them, the day this was found) and told
// the session nothing about them. Same class as guardrails.mjs, whose half is tested by guardrails.selftest.mjs
// "rule 2e".
//
// Real repos, real `git worktree add`, the real os-lint.mjs run as a child — nothing stubbed, because stubbing the
// resolution is exactly what would let a broken resolution pass. The fixture's "main checkout" is pointed at with
// OSLINT_MAIN_REPO (so the real checkout is never read or written), and OSLINT_REPO is set to '' so the child
// resolves from its cwd the way a real session does.
//
// Every case says which direction it guards — "seen" (the hole) or "not misread" (the guard's own failure mode,
// which this project has shipped nine times) — and the worktree case has a POSITIVE CONTROL: the same file is
// absent from the main checkout, so a hit can only have come from reading the worktree.
//
// Run: node .claude/hooks/os-lint.selftest.mjs     (exit 1 if any case misbehaves)
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const LINT = join(HERE, 'os-lint.mjs')
const dir = mkdtempSync(join(tmpdir(), 'oslint-wt-'))
let bad = 0
const say = (cond, want, label) => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'}  want=${want}  ${label}`) }

const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: 'pipe' })
const BUG = (status) => `---\nid: probe\nstatus: ${status}\npriority: low\nreported: 2026-10-01\n---\n\n# probe\n`

function mkRepo (name) {
  const r = join(dir, name)
  mkdirSync(join(r, 'docs', 'bugs'), { recursive: true })
  execFileSync('git', ['init', '-q', r], { stdio: 'pipe' })
  g(r, 'config', 'user.email', 'selftest@example.com'); g(r, 'config', 'user.name', 'selftest')
  writeFileSync(join(r, 'docs', 'bugs', '2026-10-01-main-ledger-ok.md'), BUG('closed'))
  writeFileSync(join(r, 'docs', 'current-sprint.md'), '# sprint\n')
  writeFileSync(join(r, 'docs', 'roadmap.md'), '# roadmap\n')
  g(r, 'add', '-A'); g(r, 'commit', '-qm', 'base')
  return r
}

// A bug file ONLY the worktree has, with an invalid status: `bug-files` names it, and only if it was read.
const WT_ONLY = '2026-10-01-only-in-the-worktree.md'

function lint (cwd, baseline, extraEnv = {}) {
  const r = spawnSync(process.execPath, [LINT, '--report'], {
    cwd, encoding: 'utf8', timeout: 120000,
    // OSLINT_HOOKS_DIR points at a folder that does not exist: os-lint's hook-selftests check RUNS every *.selftest.mjs it
    // finds under the hooks dir, this file included, so a child that resolved the REAL hooks dir would run this test again
    // from inside itself. (With the fixture as the repo it would not — there is no .claude/hooks there — but "would not,
    // by the shape of the fixture" is not the same as "cannot".)
    env: { ...process.env, OSLINT_MAIN_REPO: MAIN, OSLINT_REPO: '', OSLINT_SIZE_BASELINE: baseline, OSLINT_NO_SELFTEST_LAUNCH: '1', OSLINT_HOOKS_DIR: join(dir, 'no-hooks-here'), ...extraEnv }
  })
  return { out: (r.stdout || '') + (r.stderr || ''), code: r.status }
}

let MAIN
try {
  MAIN = mkRepo('main')
  // A registered hook, the way the real settings.json does it: the command names the script by its MAIN-checkout path.
  mkdirSync(join(MAIN, '.claude', 'hooks'), { recursive: true })
  writeFileSync(join(MAIN, '.claude', 'hooks', 'probe.mjs'), '// a registered hook\n')
  writeFileSync(join(MAIN, '.claude', 'settings.json'), JSON.stringify({
    hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: `"node" "${MAIN.replace(/\\/g, '/')}/.claude/hooks/probe.mjs"` }] }] }
  }))
  g(MAIN, 'add', '-A'); g(MAIN, 'commit', '-qm', 'a registered hook')
  const wt = join(dir, 'wt')
  g(MAIN, 'worktree', 'add', '-q', '-b', 'wt-br', wt)
  writeFileSync(join(wt, 'docs', 'bugs', WT_ONLY), BUG('not-a-real-status'))

  const baseWt = join(dir, 'baseline-from-worktree.json')
  const baseMain = join(dir, 'baseline-from-main.json')

  console.log('— os-lint reads the tree it is run in —')
  const fromWt = lint(wt, baseWt)
  say(fromWt.out.includes(WT_ONLY), 'seen', "run from a WORKTREE, os-lint reads that worktree's docs/bugs (the row only the worktree has is reported)")
  say(!fromWt.out.includes('no bug files found'), 'seen', 'and it did not fall over to a missing ledger')

  const fromMain = lint(MAIN, baseMain)
  say(!fromMain.out.includes(WT_ONLY), 'not misread', "POSITIVE CONTROL: run from the MAIN checkout, the worktree-only row is NOT reported — so the hit above came from reading the worktree")
  say(/all 1 bug files parse/.test(fromMain.out), 'not misread', 'run from the main checkout it still reads the main ledger (1 valid row)')

  console.log('— settings.json registers MAIN\'s copy of a hook; a worktree\'s copy of it is registered too —')
  // settings.json names every hook by its main-checkout path, by design (one place, so a worktree cannot quietly run a
  // different gate). os-lint's wiring check compared the hooks dir it was LINTING with those paths, so from a worktree it
  // reported every hook "registered in NO settings file": two false REDs at the top of every worktree session.
  // OSLINT_HOOKS_DIR is unset here ('' — the harness above pins it elsewhere to keep this file from running itself).
  const wired = lint(wt, join(dir, 'baseline-wired.json'), { OSLINT_HOOKS_DIR: '' })
  say(/GREEN\s+hooks\s/.test(wired.out) && !wired.out.includes('registered in NO settings file'), 'not misread',
    "from a worktree, main's registration of probe.mjs covers the worktree's copy of it (the wiring check is green)")
  writeFileSync(join(wt, '.claude', 'hooks', 'rogue.mjs'), '// a script nothing registers\n')
  const rogue = lint(wt, join(dir, 'baseline-rogue.json'), { OSLINT_HOOKS_DIR: '' })
  say(rogue.out.includes('hooks/rogue.mjs exists on disk but is registered in NO settings file') && !rogue.out.includes('hooks/probe.mjs exists on disk'), 'seen',
    "POSITIVE CONTROL: a script in the worktree that NO settings file registers is still reported — the mapping excuses only main's registered names")
  rmSync(join(wt, '.claude', 'hooks', 'rogue.mjs'))

  console.log('— a tree that is not this repository is never read as if it were —')
  const other = mkRepo('unrelated')
  writeFileSync(join(other, 'docs', 'bugs', '2026-10-01-only-in-the-unrelated-repo.md'), BUG('not-a-real-status'))
  const fromOther = lint(other, join(dir, 'baseline-other.json'))
  say(!fromOther.out.includes('only-in-the-unrelated-repo'), 'not misread', 'run from an UNRELATED repository, its ledger is not linted as CoachApp\'s')
  say(/all 1 bug files parse/.test(fromOther.out), 'not misread', '…it falls back to the main checkout (1 valid row), the old behaviour, never an error')
  const notRepo = join(dir, 'not-a-repo'); mkdirSync(notRepo)
  const fromNowhere = lint(notRepo, join(dir, 'baseline-nowhere.json'))
  say(fromNowhere.code === 0 && /all 1 bug files parse/.test(fromNowhere.out), 'not misread', 'run from a folder that is not a repo at all: falls back to main, exit 0 (fails OPEN — this hook never stops a session)')

  console.log('— a worktree may not move the SHARED baseline —')
  say(existsSync(baseMain), 'seen', 'POSITIVE CONTROL: linting the main checkout DOES write the size baseline in this fixture')
  say(!existsSync(baseWt), 'not misread', 'linting a worktree writes NO baseline — an older branch measuring smaller docs would re-pin the shared ceiling DOWN and turn main RED')
} catch (e) {
  bad++
  console.log(`FAIL  could not run: ${String(e.message).slice(0, 160)}`)
} finally {
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* temp dir */ }
}

console.log(bad ? `\n${bad} case(s) misbehaved` : '\nall cases behaved')
process.exit(bad ? 1 : 0)
