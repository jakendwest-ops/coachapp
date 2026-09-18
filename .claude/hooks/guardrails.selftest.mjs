#!/usr/bin/env node
// Proves guardrails.mjs can REFUSE and, just as importantly, that it does NOT refuse ordinary work.
// A guard that has only ever been observed passing is indistinguishable from a dead one.
//
// Run: node guardrails.selftest.mjs        (exit 0 = all cases behaved)

import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOOK = join(HERE, 'guardrails.mjs')

// A CLEAN throwaway git repo that every case is pointed at by default.
//
// Why: the hook returns on its FIRST deny, and REPO (guardrails.mjs:23) defaults to the real
// CoachApp tree. So a case testing rule 5 or 6 would inherit a deny from an EARLIER rule reading
// the developer real index -- rule 2 on any staged coach_id, or rule 1c on any stray zz-* file --
// and report a false failure for a rule it never reached. Measured 2026-09-02: a staged coach_id
// file produced 9 false failures (rules 5+6) and a stray zz- file produced 17 (rules 2,2c,3,5,6),
// which is why os-lint reported this self-test RED for exactly the duration of the ownership work
// it exists to guard, and GREEN when nothing was staged.
//
// A case that genuinely needs the real tree passes GUARDRAILS_REPO explicitly and overrides this.
const CLEAN_REPO = mkdtempSync(join(tmpdir(), 'grd-clean-'))
execFileSync('git', ['init', '-q', CLEAN_REPO], { encoding: 'utf8', stdio: 'pipe' })
execFileSync('git', ['-C', CLEAN_REPO, 'config', 'user.email', 'selftest@example.com'], { stdio: 'pipe' })
execFileSync('git', ['-C', CLEAN_REPO, 'config', 'user.name', 'selftest'], { stdio: 'pipe' })
mkdirSync(join(CLEAN_REPO, 'js'), { recursive: true })
writeFileSync(join(CLEAN_REPO, 'js', 'base.js'), 'const a = 1')
execFileSync('git', ['-C', CLEAN_REPO, 'add', '-A'], { stdio: 'pipe' })
execFileSync('git', ['-C', CLEAN_REPO, 'commit', '-qm', 'base'], { stdio: 'pipe' })
const CASES = JSON.parse(readFileSync(join(HERE, 'guardrails.selftest.json'), 'utf8'))

let failures = 0
const say = (ok, want, why, extra = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  want=${want.padEnd(5)} ${why}${extra}`)
}

function invoke (payload, env = {}) {
  const out = execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8',
    // GUARDRAILS_REPO first so a case can still override it; ...env wins by coming after.
    env: { ...process.env, GUARDRAILS_REPO: CLEAN_REPO, ...env }
  })
  return out.includes('"deny"') ? 'DENY' : 'ALLOW'
}

console.log('— rule 1: piped runner —')
// Each case gets its OWN lock path, cleared first. Without this the rule-4 lock written by one
// case leaks into the next and denies it — which is precisely what happened when rule 4 landed,
// and is the same shared-fixture fault feedback-test-fixture-isolation describes.
const r1dir = mkdtempSync(join(tmpdir(), 'r1-'))
for (const [i, c] of CASES.pipedRunner.entries()) {
  const lock = join(r1dir, `c${i}.lock`)
  const got = invoke(
    { hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 'S1', tool_input: { command: c.cmd } },
    { GUARDRAILS_LOCK: lock }
  )
  say(got === c.want, c.want, c.why, got === c.want ? '' : `  (got ${got})`)
}
rmSync(r1dir, { recursive: true, force: true })

console.log('— rule 1b: git stash —')
for (const c of CASES.stash) {
  const got = invoke({ hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 'S1', tool_input: { command: c.cmd } })
  say(got === c.want, c.want, c.why, got === c.want ? '' : `  (got ${got})`)
}

console.log('— rule 4: concurrent test runs —')
{
  const lock = join(mkdtempSync(join(tmpdir(), 'lk-')), 'pw.lock')
  const pre = c => invoke({ hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 'S1', tool_input: { command: c } }, { GUARDRAILS_LOCK: lock })
  const post = () => invoke({ hook_event_name: 'PostToolUse', tool_name: 'Bash', session_id: 'S1', tool_input: { command: 'x' } }, { GUARDRAILS_LOCK: lock })
  say(pre('npx playwright test tests/a.spec.js') === 'ALLOW', 'ALLOW', 'first run acquires the lock')
  say(existsSync(lock), 'LOCK ', 'the lock file is actually written')
  say(pre('npx playwright test tests/b.spec.js') === 'DENY', 'DENY ', 'a second concurrent run is refused')
  post()
  say(!existsSync(lock), 'FREE ', 'PostToolUse releases the lock')
  say(pre('npx playwright test tests/c.spec.js') === 'ALLOW', 'ALLOW', 'a run after release is allowed again')
  rmSync(lock, { force: true })
  say(pre('git status') === 'ALLOW' && !existsSync(lock), 'ALLOW', 'a non-test command neither blocks nor locks')
}

console.log('— rule 2: ownership commit —')
const dir = mkdtempSync(join(tmpdir(), 'grd-'))
try {
  for (const c of CASES.ownershipCommit) {
    const marker = join(dir, 'review-ran')
    if (c.marker === null) { if (existsSync(marker)) rmSync(marker) } else writeFileSync(marker, c.marker)
    const got = invoke(
      { hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: c.session, tool_input: { command: 'git commit -m x' } },
      { GUARDRAILS_STATE: dir, GUARDRAILS_MARKER: marker, GUARDRAILS_FAKE_STAGED: c.staged }
    )
    say(got === c.want, c.want, c.why, got === c.want ? '' : `  (got ${got})`)
  }

  console.log('— rule 2b: chained `git add && git commit` against a REAL repo —')
  // The fixture cases above inject GUARDRAILS_FAKE_STAGED, which bypasses the git logic entirely —
  // so they could not have caught the bug this covers. PreToolUse fires before the whole command,
  // so for `git add … && git commit …` the index is still EMPTY and `--cached` returns nothing.
  // The first live commit after this hook shipped passed vacuously for exactly that reason. A real
  // repo is the only way to test it.
  const repo = join(dir, 'repo')
  const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: 'pipe' })
  try {
    mkdirSync(join(repo, 'js'), { recursive: true })
    execFileSync('git', ['init', '-q', repo], { encoding: 'utf8', stdio: 'pipe' })
    git('config', 'user.email', 'selftest@example.com')
    git('config', 'user.name', 'selftest')
    writeFileSync(join(repo, 'js', 'm.js'), 'const a = 1\n')
    git('add', '-A'); git('commit', '-qm', 'base')
    writeFileSync(join(repo, 'js', 'm.js'), "const a = 1\nconst x = q.eq('coach_id', me)\n")   // UNSTAGED

    const chained = invoke(
      { hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 'S1', tool_input: { command: 'git add js/m.js && git commit -m x' } },
      { GUARDRAILS_STATE: dir, GUARDRAILS_MARKER: join(dir, 'nope'), GUARDRAILS_REPO: repo }
    )
    say(chained === 'DENY', 'DENY', 'chained add+commit sees the working tree, not an empty index')

    const bare = invoke(
      { hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 'S1', tool_input: { command: 'git commit -m x' } },
      { GUARDRAILS_STATE: dir, GUARDRAILS_MARKER: join(dir, 'nope'), GUARDRAILS_REPO: repo }
    )
    say(bare === 'ALLOW', 'ALLOW', 'bare commit ignores unrelated unstaged WIP (no false refusal)')
  } catch (e) {
    say(false, 'DENY', `real-repo case could not run: ${String(e.message).slice(0, 70)}`)
  }

  console.log('— rule 2c: the commit must be IN the guarded repo —')
  // These two cases are ABOUT repo containment, so the 'inside' case drives its cwd off CLEAN_REPO
  // -- the guarded repo IS CLEAN_REPO here. Pinning them to the real CoachApp path was tried and
  // reverted the same day: it put rule 1c and rule 5 back on the developer's real tree, so a stray
  // zz- file or a staged .sql made these two fail again. Containment does not care which path is
  // guarded, only whether the cwd sits inside it.
  // The first version hardcoded the CoachApp repo and ran its diff regardless of where the command
  // was going, so a commit in ~/.claude was refused because CoachApp's tree held ownership code.
  {
    const own = "+  .eq('coach_id', currentUser.id)"
    const elsewhere = invoke(
      { hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 'S1', cwd: 'C:/Users/jaken/.claude',
        tool_input: { command: 'cd "C:/Users/jaken/.claude" && git add -A && git commit -m x' } },
      { GUARDRAILS_STATE: dir, GUARDRAILS_MARKER: join(dir, 'nope'), GUARDRAILS_FAKE_STAGED: own }
    )
    say(elsewhere === 'ALLOW', 'ALLOW', 'a commit in ANOTHER repo is not judged by the CoachApp tree')

    const inRepo = invoke(
      { hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 'S1', cwd: CLEAN_REPO,
        tool_input: { command: 'git commit -m x' } },
      { GUARDRAILS_STATE: dir, GUARDRAILS_MARKER: join(dir, 'nope'), GUARDRAILS_FAKE_STAGED: own }
    )
    say(inRepo === 'DENY', 'DENY ', 'a commit inside CoachApp still gets the ownership gate')
  }

  console.log('— rule 3: measurement must ACTUALLY write —')
  // This case exists because a missing `appendFileSync` import once made rule 3 throw straight into
  // its own catch: it recorded nothing, reported nothing, and looked exactly like a working check.
  const scope = join(dir, 'scope.jsonl')
  if (existsSync(scope)) rmSync(scope)
  invoke(
    { hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 'SCOPE1', tool_input: { command: 'git commit -m x' } },
    { GUARDRAILS_STATE: dir, GUARDRAILS_MARKER: join(dir, 'nope'), GUARDRAILS_FAKE_STAGED: '+ plain' }
  )
  const wrote = existsSync(scope) && readFileSync(scope, 'utf8').includes('SCOPE1')
  say(wrote, 'WRITE', 'commit scope is appended to scope.jsonl')

  console.log('— rule 5: a staged .sql needs sql-safety this session —')
  // Both directions, because the danger of this gate is refusing legitimate work: it sits on every
  // `git commit`, and most commits have no SQL in them at all.
  const sqlCommit = (staged, sqlMarker) => invoke(
    { hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 'SQL1', tool_input: { command: 'git commit -m x' } },
    { GUARDRAILS_STATE: dir, GUARDRAILS_MARKER: join(dir, 'nope'), GUARDRAILS_SQL_MARKER: sqlMarker, GUARDRAILS_FAKE_STAGED_FILES: staged }
  )
  const noMarker = join(dir, 'sql-absent')
  const goodMarker = join(dir, 'sql-good');  writeFileSync(goodMarker, 'SQL1')
  const staleMarker = join(dir, 'sql-stale'); writeFileSync(staleMarker, 'SOME-OTHER-SESSION')

  say(sqlCommit('scripts/add-consent-2026-08-24.sql', noMarker) === 'DENY', 'DENY ',
    'a staged migration with no sql-safety run is refused')
  say(sqlCommit('js/app-core.js\nindex.html', noMarker) === 'ALLOW', 'ALLOW',
    'an ordinary commit with no .sql is untouched (the false-refusal risk)')
  say(sqlCommit('scripts/add-consent-2026-08-24.sql', goodMarker) === 'ALLOW', 'ALLOW',
    'the marker from THIS session clears it')
  say(sqlCommit('scripts/x.sql', staleMarker) === 'DENY', 'DENY ',
    "a previous session's marker does NOT clear it — session-scoped, like rule 2")
  say(sqlCommit('docs/notes.md', noMarker) === 'ALLOW', 'ALLOW',
    'a file merely mentioning sql in its path is not a .sql file')

  console.log('— rule 6: appending a prediction while past-due ones are ungraded —')
  // The DOOR is tested harder than the wall here. This rule guards a file the save ritual writes
  // every session, so a false refusal would break /save itself — and "a guard's real risk is
  // refusing the legitimate user" is the most-repeated lesson in this project's ledger.
  const rec = (id, verify_by, outcome, project = 'CoachApp') =>
    JSON.stringify({ id, project, claim: 'x', verify_by, outcome })
  const PAST = '2026-01-01', FUTURE = '2099-01-01'
  const emptyBaseline = join(dir, 'pred-baseline-empty'); writeFileSync(emptyBaseline, '')
  const predCommit = (head, staged, baseline = emptyBaseline) => invoke(
    { hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 'P1', tool_input: { command: 'git commit -m x' } },
    { GUARDRAILS_STATE: dir, GUARDRAILS_MARKER: join(dir, 'nope'), GUARDRAILS_PRED_BASELINE: baseline,
      GUARDRAILS_PRED_HEAD: head, GUARDRAILS_PRED_STAGED: staged }
  )

  const oneOverdue = rec('a', PAST, null)
  const oneGraded  = rec('a', PAST, 'true')

  say(predCommit(oneOverdue, `${oneOverdue}\n${rec('b', FUTURE, null)}`) === 'DENY', 'DENY ',
    'appending a NEW prediction while a past-due one is ungraded is refused')
  say(predCommit(oneOverdue, oneGraded) === 'ALLOW', 'ALLOW',
    'DOOR 1 — a grading-only commit is never blocked, however big the backlog')
  say(predCommit(oneOverdue, `${oneGraded}\n${rec('b', FUTURE, null)}`) === 'ALLOW', 'ALLOW',
    'DOOR 2 — grade and append in ONE commit (what /save does) passes: staged content is what counts')
  say(predCommit(`${oneOverdue}\n${rec('c', PAST, null)}`, `${oneGraded}\n${rec('c', PAST, null)}\n${rec('b', FUTURE, null)}`) === 'DENY', 'DENY ',
    'grading only SOME of the past-due ones does not buy an append — proves door 2 is not a bypass')
  say(predCommit(rec('a', FUTURE, null), `${rec('a', FUTURE, null)}\n${rec('b', FUTURE, null)}`) === 'ALLOW', 'ALLOW',
    'ungraded but NOT YET DUE is not a backlog — appending alongside it is normal work')
  // Was a PTHub-specific exclusion; PTHub ended 2026-09-15 and isn't a live concept here anymore.
  // Generalised to prove the real shape of the filter (CoachApp-only inclusion, matching os-lint's
  // stale-predictions check exactly) rather than one now-retired project name.
  say(predCommit(rec('a', PAST, null, 'SomeOtherProject'), `${rec('a', PAST, null, 'SomeOtherProject')}\n${rec('b', FUTURE, null)}`) === 'ALLOW', 'ALLOW',
    'a non-CoachApp prediction is excluded — one fact, one definition, shared with os-lint')
  say(predCommit(oneOverdue, oneOverdue) === 'ALLOW', 'ALLOW',
    'a commit that does not touch predictions.jsonl at all is untouched')

  // THE RATCHET. The 63 predictions already past due when this rule shipped are grandfathered, or it
  // would have walled the very next /save. Both halves are asserted: a baselined id buys an append,
  // and a NON-baselined one still refuses — otherwise the baseline would be a silent kill switch.
  {
    const baselined = join(dir, 'pred-baseline-a'); writeFileSync(baselined, 'a\n')
    say(predCommit(oneOverdue, `${oneOverdue}\n${rec('b', FUTURE, null)}`, baselined) === 'ALLOW', 'ALLOW',
      'a GRANDFATHERED past-due prediction does not block an append (the ratchet)')
    say(predCommit(rec('z', PAST, null), `${rec('z', PAST, null)}\n${rec('b', FUTURE, null)}`, baselined) === 'DENY', 'DENY ',
      'a past-due id that is NOT baselined still refuses — the baseline is not a kill switch')
  }

  // THE PATH CASE. Every fixture above injects GUARDRAILS_PRED_*, which bypasses git entirely — so
  // all seven passed while the real `git show` was failing with "path is in the index, but not
  // docs/predictions.jsonl" and the rule could never have fired in actual use. Same lesson as rule
  // 2b: a fixture proves the logic, only the real repo proves the plumbing.
  //
  // REPOINTED 2026-09-17: predictions.jsonl moved from the Vault into this repo at
  // docs/predictions.jsonl (see guardrails.mjs RULE 6's comment) — this now reads the real CoachApp
  // repo, not a separate one, so the old Claude/Vault/-vs-Claude/ path-reconciliation concern this
  // comment used to describe no longer applies; `./` is kept only for consistency with RULE 2/5's
  // existing `git show :./<path>` form.
  try {
    const REAL_REPO = 'c:/Users/jaken/OneDrive/coachapp'
    const show = ref => execFileSync('git', ['show', ref], { cwd: REAL_REPO, encoding: 'utf8', stdio: 'pipe', maxBuffer: 20 * 1024 * 1024 })
    const head = show('HEAD:./docs/predictions.jsonl')
    say(head.trim().length > 0 && head.includes('"verify_by"'), 'PATH ',
      'the real docs/predictions.jsonl actually resolves — the rule is not decorative')
  } catch (e) {
    say(false, 'PATH ', `real docs/predictions.jsonl path did NOT resolve: ${String(e.message).slice(0, 80)}`)
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log(failures ? `\n${failures} case(s) misbehaved` : '\nall cases behaved')
process.exit(failures ? 1 : 0)
