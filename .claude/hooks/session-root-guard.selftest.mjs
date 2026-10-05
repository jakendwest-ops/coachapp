// Does the session-root guard still FIRE in the Vault and stay SILENT everywhere else? (2026-10-05)
//
// The guard exists because a CoachApp session ran for 16 days rooted in the Vault folder with no sign of it. A guard that has only ever been seen
// passing is indistinguishable from a dead one, so this runs the real hook as a child process with real hook input and checks both directions:
//   - "fires": the Vault root, a Vault worktree, the same folder spelled the Git-Bash way, a lower-case drive, and a context compaction (the event that
//     re-injects a stale session's context every few days);
//   - "not misread": the repo itself, a folder that merely shares the Vault's name as a prefix, the hidden ~/.claude folder, and garbage / empty / JSON
//     `null` input - the guard's own failure mode is crying wolf in a session that is fine (or crashing on odd input), and it must never block a session.
// A positive control proves the log is written (that is how "is the hook wired?" is answered after a real session start).
//
// COST. os-lint runs every *.selftest.mjs in this folder at EVERY session start, so the one slow case (a stdin that never closes: the hook waits 1.5 s)
// is started first and runs alongside the fast ones, with its own log so it cannot race the run count below.
//
// Run: node .claude/hooks/session-root-guard.selftest.mjs     (exit 1 if any case misbehaves)
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOOK = join(HERE, 'session-root-guard.mjs')
const dir = mkdtempSync(join(tmpdir(), 'session-root-guard-'))
const LOG = join(dir, 'guard.log')

const VAULT = 'C:/Users/jaken/Claude'                    // LINT-OK: the fixture has to name the folder the guard refuses
const REPO = 'C:/Users/jaken/OneDrive/coachapp'
const REPO_MEMORY = 'C:/Users/jaken/.claude/projects/c--Users-jaken-OneDrive-coachapp/memory'

// --- the one slow case, started now so its wait overlaps everything below: a host that leaves stdin open and never closes it would stall EVERY session start
// on the machine with a blocking read; the hook must give up after ~1.5 s, exit 0 and fall back to its own folder (a neutral one here, so it stays silent).
const openRun = new Promise(resolve => {
  const t0 = Date.now()
  const child = spawn(process.execPath, [HOOK], { env: { ...process.env, SESSION_ROOT_GUARD_LOG: join(dir, 'hung.log') }, cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] })
  let out = ''
  child.stdout.on('data', d => { out += d })
  // On a hang the child must be gone before the temp folder (its cwd) is deleted, or Windows refuses the delete and the crash would hide the FAIL line.
  let killed = false
  const killer = setTimeout(() => { killed = true; child.kill() }, 8000)
  child.on('exit', code => { clearTimeout(killer); resolve({ hung: killed, code, ms: Date.now() - t0, out }) })
  // stdin is never written to and never closed
})

const run = (payload, raw) => spawnSync(process.execPath, [HOOK], {
  input: raw !== undefined ? raw : JSON.stringify(payload), encoding: 'utf8',
  // cwd: a neutral folder. With unparseable input the hook falls back to ITS OWN cwd (which, as a real hook, is the session's), so without this the
  // "garbage input" cases would pass or fail depending on where the self-test happened to be launched from - which is the very bug being guarded.
  env: { ...process.env, SESSION_ROOT_GUARD_LOG: LOG }, cwd: dir, timeout: 15000,
})

const failures = []
const check = (label, cond, detail) => { if (!cond) failures.push(`FAIL ${label}${detail ? ' - ' + detail : ''}`) }

const fires = (label, payload) => {
  const r = run(payload)
  check(`${label}: exits 0 (a guard never blocks a session)`, r.status === 0, `status ${r.status}`)
  let out = null
  try { out = JSON.parse(r.stdout) } catch { /* reported below */ }
  check(`${label}: prints one JSON object`, !!out, `stdout was: ${String(r.stdout).slice(0, 80)}`)
  if (!out) return
  const ctx = out.hookSpecificOutput && out.hookSpecificOutput.additionalContext
  check(`${label}: is a SessionStart output`, out.hookSpecificOutput && out.hookSpecificOutput.hookEventName === 'SessionStart')
  check(`${label}: tells the user (systemMessage)`, typeof out.systemMessage === 'string' && out.systemMessage.length > 20)
  check(`${label}: tells the model to move to the repo`, typeof ctx === 'string' && ctx.includes('mcp__ccd_directory__change_directory') && ctx.includes('call it with path ' + REPO))
  check(`${label}: says CoachApp is not here`, typeof ctx === 'string' && /does NOT live here/.test(ctx))
  // A move re-roots the shell, hooks and skills at once, CLAUDE.md only later and the memory path never (measured 2026-10-05): the message must not promise a clean re-root.
  check(`${label}: says what a move does NOT carry, and what to do about it`, typeof ctx === 'string'
    && ctx.includes('Read ' + REPO + '/CLAUDE.md') && ctx.includes('write memory notes ONLY into ' + REPO_MEMORY) && ctx.includes('NEW session'))
}
const silent = (label, payload, raw) => {
  const r = run(payload, raw)
  check(`${label}: exits 0`, r.status === 0, `status ${r.status}`)
  check(`${label}: prints nothing`, r.stdout.trim() === '', `stdout was: ${String(r.stdout).slice(0, 80)}`)
}

// --- fires -----------------------------------------------------------------------------------------------------------------------------------
fires('Vault root, new session', { hook_event_name: 'SessionStart', source: 'startup', cwd: 'C:\\Users\\jaken\\Claude', session_id: 's1' })
fires('Vault worktree (the app has opened ~20 sessions in these)', { hook_event_name: 'SessionStart', source: 'startup', cwd: 'C:\\Users\\jaken\\Claude\\.claude\\worktrees\\busy-nash-dcbe40' })
fires('Git-Bash spelling of the Vault', { hook_event_name: 'SessionStart', source: 'resume', cwd: '/c/Users/jaken/Claude' })
fires('lower-case drive letter', { hook_event_name: 'SessionStart', source: 'startup', cwd: 'c:\\users\\jaken\\claude\\' })
fires('context compaction in a Vault-rooted session', { hook_event_name: 'SessionStart', source: 'compact', cwd: VAULT })

// --- not misread -----------------------------------------------------------------------------------------------------------------------------
silent('the CoachApp repo itself', { hook_event_name: 'SessionStart', source: 'startup', cwd: REPO })
silent('a repo worktree', { hook_event_name: 'SessionStart', source: 'startup', cwd: REPO + '/.claude/worktrees/rpe-top-set' })
silent('a folder that only shares the Vault name as a prefix', { hook_event_name: 'SessionStart', source: 'startup', cwd: 'C:/Users/jaken/Claude-other' })
silent('the hidden ~/.claude folder', { hook_event_name: 'SessionStart', source: 'startup', cwd: 'C:/Users/jaken/.claude' })
silent('empty input', null, '')
silent('garbage input', null, 'this is not json {')
silent('JSON null (valid JSON, not an object: `null.cwd` throws)', null, 'null')

// --- positive control: the log is how "is the hook wired?" gets answered ----------------------------------------------------------------------
check('every invocation is logged (12 runs above)', existsSync(LOG) && readFileSync(LOG, 'utf8').trim().split('\n').length === 12,
  existsSync(LOG) ? `${readFileSync(LOG, 'utf8').trim().split('\n').length} lines` : 'no log file')
const lines = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l) } catch { return {} } }) : []
check('the log records which runs fired', lines.filter(l => l.fired).length === 5 && lines.filter(l => l.fired === false).length === 7,
  `fired=${lines.filter(l => l.fired).length} not=${lines.filter(l => l.fired === false).length}`)

// --- the slow case's verdict ------------------------------------------------------------------------------------------------------------------
const open = await openRun
check('an open, silent stdin does not hang the hook', !open.hung, `still running after ${open.ms} ms`)
check('...it exits 0 within a few seconds', !open.hung && open.code === 0 && open.ms < 6000, `code ${open.code}, ${open.ms} ms`)
check('...and with no input it uses its own folder (neutral here), so it stays silent', open.out.trim() === '', `stdout was: ${open.out.slice(0, 80)}`)

try { rmSync(dir, { recursive: true, force: true }) } catch { /* temp folder cleanup must never hide a verdict */ }
if (failures.length) {
  console.log(failures.join('\n'))
  console.log(`\n${failures.length} case(s) misbehaved.`)
  process.exit(1)
}
console.log('session-root-guard: fires in the Vault (5 spellings/events), silent everywhere else (7 cases), always exits 0, and logs every run.')
