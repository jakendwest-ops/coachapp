#!/usr/bin/env node
// Session-root guard — added 2026-10-05 (docs/decisions.md, "The Vault severing was verified on files and never on the session's folder").
//
// THE FAILURE IT CATCHES. CoachApp's CLAUDE.md, skills (/hello-claude, /save, /multi-agent-review ...), hooks and auto-memory all load from the folder a
// session is ROOTED in. The 2026-09-15..18 severing moved all of them into the repo, which is correct - and changed nothing about where Jake's desktop
// sessions START: all 22 sessions the app lists (this one included) started in the Vision OS folder or one of its worktrees. From 2026-09-19 one such
// session ran CoachApp work for 16 days and 8 context compactions: no CLAUDE.md, no repo hooks, "Unknown skill: hello-claude" on its very first command
// (answered with a workaround instead of a stop), memory read from and written to a second, diverging folder. Nothing was ever red, because every check in
// this project looks at FILES, and none looks at WHERE THE SESSION IS.
//
// WHY A USER-LEVEL HOOK. A hook registered in the repo's .claude/settings.json only exists in a repo-rooted session - exactly the session that does not
// have the problem. This one is registered in ~/.claude/settings.json (see os-lint's `hooks` check, which goes RED if the registration is lost), so it
// fires in EVERY folder, on every start, resume, clear and context compaction.
//
// WHAT IT DOES. Silent everywhere except a session rooted in the Vault folder (or one of its worktrees). There it tells the user (systemMessage) and the
// model (additionalContext): CoachApp is not here; for any CoachApp request, move the session to the repo with mcp__ccd_directory__change_directory
// instead of working around the missing pieces - and know what a move does NOT carry. Measured 2026-10-05 in the transcript of the move itself: the shell,
// the repo's hooks and its skills followed at once; CLAUDE.md followed only at the harness's next post-compaction re-read of its instruction files (about 45
// minutes after the move took effect); the auto-memory path never did.
// So it also tells the model to read the repo's CLAUDE.md and memory index itself, to write memory only into the repo's folder, and to say that a NEW
// session started on the repo is the clean fix (and that a Terminal tab already open stays in the Vault: only new tabs follow a move). It never blocks a session (always exit 0) and logs every invocation to ~/.claude/state, which is how
// "is the hook actually wired?" is answered without waiting for a failure. (First real input, 2026-10-05: a `compact` event, cwd a backslash path.)
// REAL-SESSION TEST, repeatable: from the Vault folder run `claude -p "<question about the guard notice>" --tools "" --no-session-persistence` - the model quotes the
// notice back and the log gains a `fired: true` line (done 2026-10-05).
import { appendFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const VAULT_ROOT  = 'C:/Users/jaken/Claude'              // LINT-OK: the guard has to name the folder it refuses
const REPO_ROOT   = 'C:/Users/jaken/OneDrive/coachapp'
const REPO_MEMORY = 'C:/Users/jaken/.claude/projects/c--Users-jaken-OneDrive-coachapp/memory'
const LOG = process.env.SESSION_ROOT_GUARD_LOG || 'C:/Users/jaken/.claude/state/session-root-guard.log'

// Windows paths arrive as C:\x, c:\x, C:/x or /c/x depending on who built them; compare in one shape.
const norm = p => String(p || '').replace(/\\/g, '/').replace(/^\/([a-z])\//i, '$1:/').toLowerCase()
const inside = (cwd, root) => { const c = norm(cwd), r = norm(root); return !!c && (c === r || c.startsWith(r + '/')) }

// A hook's input arrives as JSON on stdin. Read it with a timeout: if the host ever leaves stdin open without closing it, a plain readFileSync(0) would
// block forever and stall EVERY session start on this machine (user-level hook) until the host gave up. After 1.5 s it proceeds with what it has -
// nothing - and falls back to its own working folder, which for a real hook IS the session's. Anything that is not a JSON object (`null`, `42`, `"x"`)
// counts as no input: `null.cwd` would throw, and a guard that crashes on odd input is a guard that fails every session start.
function readInput () {
  return new Promise(resolve => {
    let raw = '', settled = false
    const finish = () => {
      if (settled) return; settled = true; clearTimeout(timer)
      try { const v = JSON.parse(raw || '{}'); resolve(v && typeof v === 'object' ? v : {}) } catch { resolve({}) }
    }
    const timer = setTimeout(finish, 1500)
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', d => { raw += d }).on('end', finish).on('error', finish)
    process.stdin.resume()
  })
}

function log (entry) {
  try {
    mkdirSync(dirname(LOG), { recursive: true })
    // Bounded: this runs at every session event for the rest of the machine's life.
    try { if (statSync(LOG).size > 100_000) writeFileSync(LOG, '') } catch { /* no log yet */ }
    appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n')
  } catch { /* bookkeeping only - never fail a session start over it */ }
}

const input = await readInput()
const cwd = input.cwd || process.cwd()
const source = input.source || 'unknown'
const fired = inside(cwd, VAULT_ROOT)
log({ source, cwd: String(cwd).slice(0, 200), session: String(input.session_id || '').slice(0, 40), fired })

if (fired) {
  const context = [
    `SESSION-ROOT GUARD (CoachApp). This session's working folder is ${cwd}, inside the Vision OS Vault (${VAULT_ROOT}).`,
    `CoachApp does NOT live here. Since 2026-09-18 its repo, ${REPO_ROOT}, is its only home, and its CLAUDE.md, skills (/hello-claude, /save, /multi-agent-review ...), hooks and memory load ONLY when a session is rooted there. In a Vault-rooted session every one of them is missing and nothing says so: the first symptom is "Unknown skill: hello-claude".`,
    `If the user's request is about CoachApp in any way (hello claude, save, the app, a release, tests, bugs, docs, the wiki board, CoachApp memory): do NOT work around it with absolute paths or by reading skill files from here. Load mcp__ccd_directory__change_directory (ToolSearch, select:), call it with path ${REPO_ROOT}, tell the user the session moves when the turn ends, and end the turn.`,
    `A move carries only PART of a re-root (measured 2026-10-05): the shell, the repo's hooks and its skills follow at once; CLAUDE.md follows only when the harness next re-reads its instruction files (in that session, about 45 minutes later, at the first turn after a compaction); the auto-memory path never follows. So on the next turn, before any CoachApp work: Read ${REPO_ROOT}/CLAUDE.md and ${REPO_MEMORY}/MEMORY.md yourself, write memory notes ONLY into ${REPO_MEMORY} whatever your system prompt says, and tell the user that a NEW session started on ${REPO_ROOT} is the clean fix. Also tell them that any Terminal-panel tab already open stays in the Vault folder (only NEW tabs follow a move, and you cannot close a tab they opened): they should close it, and you can open a fresh one with open_terminal_tab.`,
    `If the request is Vision OS / Vault work and not CoachApp, carry on: this guard does not apply. Never write CoachApp notes to this folder's memory either way.`,
    `(hook source: ${source})`,
  ].join('\n')
  const out = {
    systemMessage: `CoachApp guard: this session is rooted in the Vision OS Vault (${cwd}), which is not where CoachApp lives. For CoachApp, start a NEW session on ${REPO_ROOT}. If you carry on here, the session will be moved there first - but a moved session can keep this folder's CLAUDE.md for a while and its memory folder for good, so a new one is cleaner.`,
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
  }
  // Exit only once the write has flushed: process.exit() straight after a write to a pipe can cut the output off, and the output is the whole point.
  // (A backstop timer, because a stdout that never drains must not hold the session start either.)
  setTimeout(() => process.exit(0), 3000).unref()
  process.stdout.write(JSON.stringify(out) + '\n', () => process.exit(0))
} else {
  process.exit(0)   // never block a session: speak loudly, never stop Jake working
}
