// Is a commit judged in the WORKTREE it is made in, not the main checkout? (2026-10-01)
//
// THE BUG. Every git command in .claude/hooks/guardrails.mjs ran with cwd = the MAIN checkout, so a commit made from a git
// worktree was judged by main's index: an unreviewed ownership/RLS diff staged in the worktree was never seen, a staged .sql
// was never seen, a probe file in the worktree was never seen, and main's own dirt could refuse a clean worktree commit.
// `inCoachApp` was also a string-PREFIX test on the path, so a worktree outside the main folder skipped the ownership rule
// altogether. This project uses worktrees routinely, so the gate was skipped for a growing share of commits.
//
// Real repos, real `git worktree add`, the real hook run as a child: GUARDRAILS_FAKE_STAGED would bypass exactly the plumbing
// under test. Each case says which direction it guards — "unseen" (the hole) or "not refused" (the guard's own failure mode,
// which this project has shipped nine times).
//
// WHY THIS IS NOT IN .claude/hooks/guardrails.selftest.mjs. os-lint runs every *.selftest.mjs there at EVERY session start
// (its hook-selftests check). A hook run in a real repo is ~1 s (node plus ~ten git spawns) and this matrix needs nine of
// them plus the repo setup: it took that file from 14 s to 30 s, past os-lint's limit, and taxed every session. Real-git cases
// belong where they run at the gate — checks.sh rule 9r, at release — not on the path every session start walks.
//
// Run: node scripts/check-guardrails-worktree.selftest.mjs     (exit 1 if any case misbehaves)
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOOK = join(HERE, '..', '.claude', 'hooks', 'guardrails.mjs')
const dir = mkdtempSync(join(tmpdir(), 'grd-wt-'))
let bad = 0
const say = (cond, want, label) => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'}  want=${want.padEnd(5)} ${label}`) }

function invoke (payload, env = {}) {
  const out = execFileSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...env } })
  return out.includes('"deny"') ? 'DENY' : 'ALLOW'
}

const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: 'pipe' })
const OWN_LINE = "const x = q.eq('coach_id', me)\n"
const mkRepo = name => {
  const r = join(dir, name)
  mkdirSync(join(r, 'js'), { recursive: true })
  execFileSync('git', ['init', '-q', r], { encoding: 'utf8', stdio: 'pipe' })
  g(r, 'config', 'user.email', 'selftest@example.com'); g(r, 'config', 'user.name', 'selftest')
  writeFileSync(join(r, 'js', 'm.js'), 'const a = 1\n')
  g(r, 'add', '-A'); g(r, 'commit', '-qm', 'base')
  return r
}
const stage = (tree, file, text) => { writeFileSync(join(tree, file), text); g(tree, 'add', file) }
const commitIn = (cwd, main, env = {}, command = 'git commit -m x') => invoke(
  { hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 'S1', cwd, tool_input: { command } },
  { GUARDRAILS_STATE: dir, GUARDRAILS_MARKER: join(dir, 'nope'), GUARDRAILS_SQL_MARKER: join(dir, 'nope-sql'), GUARDRAILS_REPO: main, ...env }
)

try {
  const main = mkRepo('wt-main')
  // two worktrees: one OUTSIDE the main folder, one NESTED inside it like .claude/worktrees/<name> (where the real ones live)
  const outside = join(dir, 'wt-outside')
  const nested = join(main, '.claude', 'worktrees', 'nested')
  g(main, 'worktree', 'add', '-q', '-b', 'wt-outside-br', outside)
  mkdirSync(join(main, '.claude', 'worktrees'), { recursive: true })
  g(main, 'worktree', 'add', '-q', '-b', 'wt-nested-br', nested)

  for (const [label, tree] of [['OUTSIDE the main folder', outside], ['NESTED inside it', nested]]) {
    // unseen: ownership staged in the worktree, main untouched and clean
    stage(tree, 'js/m.js', 'const a = 1\n' + OWN_LINE)
    say(commitIn(tree, main) === 'DENY', 'DENY', `unreviewed ownership staged in a worktree ${label} is SEEN (main's clean index must not hide it)`)

    // not refused: the same worktree, review marker present for this session
    const marker = join(dir, `rev-${label.split(' ')[0]}`); writeFileSync(marker, 'S1')
    say(commitIn(tree, main, { GUARDRAILS_MARKER: marker }) === 'ALLOW', 'ALLOW', `…and a review this session clears it, as in the main checkout (${label})`)

    // not refused: a worktree change with no ownership content
    g(tree, 'reset', '-q', '--hard')
    stage(tree, 'js/m.js', 'const a = 2\n')
    say(commitIn(tree, main) === 'ALLOW', 'ALLOW', `an ordinary worktree commit is not refused (${label})`)

    // unseen: a staged .sql in the worktree needs sql-safety (rule 5 also read main's index)
    g(tree, 'reset', '-q', '--hard')
    mkdirSync(join(tree, 'scripts'), { recursive: true })
    stage(tree, 'scripts/m.sql', 'select 1;\n')
    say(commitIn(tree, main) === 'DENY', 'DENY', `a staged .sql in a worktree is SEEN by rule 5 (${label})`)
    g(tree, 'reset', '-q', '--hard'); rmSync(join(tree, 'scripts'), { recursive: true, force: true })
    g(tree, 'clean', '-fdq')
  }

  // not refused: main's own dirt must not refuse a CLEAN worktree commit (rule 1c read main's status)
  writeFileSync(join(main, 'zz-probe-main.js'), 'x')
  stage(outside, 'js/m.js', 'const a = 3\n')
  say(commitIn(outside, main) === 'ALLOW', 'ALLOW', 'a stray probe file in MAIN does not refuse a clean worktree commit')
  rmSync(join(main, 'zz-probe-main.js'))

  // unseen: a probe file in the WORKTREE (rule 1c) while main is clean
  writeFileSync(join(outside, 'zz-probe-wt.js'), 'x')
  say(commitIn(outside, main) === 'DENY', 'DENY', 'a throwaway probe file in the WORKTREE is seen')
  rmSync(join(outside, 'zz-probe-wt.js'))
  g(outside, 'reset', '-q', '--hard')

  // not refused: ANOTHER repository is still not judged by CoachApp's rules (guardrails.selftest.mjs rule 2c covers the
  // repo-containment property on its own; this is the same property for a repo that is a sibling of a worktree)
  const other = mkRepo('unrelated-repo')
  stage(other, 'js/m.js', 'const a = 1\n' + OWN_LINE)
  say(commitIn(other, main) === 'ALLOW', 'ALLOW', 'ownership staged in an UNRELATED repo is not judged by the CoachApp gate')

  // an explicit `cd` into a worktree wins over the session cwd — the way these commits are actually issued
  stage(outside, 'js/m.js', 'const a = 1\n' + OWN_LINE)
  say(commitIn(main, main, {}, `cd "${outside.split(String.fromCharCode(92)).join('/')}" && git commit -m x`) === 'DENY', 'DENY',
    'an explicit `cd <worktree> && git commit` is judged in that worktree, not the session cwd')
  g(outside, 'reset', '-q', '--hard')

  // the repository is found by walking UP from wherever the command runs: a commit issued from a SUBDIRECTORY of the
  // worktree is judged in that worktree (a resolver that only looked at the cwd itself would find no .git and fail open)
  stage(outside, 'js/m.js', 'const a = 1\n' + OWN_LINE)
  say(commitIn(join(outside, 'js'), main) === 'DENY', 'DENY', 'a commit issued from a SUBDIRECTORY of the worktree is judged in that worktree')
  g(outside, 'reset', '-q', '--hard')

  // and a folder that is not inside any repository fails OPEN — the hook never refuses over its own failure to find out
  const nowhere = join(dir, 'not-a-repo'); mkdirSync(nowhere)
  say(commitIn(nowhere, main) === 'ALLOW', 'ALLOW', 'a commit issued from a folder that is not in any repository is not refused')
} catch (e) {
  bad++
  console.log(`FAIL  could not run: ${String(e.message).slice(0, 160)}`)
} finally {
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* temp dir */ }
}

console.log(bad ? `\n${bad} case(s) misbehaved` : '\nall cases behaved')
process.exit(bad ? 1 : 0)
