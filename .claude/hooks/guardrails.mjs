#!/usr/bin/env node
// PreToolUse(Bash) guardrails — the MECHANICAL half of the 2026-08-22 error-rate review.
//
// WHY A HOOK AND NOT A STANDING BEHAVIOUR. standing-behaviours.mjs already injects
// "No claim without a check you actually ran" on EVERY turn, and on 2026-08-22 I still
// read "exit code 0" off a piped Playwright run that had 2 failed tests. A rule that
// fires every turn and is still violated is not under-stated, it is unenforceable by
// statement. Only a check that can refuse changes behaviour.
//
// Both rules below are deliberately NARROW. The documented failure mode of a guard in
// this project is refusing the legitimate user (it broke "View as" once already), and
// alarm fatigue is the failure mode this OS worries about most. Each rule targets one
// incident that actually happened, not a category that might.

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, rmSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'

// Every input is env-overridable. A check whose inputs cannot be substituted cannot be shown to
// FAIL, and an untestable check is indistinguishable from a dead one — the dominant defect class
// in this OS (see feedback-reports-success-doing-nothing).
const STATE = process.env.GUARDRAILS_STATE || 'C:/Users/jaken/.claude/state'
const REVIEW_MARKER = process.env.GUARDRAILS_MARKER || `${STATE}/review-ran`
const REPO = process.env.GUARDRAILS_REPO || 'c:/Users/jaken/OneDrive/coachapp'

// ─── input ────────────────────────────────────────────────────────────────────
let raw = ''
try { raw = readFileSync(0, 'utf8') } catch { /* no stdin */ }
let ev = {}
try { ev = JSON.parse(raw || '{}') } catch { /* malformed — fail open, never block on our own bug */ }

const cmd = String(ev?.tool_input?.command ?? '')
const sessionId = String(ev?.session_id ?? 'unknown')

// Record the live session id so the review skill has something to copy into the marker.
// Doing it here rather than asking the skill to discover it: there is no reliable session-id
// env var in this shell, and a step that cannot be performed mechanically becomes a step that
// gets skipped. Guarded so a read-only state dir can never break tool use.
if (!process.env.GUARDRAILS_MARKER && sessionId !== 'unknown') {
  try {
    mkdirSync(STATE, { recursive: true })
    writeFileSync(`${STATE}/session-current`, sessionId)
  } catch { /* never block a tool call over bookkeeping */ }
}

// PostToolUse arrives after the tool finished — release the run lock and do nothing else.
if (ev?.hook_event_name === 'PostToolUse') {
  try {
    const lock = process.env.GUARDRAILS_LOCK || `${STATE}/playwright-running.lock`
    if (existsSync(lock)) rmSync(lock)
  } catch { /* never let bookkeeping fail a tool result */ }
  process.exit(0)
}

// ─── RULE 4: never run two Playwright invocations against one server ──────────
// Retires memory feedback-concurrent-test-contamination. A second suite against the same :3001 and
// the same E2E accounts causes mass FALSE failures, which is worse than no run at all: it burns a
// full cycle and teaches you to distrust red.
//
// A lock, not a process scan. Process inspection is platform-specific and a lingering headless
// Chrome from a crashed run would block forever. The lock is written on PreToolUse and released on
// PostToolUse, with a TTL longer than a full suite (measured at ~31 min on 2026-08-22) so a run that
// dies without a PostToolUse self-heals rather than wedging the tool.
const RUN_LOCK = `${STATE}/playwright-running.lock`
const LOCK_TTL_MS = 45 * 60 * 1000
const isTestRun = c => /\bnpx\s+playwright\s+test\b|\bnpm\s+(run\s+)?test\b/.test(c) ||
  /(^|[;&|]\s*)(bash|sh|source|\.)\s+\S*checks\.sh\b|(^|[;&|]\s*)\.?\/\S*checks\.sh\b/.test(c)

function deny (reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  }))
  process.exit(0)
}

// A command is "chained" only where a later stage would MASK the runner's status.
// `&&` and `;` do not mask it; a pipe does, because pipefail is off in this shell.
// Quoted text is DATA, not a command. Strip it once and match everything against the
// stripped form. This is not a nicety: within minutes of going live this hook refused a
// self-test whose fixture strings contained the literal pattern `npx playwright test | tail`.
// A real invocation has the runner unquoted, so it still matches; a fixture, a grep pattern,
// an echo, or a commit message mentioning it no longer does.
// Heredoc BODIES are stdin data too, and are stripped for the same reason — this hook refused a
// second self-test whose fixtures sat in a `<<'EOF' … EOF` block. Both over-refusals were on a test
// harness rather than real work, which is the right side to fail on, but the lesson is that a shell
// string cannot be reliably split into "command" and "data" and this guard should only ever be as
// aggressive as the cases it has actually been shown to get right.
const bareCmd = cmd
  .replace(/<<-?\s*'?"?([A-Za-z_][A-Za-z0-9_]*)'?"?[\s\S]*?^\s*\1\s*$/gm, '<<HEREDOC')
  .replace(/'[^']*'/g, "''")
  .replace(/"[^"]*"/g, '""')

function pipesAway (c) {
  return /\|(?!\|)/.test(c)
}

// ─── RULE 1: never read a runner's exit code through a pipe ───────────────────
// INCIDENT, 2026-08-22: `npx playwright test 2>&1 | tail -45` reported "exit code 0"
// on a run with 2 FAILED tests, because a pipeline returns its LAST command's status
// and `pipefail` is off. Verified directly: `false | tail -1` -> 0, `false` -> 1.
// I nearly recorded a red suite as green. scripts/checks.sh:167 does NOT pipe, which
// is the only reason the real gate stayed trustworthy.
//
// Scoped to runners whose EXIT CODE is the thing being asked for. Piping `git log`
// or `grep` is normal and stays untouched.
const RUNNERS = [
  { re: /\bnpx\s+playwright\s+test\b/, name: 'npx playwright test' },
  { re: /\bnpm\s+(run\s+)?test\b/, name: 'npm test' },
  // Must look like an INVOCATION, not a path argument. `grep -n x scripts/checks.sh` is reading the
  // file, not running it — this guard refused exactly that, its third false refusal, all three on
  // read-only inspection and none on real work.
  { re: /(^|[;&|]\s*)(bash|sh|source|\.)\s+\S*checks\.sh\b|(^|[;&|]\s*)\.?\/\S*checks\.sh\b/, name: 'checks.sh' },
  { re: /\bgit\s+push\b/, name: 'git push' }
]
// The runner and the pipe must be in the SAME pipeline segment. `git push > f; grep x | tail` pipes
// only the GREP — the push's status is intact and `echo $?` right after it reads correctly. Testing
// the whole command string flagged that as masked, the sixth false refusal from this hook and the
// third caused by examining a wider span than the rule actually covers.
// NEWLINES separate commands too. Omitting them collapsed a multi-line script into ONE segment,
// so a `head` pipe on line 2 read as masking a `git push` on line 4 — the seventh false refusal,
// and the FOURTH from this same cause. Writing the 'guard reads too wide a span' note into memory
// an hour earlier did not stop it; enumerating the separators would have.
const segments = bareCmd.split(/;|&&|\|\||[\r\n]+/)
const offending = segments.find(seg => RUNNERS.some(r => r.re.test(seg)) && pipesAway(seg))
const runner = offending ? RUNNERS.find(r => r.re.test(offending)) : null
if (runner) {
  deny(
    `PIPED RUNNER — the exit code you get back will be the pipe's LAST command, not ${runner.name}'s.\n` +
    `pipefail is OFF in this shell (verified: \`false | tail -1\` -> 0). On 2026-08-22 this reported\n` +
    `"exit code 0" for a Playwright run with 2 FAILED tests.\n\n` +
    `Redirect to a file instead, then read BOTH the status and the summary line:\n` +
    `  ${runner.name} ... > "$SCRATCH/run.out" 2>&1; echo "EXIT=$?"; grep -E "passed|failed|flaky" "$SCRATCH/run.out" | tail\n\n` +
    `If you only want to trim OUTPUT and do not care about the status, say so explicitly in your\n` +
    `message and re-run with the redirect anyway — the summary line is what you should be reading.`
  )
}

// Rule 4 gate + lock acquisition.
if (isTestRun(bareCmd)) {
  const lock = process.env.GUARDRAILS_LOCK || RUN_LOCK
  try {
    if (existsSync(lock)) {
      const age = Date.now() - statSync(lock).mtimeMs
      if (age < LOCK_TTL_MS) {
        deny(
          `A TEST RUN IS ALREADY IN FLIGHT (started ${Math.round(age / 60000)} min ago).

` +
          `Two Playwright invocations share one :3001 and one set of E2E accounts, so the second run
` +
          `produces mass FALSE failures — worse than no run, because it burns a cycle and teaches you
` +
          `to distrust red. Wait for the first to finish.

` +
          `If that run actually died, clear the lock explicitly:  rm "${lock}"`
        )
      }
    }
    mkdirSync(STATE, { recursive: true })
    writeFileSync(lock, new Date().toISOString())
  } catch { /* lock unavailable — fail OPEN, never block a run over bookkeeping */ }
}

// ─── RULE 1b: never touch the stash in this working tree ──────────────────────
// Retires memory feedback-no-git-stash-shared-tree, which was prose only. A real WIP stash
// lives in this tree and a reviewer subagent already popped the wrong one once. Prose could
// not stop that; this can. Read-only stash inspection stays allowed — `git stash list` is
// how you find out what is there.
if (/\bgit\s+stash\b/.test(bareCmd) && !/\bgit\s+stash\s+(list|show)\b/.test(bareCmd)) {
  deny(
    `GIT STASH IS BANNED IN THIS TREE.\n\n` +
    `A real WIP stash lives here and a reviewer subagent has already popped the wrong one.\n` +
    `Use \`cp\` to a scratchpad, or \`git show HEAD:<path>\`, to get at a pristine copy.\n` +
    `\`git stash list\` and \`git stash show\` are still allowed — inspecting is fine, mutating is not.`
  )
}

// ─── RULE 1c: no throwaway probe files in a commit ────────────────────────────
// Retires memory feedback-subagent-throwaway-file-cleanup. Subagents doing live diagnostics
// leave zz-probe-*/_tmp-*/_debug-* specs behind, and the rule to check `git status` before
// committing was prose that depended on remembering.
if (/\bgit\s+commit\b/.test(bareCmd)) {
  try {
    const junk = execSync('git status --porcelain', { cwd: REPO, encoding: 'utf8' })
      .split(/\r?\n/)
      .map(l => l.slice(3).trim())
      .filter(f => /(^|\/)(zz-|_tmp-|_debug-|probe-)/i.test(f))
      // `zz-` not `zz-probe-`: the pattern originally required the word 'probe' and MISSED the
      // one piece of real debris in the tree — tests/zz-unipill.spec.js, an untracked diagnostic
      // from the 2026-08-19 unilateral investigation. A guard written from the remembered
      // convention rather than from what is actually on disk.
    if (junk.length) {
      deny(
        `THROWAWAY PROBE FILE(S) IN THE TREE:\n` + junk.slice(0, 10).map(f => `  · ${f}`).join('\n') +
        `\n\nThese are live-diagnostic leftovers. Delete them (or rename them to something real)\n` +
        `before committing — a probe file that ships reads as a test nobody can explain.`
      )
    }
  } catch { /* not a git repo — fail open */ }
}

// ─── RULE 2: ownership/RLS work is reviewed BEFORE it is committed ────────────
// The project rule was "review before PUSH". That catches everything one cycle too late:
// on 2026-08-22 a commit's ownership gate was found to be anchored on the wrong id, its
// guard placed after a destructive loop, and its test carrying a decorative assertion —
// all AFTER the code was written and staged as finished. Reviewing before the commit puts
// the catch where the work still feels editable.
//
// Deliberately session-scoped, not diff-hash-scoped. A hash marker would re-block after
// every review-fix edit, which is the "refuses the legitimate user" failure this project
// has already shipped once. This only catches the real case: ownership code committed with
// NO review having run at all.
const OWNERSHIP = /_verify[A-Z]|coach_id|client_id|auth\.uid|\bRLS\b|create\s+policy/i

// WHICH repo is this commit actually in? The first version hardcoded REPO and ran `git diff` there
// no matter where the command was headed — so committing in ~/.claude was refused because the
// COACHAPP working tree happened to contain ownership code. Fourth false refusal from this hook, and
// the only one that was a design fault rather than a pattern that was too broad: the guard asserted a
// context it had never checked. An explicit `cd` in the command wins over the session cwd.
const cdTarget = (cmd.match(/(?:^|&&|;|\|)\s*cd\s+["']?([^"'&;|\n]+)["']?/) || [])[1]
const normPath = p => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
const effectiveCwd = normPath(cdTarget || ev?.cwd || REPO)
const inCoachApp = effectiveCwd.startsWith(normPath(REPO))

if (/\bgit\s+commit\b/.test(bareCmd) && inCoachApp) {
  let staged = ''
  if (process.env.GUARDRAILS_FAKE_STAGED !== undefined) {
    staged = process.env.GUARDRAILS_FAKE_STAGED   // self-test injection point
  } else {
    // PreToolUse fires before the WHOLE command runs, so for the extremely common
    // `git add … && git commit …` the index is still empty at this point and `--cached`
    // returns nothing. The first live commit after this hook shipped recorded files:0 for
    // exactly that reason — the ownership check would have passed VACUOUSLY on an empty
    // diff, which is the "reports success while doing nothing" class this hook exists to
    // fight, inside the hook itself.
    //
    // So: prefer the index, and fall back to the working tree only when the index is empty.
    // Not `git diff HEAD` unconditionally — this tree carries real unrelated WIP, and
    // blocking a clean commit because of someone else's half-finished edit is the
    // refuse-the-legitimate-user failure this project has already shipped once.
    const PATHS = '-- js/ scripts/ supabase/'
    const run = a => execSync(`git diff ${a} ${PATHS}`, { cwd: REPO, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
    try {
      staged = run('--cached')
      if (!staged.trim() && /\bgit\s+add\b/.test(bareCmd)) staged = run('HEAD')
    } catch { /* not a git repo / no HEAD yet — fail open */ }
  }

  // ADDED lines only. Testing the whole diff counts unchanged CONTEXT lines, so any edit that merely
  // sits near ownership code trips the gate — this refused a checks.sh change whose own added lines
  // contained no ownership content at all, because `coach_id` appeared in the surrounding context.
  // Fifth false refusal, same family as the rest: the guard examining more than it should.
  // Removed lines are excluded too: deleting an ownership check is a different (and rarer) review
  // question, and gating it here would block the cleanup of code this very project keeps retiring.
  const addedLines = staged.split(/\r?\n/).filter(l => /^\+/.test(l) && !/^\+\+\+/.test(l))
  const removedLines = staged.split(/\r?\n/).filter(l => /^-/.test(l) && !/^---/.test(l))

  // A PURE TOKENISATION is not ownership work, even when it lands on a line that happens to
  // mention client_id. 2026-08-22, this gate's EIGHTH false refusal: it blocked
  //   <div style="font-size:var(--text-base, 13px);..." onclick="openClient('${f.client_id}')">
  // where the ONLY change was wrapping 13px. The client_id was pre-existing text.
  //
  // The test is per-line and EXACT: expand every `var(--token, LITERAL)` back to LITERAL, and
  // if the result equals a line that was REMOVED, this line changed nothing but its wrappers.
  // That is the codemod's round-trip property, applied one line at a time.
  //
  // It does NOT weaken the real case. Changing `.eq('coach_id', x)` to `.eq('coach_id', y)`
  // does not expand to any removed line, so it still gates. A cruder rule -- "ignore the token
  // if it also appears somewhere in the removals" -- WOULD have let that through, which is why
  // the comparison is against whole-line identity rather than token presence.
  const expandVars = s => s.replace(/var\(--[a-z0-9-]+,\s*([^)]*)\)/gi, (_m, lit) => lit.trim())
  const removedBodies = new Set(removedLines.map(l => l.slice(1)))
  const isPureTokenisation = l => removedBodies.has(expandVars(l.slice(1)))

  const touchesOwnership = addedLines.some(l => OWNERSHIP.test(l) && !isPureTokenisation(l))
  let reviewed = false
  try {
    reviewed = existsSync(REVIEW_MARKER) &&
      readFileSync(REVIEW_MARKER, 'utf8').trim() === sessionId
  } catch { /* unreadable marker counts as not reviewed — fail CLOSED here, on purpose */ }

  if (touchesOwnership && !reviewed) {
    const hits = [...new Set((staged.match(OWNERSHIP) ? staged.split(/\r?\n/) : [])
      .filter(l => /^\+/.test(l) && OWNERSHIP.test(l))
      .map(l => (l.match(OWNERSHIP) || [''])[0]))].slice(0, 6)
    deny(
      `OWNERSHIP/RLS CODE STAGED WITH NO REVIEW THIS SESSION.\n\n` +
      `The staged diff touches multi-tenant scoping${hits.length ? ` (${hits.join(', ')})` : ''}.\n` +
      `Project rule as of 2026-08-22: this class is reviewed BEFORE the commit, not before the push.\n` +
      `Every ownership commit reviewed on 2026-08-22 came back with a real finding — wrong anchor id,\n` +
      `guard placed after a destructive write, and a decorative test assertion.\n\n` +
      `Run the multi-agent-review skill. It writes ${REVIEW_MARKER} on completion, which clears this.\n` +
      `If this diff genuinely has no ownership content, unstage the file that matched and commit the rest.`
    )
  }
}

// ─── RULE 3 (MEASUREMENT ONLY, no gate): record the scope of each commit ──────
// ─── RULE 5: a SQL migration gets sql-safety, mechanically ────────────────────
// Added OS v3, 2026-08-24, on live evidence from the session that added it: I wrote
// scripts/add-consent-2026-08-24.sql — a schema change on the profiles table — and never ran
// sql-safety, despite hello-claude carrying "Before any SQL → sql-safety" as a standing mandate
// since July. The 2026-08-23 inventory had already measured that skill's last real use as
// 2026-07-19. A mandate read once per session does not fire; this is RULE 0 applied to it.
//
// Same shape as RULE 2 and deliberately so: session-scoped marker, fail CLOSED, cleared by the
// skill itself. The skill MUST write the marker or this becomes a wall with no door — that step
// was added to skills/sql-safety/SKILL.md in the same change.
//
// Scoped to *.sql only. It does not try to detect SQL embedded in JS: that would be a guess at
// what counts as a schema change, and an over-broad guard that refuses legitimate work is this
// OS's newest failure class (eight false refusals from RULE 2 alone).
const SQL_MARKER = process.env.GUARDRAILS_SQL_MARKER || `${STATE}/sql-safety-ran`
if (/\bgit\s+commit\b/.test(bareCmd)) {
  let sqlFiles = []
  try {
    const raw = process.env.GUARDRAILS_FAKE_STAGED_FILES ??
      execSync('git diff --cached --name-only', { cwd: REPO, encoding: 'utf8' })
    sqlFiles = raw.split(/\r?\n/).filter(Boolean).filter(f => /\.sql$/i.test(f))
  } catch { /* if git cannot be read here, never block on a measurement failure */ }

  if (sqlFiles.length) {
    let ran = false
    try {
      ran = existsSync(SQL_MARKER) && readFileSync(SQL_MARKER, 'utf8').trim() === sessionId
    } catch { /* unreadable marker counts as not run — fail CLOSED, same as RULE 2 */ }
    if (!ran) {
      deny(
        `SQL MIGRATION STAGED WITH NO sql-safety THIS SESSION.\n\n` +
        `Staged: ${sqlFiles.slice(0, 5).join(', ')}${sqlFiles.length > 5 ? ` (+${sqlFiles.length - 5} more)` : ''}\n\n` +
        `This project has shipped four RLS gaps and a live cross-tenant storage leak. The rule\n` +
        `"before any SQL → sql-safety" has existed since July and its last real run was 2026-07-19,\n` +
        `because a mandate read once per session does not fire.\n\n` +
        `Run the sql-safety skill. It writes ${SQL_MARKER} on completion, which clears this.\n` +
        `If this .sql is genuinely not a schema/policy change (a comment edit, a revert), unstage it\n` +
        `and commit the rest.`
      )
    }
  }
}

// ─── RULE 6: you may not APPEND a prediction while past-due ones sit ungraded ─
// Added OS v3, 2026-08-25 (plan recommendation R6). The backlog is not a one-off to be cleared, it
// REGENERATES: a grading pass on 2026-08-09 took the ungraded count 62 -> 32, and it was back to 110
// within two weeks; measured again today it is 63. Draining it by hand again without changing the
// valve would just schedule the next drain.
//
// So this is self-limiting by construction rather than a nag: writing a NEW prediction is what
// requires the past-due ones to be graded first. Grading is what the ledger is for; appending is the
// privilege that has to be earned.
//
// THE DOOR MATTERS MORE THAN THE WALL. A gate whose failure mode is "you can never touch this file
// again" is worse than the gap it closes, and this OS has shipped that shape before. Two deliberate
// escapes:
//   1. a commit that ONLY grades (adds no new id) is never blocked, however many remain ungraded —
//      so the backlog can always be drained incrementally, in as many commits as it takes;
//   2. the ungraded count is read from the STAGED content, not the working tree, so grading and
//      appending in the SAME commit (which is what /save does) passes as long as the result is clean.
// REPOINTED 2026-09-17: predictions.jsonl moved from the Vault (a separate repo, cross-project with
// PTHub) into this repo at docs/predictions.jsonl — PTHub-labelled rows left behind. PTHub ended
// 2026-09-15 and this file held only two project labels, CoachApp and PTHub (verified before the
// move), so there was no longer a second live project for this to be "cross-project" WITH. Now reads
// the same repo RULE 2/5 already do, via the same staged-vs-HEAD pattern, instead of shelling into a
// separate git repo — and picks up the `inCoachApp` guard RULE 2 already learned it needed (Fourth
// false refusal, 2026-08-22: a hardcoded repo path fired regardless of which repo the commit was
// actually in — the exact shape this rule was exposed to before, since a fixed cwd means it only
// ever compared THIS repo's own index, no matter what command or repo triggered the hook).
//
// Scoped to CoachApp's own predictions, matching os-lint's stale-predictions check exactly — one
// fact, one definition. The project-label filter below stays even though every remaining row is
// already CoachApp: it costs nothing, and it is the same guard against a future non-CoachApp row
// os-lint's check already relies on.
const PRED_PATH = 'docs/predictions.jsonl'
if (/\bgit\s+commit\b/.test(bareCmd) && inCoachApp) {
  const readRepo = (envVar, gitArgs) => {
    if (process.env[envVar] !== undefined) return process.env[envVar]
    try { return execSync(gitArgs, { cwd: REPO, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }) }
    catch { return null }
  }

  const stagedText = readRepo('GUARDRAILS_PRED_STAGED', `git show :./${PRED_PATH}`)
  const headText   = readRepo('GUARDRAILS_PRED_HEAD',   `git show HEAD:./${PRED_PATH}`)

  // Any read failure means this commit does not touch predictions.jsonl (or git is unreadable
  // here). Never block on a measurement failure — that is how a guard starts refusing everything.
  if (stagedText !== null && headText !== null && stagedText !== headText) {
    const parse = t => t.split(/\r?\n/).filter(Boolean)
      .map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

    const stagedRecs = parse(stagedText)
    const headIds = new Set(parse(headText).map(p => p.id))
    // Count by ID, not by diff line. Grading REWRITES a line (outcome null -> true), so a
    // line-oriented "+" count reads every graded record as a new one and would deny the pure
    // grading commit that is this rule's only escape hatch.
    const appended = stagedRecs.filter(p => p.id && !headIds.has(p.id))

    if (appended.length) {
      // RATCHET, not a purge — the same shape os-lint's rule-0 uses, and for the same reason. The 63
      // predictions already past due on 2026-08-25 are grandfathered via state/predictions-baseline.txt.
      // Without this the rule would wall the very NEXT /save (that ritual appends predictions), and a
      // gate whose first act is to lock its owner out gets switched off rather than obeyed. The legacy
      // set stays fully visible in os-lint's stale-predictions RED; what this closes is the VALVE, so
      // the backlog can no longer regrow while it is being drained.
      let baseline = new Set()
      try {
        const bPath = process.env.GUARDRAILS_PRED_BASELINE || `${STATE}/predictions-baseline.txt`
        if (existsSync(bPath)) baseline = new Set(readFileSync(bPath, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean))
      } catch { /* an unreadable baseline must not turn into a refusal */ }

      const now = Date.now()
      const overdue = stagedRecs.filter(p =>
        (p.outcome === null || p.outcome === undefined) &&
        /coachapp/i.test(p.project || '') && p.verify_by && !baseline.has(p.id) &&
        Number.isFinite(Date.parse(p.verify_by)) && Date.parse(p.verify_by) < now)

      if (overdue.length) {
        deny(
          `NEW PREDICTION APPENDED WHILE ${overdue.length} PAST-DUE ONE(S) ARE UNGRADED.\n\n` +
          `Appending: ${appended.slice(0, 3).map(p => p.id).join(', ')}${appended.length > 3 ? ` (+${appended.length - 3})` : ''}\n` +
          `Oldest ungraded: ${overdue.slice(0, 3).map(p => `${p.id} (due ${p.verify_by})`).join(', ')}\n\n` +
          `An ungraded prediction is calibration left open, and this backlog REGENERATES — it went\n` +
          `62 -> 32 in a grading pass on 2026-08-09 and was back over 100 within two weeks. Clearing\n` +
          `it again without closing the valve just books the next clear-out.\n\n` +
          `Two ways through, both open right now:\n` +
          `  1. Grade the past-due records in this same commit — set "outcome" on each. The count is\n` +
          `     read from the STAGED file, so grading + appending together passes.\n` +
          `  2. Or commit the gradings alone first. A commit that adds no NEW id is never blocked,\n` +
          `     so the backlog can be drained in as many passes as you like.\n\n` +
          `Grade true/false on evidence (Jake confirms, or red->green does) — never to clear the gate.`
        )
      }
    }
  }
}

// Deliberately NOT a cap. The proposal was "hard cap on scope per session", and the
// measurement that should have preceded it says a cap would misfire: across the last 120
// commits, module-touching commits split 51 at one module, 16 at two, 22 at three or more.
// A "3+ modules" gate would fire on a quarter of all commits, and there is currently NO
// evidence linking module count to defect rate — so a threshold now would be a number I
// invented. Jake's standing rule, 2026-08-12: do not fix a problem that does not exist yet;
// evidence first.
//
// So this records, and standing-behaviours.mjs surfaces the running tally so scope creep is
// visible WHILE it happens rather than in hindsight. The threshold gets set when the data
// supports one, or never.
if (/\bgit\s+commit\b/.test(bareCmd)) {
  try {
    const files = execSync('git diff --cached --name-only', { cwd: REPO, encoding: 'utf8' })
      .split(/\r?\n/).filter(Boolean)
    const modules = files.filter(f => /^js\/.*\.js$/.test(f))
    mkdirSync(STATE, { recursive: true })
    appendFileSync(`${STATE}/scope.jsonl`,
      JSON.stringify({ ts: new Date().toISOString(), session: sessionId, modules, files: files.length }) + '\n')
  } catch { /* measurement must never block a commit */ }
}

// Anything not matched above proceeds untouched.
process.exit(0)

// ─── self-test ────────────────────────────────────────────────────────────────
// Not reachable in hook mode; invoked as `node guardrails.mjs --self-test` by os-lint.
// Exists because a guard that has never been shown to REFUSE is indistinguishable from
// a dead one — the single most common defect in this OS.
export function __selfTestCases () {
  return [
    { cmd: 'npx playwright test 2>&1 | tail -45', expectDeny: true, why: 'the 2026-08-22 incident verbatim' },
    { cmd: 'npx playwright test --reporter=line > out.txt 2>&1', expectDeny: false, why: 'redirect, not a pipe' },
    { cmd: 'bash scripts/checks.sh | grep FAIL', expectDeny: true, why: 'gate status masked by grep' },
    { cmd: 'git log --oneline | head -5', expectDeny: false, why: 'not a runner — normal piping must stay free' },
    { cmd: 'echo "a | b"', expectDeny: false, why: 'pipe inside a quoted string is not a pipeline' },
    { cmd: 'npm test && git push', expectDeny: false, why: '&& does not mask the status' }
  ]
}
