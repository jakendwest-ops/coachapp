#!/usr/bin/env node
/**
 * os-lint — staleness lint for the CoachApp operating system (skills + rituals + docs).
 * Lives in coachapp/.claude/hooks/ since 2026-09-15 — the repo replaced the Vault as CoachApp's
 * system of record; see CLAUDE.md and docs/decisions.md's 2026-09-15 entry.
 *
 * Runs on SessionStart. SILENT when clean; speaks only when RED. Silence is its normal state.
 * That is deliberate: the daily-question cron died because it asked something every session.
 * A lint asks nothing.
 *
 * Everything it checks is mechanically detectable. The whole point is that something LOOKS,
 * every session, forever — because for ten days nothing did.
 *
 * Usage:
 *   node os-lint.mjs             # hook mode: print only failures (silent + exit 0 when clean)
 *   node os-lint.mjs --report    # print every check's verdict — used to PROVE a detector goes red
 *   node os-lint.mjs --self-test # point every DETECTOR at a fixture built to trip it; name any that
 *                                # stay green as DECORATIVE. Weekly; the `self-test` check nags.
 *                                # Each spec asserts a SUBSTRING of the RED message, not just that
 *                                # the check fired -- a multi-detector check stays green with one
 *                                # detector dead if you only match the check name (found 2026-08-22).
 *
 * Every input path is env-overridable (OSLINT_SKILLS, OSLINT_BUGS, OSLINT_LOG, OSLINT_STATUS,
 * OSLINT_MARKER, OSLINT_HOOKS_DIR, OSLINT_SETTINGS, OSLINT_CLAUDE_MD, OSLINT_PREDICTIONS,
 * OSLINT_SELFTEST_MARKER) — that is what makes --self-test possible. Adding a check WITHOUT an
 * override for its input makes it untestable, which is how a check quietly becomes decorative.
 *
 * Suppression: put LINT-OK on a line to exempt it (use sparingly; it is a confession, not a fix).
 */

import { readFileSync, readdirSync, existsSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync, openSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HOME     = 'C:/Users/jaken'
const STATE    = `${HOME}/.claude/state`
const REPO     = `${HOME}/OneDrive/coachapp`
const VAULT    = `${HOME}/Claude/Vault/projects/CoachApp`

// EVERY input is env-overridable, uniformly. Not a convenience — a requirement.
// Until 2026-08-21 only 3 of 15 checks had an override, so the other 12 could not be pointed at a
// fixture, so nobody could ever answer "does this check still bite?". That is precisely how
// checkGatesFired sat GREEN for weeks while being structurally incapable of failing: it was not caught
// by inspection, it was caught because Jake asked a question that forced someone to read it.
// An untestable check is a check nobody can distinguish from a decorative one. `--self-test` below
// drives these overrides to prove each detector goes RED on a corpus that should trip it.
const env      = (k, d) => process.env[k] || d
// Repointed 2026-09-15: CoachApp's repo (docs/*.md) replaced the Vault as system of record — see
// coachapp/CLAUDE.md and coachapp/docs/decisions.md's 2026-09-15 entry. VAULT/LOG stay defined
// (LOG.md still exists there, untouched) but STATUS/BUGS/ROADMAP/DATA_MODEL/CRITICAL below now
// point at the repo. The Vault's own copies are historical, not live — see the transitional caveat
// in CLAUDE.md for what (if anything) still reads them directly.
// Repointed 2026-09-15: skill-scanning checks (dead-tool-refs, dead-file-refs, skills-pii,
// retired-terms, frontmatter, mandated-dead-tools, module-count) need to see BOTH the generic
// skills that still live at the user level (sql-safety, multi-agent-review, mobile-check, ...) AND
// the 3 CoachApp-specific ones now living in this repo (hello-claude, save, run-coachapp) — missing
// this split after the move would have left those 3 skills silently unscanned by every check in
// this list, the exact "reports success while doing nothing" class this file exists to catch.
const SKILLS_DIRS = (process.env.OSLINT_SKILLS || [
  `${HOME}/.claude/skills`,
  `${REPO}/.claude/skills`,
].join(';')).split(';').filter(Boolean)
const STATUS   = env('OSLINT_STATUS',    `${REPO}/docs/current-sprint.md`)
const BUGS     = env('OSLINT_BUGS',      `${REPO}/docs/bugs`)
const LOG      = env('OSLINT_LOG',       `${VAULT}/LOG.md`)
const MARKER   = env('OSLINT_MARKER',    `${STATE}/last-full-file-review`)
// Repointed 2026-09-15: this file now lives in coachapp/.claude/hooks/ alongside guardrails.mjs —
// audits its own repo-local hooks dir, not the shared ~/.claude/hooks/ (which now holds only
// claim-check.mjs/standing-behaviours.mjs, generic hooks used across other projects too, not this
// one's concern).
const HOOKS_DIR = env('OSLINT_HOOKS_DIR', `${REPO}/.claude/hooks`)
// Every settings file whose hooks apply to a CoachApp session, in load order (user → project → local).
// Overridable as a list ONLY so checkHooks can be proven RED→GREEN against fixtures.
const SETTINGS_FILES = (process.env.OSLINT_SETTINGS || [
  `${HOME}/.claude/settings.json`,
  `${REPO}/.claude/settings.json`,
  `${REPO}/.claude/settings.local.json`,
].join(';')).split(';').filter(Boolean)
const CLAUDE_MD = env('OSLINT_CLAUDE_MD', `${REPO}/CLAUDE.md`)
const ROADMAP  = env('OSLINT_ROADMAP',   `${REPO}/docs/roadmap.md`)
// The two documents hello-claude instructs a session to read IN FULL, and the ceiling on their
// combined size. Nothing watched this until OS v3: between 2026-07-17 and 2026-08-23 STATUS.md grew
// 107k -> 208k and roadmap.md 70k -> 135k (+94% each), so every session paid ~86k tokens to read
// them and roughly half of STATUS.md turned out to be a duplicate of LOG.md. The lint had 21 checks
// and not one measured the size of what it made you read.
const CONTEXT_BUDGET = Number(env('OSLINT_CONTEXT_BUDGET', '300000'))
// The two RITUALS, budgeted separately from the Vault documents because they regrow for a different
// reason and at a different scale. Measured 2026-08-24: the v2 rebuild (2026-07-17) cut hello-claude
// 319 -> 246 lines, and five weeks later it was back to 303 — within 16 lines of where it started,
// the entire saving spent. `save` never shrank at all: 195 -> 250 -> 289, growing THROUGH the rebuild.
// Two rebuilds have now trimmed these by hand and neither trim held, because nothing measured them.
// Combined today: ~38.9k. Ceiling 44k leaves real editing room while catching another +23% run.
const RITUAL_BUDGET = Number(env('OSLINT_RITUAL_BUDGET', '44000'))

// --- Measured ceilings -------------------------------------------------------
// A ceiling picked by hand is a guess with padding. RITUAL_BUDGET was set to 44,000 while the
// rituals measured 38,856 — 5,144 bytes of headroom that licensed the exact regrowth the check
// exists to stop, and 1,257 of it was spent within a day. CONTEXT_BUDGET had the same shape, and
// 38,171 chars of the total it was policing were a stale history block STATUS.md's own masthead
// claimed to have deleted. Meanwhile every ratchet in this OS that HELD — style-baseline.json,
// rule0-baseline.txt, predictions-baseline.txt — is pinned at what was measured, not above it.
//
// So these two ceilings now derive from a measured baseline that ratchets DOWN and never up:
// every trim is locked in the moment it lands, and growth past SIZE_TOLERANCE is refused.
// Auto-tightening can only ever make the check STRICTER, so it cannot manufacture the false
// refusal that gets a rule switched off. The env budget overrides still win when set, which is
// what keeps the existing --self-test fixtures meaningful.
const SIZE_BASELINE  = env('OSLINT_SIZE_BASELINE', `${STATE}/size-baseline.json`)
const SIZE_TOLERANCE = Number(env('OSLINT_SIZE_TOLERANCE', '1.02'))  // routine edits pass; a +23% run does not

// `inputEnv` names the OSLINT_* vars that can redirect this group's INPUTS. If any is set we are
// measuring a fixture, not the real corpus, and the baseline must NOT be written.
//
// Found the hard way on the day this landed (2026-08-25): --self-test points OSLINT_STATUS and
// OSLINT_ROADMAP at 120-byte fixtures but does NOT override OSLINT_SIZE_BASELINE. Auto-tighten saw
// 120 < 229,178, decided that was an improvement, and wrote 120 into the REAL state file. The next
// real run then reported "ceiling 122" against a 235,631-char corpus. The self-test poisoned the
// thing it was testing.
//
// This is the standing lesson in its own house: a guard is subject to every failure mode it exists
// to catch, and auto-tightening -- the property that made this SAFE against false refusals -- is
// exactly what made it dangerous under fixtures. Ratchet down only on evidence from the real files.
function measuredCeiling (group, entries, override, inputEnv = []) {
  let total = 0
  const sizes = []
  for (const [label, path] of entries) {
    if (!existsSync(path)) return { missing: label, path }
    const n = statSync(path).size
    total += n
    sizes.push(`${label} ${n.toLocaleString()}`)
  }
  if (override) return { total, sizes, ceiling: override, source: 'explicit budget' }
  const synthetic = inputEnv.some(v => process.env[v])
  let base = {}
  try { base = JSON.parse(readFileSync(SIZE_BASELINE, 'utf8')) } catch { /* first run: pinned below */ }
  const prev = Number(base[group]) || 0
  if (!prev || total < prev) {
    if (synthetic) {
      // Measure and report, but never persist a fixture as the new floor.
      return { total, sizes, ceiling: Math.round(total * SIZE_TOLERANCE), source: 'fixture input — baseline NOT written' }
    }
    base[group] = total
    try { writeFileSync(SIZE_BASELINE, JSON.stringify(base, null, 2) + '\n') } catch { /* never fail over bookkeeping */ }
    return { total, sizes, ceiling: Math.round(total * SIZE_TOLERANCE),
             source: prev ? `re-pinned ${prev.toLocaleString()} -> ${total.toLocaleString()}` : `pinned at ${total.toLocaleString()}` }
  }
  return { total, sizes, ceiling: Math.round(prev * SIZE_TOLERANCE),
           source: (synthetic ? 'fixture input, ' : '') + `baseline ${prev.toLocaleString()}` }
}
const HELLO_SKILL = env('OSLINT_HELLO_SKILL', `${REPO}/.claude/skills/hello-claude/SKILL.md`)
const SAVE_SKILL  = env('OSLINT_SAVE_SKILL',  `${REPO}/.claude/skills/save/SKILL.md`)
// deploy-check/feature-audit/mobile-check each stamp one of these on completion (added 2026-09-15/16,
// see docs/technical-debt.md's 2026-09-16 update) but nothing reads them yet. See checkEventGateEvidence.
const DEPLOY_CHECK_MARKER  = env('OSLINT_DEPLOY_CHECK_MARKER',  `${STATE}/last-deploy-check-run`)
const FEATURE_AUDIT_MARKER = env('OSLINT_FEATURE_AUDIT_MARKER', `${STATE}/last-feature-audit-run`)
const MOBILE_CHECK_MARKER  = env('OSLINT_MOBILE_CHECK_MARKER',  `${STATE}/last-mobile-check-run`)
// Documents that state their own update obligation in prose. Each needs a mechanical trigger or the
// sentence is a promise nothing keeps — see checkDocObligations.
const DATA_MODEL = env('OSLINT_DATA_MODEL', `${REPO}/docs/schema.md`)
// Added 2026-09-15 per an external audit's "Quick Win": docs/*.md had zero automated growth
// monitoring, unlike every other content tier this project has ever measured (STATUS.md/roadmap.md,
// the ritual skills) — all of which eventually needed a ratchet after growing unboundedly first.
// Non-recursive by design: readdirSync without recursion naturally excludes docs/archive/ (meant to
// be large and static) and docs/bugs/ (tracked separately, expected to grow with the ledger) without
// having to hardcode an exclusion list that could drift from what's actually in those directories.
const DOCS_DIR = env('OSLINT_DOCS_DIR', `${REPO}/docs`)
const CRITICAL   = env('OSLINT_CRITICAL',   `${REPO}/docs/critical.md`)
const SQL_DIR    = env('OSLINT_SQL_DIR',    `${REPO}/scripts`)
// Overridable ONLY so a detector can be proven RED→GREEN against a fixture; defaults to the repo file.
// REPOINTED 2026-09-17: moved from the Vault into this repo (docs/predictions.jsonl, CoachApp-only
// rows) — see docs/decisions.md's 2026-09-17 entry and guardrails.mjs RULE 6's comment.
const PREDICTIONS = process.env.OSLINT_PREDICTIONS || `${REPO}/docs/predictions.jsonl`

const REPORT = process.argv.includes('--report')
const DAY = 86_400_000
const now = Date.now()

const findings = []   // { check, severity: 'RED'|'WARN', msg }
const passed = []

const red  = (check, msg) => findings.push({ check, severity: 'RED', msg })
const warn = (check, msg) => findings.push({ check, severity: 'WARN', msg })
const ok   = (check, msg) => passed.push({ check, msg })

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Every SKILL.md on disk, as { name, path, text, lines }. */
function loadSkills () {
  const out = []
  for (const dir of SKILLS_DIRS) {
    if (!existsSync(dir)) continue
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      const path = join(dir, d.name, 'SKILL.md')
      if (!existsSync(path)) continue
      const text = readFileSync(path, 'utf8')
      out.push({ name: d.name, path, text, lines: text.split(/\r?\n/) })
    }
  }
  return out
}

/** Walk a skill's lines, skipping any line the author explicitly exempted. */
function eachLine (skill, fn) {
  skill.lines.forEach((line, i) => {
    if (line.includes('LINT-OK')) return
    fn(line, i + 1)
  })
}

const skills = loadSkills()
const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : null)

// ---------------------------------------------------------------------------
// 0. Corpus guard — the VACUOUS PASS class.
//    A check that iterates an empty collection reports GREEN. loadSkills() returns [] when the skills
//    directory is missing or renamed, and six checks then loop zero times and each announce success:
//    "all 0 skills have name: + description:". Rename ~/.claude/skills and os-lint goes almost
//    entirely green while checking nothing whatsoever.
//
//    This is the same failure class as every other one found on 2026-08-21 — reports success while
//    doing nothing — and it is the most dangerous variant, because it disables the checker itself
//    rather than one rule inside it. A check must never be allowed to pass because it found nothing
//    to look at. Anything that reports "all N ..." needs N asserted non-zero somewhere.
// ---------------------------------------------------------------------------
// A self-test nobody runs is the "gate that never fires" class — the very thing this file exists to
// catch. So the normal run nags when it goes stale, exactly like full-file-review's marker, which is
// the one staleness mechanism here with a proven track record.
//   node os-lint.mjs --self-test && node -e "require('fs').writeFileSync('C:/Users/jaken/.claude/state/last-self-test', new Date().toISOString())"
const SELFTEST_MARKER = env('OSLINT_SELFTEST_MARKER', `${STATE}/last-self-test`)

// Where a background launch records that it TRIED, and where its output goes.
const SELFTEST_ATTEMPT = env('OSLINT_SELFTEST_ATTEMPT', `${STATE}/last-self-test-attempt`)
const SELFTEST_LOG     = env('OSLINT_SELFTEST_LOG',     `${STATE}/last-self-test.log`)
const SELFTEST_COOLDOWN_MIN = 45

// NAGGING WAS THE ENTIRE MECHANISM, AND IT DID NOT WORK. Measured 2026-09-06: the marker said
// 28 August — 8 days — and NOTHING anywhere invoked `--self-test`. Not a hook, not a settings entry,
// not a script; the only reference in the tree was a comment telling a human to type it. The stamping
// works (that hole was closed 2026-08-24); the RUNNING never existed. So the check that proves every
// other check can fail was itself resting on somebody remembering — os-lint's own signature defect
// class, one level up from where it had already been caught once.
//
// Not scheduled inline because it takes ~10 minutes and prints nothing until it finishes (open bug
// 2026-08-25). A ten-minute silent blocker at SessionStart would be worse than the nag it replaces.
// So it is launched DETACHED and forgotten: nothing waits, the session starts normally, and the run
// stamps its own marker if — and only if — it passes.
//
// THREE GUARDS, because a self-launching self-test is an obvious way to fork-bomb a machine:
//   - never under `--self-test` (direct recursion), and never under `--report`, which is the mode
//     the self-test's own 38-spec loop runs its children in. Without that second guard, every one of
//     those 38 spec runs would launch a full self-test of its own.
//   - a cooldown file, so a burst of sessions cannot start a dozen overlapping runs.
//   - OSLINT_NO_SELFTEST_LAUNCH=1 as an explicit off switch.
function maybeLaunchSelfTest () {
  if (REPORT || process.argv.includes('--self-test')) return null
  if (process.env.OSLINT_NO_SELFTEST_LAUNCH) return 'auto-launch is off (OSLINT_NO_SELFTEST_LAUNCH)'
  const raw = read(SELFTEST_ATTEMPT)
  const mins = raw ? (now - Date.parse(raw.trim())) / 60000 : Infinity
  if (mins < SELFTEST_COOLDOWN_MIN) {
    return `already launched ${Math.floor(mins)} min ago — probably still running (it takes ~10)`
  }
  try {
    mkdirSync(dirname(SELFTEST_ATTEMPT), { recursive: true })
    writeFileSync(SELFTEST_ATTEMPT, new Date().toISOString())
    const out = openSync(SELFTEST_LOG, 'w')
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--self-test'],
      { detached: true, stdio: ['ignore', out, out] })
    child.unref()
    return `LAUNCHED in the background just now, takes ~10 min. Output: ${SELFTEST_LOG}`
  } catch (e) {
    return `could not launch it: ${e.message}`
  }
}

function checkSelfTestFresh () {
  const raw = read(SELFTEST_MARKER)
  const age = raw ? (now - Date.parse(raw.trim())) / DAY : Infinity
  if (!(age <= 7)) {
    const launched = maybeLaunchSelfTest()
    red('self-test', `os-lint's own self-test has not run in ${raw ? Math.floor(age) + ' days' : 'ever'}.\n`
      + (launched ? `    ${launched}\n` : '    Run `node os-lint.mjs --self-test` yourself.\n')
      + '    It proves every check still fires against a fixture built to trip it, and names any that\n'
      + '    have gone DECORATIVE. gates-fired sat GREEN for weeks while incapable of failing; this is\n'
      + '    the mechanism that would have caught it unprompted.\n'
      + '    The marker stamps only on a CLEAN run, so this stays RED until it genuinely passes.')
  } else ok('self-test', `os-lint self-test ran ${Math.floor(age)} day(s) ago`)
}

// ---------------------------------------------------------------------------
// 0c. The memory system — 44 auto-memory files plus the Vault's JSONL stores, read by NO check until
//     2026-08-21. That gap was not theoretical: a hand audit that day found a memory entry that was
//     FACTUALLY FALSE (it claimed plugins do not load in this harness; superpowers is installed, listed
//     and injected at SessionStart) and 26 dangling wikilinks, 17 of them a `_` vs `-` collision between
//     filenames and their own `name:` field. Both mechanically detectable, neither watched.
//
//     Truth of a memory's CLAIM is not checkable here — that needs a human or a probe. Structure is.
// ---------------------------------------------------------------------------
const MEM_DIR   = env('OSLINT_MEM_DIR', `${HOME}/.claude/projects/c--Users-jaken-OneDrive-coachapp/memory`)
// lessons.jsonl/beliefs.jsonl stay here: `Vault/memory/` is written by the general, cross-project
// /vault-save ritual (C:\Users\jaken\Claude\.claude\commands\vault-save.md), not something CoachApp
// owns — moving them into this repo would go stale the moment another project's save appended to the
// real ones. predictions.jsonl is the one exception (see PREDICTIONS above and checkMemory below).
const VAULT_MEM = env('OSLINT_VAULT_MEM', `${HOME}/Claude/Vault/memory`)
const MEM_TYPES = ['user', 'feedback', 'project', 'reference']

/** Link targets that normalise identically are the same intended name. */
const normName = s => s.toLowerCase().replace(/[_-]/g, '')

// The repo's LIVE docs — state and plans, which must describe the world as it is now.
// LOG.md is DELIBERATELY ABSENT and must stay absent: it is a historical record, so a July entry naming
// a July-era skill or a since-deleted file is CORRECT, not stale. Measured 2026-08-21 before wiring this:
// LOG.md holds 7 retired-term references, every one of them legitimate history, while roadmap.md holds 2
// that are genuinely stale. Scanning LOG would have produced permanent unfixable noise — the alarm
// fatigue this OS guards hardest against — in exchange for nothing.
const LIVE_DOCS = env('OSLINT_LIVE_DOCS', [
  `${REPO}/docs/current-sprint.md`, `${REPO}/docs/roadmap.md`, `${REPO}/docs/critical.md`,
  `${REPO}/docs/technical-debt.md`, `${REPO}/docs/session-context.md`,
].join(';')).split(';').filter(Boolean)

/** Strip a `:123` or `:12-34` line-reference suffix. `js/app-core.js:303` names a real file. */
const stripLineRef = p => p.replace(/:\d+(-\d+)?$/, '')

function eachLiveDocLine (fn) {
  for (const path of LIVE_DOCS) {
    const text = read(path)
    if (text === null) continue
    const label = path.split('/').pop()
    text.split(/\r?\n/).forEach((line, i) => {
      if (line.includes('LINT-OK')) return
      fn(label, line, i + 1)
    })
  }
}

function checkLiveDocs () {
  const hits = []
  eachLiveDocLine((label, line, n) => {
    for (const r of RETIRED) {
      if (r.term.test(line)) hits.push(`${label}:${n} → retired ${r.since}: ${r.why}`)
    }
    for (const raw of [...(line.match(ABS_PATH) || []), ...(line.match(REL_PATH) || [])]) {
      if (/[*<>$?]/.test(raw)) continue
      if (EPHEMERAL.some(re => re.test(raw))) continue
      const bare = stripLineRef(raw)
      const p = bare.includes(':') ? bare.replace(/\\/g, '/') : join(REPO, bare)
      if (!existsSync(p)) hits.push(`${label}:${n} → names a path that does not exist: ${raw}`)
    }
  })
  if (!LIVE_DOCS.some(p => read(p) !== null)) { warn('live-docs', `none of the live docs exist: ${LIVE_DOCS.join(', ')}`); return }
  if (hits.length) {
    red('live-docs', `${hits.length} stale reference(s) in the repo's LIVE docs (STATUS/roadmap/CRITICAL — NOT LOG, which is history):\n    ` + hits.join('\n    '))
  } else ok('live-docs', `STATUS/roadmap/CRITICAL name no retired term and no dead path`)
}

function checkMemory () {
  if (!existsSync(MEM_DIR)) { warn('memory', `no memory dir at ${MEM_DIR}`); return }
  const files = readdirSync(MEM_DIR).filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
  if (!files.length) { red('memory', `${MEM_DIR} holds no memory files — every memory check below is passing over an empty set.`); return }

  const problems = []
  const names = new Map()          // name: -> filename

  for (const f of files) {
    const text = readFileSync(join(MEM_DIR, f), 'utf8')
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!fm) { problems.push(`${f} → no YAML frontmatter; invisible to every other memory check`); continue }
    const name = (fm[1].match(/^name:\s*(\S+)/m) || [])[1]
    if (!name) problems.push(`${f} → frontmatter missing name:`)
    else {
      names.set(name, f)
      // The 17 dangling links all came from this exact drift.
      if (normName(name) !== normName(f.replace(/\.md$/, ''))) {
        problems.push(`${f} → name: "${name}" does not match its filename; links written either way will dangle`)
      }
    }
    if (!/^description:/m.test(fm[1])) problems.push(`${f} → frontmatter missing description: (used to decide relevance at recall)`)
    const type = (fm[1].match(/^\s*type:\s*(\S+)/m) || [])[1]
    if (type && !MEM_TYPES.includes(type)) problems.push(`${f} → type "${type}" is not one of ${MEM_TYPES.join('/')}`)
  }

  // Wikilinks: only flag NEAR-MISSES. A link with no close match is an intentional forward-marker, which
  // the memory spec explicitly permits ("marks something worth writing later, not an error"). Flagging
  // those would cry wolf on 9 legitimate entries — alarm fatigue, the failure this OS guards hardest.
  const byNorm = new Map([...names.keys()].map(n => [normName(n), n]))
  for (const f of [...files, 'MEMORY.md']) {
    const p = join(MEM_DIR, f)
    if (!existsSync(p)) continue
    for (const l of readFileSync(p, 'utf8').match(/\[\[([^\]]+)\]\]/g) || []) {
      const target = l.slice(2, -2)
      if (names.has(target)) continue
      const near = byNorm.get(normName(target))
      if (near) problems.push(`${f} → [[${target}]] dangles, but [[${near}]] exists — a typo, not a forward-marker`)
    }
  }

  // Index consistency, both directions.
  const idx = read(join(MEM_DIR, 'MEMORY.md'))
  if (idx === null) problems.push('MEMORY.md is missing — it is the index loaded into context every session')
  else {
    const linked = new Set((idx.match(/\(([a-z0-9_.-]+\.md)\)/gi) || []).map(m => m.slice(1, -1)))
    for (const f of files) if (!linked.has(f)) problems.push(`${f} exists but has no MEMORY.md pointer — it will never be surfaced`)
    for (const l of linked) if (!existsSync(join(MEM_DIR, l))) problems.push(`MEMORY.md points at ${l}, which does not exist`)
  }

  // The memory system's JSONL ledgers: one malformed line is silently skipped by every reader.
  // predictions.jsonl moved from the Vault into this repo 2026-09-17 (CoachApp-only rows; see
  // docs/decisions.md and guardrails.mjs RULE 6) — lessons.jsonl/beliefs.jsonl stay in the Vault.
  for (const [j, path] of [
    ['lessons.jsonl', join(VAULT_MEM, 'lessons.jsonl')],
    ['beliefs.jsonl', join(VAULT_MEM, 'beliefs.jsonl')],
    ['predictions.jsonl', PREDICTIONS],
  ]) {
    const raw = read(path)
    if (raw === null) { problems.push(`${path} is missing`); continue }
    raw.split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return
      try { JSON.parse(line) } catch { problems.push(`${j}:${i + 1} → unparseable JSON; this record is invisible to every reader`) }
    })
  }

  if (problems.length) {
    red('memory', `${problems.length} memory-system problem(s):\n    ` + problems.slice(0, 15).join('\n    ')
      + (problems.length > 15 ? `\n    …and ${problems.length - 15} more` : ''))
  } else ok('memory', `memory system consistent (${files.length} files, ${names.size} named, index + 3 JSONL stores parse)`)
}

function checkCorpora () {
  const empty = []
  if (!skills.length) empty.push(`skills — none of [${SKILLS_DIRS.join(', ')}] has any SKILL.md; SIX checks (dead-tool-refs, dead-file-refs, skills-pii, retired-terms, frontmatter, mandated-dead-tools) are passing on an empty set`)
  const rows = bugRows()
  if (rows !== null && !rows.length) empty.push(`bugs — ${BUGS} exists but holds no parseable bug files; bug-files/stale-bugs/ledger-drift are passing on an empty set`)
  if (empty.length) {
    red('corpus', `${empty.length} check corpus is EMPTY — the checks that read it are passing vacuously:\n    ` + empty.join('\n    ')
      + '\n    A green verdict over zero items is not a pass, it is a checker that has been switched off.')
  } else ok('corpus', `every check corpus is non-empty (${skills.length} skills, ${(rows || []).length} bug files)`)
}

// ---------------------------------------------------------------------------
// 1. Dead tool references — a skill calling a tool that does not exist in this harness.
//    Caught nothing for 8 days while run-coachapp was 100% dead.
// ---------------------------------------------------------------------------
const DEAD_TOOLS = /\bpreview_(start|resize|screenshot|snapshot|click|fill|eval|console_logs|network|inspect)\b/

// 2026-08-21: this check used to be ONLY the regex above — nine hard-coded preview_* names. It exists
// because run-coachapp called dead preview_* tools for 8 days, and it was written to the exact shape of
// that one wound. So when hello-claude and save mandated `TodoWrite` — a tool this harness does not
// have — they sailed straight past the checker whose entire purpose is "a skill references a tool that
// does not exist". The linter had fixed the instance and not the class, which is the one rule this OS
// states twice in bold. Jake, 2026-08-21: "we have an OS lint set up so how are these being missed?"
//
// Now allowlist-based: any backticked tool-shaped name that is NOT known-real is reported. An allowlist
// fails CLOSED on a name nobody anticipated; the old denylist failed OPEN on everything it did not
// enumerate. That difference is the whole fix.
//
// Keep KNOWN_TOOLS current when the harness gains or loses a tool. A name here that no longer exists
// silently re-opens the original hole, so treat it as a real config file, not a scratch list.
const KNOWN_TOOLS = new Set([
  'Agent', 'Artifact', 'AskUserQuestion', 'Bash', 'Edit', 'Glob', 'Grep', 'PowerShell', 'Read',
  'ReportFindings', 'ScheduleWakeup', 'Skill', 'ToolSearch', 'Write',
  // deferred, fetched via ToolSearch but genuinely available
  'CronCreate', 'CronDelete', 'CronList', 'DesignSync', 'EnterPlanMode', 'EnterWorktree',
  'ExitPlanMode', 'ExitWorktree', 'Monitor', 'NotebookEdit', 'PushNotification', 'RemoteTrigger',
  'SendMessage', 'TaskOutput', 'TaskStop', 'WebFetch', 'WebSearch',
])

// Tool-SHAPED but not tools. Each needs a reason; an unexplained entry here is how an allowlist rots
// back into a denylist. Verified 2026-08-21 by enumerating every backticked CamelCase term in skills/.
const NOT_TOOLS = new Set([
  'Status',       // bug-ledger frontmatter field name
  'Reported',     // bug-ledger frontmatter field name
  'HttpListener', // .NET class in run-coachapp's PowerShell server command
  'Claude',       // the product
])

function checkDeadTools () {
  const hits = []
  for (const s of skills) eachLine(s, (line, n) => {
    const m = line.match(DEAD_TOOLS)
    if (m) hits.push(`${s.name}/SKILL.md:${n} → ${m[0]} (nonexistent preview_* tool)`)
    // Backticked, initial capital, at least one lowercase — excludes SQL keywords (`FROM`, `NULL`,
    // `USING`) and other all-caps shouting, which are never tool names.
    const seen = new Set()   // one report per NAME per line — a sentence naming it twice is one defect
    for (const raw of line.match(/`[A-Z][a-z][A-Za-z]*`/g) || []) {
      const name = raw.slice(1, -1)
      if (KNOWN_TOOLS.has(name) || NOT_TOOLS.has(name) || seen.has(name)) continue
      seen.add(name)
      hits.push(`${s.name}/SKILL.md:${n} → \`${name}\` is not a tool this harness provides`)
    }
  })
  if (hits.length) {
    red('dead-tool-refs', `${hits.length} reference(s) to tools that do not exist in this harness:\n    ` + hits.join('\n    ')
      + '\n    If the name IS real, add it to KNOWN_TOOLS. If it is not, rewrite the step — a skill that'
      + '\n    calls a tool that cannot resolve is dead code that fails silently.')
  } else ok('dead-tool-refs', `no skill references an unknown tool (${KNOWN_TOOLS.size} known)`)
}

// ---------------------------------------------------------------------------
// 1b. MANDATED tools that do not exist here — the same class as 1, one step worse.
//     checkDeadTools catches a skill CALLING a dead tool. This catches a skill REQUIRING one as a
//     mandatory step. The difference matters: a dead call fails loudly the moment it runs, but a dead
//     mandate just silently never happens, and the step it was guarding goes unguarded forever.
//
//     Found 2026-08-20. hello-claude Step 0 is "before anything else: TodoWrite one todo per step",
//     written specifically so an interrupted ritual is VISIBLY unfinished — after a 2026-07-13 session
//     where steps after an interruption silently never ran. TodoWrite does not exist in this harness.
//     So the one safeguard against silent step-dropping has itself been silently dropped, and nothing
//     noticed, in exactly the way Step 0's own comment predicts ("a checklist nobody can see is not a
//     checklist"). That session then dropped: the plain-English explanation pairing, 5 of 7 sites in a
//     fix-the-class sweep, and a stale test count in 3 files.
//
//     Add a tool here when the harness does not provide it. Remove it if that changes.
const UNAVAILABLE_TOOLS = ['TodoWrite']
const MANDATE = /\b(MUST|must|mandatory|before anything else|Step 0|required)\b/

function checkMandatedDeadTools () {
  const hits = []
  for (const s of skills) eachLine(s, (line, n) => {
    for (const t of UNAVAILABLE_TOOLS) {
      if (!line.includes(t)) continue
      if (!MANDATE.test(line)) continue
      hits.push(`${s.name}/SKILL.md:${n} → mandates ${t}, which this harness does not provide`)
    }
  })
  if (hits.length) {
    red('mandated-dead-tools', `${hits.length} skill step(s) REQUIRE a tool that does not exist here — the step silently never runs:\n    `
      + hits.join('\n    ')
      + '\n    Either provide a substitute the harness DOES have, or rewrite the step. A mandate that'
      + '\n    cannot execute is worse than no mandate: it reads as covered and is not.')
  } else ok('mandated-dead-tools', `no skill mandates an unavailable tool (${UNAVAILABLE_TOOLS.join(', ')})`)
}

// ---------------------------------------------------------------------------
// 2. Dead file references — a skill naming a path that is not on disk.
//    sql-safety has grepped js/app.js since it stopped existing on 2026-06-30.
// ---------------------------------------------------------------------------
// Longest extension first, and a trailing (?!\w) — otherwise "lessons.jsonl" greedily
// matches as "lessons.js" and the lint reports a dead file that is very much alive.
const EXT       = '(?:mjs|jsonl|json|js|sh|md|css|sql)(?!\\w)'
const ABS_PATH  = new RegExp(`[A-Z]:[\\\\/][\\w\\\\/.-]+\\.${EXT}`, 'g')
const REL_PATH  = new RegExp(`\\b(?:js|tests|scripts|css|docs)/[\\w.-]+\\.${EXT}`, 'g')

// Paths that are SUPPOSED not to exist. The throwaway ad-hoc spec is created, used and deleted
// within a single check (and is gitignored) — a skill documenting it is correct, not stale.
const EPHEMERAL = [/tests\/_adhoc\.spec\.js$/]

function checkDeadFiles () {
  const hits = []
  for (const s of skills) eachLine(s, (line, n) => {
    for (const raw of [...(line.match(ABS_PATH) || []), ...(line.match(REL_PATH) || [])]) {
      if (/[*<>$?]/.test(raw)) continue                       // globs / placeholders
      if (EPHEMERAL.some(re => re.test(raw))) continue
      const p = raw.includes(':') ? raw.replace(/\\/g, '/') : join(REPO, raw)
      if (!existsSync(p)) hits.push(`${s.name}/SKILL.md:${n} → ${raw}`)
    }
  })
  if (hits.length) red('dead-file-refs', `${hits.length} path(s) named by a skill that do not exist on disk:\n    ` + hits.join('\n    '))
  else ok('dead-file-refs', 'every path named by a skill exists')
}

// ---------------------------------------------------------------------------
// 3. PII in skills — /save pushes ~/.claude to a GitHub repo. A real client's name and
//    database UUID were version-controlled there. checks.sh only ever scanned js/.
// ---------------------------------------------------------------------------
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g
const UUID  = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const SAFE_EMAIL_DOMAIN = /@(example\.(com|org|net)|test\.|localhost)/i
const NIL_UUID = /^0{8}-0{4}-0{4}-0{4}-0{12}$/i

function checkSkillPII () {
  const hits = []
  for (const s of skills) eachLine(s, (line, n) => {
    for (const e of line.match(EMAIL) || []) {
      if (SAFE_EMAIL_DOMAIN.test(e)) continue                 // documented placeholders are fine
      hits.push(`${s.name}/SKILL.md:${n} → email ${e}`)
    }
    for (const u of line.match(UUID) || []) {
      if (NIL_UUID.test(u)) continue
      hits.push(`${s.name}/SKILL.md:${n} → uuid ${u}`)
    }
  })
  if (hits.length) {
    red('skills-pii', `${hits.length} real identifier(s) hardcoded in a skill — both skills dirs are PUSHED TO GITHUB:\n    ` + hits.join('\n    ')
      + '\n    (Use a placeholder, or read the value at runtime. Emails on example.com are exempt.)')
  } else ok('skills-pii', 'no emails or UUIDs hardcoded in any skill')
}

// ---------------------------------------------------------------------------
// 4. Module-count drift — the rituals hardcode "8 module files". starter-content.js is a
//    9th, and matches no app-*.js glob, so a change to it would never have its cache-bust checked.
// ---------------------------------------------------------------------------
function appModules () {
  const dir = join(REPO, 'js')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f.endsWith('.js')).sort()
}

function checkModuleCount () {
  const mods = appModules()
  if (!mods.length) { warn('module-count', 'could not read js/ — repo moved?'); return }
  const hits = []
  for (const s of skills) eachLine(s, (line, n) => {
    const m = line.match(/\b(\d+)\s+modules?(?:\s+files?)?\b/i)
    if (m && Number(m[1]) !== mods.length) hits.push(`${s.name}/SKILL.md:${n} → says "${m[0]}", disk has ${mods.length}`)
  })
  if (hits.length) {
    red('module-count', `module count is stale in ${hits.length} place(s). On disk (${mods.length}): ${mods.join(', ')}\n    ` + hits.join('\n    '))
  } else ok('module-count', `module count consistent (${mods.length}: ${mods.join(', ')})`)
}

// ---------------------------------------------------------------------------
// 5. Retired terms — something declared dead in one place and still instructed in another.
//    hello-claude retired the daily-question cron at line 36 and still mandated it at line 289.
//    Maintained denylist by design: when you retire something, add it here and the file can
//    never quietly contradict itself again.
// ---------------------------------------------------------------------------
const RETIRED = [
  { term: /daily[- ]question/i,  since: '2026-07-11', why: 'cron retired by Jake — do not recreate, do not ask' },
  { term: /post-build-review/i,  since: '2026-07-13', why: 'skill deleted — feature-audit subsumes it' },
  { term: /security-audit/i,     since: '2026-07-13', why: 'skill deleted — deploy-check replaced it' }
]

function checkRetired () {
  const hits = []
  for (const s of skills) eachLine(s, (line, n) => {
    for (const r of RETIRED) {
      if (r.term.test(line)) hits.push(`${s.name}/SKILL.md:${n} (retired ${r.since}: ${r.why})`)
    }
  })
  if (hits.length) red('retired-terms', `${hits.length} reference(s) to something already retired:\n    ` + hits.join('\n    '))
  else ok('retired-terms', 'no skill references a retired term')
}

// ---------------------------------------------------------------------------
// 6. Frontmatter — a skill with no name:/description: can never auto-fire.
//    post-build-review had none; it only ever ran because hello-claude told it to.
// ---------------------------------------------------------------------------
function checkFrontmatter () {
  const bad = []
  for (const s of skills) {
    const fm = s.text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!fm) { bad.push(`${s.name} → no YAML frontmatter at all`); continue }
    if (!/^name:/m.test(fm[1]))        bad.push(`${s.name} → frontmatter missing name:`)
    if (!/^description:/m.test(fm[1])) bad.push(`${s.name} → frontmatter missing description:`)
  }
  if (bad.length) red('frontmatter', `${bad.length} skill(s) can never auto-fire:\n    ` + bad.join('\n    '))
  else ok('frontmatter', `all ${skills.length} skills have name: + description:`)
}

// ---------------------------------------------------------------------------
// 7. Full-file review marker — replaces "the agent must self-assess whether it's the first
//    session of the week", a condition that never once fired in 10 days.
// ---------------------------------------------------------------------------
function checkFullFileReview () {
  if (!existsSync(MARKER)) {
    red('full-file-review', 'the weekly FULL-FILE review has never run (no marker at ~/.claude/state/last-full-file-review).\n'
      + '    The per-session grep only checks fixed patterns; the pre-push review only ever sees the DIFF.\n'
      + '    A latent bug in a module no recent session touched can sit undetected forever — that is exactly\n'
      + '    how 5 unscoped app-clients.js queries survived ~12 reviews. Run: Skill(multi-agent-review) in full-file mode.')
    return
  }
  const age = Math.floor((now - statSync(MARKER).mtimeMs) / DAY)
  if (age > 7) red('full-file-review', `the weekly FULL-FILE review last ran ${age} days ago (>7). Run multi-agent-review in full-file mode.`)
  else ok('full-file-review', `full-file review ran ${age} day(s) ago`)
}

// ---------------------------------------------------------------------------
// 8. Stale bug rows — a Jake-reported bug still open after 7 days.
//    The slow-Workouts-page report rotted for seven days and was then closed on a wrong guess.
//    Reads bugs/*.md — one file per bug — NOT a markdown table.
//
//    Until 2026-08-11 this parsed a 125-row table inside STATUS.md, and that shape produced two
//    silent failures of its own. (a) Prose containing an unescaped `|` split a row into the wrong
//    cells, so description text landed in the Status column and the row was skipped by every check
//    here — six rows were in that state. (b) The Status cell sat at the far right of lines up to
//    6,923 characters, so it went unedited when a fix was written onto the front of the row; six
//    rows said FIXED in their text and `open` in their cell, the oldest for 17 days.
//
//    Both are structural properties of "a table cell as a database field", so the table went. Each
//    bug is now bugs/NNN-slug.md with YAML frontmatter. `status` is a five-value ENUM a machine can
//    read; whatever free text a human wrote is preserved separately in `status_detail`. One
//    machine-readable fact, one human note — never one field trying to be both.
// ---------------------------------------------------------------------------
const BUG_STATUSES   = ['open', 'fixed-awaiting-jake', 'confirmed', 'deferred', 'closed']
const BUG_PRIORITIES = ['critical', 'high', 'medium', 'low', 'unset']

function bugRows () {
  if (!existsSync(BUGS)) return null
  const files = readdirSync(BUGS).filter(f => f.endsWith('.md')).sort()
  if (!files.length) return null
  const rows = []
  for (const f of files) {
    const text = read(join(BUGS, f))
    if (!text) continue
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
    if (!m) { rows.push({ file: f, malformed: 'no frontmatter' }); continue }
    const fm = {}
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^(\w+):\s*(.*)$/)
      if (kv) fm[kv[1]] = kv[2].trim().replace(/^"|"$/g, '')
    }
    rows.push({
      file: f,
      action: m[2].replace(/^\s*#[^\n]*\n/, '').trim(),
      reported: fm.reported || null,
      status: (fm.status || '').toLowerCase(),
      statusDetail: fm.status_detail || '',
      priority: (fm.priority || '').toLowerCase(),
    })
  }
  return rows
}

// ---------------------------------------------------------------------------
// 8a. Bug-file frontmatter — the new shape's own failure mode.
//     A table row could be malformed and get silently skipped. A bug FILE can be malformed the same
//     way, so the thing that replaced the fragile parser needs its own guard, or the migration just
//     moved the blind spot. A bug with an unreadable status is invisible to checkStaleBugs exactly
//     like a pipe-split row was.
// ---------------------------------------------------------------------------
function checkBugFrontmatter () {
  const rows = bugRows()
  if (rows === null) { warn('bug-files', `no bug files found at ${BUGS}`); return }
  const bad = []
  for (const r of rows) {
    if (r.malformed) { bad.push(`${r.file}: ${r.malformed}`); continue }
    if (!BUG_STATUSES.includes(r.status)) bad.push(`${r.file}: status "${r.status || '(missing)'}" is not one of ${BUG_STATUSES.join('/')}`)
    if (!BUG_PRIORITIES.includes(r.priority)) bad.push(`${r.file}: priority "${r.priority || '(missing)'}" is not one of ${BUG_PRIORITIES.join('/')}`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.reported || '')) bad.push(`${r.file}: reported "${r.reported || '(missing)'}" is not an ISO date`)
  }
  if (bad.length) {
    red('bug-files', `${bad.length} bug file(s) have unreadable frontmatter — they are INVISIBLE to every other bug check:\n    ` + bad.slice(0, 12).join('\n    '))
  } else ok('bug-files', `all ${rows.length} bug files parse (status/priority/reported valid)`)
}

function checkStaleBugs () {
  const rows = bugRows()
  if (rows === null) { warn('stale-bugs', `no bug files found at ${BUGS}`); return }
  const stale = []
  for (const r of rows) {
    if (r.malformed) continue                     // checkBugFrontmatter owns these
    if (r.status !== 'open') continue             // exact enum now, not a substring test on free text
    if (!r.reported) { stale.push(`(no reported date) ${r.file}`); continue }
    const age = Math.floor((now - Date.parse(r.reported)) / DAY)
    // Name the FILE, not a truncated prose snippet: the whole point of one-file-per-bug is that the
    // row is openable. A 90-char excerpt of a 7,000-char cell was never enough to act on.
    if (age > 7) stale.push(`${age}d old — reported ${r.reported} — ${r.file}`)
  }
  if (stale.length) {
    red('stale-bugs', `${stale.length} reported bug(s) still OPEN after 7+ days:\n    ` + stale.join('\n    ')
      + '\n    A Jake-reported item closes ONLY on (a) Jake confirming it, or (b) a test that went red before the fix and green after.')
  } else ok('stale-bugs', `no reported bug open longer than 7 days (${rows.length} rows scanned)`)
}

// ---------------------------------------------------------------------------
// 8b2. Closure candidates — put the specs to work on the ledger. Added OS v3, 2026-08-25 (plan R4).
//
//      THE PROBLEM THIS SOLVES IS NOT "too many open rows". It is that the closure rule has TWO
//      doors and only one is ever used. The rule reads: a Jake-reported item closes only on (a) Jake
//      confirming it, or (b) a test that went RED before the fix and GREEN after. Clause (b) has been
//      available the whole time; the repo now holds 83 spec files, many written red-before against
//      exactly these rows — and THREE rows in the ledger's entire history have ever reached `closed`.
//      86 sit `fixed-awaiting-jake` at a median age of ~30 days, all waiting on one person.
//
//      A working escape hatch that nothing uses is the same defect shape as a decorative check.
//
//      SURFACING, NOT CLOSING. This deliberately does not close anything. A spec citing a row's date
//      is EVIDENCE THAT MAY EXIST, not proof it went red before the fix — and auto-closing on a date
//      match would be exactly the "inference, not evidence" the closure rule was written to stop
//      (a row was closed on a guess on 2026-07-06 and Jake re-reported it, still broken, a week
//      later). What this does is hand over a short list with the candidate spec attached, so the
//      question becomes "does this spec cover this row?" instead of "what are these 86 rows?".
//
//      WARN, not RED. There are already two permanent REDs, and alarm fatigue is the failure mode
//      this OS guards hardest. This is a to-do list with its evidence attached; it shrinks as rows
//      close, which is the property a nag does not have.
const TESTS = env('OSLINT_TESTS', `${REPO}/tests`)
function checkClosureCandidates () {
  const rows = bugRows()
  if (rows === null) return                         // checkStaleBugs already warned
  if (!existsSync(TESTS)) { warn('closure-candidates', `tests dir not found: ${TESTS}`); return }

  let specs = []
  try { specs = readdirSync(TESTS).filter(f => /\.spec\.js$/i.test(f)) } catch { return }
  if (!specs.length) { warn('closure-candidates', `no spec files found in ${TESTS}`); return }

  // MATCH ON THE ROW'S SUBJECT, NOT ITS DATE. The first version of this check matched a spec that
  // cited the row's `reported` date, and produced 103 candidates averaging seven specs each —
  // unusable, and worse than nothing, because a list nobody can act on trains you to skip the list.
  // 79 of 83 spec files carry SOME 2026-0X-XX date, so a date match is very nearly "any spec".
  // Matching the slug phrase instead yields 17 of 177 rows: sparse enough to open one by one.
  // (Loose greps have produced three wrong conclusions in this project already — "fail" matching
  //  "test-failed-1.png" among them — so the sparseness IS the evidence the pattern is discriminating.)
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const specText = new Map()
  for (const s of specs) {
    try { specText.set(s, norm(readFileSync(join(TESTS, s), 'utf8'))) } catch { /* unreadable spec */ }
  }

  const candidates = []
  for (const r of rows) {
    if (r.malformed) continue
    if (r.status !== 'open' && r.status !== 'fixed-awaiting-jake') continue
    if (!r.reported) continue
    if (Math.floor((now - Date.parse(r.reported)) / DAY) <= 7) continue

    // The id minus its date prefix, first three words — long enough to be distinctive, short enough
    // to survive the row being renamed slightly. Skip rows whose slug is too short to discriminate.
    const slug = String(r.id || r.file.replace(/\.md$/, '')).replace(/^\d{4}-\d{2}-\d{2}-/, '')
    const phrase = norm(slug.split('-').slice(0, 3).join(' '))
    if (phrase.length < 12) continue

    const hits = [...specText].filter(([, t]) => t.includes(phrase)).map(([s]) => s)
    // A phrase matching a fifth of the suite is not evidence about THIS row, it is a common word.
    // `app workouts js` matched 22 specs on the real corpus — a lead that costs more to dismiss than
    // it saves. Discrimination is the whole value here; an undiscriminating hit is noise wearing a
    // citation.
    if (hits.length > 5) continue
    if (hits.length) candidates.push(`${r.file}\n        └─ cited by: ${hits.slice(0, 3).join(', ')}${hits.length > 3 ? ` (+${hits.length - 3} more)` : ''}`)
  }

  if (!candidates.length) {
    ok('closure-candidates', 'no ageing ledger row has a spec naming its subject')
    return
  }
  const shown = candidates.slice(0, 10)
  const more = candidates.length > 10 ? `\n    …and ${candidates.length - 10} more` : ''
  warn('closure-candidates',
    `${candidates.length} ageing row(s) name a spec that may already carry clause (b) evidence:\n    ` +
    shown.join('\n    ') + more +
    '\n    Open the spec. If it went RED before the fix and GREEN after, the row closes NOW and' +
    '\n    `closed_by:` names that spec. If it does not cover the row, leave it open — a date match' +
    '\n    is a lead, never a closure. Only Jake or red→green evidence closes a row.')
}

// ---------------------------------------------------------------------------
// 8c. Deferred CRITICALS — the memory hole. Added OS v3, 2026-08-24.
//     `deferred` means "Jake decided not now". It does NOT mean "resolved", but it removes the row
//     from every view: checkStaleBugs only counts `open`, so a scan for open+critical rows returns
//     ZERO while a critical row sits right there. That is exactly what happened to
//     bugs/2026-08-11-gdpr-no-consent-capture-…: a live UK GDPR consent gap on special-category
//     health data, with a real beta tester already onboarded under it, invisible to the ledger's own
//     reporting since 2026-08-19 — and roadmap.md meanwhile still described it as `open`.
//
//     WARN, deliberately, not RED. Jake made this call knowingly and RED every session would be pure
//     alarm fatigue — the failure mode this OS worries about most. The job here is VISIBILITY of a gap
//     being carried on purpose, not a demand for action. A deferred critical should never be able to
//     go quiet just because someone chose to postpone it.
// ---------------------------------------------------------------------------
function checkDeferredCriticals () {
  const rows = bugRows()
  if (rows === null) return                       // checkStaleBugs already warned
  const carried = rows
    .filter(r => !r.malformed && r.status === 'deferred' && r.priority === 'critical')
    .map(r => {
      const age = r.reported ? `${Math.floor((now - Date.parse(r.reported)) / DAY)}d` : '(no date)'
      const why = r.statusDetail ? ` — ${r.statusDetail.slice(0, 120)}` : ''
      return `${age} — ${r.file}${why}`
    })
  if (carried.length) {
    warn('deferred-criticals', `${carried.length} CRITICAL bug(s) deferred — carried on purpose, still live:\n    ` + carried.join('\n    ')
      + '\n    `deferred` is not `closed`. These are invisible to stale-bugs (it counts only `open`),\n'
      + '    so this line is the only place they surface. Only Jake may un-defer one.')
  } else ok('deferred-criticals', 'no critical bug is sitting deferred')
}

// ---------------------------------------------------------------------------
// 8b. Ledger status drift — the row's TEXT says the bug is fixed, but its STATUS cell still
//     says "open". Two representations of one fact, and until 2026-08-09 nothing made them agree.
//
//     How this bit: when a bug gets fixed, the session writes "✅ FIXED + LIVE <commit>" onto the
//     FRONT of the row's description (that's the convention, and /save prompts for the writeup) —
//     but the Status cell is a separate edit, at the far right of a line that is often 3,000+
//     characters. It gets skipped. A human reading the row sees "fixed"; checkStaleBugs reads the
//     cell and counts it OPEN. On 2026-08-09 six rows were in this state, the oldest fixed on
//     2026-07-23 — 17 days of a RED count inflated by already-done work, which is exactly how the
//     genuinely-open rows got buried. Alarm fatigue is the real damage: a health check that is
//     always red stops being read.
//
//     Deliberately NOT flagged: "HALF FIXED" (one half shipped, the other genuinely open) and rows
//     whose text explicitly says the fix was insufficient — those are correctly `open`.
//     This does not close anything. It only says the two fields disagree; a Jake-reported item
//     still closes ONLY by his confirmation or a red→green test.
// ---------------------------------------------------------------------------
const CLAIMS_FIXED   = /(?:FIXED \+ LIVE|SHIPPED LIVE|SHIPPED \(LOCAL MERGE ONLY\)|ALREADY FIXED|CONFIRMED (?:ALREADY )?FIXED|FIXED \+ CONFIRMED)/i
const PARTIAL_ONLY   = /HALF (?:FIXED|SHIPPED)|PARTIALLY FIXED/i
const CONTRADICTS    = /still (?:open|broken|not )|was (?:real but )?(?:incomplete|insufficient)|NOT FIXED|remains open|do not run|CONFLICTS WITH/i

function checkLedgerStatusDrift () {
  const rows = bugRows()
  if (rows === null) { warn('ledger-drift', `no bug files found at ${BUGS}`); return }
  const drift = []
  for (const r of rows) {
    if (r.malformed) continue
    if (r.status !== 'open') continue
    // Only the LEADING banner counts. The convention is that a fix is written onto the FRONT of the
    // row ("✅ FIXED + LIVE <commit>"), so scanning the whole body matches any prose that merely CITES
    // another commit's fix as context — e.g. "a different instance of the class that d4b2689 already
    // fixed", which is a correctly-OPEN row. That false positive fired on the very first outside use of
    // this check (2026-08-12 architecture audit). A health check that cries wolf is how alarm fatigue
    // starts, which is the thing ledger-drift exists to prevent.
    if (!CLAIMS_FIXED.test(r.action.slice(0, 400))) continue
    if (PARTIAL_ONLY.test(r.action)) continue      // half-done rows are correctly still open
    if (CONTRADICTS.test(r.action)) continue       // text itself says it is not actually resolved
    drift.push(`${r.file} (reported ${r.reported || 'no date'})`)
  }
  if (drift.length) {
    red('ledger-drift', `${drift.length} ledger row(s) claim FIXED in their text but are still marked "open":\n    ` + drift.join('\n    ')
      + '\n    These inflate the stale-bugs count and bury the genuinely-open rows. Verify each against the cited'
      + '\n    commit, then set `status: fixed-awaiting-jake` in its frontmatter. That is a relabel, NOT a close.')
  } else ok('ledger-drift', `no ledger row contradicts its own status cell (${rows.length} rows scanned)`)
}

// ---------------------------------------------------------------------------
// 9. Gate-never-fired — a mandatory gate with zero evidence in the LOG since it was created
//    is dead. Fix it or delete it. Do not keep claiming it runs.
// ---------------------------------------------------------------------------
const GATES = [
  // Hyphenated form added 2026-08-21: the skill is literally NAMED `multi-agent-review`, so the pattern
  // could not match the canonical spelling of the thing it tracks — only the prose variant with a space.
  { id: 'multi-agent-review', pattern: /multi-agent[- ]review|3-agent review|multi_agent_review/i },
  { id: 'feature-audit',      pattern: /feature-audit|feature audit/i },
  { id: 'mobile-check',       pattern: /mobile-check|mobile check|390|480/i },
  { id: 'deploy-check',       pattern: /deploy-check|\/deploy-check/i }
  // `full-file-review` was tracked here until OS v3 (2026-08-23) and was REMOVED, not lost.
  // It is the one gate with a real artifact — state/last-full-file-review, written by the ritual —
  // and checkFullFileReview() reads it directly on a 7-day window. Tracking the same fact a second
  // way, by grepping LOG.md prose over a 5-session window, produced exactly the drift this OS already
  // has a memory about (feedback-two-fields-one-fact): on 2026-08-23 the marker said GREEN (6 days)
  // while this said RED ("decaying") for the same day. Two detectors, one fact, nothing forcing
  // agreement — inside the lint whose whole job is detecting decay.
  // The marker wins because it records the ACT; a prose mention only records that someone wrote
  // about it. Every other gate here lacks an artifact, which is why they still grep.
]

// Sessions to look back over. Not 1: a gate that legitimately had nothing to do (no UI change → no
// mobile-check) would go RED every quiet session, and a check that cries wolf is how alarm fatigue
// starts — the failure this OS worries about most. Not all-history either (see below). 5 sessions is
// long enough that any gate still in real use appears, short enough to catch decay within ~a week.
const GATE_WINDOW = 5

// ---------------------------------------------------------------------------
// 9b. Hook wiring — the gap the 2026-08-21 audit found in os-lint ITSELF.
//     os-lint read zero settings files. So a hook registered with a typo'd path, a hook script on disk
//     nobody registered, or a settings file with a JSON syntax error were all invisible — forever.
//     That is the same silent-no-op class as a skill mandating a tool the harness lacks: it reports
//     success while doing nothing. A broken settings.json is the worst of the three, because Claude
//     Code silently disables EVERY setting from that file, including the hooks meant to catch decay.
// ---------------------------------------------------------------------------
function checkHooks () {
  const problems = []
  const registered = new Set()
  let filesRead = 0

  for (const file of SETTINGS_FILES) {
    const raw = read(file)
    if (raw === null) continue            // absent is fine — settings.local.json is optional
    filesRead++
    let cfg
    try { cfg = JSON.parse(raw) } catch (e) {
      problems.push(`${file} → INVALID JSON (${e.message.slice(0, 60)}). Claude Code silently ignores EVERY setting in this file, hooks included.`)
      continue
    }
    for (const [event, groups] of Object.entries(cfg.hooks || {})) {
      for (const g of groups || []) {
        for (const h of g.hooks || []) {
          if (h.type !== 'command' || !h.command) continue
          // Commands look like: "<node.exe>" "<script>". Pull out anything script-shaped and verify it.
          const tokens = h.command.match(/"[^"]+"|\S+/g) || []
          for (const t of tokens) {
            const p = t.replace(/^"|"$/g, '')
            if (!/\.(mjs|cjs|js|sh|ps1)$/i.test(p)) continue
            registered.add(p.replace(/\\/g, '/').toLowerCase())
            if (!existsSync(p)) problems.push(`${file} → ${event} hook points at a script that does not exist: ${p}`)
          }
        }
      }
    }
  }

  // The reverse direction: a hook script sitting in hooks/ that nothing invokes is dead weight, and
  // (worse) reads as active coverage to anyone browsing the directory.
  if (existsSync(HOOKS_DIR)) {
    for (const f of readdirSync(HOOKS_DIR).filter(f => /\.(mjs|cjs|js|sh|ps1)$/i.test(f))) {
      // *.selftest.mjs is legitimately unregistered — it is not a hook, it PROVES a hook can refuse.
      // An exemption that buys coverage rather than a hole: checkHookSelfTests requires each one to
      // have a matching hook AND runs it, so an exempted file cannot quietly rot.
      if (/\.selftest\.(mjs|cjs|js)$/i.test(f)) continue
      const full = `${HOOKS_DIR}/${f}`.toLowerCase()
      if (!registered.has(full)) problems.push(`hooks/${f} exists on disk but is registered in NO settings file — dead weight, or a registration that was lost.`)
    }
  }

  if (!filesRead) { warn('hooks', `no settings file found at any of: ${SETTINGS_FILES.join(', ')}`); return }
  if (problems.length) {
    red('hooks', `${problems.length} hook-wiring problem(s) — these fail SILENTLY, which is why nothing noticed:\n    ` + problems.join('\n    '))
  } else ok('hooks', `all registered hooks resolve, and every script in hooks/ is registered (${filesRead} settings file(s))`)
}

function checkGatesFired () {
  const log = read(LOG)
  if (!log) { warn('gates-fired', 'could not read LOG.md'); return }

  // Until 2026-08-21 this tested each pattern against the WHOLE of LOG.md — all 3,054 lines of
  // project history. One occurrence in July kept it green forever, so the check was structurally
  // incapable of failing and had been reporting GREEN while gates went unrun. It was the only check
  // in os-lint that looks at BEHAVIOUR rather than artifacts, and it was decorative.
  // Jake, 2026-08-21: "how is it possible for the OS to skip steps it has committed to a ritual".
  // This was a large part of the answer.
  const entries = log.split(/^## /m).slice(1)          // newest-first; [0] is the latest session
  if (!entries.length) { warn('gates-fired', 'LOG.md has no "## " session entries to scan'); return }
  const window = entries.slice(0, GATE_WINDOW).join('\n')
  const scanned = Math.min(entries.length, GATE_WINDOW)

  const dead = GATES.filter(g => !g.pattern.test(window)).map(g => g.id)
  const everFired = GATES.filter(g => dead.includes(g.id) && g.pattern.test(log)).map(g => g.id)
  const neverFired = dead.filter(id => !everFired.includes(id))

  if (dead.length) {
    const lines = []
    if (neverFired.length) lines.push(`NEVER fired in all of LOG.md: ${neverFired.join(', ')} — dead. Fix it or delete it.`)
    if (everFired.length) lines.push(`fired historically but NOT in the last ${scanned} session(s): ${everFired.join(', ')} — decaying.`)
    red('gates-fired', `${dead.length} mandatory gate(s) have no recent trace in LOG.md:\n    ` + lines.join('\n    ')
      + `\n    A gate is only real if it keeps running. "It ran once in July" is not evidence it runs now.`)
  } else ok('gates-fired', `all ${GATES.length} tracked gates fired within the last ${scanned} session(s)`)
}

// ---------------------------------------------------------------------------
// 10. coachapp/CLAUDE.md — the repo's auto-loaded grounding file (added 2026-07-17). It is the ONE
//     in-repo doc that loads without the hello-claude ritual, so it must not silently rot. It is not a
//     skill, so the skill-scanning checks above never touch it; scan it explicitly for the same drift
//     classes: existence, module-count/list drift vs disk, dead file refs, dead preview_* tool refs.
// ---------------------------------------------------------------------------
function checkClaudeMd () {
  const text = read(CLAUDE_MD)
  if (text === null) {
    red('claude-md', 'coachapp/CLAUDE.md is missing — it is the only in-repo grounding that loads '
      + 'without hello-claude (bare `claude`, standalone CLI, a subagent, a collaborator all rely on it).')
    return
  }
  const mods = appModules()
  const hits = []
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes('LINT-OK')) return
    const n = i + 1
    const t = line.match(DEAD_TOOLS)
    if (t) hits.push(`:${n} → dead tool ${t[0]}`)
    const mc = line.match(/\b(\d+)\s+modules?(?:\s+files?)?\b/i)
    if (mc && mods.length && Number(mc[1]) !== mods.length) hits.push(`:${n} → says "${mc[0]}", disk has ${mods.length}`)
    for (const raw of line.match(/\bjs\/[\w.-]+\.js\b/g) || []) {
      if (!existsSync(join(REPO, raw))) hits.push(`:${n} → dead file ${raw}`)
    }
  })
  // List-completeness: every module on disk must be named somewhere in the file (a new 10th module
  // that nobody adds here is exactly the drift this guards against).
  for (const m of mods) {
    const stem = m.replace(/\.js$/, '')
    if (!text.includes(stem)) hits.push(`module "${stem}" exists on disk but is not mentioned`)
  }
  if (hits.length) red('claude-md', `coachapp/CLAUDE.md has drifted from the repo:\n    ` + hits.join('\n    '))
  else ok('claude-md', `coachapp/CLAUDE.md present and consistent (${mods.length} modules named)`)
}

// ---------------------------------------------------------------------------
// 11. Stale predictions — a CoachApp prediction past its verify_by date and still ungraded
//     (outcome:null). Replaces hello-claude's manual "Step 8 — Predictions", a grep nobody acted
//     on: it left 16 CoachApp predictions overdue and ungraded, some by 12 days. Calibration only
//     works if the loop closes — an ungraded prediction past its date is the loop left open. Grade
//     each true/false with Jake (the closure rule applies: Jake confirms, or red/green evidence
//     does), then set "outcome". Scoped to CoachApp's own predictions — PTHub ended 2026-09-15;
//     grading a dead project's predictions is exactly the theatre this move is meant to kill.
// ---------------------------------------------------------------------------
function checkStalePredictions () {
  const text = read(PREDICTIONS)
  if (text === null) { warn('stale-predictions', `could not read ${PREDICTIONS}`); return }
  const due = []
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    let p
    try { p = JSON.parse(t) } catch { warn('stale-predictions', `unparseable line skipped: ${t.slice(0, 60)}`); continue }
    if (p.outcome !== null && p.outcome !== undefined) continue           // already graded
    if (!/coachapp/i.test(p.project || '')) continue                      // CoachApp only; PTHub ended 2026-09-15
    if (!p.verify_by) continue
    const dueMs = Date.parse(p.verify_by)
    if (Number.isNaN(dueMs) || dueMs > now) continue                      // not due yet
    due.push({ age: Math.floor((now - dueMs) / DAY), id: p.id || '(no id)', verify_by: p.verify_by,
               claim: (p.claim || '').replace(/[*`]/g, '').slice(0, 90) })
  }
  if (!due.length) { ok('stale-predictions', 'no CoachApp prediction is past its verify_by date ungraded'); return }
  due.sort((a, b) => b.age - a.age)
  const shown = due.slice(0, 8).map(d => `${d.age}d overdue — ${d.id} (by ${d.verify_by}) — ${d.claim}`)
  const more = due.length > shown.length ? `\n    …and ${due.length - shown.length} more` : ''
  red('stale-predictions', `${due.length} CoachApp prediction(s) past verify_by and still ungraded:\n    ` + shown.join('\n    ') + more
    + '\n    Grade each true/false (Jake confirms, or red→green evidence does), then set "outcome". An ungraded prediction is calibration left open.')
}

// ---------------------------------------------------------------------------
// Self-test — "does this alarm still have batteries?"
// ---------------------------------------------------------------------------
// Every check here inspects an artifact. None of them could, until now, be asked whether they still
// WORK. checkGatesFired sat GREEN for weeks while structurally incapable of failing; it was not found
// by inspection, it was found because Jake asked a question that forced someone to read the source.
// That is not a repeatable discovery process.
//
// This drives each check against a fixture built to trip it, and reports any check that stays GREEN as
// DECORATIVE. A decorative check is worse than a missing one: it occupies the slot where a real check
// would go, and reports success while doing nothing — the failure class behind every single problem
// found on 2026-08-21.
//
// Run: node os-lint.mjs --self-test
function runSelfTest () {
  const SELF = fileURLToPath(import.meta.url)
  const root = mkdtempSync(join(tmpdir(), 'oslint-selftest-'))

  // Snapshot real persisted state BEFORE anything runs. Taken here, not in the purity block below,
  // because the SPEC LOOP ITSELF is a fixture run: on a build where the write-guard is broken, the
  // context-budget spec poisons size-baseline.json before the purity block ever looks at it. Snapping
  // late meant recording the already-corrupted value as "the good one" and then reporting
  // "State was restored" while leaving it corrupted — a false claim inside the very assertion that
  // exists to catch false claims. Found 2026-08-25 by the red-before run, and invisible on a green
  // one, because with the guard intact nothing writes and every snapshot looks identical.
  const baselineAtStart = existsSync(SIZE_BASELINE) ? readFileSync(SIZE_BASELINE, 'utf8') : null

  // Build a fixture skills dir with one skill whose body is `body`.
  const skillDir = (name, body) => {
    const d = join(root, name, 'skills', 'probe')
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'SKILL.md'), body)
    return join(root, name, 'skills')
  }
  const file = (name, content) => {
    const p = join(root, name)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, content)
    return p
  }
  const bugDir = (name, fname, content) => {
    const d = join(root, name, 'bugs')
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, fname), content)
    return d
  }
  // A scripts/ dir holding one migration provably NEWER than the doc that must track it. mtimes are
  // set explicitly rather than relying on creation order — both files can land in the same millisecond,
  // which would make the fixture pass by accident and report the detector DECORATIVE for the wrong reason.
  // A CRITICAL.md provably OLDER than a bugs/ file whose name matches a tracked security class.
  // The bug file carries valid frontmatter so it parses as a real row rather than being skipped as
  // malformed — a fixture the parser rejects would prove nothing about the detector under test.
  const criticalOlderThanBug = () => {
    const d = join(root, 'critbugs', 'bugs')
    mkdirSync(d, { recursive: true })
    const bug = join(d, '2026-08-20-stored-xss-probe.md')
    writeFileSync(bug, '---\nid: 2026-08-20-stored-xss-probe\nstatus: confirmed\npriority: high\nreported: 2026-08-20\n---\n\n# probe\n')
    const crit = join(root, 'critbugs', 'CRITICAL.md')
    writeFileSync(crit, '# CRITICAL\n\n_Changes append to the timeline block at the bottom._\n\n## Timeline\n- 2026-07-28: probe\n')
    const critTime = new Date(now - 30 * DAY)
    utimesSync(crit, critTime, critTime)
    const bugTime = new Date(now - 2 * DAY)
    utimesSync(bug, bugTime, bugTime)
    return crit
  }
  const sqlDirNewerThan = (docPath) => {
    const d = join(root, 'sqlnewer')
    mkdirSync(d, { recursive: true })
    const sql = join(d, '2026-08-23-probe-migration.sql')
    writeFileSync(sql, 'alter table clients add column probe boolean;\n')
    const docTime = new Date(now - 10 * DAY)
    utimesSync(docPath, docTime, docTime)
    const sqlTime = new Date(now - 1 * DAY)
    utimesSync(sql, sqlTime, sqlTime)
    return d
  }
  // A memory corpus carrying the real drift: name: not matching its filename (the exact collision that
  // produced 17 dangling links on 2026-08-21), plus an index pointing at a file that does not exist.
  // ONE defect per fixture. The previous version planted a name/filename mismatch AND a ghost index
  // entry in the same corpus, so neutering either detector left the other firing and the self-test
  // still said BITES. A fixture that trips two detectors cannot prove either one.
  const memDir = (name, files, index) => {
    const d = join(root, name, 'memory')
    mkdirSync(d, { recursive: true })
    for (const [fname, body] of Object.entries(files)) writeFileSync(join(d, fname), body)
    writeFileSync(join(d, 'MEMORY.md'), index)
    return d
  }
  // A memory file with nothing wrong with it — the baseline every single-defect fixture builds on, so
  // the corpus is never empty (which would trip a different branch again).
  const memOK = (nm) => ['feedback_' + nm + '.md', `---\nname: feedback-${nm}\ndescription: d\nmetadata:\n  type: feedback\n---\nbody\n`]
  const memIndex = (...names) => names.map(n => `- [X](feedback_${n}.md)\n`).join('')
  const FM = '---\nname: probe\ndescription: probe\n---\n'
  const OLD = '2026-01-01'

  const specs = [
    // EVERY spec carries `expect` — the substring the RED message must contain. That is what makes the
    // spec prove a DETECTOR rather than a check. A spec without it is reported DECORATIVE by design.
    // Multi-detector checks get one spec each; `name` disambiguates them in the output.
    { check: 'self-test', expect: 'has not run in',
      env: { OSLINT_SELFTEST_MARKER: join(root, 'no-selftest-marker') } },

    { check: 'live-docs', name: 'live-docs/retired-term', expect: 'retired 2026-07-13',
      env: { OSLINT_LIVE_DOCS: file('ld1.md', 'Run the post-build-review skill.') } },
    { check: 'live-docs', name: 'live-docs/dead-path', expect: 'names a path that does not exist',
      env: { OSLINT_LIVE_DOCS: file('ld2.md', 'See `js/does-not-exist.js` for detail.') } },

    { check: 'memory', name: 'memory/name-mismatch', expect: 'does not match its filename',
      env: { OSLINT_MEM_DIR: memDir('m1',
        { 'feedback_probe_file.md': '---\nname: feedback-totally-different\ndescription: d\nmetadata:\n  type: feedback\n---\nb\n' },
        '- [X](feedback_probe_file.md)\n') } },
    { check: 'memory', name: 'memory/ghost-index', expect: 'points at',
      env: { OSLINT_MEM_DIR: memDir('m2', Object.fromEntries([memOK('ok')]),
        memIndex('ok') + '- [Ghost](feedback_ghost.md)\n') } },
    { check: 'memory', name: 'memory/no-pointer', expect: 'has no MEMORY.md pointer',
      env: { OSLINT_MEM_DIR: memDir('m3', Object.fromEntries([memOK('ok'), memOK('orphan')]), memIndex('ok')) } },
    { check: 'memory', name: 'memory/near-miss-link', expect: 'a typo, not a forward-marker',
      env: { OSLINT_MEM_DIR: memDir('m4',
        { 'feedback_ok.md': '---\nname: feedback-ok\ndescription: d\nmetadata:\n  type: feedback\n---\nSee [[feedback_ok]].\n' },
        memIndex('ok')) } },
    { check: 'memory', name: 'memory/bad-type', expect: 'is not one of user/feedback',
      env: { OSLINT_MEM_DIR: memDir('m5',
        { 'feedback_ok.md': '---\nname: feedback-ok\ndescription: d\nmetadata:\n  type: nonsense\n---\nb\n' },
        memIndex('ok')) } },
    { check: 'memory', name: 'memory/jsonl-unparseable', expect: 'unparseable JSON',
      env: { OSLINT_MEM_DIR: memDir('m6', Object.fromEntries([memOK('ok')]), memIndex('ok')),
             OSLINT_VAULT_MEM: (() => { const d = join(root, 'vm'); mkdirSync(d, { recursive: true })
               for (const j of ['lessons.jsonl', 'beliefs.jsonl']) writeFileSync(join(d, j), '{}\n')
               return d })(),
             OSLINT_PREDICTIONS: file('bad-predictions.jsonl', '{ this is not json\n') } },

    { check: 'corpus', name: 'corpus/skills-empty', expect: 'passing on an empty set',
      env: { OSLINT_SKILLS: join(root, 'nope') } },

    { check: 'dead-tool-refs', name: 'dead-tools/preview_*', expect: 'nonexistent preview_* tool',
      env: { OSLINT_SKILLS: skillDir('dt1', FM + 'Then call preview_screenshot to look.\n') } },
    { check: 'dead-tool-refs', name: 'dead-tools/unknown-name', expect: 'is not a tool this harness provides',
      env: { OSLINT_SKILLS: skillDir('dt2', FM + 'Call `FakeTool` to do it.\n') } },

    { check: 'mandated-dead-tools', expect: 'which this harness does not provide',
      env: { OSLINT_SKILLS: skillDir('md', FM + 'You MUST use TodoWrite first.\n') } },
    { check: 'dead-file-refs', expect: 'do not exist on disk',
      env: { OSLINT_SKILLS: skillDir('df', FM + 'Read `C:/definitely/not/here.md` first.\n') } },
    { check: 'skills-pii', expect: 'PUSHED TO GITHUB',
      env: { OSLINT_SKILLS: skillDir('pii', FM + 'Email nobody@example-real.com about it.\n') } },
    { check: 'module-count', expect: 'module count is stale',
      env: { OSLINT_SKILLS: skillDir('mc', FM + 'There are 3 modules in js/.\n') } },
    { check: 'retired-terms', expect: 'already retired',
      env: { OSLINT_SKILLS: skillDir('rt', FM + 'Run the daily-question cron.\n') } },

    { check: 'frontmatter', name: 'frontmatter/missing-name', expect: 'frontmatter missing name:',
      env: { OSLINT_SKILLS: skillDir('fm1', '---\ndescription: d\n---\n# no name\n') } },
    { check: 'frontmatter', name: 'frontmatter/missing-description', expect: 'frontmatter missing description:',
      env: { OSLINT_SKILLS: skillDir('fm2', '---\nname: probe\n---\n# no description\n') } },

    { check: 'full-file-review', expect: 'FULL-FILE review has never run',
      env: { OSLINT_MARKER: join(root, 'no-marker') } },

    { check: 'bug-files', name: 'bug-files/no-frontmatter', expect: 'b.md: no frontmatter',
      env: { OSLINT_BUGS: bugDir('bf1', 'b.md', 'no frontmatter here\n') } },
    { check: 'bug-files', name: 'bug-files/bad-status', expect: 'is not one of',
      env: { OSLINT_BUGS: bugDir('bf2', 'b.md', `---\nid: b\nstatus: nonsense\npriority: high\nreported: ${OLD}\n---\n# x\n`) } },
    { check: 'bug-files', name: 'bug-files/bad-reported', expect: 'is not an ISO date',
      env: { OSLINT_BUGS: bugDir('bf3', 'b.md', '---\nid: b\nstatus: open\npriority: high\nreported: sometime\n---\n# x\n') } },

    { check: 'stale-bugs', expect: 'still OPEN after 7+ days',
      env: { OSLINT_BUGS: bugDir('sb', 'b.md', `---\nid: b\nstatus: open\npriority: high\nreported: ${OLD}\n---\n# old open bug\n`) } },
    // Both halves matter. The RED-before proves it can spot evidence; the companion below proves it
    // stays quiet when the spec cites an unrelated date — otherwise "every ageing row has a
    // candidate" would be indistinguishable from a working detector.
    { check: 'closure-candidates', expect: 'clause (b) evidence',
      env: { OSLINT_BUGS: bugDir('cc', `${OLD}-renderclientweight-leaks-a-chart.md`,
               `---\nid: ${OLD}-renderclientweight-leaks-a-chart\nstatus: open\npriority: high\nreported: ${OLD}\n---\n# x\n`),
             OSLINT_TESTS: (() => { const d = join(root, 'cc-tests'); mkdirSync(d, { recursive: true })
               writeFileSync(join(d, 'a.spec.js'), "test('renderClientWeight leaks a chart on every save', () => {})\n"); return d })() } },
    // This harness only ever asserts that a check FIRES, so the negative direction cannot live here.
    // It was verified against the REAL corpus instead, which is the stronger test anyway: matching on
    // the reported date returned 103 of 177 rows (7 specs each, unusable); matching the slug phrase
    // returns 17. A detector that fires on 58% of the corpus is not discriminating, and only running
    // it against real data shows that — a fixture would have passed either way.
    { check: 'ledger-drift', expect: 'claim FIXED in their text',
      env: { OSLINT_BUGS: bugDir('ld', 'b.md', `---\nid: b\nstatus: open\npriority: high\nreported: ${OLD}\n---\n# x\n✅ FIXED + LIVE abc1234 — but the status cell still says open.\n`) } },

    { check: 'hooks', name: 'hooks/missing-script', expect: 'points at a script that does not exist',
      env: { OSLINT_SETTINGS: file('hk1.json', '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"\\"node\\" \\"C:/nope/missing.mjs\\""}]}]}}') } },
    { check: 'hooks', name: 'hooks/invalid-json', expect: 'INVALID JSON',
      env: { OSLINT_SETTINGS: file('hk2.json', '{"hooks":{ not json') } },
    { check: 'hooks', name: 'hooks/unregistered-script', expect: 'registered in NO settings file',
      env: { OSLINT_SETTINGS: file('hk3.json', '{"hooks":{}}') } },

    { check: 'gates-fired', expect: 'no recent trace in LOG.md',
      env: { OSLINT_LOG: file('log.md', '## 2026-08-21 — nothing\nno gate ran here.\n') } },
    { check: 'claude-md', expect: 'is missing',
      env: { OSLINT_CLAUDE_MD: join(root, 'no-claude-md') } },
    { check: 'stale-predictions', expect: 'past verify_by and still ungraded',
      env: { OSLINT_PREDICTIONS: file('p.jsonl', `{"id":"probe","project":"CoachApp","verify_by":"${OLD}","outcome":null,"prediction":"probe"}\n`) } },

    // OS v3 — RULE 0 for documents. One fixture per detector, each carrying exactly one defect.
    { check: 'context-budget', expect: 'exceed the budget',
      env: { OSLINT_STATUS: file('cb-status.md', 'x'.repeat(600)),
             OSLINT_ROADMAP: file('cb-roadmap.md', 'y'.repeat(600)),
             OSLINT_CONTEXT_BUDGET: '1000' } },
    // Fixture STATUS whose continuity block is far larger than the real baseline. OSLINT_STATUS is
    // also what makes the check treat this as synthetic and refuse to persist a new baseline, so
    // this spec doubles as the poisoning guard.
    { check: 'continuity-budget', expect: 'the continuity block has grown',
      env: { OSLINT_STATUS: file('cont-status.md',
        '## Continuity block\n' + '### an entry\nbody line that makes this section large\n'.repeat(3000) + '\n## next\n') } },
    { check: 'ritual-budget', expect: 'grown past their budget',
      env: { OSLINT_HELLO_SKILL: file('rb-hello.md', 'x'.repeat(600)),
             OSLINT_SAVE_SKILL:  file('rb-save.md',  'y'.repeat(600)),
             OSLINT_RITUAL_BUDGET: '1000' } },
    { check: 'docs-budget', expect: 'grown past budget',
      env: { OSLINT_DOCS_DIR: (() => { const d = join(root, 'docsbudget'); mkdirSync(d, { recursive: true })
               writeFileSync(join(d, 'a.md'), 'x'.repeat(600)); writeFileSync(join(d, 'b.md'), 'y'.repeat(600)); return d })(),
             OSLINT_DOCS_BUDGET: '1000' } },
    { check: 'masthead-drift', expect: 'understate their own freshness',
      env: { OSLINT_STATUS: file('md-status.md', '# S\n_Last updated: 2026-01-01_\n\nwork landed 2026-06-01 and shipped.\n'),
             OSLINT_ROADMAP: file('md-roadmap.md', '# R\n_Last updated: 2026-06-01_\n\nnothing newer here.\n') } },
    { check: 'doc-obligations', name: 'doc-obligations/data-model', expect: 'update whenever the schema changes',
      env: { OSLINT_DATA_MODEL: file('dm.md', 'stale schema doc'),
             OSLINT_SQL_DIR: sqlDirNewerThan(join(root, 'dm.md')),
             OSLINT_CRITICAL: join(root, 'no-critical-md') } },
    // doc-obligations has TWO detectors. One spec proves one of them; the other could be fully dead
    // and this check would still report BITES on the data-model fixture alone. That is the exact
    // failure the `expect` mechanism was added for on 2026-08-22 — so the CRITICAL.md branch gets
    // its own single-defect fixture, with the data-model input pointed at nothing.
    // The harness matches RED *or* WARN, so a deliberately-WARN check is still provable.
    { check: 'deferred-criticals', expect: 'deferred — carried on purpose, still live',
      env: { OSLINT_BUGS: bugDir('defcrit', '2026-08-11-probe-critical.md',
        '---\nid: 2026-08-11-probe-critical\nstatus: deferred\npriority: critical\nreported: 2026-08-11\nstatus_detail: "probe"\n---\n\n# probe\n') } },
    { check: 'doc-obligations', name: 'doc-obligations/critical-md', expect: 'append-only and tracks recurring security patterns',
      env: { OSLINT_CRITICAL: criticalOlderThanBug(),
             OSLINT_BUGS: join(root, 'critbugs', 'bugs'),
             OSLINT_DATA_MODEL: join(root, 'no-data-model') } },
  ]

  const results = []
  for (const s of specs) {
    let out = ''
    try {
      out = execFileSync(process.execPath, [SELF, '--report'],
        { env: { ...process.env, ...s.env }, encoding: 'utf8' })
    } catch (e) { out = String(e.stdout || '') }
    // Capture the check's WHOLE message, not just its verdict line: a RED message wraps onto
    // continuation lines, and the substring identifying WHICH detector fired usually lives there.
    const lines = out.split(/\r?\n/)
    const start = lines.findIndex(l => new RegExp(`^\\s+(RED|WARN)\\s+${s.check}\\b`).test(l))
    let msg = ''
    if (start !== -1) {
      msg = lines[start]
      for (let i = start + 1; i < lines.length; i++) {
        if (/^\s+(RED|WARN|GREEN)\s+\S/.test(lines[i]) || /^\d+ RED /.test(lines[i])) break
        msg += '\n' + lines[i]
      }
    }
    // `expect` is REQUIRED. Asserting only that the check went RED proves it emitted *a* finding, not
    // that the detector THIS fixture targets is alive. A multi-detector check stays "BITES" with one
    // detector fully dead — which is exactly what made this self-test decorative until 2026-08-22:
    // neutering checkMemory's name-vs-filename branch still reported BITES, because the same fixture
    // also tripped the ghost-index branch and the assertion only matched the check NAME.
    const tripped = start !== -1 && !!s.expect && msg.includes(s.expect)
    results.push({
      name: s.name || s.check,
      check: s.check,
      tripped,
      why: start === -1 ? 'check did not fire at all'
        : !s.expect ? 'SPEC HAS NO expect — cannot prove which detector fired'
        : `fired, but its message lacked: "${s.expect}"`,
    })
  }

  rmSync(root, { recursive: true, force: true })

  const dead = results.filter(r => !r.tripped)
  console.log('\n=== os-lint self-test ===')
  for (const r of results) console.log(`  ${r.tripped ? 'BITES     ' : 'DECORATIVE'}  ${(r.name || r.check).padEnd(32)}${r.tripped ? '' : r.why}`)
  console.log(`\n${results.length - dead.length}/${results.length} checks proven to fire on a corpus that should trip them.`)
  if (dead.length) {
    console.log(`\n🔴 ${dead.length} DECORATIVE check(s): ${dead.map(d => d.check).join(', ')}`)
    console.log('   These report GREEN over a fixture built to break them. They are occupying the slot')
    console.log('   where a real check would go. Fix or delete.\n')
  } else console.log('\nEvery check bites.\n')

  // --- Side-effect purity ----------------------------------------------------
  // A --self-test run must never write REAL state. Every other spec above asks "can this check
  // FAIL?"; this one asks "does asking that question break anything?"
  //
  // The incident, 2026-08-25, on the day measuredCeiling() landed. Its baseline auto-tightens: when
  // the measured files are smaller than the recorded floor it rewrites the floor lower, so a cleanup
  // is locked in and the check can only ever get stricter. The specs above point OSLINT_STATUS and
  // OSLINT_ROADMAP at ~120-byte fixtures — but nothing overrode OSLINT_SIZE_BASELINE. So auto-tighten
  // read 120 bytes, concluded the docs had been cleaned up, and wrote 120 into the real state file.
  // The next genuine run compared a 235,631-char corpus against a ceiling of 122.
  //
  // Note the shape: auto-tightening is the property that makes the check SAFE against false refusals,
  // and it was the same property that made it destructive under fixtures. That is why this is a
  // standing assertion and not a one-off fix — the next stateful check will have the same shape, and
  // the fixture path has to be inert for all of them.
  //
  // It runs BEFORE the freshness marker deliberately: a leak must not be able to stamp a run "fresh".
  const impure = []
  let restoreVerified = true
  {
    const readBaseline = () => existsSync(SIZE_BASELINE) ? readFileSync(SIZE_BASELINE, 'utf8') : null
    const restore = () => {
      try {
        if (baselineAtStart === null) rmSync(SIZE_BASELINE, { force: true })
        else writeFileSync(SIZE_BASELINE, baselineAtStart)
      } catch { /* verified below — never claimed on faith */ }
    }

    // (a) Did the 38-spec loop above already write real state? Those are fixture runs too, and they
    //     are the ones that actually caused the 2026-08-25 incident.
    if (readBaseline() !== baselineAtStart) {
      impure.push(`the 38-spec loop REWROTE ${SIZE_BASELINE}`)
      restore()
    }

    // (b) Targeted probes: one per group that persists state, driving the exact override path.
    const probe = mkdtempSync(join(tmpdir(), 'oslint-purity-'))
    const tiny = n => { const p = join(probe, n); writeFileSync(p, '# x\n_Last updated: 2026-01-01_\n'); return p }
    const tinyDir = n => { const d = join(probe, n); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'x.md'), '# x\n'); return d }
    const cases = [
      ['context-budget', { OSLINT_STATUS: tiny('s.md'), OSLINT_ROADMAP: tiny('r.md') }],
      ['ritual-budget',  { OSLINT_HELLO_SKILL: tiny('h.md'), OSLINT_SAVE_SKILL: tiny('v.md') }],
      ['docs-budget',    { OSLINT_DOCS_DIR: tinyDir('d') }]
    ]
    for (const [label, fixtureEnv] of cases) {
      try {
        execFileSync(process.execPath, [SELF, '--report'],
          { env: { ...process.env, ...fixtureEnv }, encoding: 'utf8' })
      } catch { /* the verdict is irrelevant here — only the side effect is under test */ }
      if (readBaseline() !== baselineAtStart) {
        impure.push(`${label}: a fixture-input run REWROTE ${SIZE_BASELINE}`)
        restore()
      }
    }
    rmSync(probe, { recursive: true, force: true })

    // Never CLAIM the restore worked — check it. This block reports on other people's false
    // success claims; it does not get to make one.
    restoreVerified = readBaseline() === baselineAtStart
  }

  if (impure.length && !restoreVerified) {
    impure.push(`AND THE RESTORE FAILED — ${SIZE_BASELINE} is still not what it was before this run`)
  }

  if (impure.length) {
    console.log(`🔴 ${impure.length} SIDE-EFFECT LEAK(S) — a --self-test run wrote real state:`)
    for (const p of impure) console.log(`   ${p}`)
    console.log('   The fixture path must be INERT. Pass the input-override env names into')
    console.log('   measuredCeiling() (or the equivalent) and refuse to persist when any is set.')
    console.log(`   Restore to the pre-run value: ${restoreVerified ? 'VERIFIED' : '*** FAILED — REPAIR BY HAND ***'}.`)
    console.log('   The run is NOT clean and the marker was not stamped.\n')
  } else {
    console.log('Side-effect purity: fixture-input runs leave size-baseline.json untouched.\n')
  }

  // Stamp the freshness marker — but ONLY on a fully clean run.
  //
  // Until 2026-08-24 this function READ nothing and WROTE nothing: checkSelfTestFresh() watched
  // state/last-self-test, and no code path anywhere wrote that file. The self-test was run six times
  // on 2026-08-24 and the marker still said 2026-08-22, so the check guarding the self-test could not
  // observe the self-test. It was watching a file nothing wrote — os-lint's own signature defect
  // class (feedback-reports-success-doing-nothing) sitting inside its own freshness guard, and it
  // fails in both directions: RED after 7 days no matter how often the self-test really ran, and
  // GREEN forever if someone touches the file by hand without running anything.
  //
  // Gated on `!dead.length` deliberately: stamping after a DECORATIVE result would certify a FAILED
  // run as fresh, which is strictly worse than the bug being fixed.
  if (!dead.length && !impure.length) {
    try {
      mkdirSync(dirname(SELFTEST_MARKER), { recursive: true })
      writeFileSync(SELFTEST_MARKER, new Date().toISOString())
    } catch { /* never fail the self-test over its own bookkeeping */ }
  }
  // Exit non-zero on EITHER failure mode. A decorative check and a check that corrupts real state are
  // both "the self-test did not pass"; returning 0 for the second would make the purity assertion
  // decorative itself — reporting a problem while deciding nothing.
  //
  // YES, THIS DISAGREES WITH `--report`, WHICH EXITS 0 EVEN WITH REDS. That is deliberate, not an
  // oversight to tidy up (checked 2026-08-25: --report exits 0 with 4 REDs live). The two modes have
  // opposite jobs:
  //   --report    runs at SessionStart as ADVICE. It must never break the session, so exit 0 always.
  //   --self-test is a VERIFICATION run whose entire output is a pass/fail verdict. An always-zero
  //               verdict is a status report that cannot report status.
  // The deciding argument: the freshness marker above is already gated on !dead && !impure, so on a
  // bad run this function refuses to stamp itself fresh. Exiting 0 would have it declare failure and
  // success three lines apart, about the same run.
  //
  // Blast radius when this changed: ZERO automated consumers (no hook, no settings.json entry). The
  // only documented chain was `--self-test && node -e "<write marker>"`, which is now redundant —
  // the self-test stamps its own marker, correctly gated — and which this change fixes anyway, since
  // it used to stamp "fresh" over a failed run.
  process.exit(dead.length || impure.length ? 1 : 0)
}

// ---------------------------------------------------------------------------
// 22. Context budget — the size of what every session is INSTRUCTED to read in full.
//     hello-claude says "Read the WHOLE of STATUS.md, not just one table." That was a correct fix in
//     July, when the file was a third of its later size. By 2026-08-23 STATUS.md + roadmap.md were
//     343k chars (~86k tokens) per session, +94% in five weeks, and ~70k of STATUS.md turned out to
//     be a verbatim duplicate of LOG.md that nobody noticed because no check measured growth.
//     Cheap to compute, and it is the only check here that guards the cost of the OS itself.
// ---------------------------------------------------------------------------
function checkContextBudget () {
  const docs = [['STATUS.md', STATUS], ['roadmap.md', ROADMAP]]
  const m = measuredCeiling('context', docs, process.env.OSLINT_CONTEXT_BUDGET ? CONTEXT_BUDGET : 0, ['OSLINT_STATUS','OSLINT_ROADMAP'])
  if (m.missing) { warn('context-budget', `${m.missing} not found at ${m.path}`); return }
  const detail = m.sizes.join(' + ') + ` = ${m.total.toLocaleString()} chars`
  if (m.total > m.ceiling) {
    red('context-budget', `the docs every session reads in full exceed the budget: ${detail} (ceiling ${m.ceiling.toLocaleString()}, ${m.source}).\n`
      + '    This is a cost every future session pays before any work starts. Move history to LOG.md —\n'
      + '    STATUS.md holds LIVE STATE. Do not raise the ceiling to make this green; that is the failure\n'
      + '    mode it exists to catch. The baseline ratchets DOWN on its own — it never needs raising.')
  } else {
    ok('context-budget', `session-read docs within budget (${detail}, ceiling ${m.ceiling.toLocaleString()}, ${m.source})`)
  }
}

// ---------------------------------------------------------------------------
// 22b. Ritual budget — the same guard, on the two skills that keep regrowing after every hand-trim.
//      Separate from context-budget so one going RED never hides the other, and so the two can carry
//      honest ceilings an order of magnitude apart rather than one averaged number that catches
//      neither. Two rebuilds have trimmed these by hand; neither trim survived five weeks.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 22c. Continuity-block ratchet — the same guard, on the section of STATUS.md that grows fastest.
//
//      Measured 2026-08-28: the continuity block was 41,483 chars — 44% of STATUS.md — across 51
//      entries, and at least the top several DUPLICATE a memory file almost word for word
//      ("The DISPLAY value is a lossy proxy" <-> feedback_display_value_is_not_the_stored_value.md;
//      "A ceiling set ABOVE current is a permit" <-> feedback_threshold_at_current_not_above.md).
//      The same lesson was being written into both homes in the same session, which is
//      feedback_two_fields_one_fact applied to this OS itself — and the continuity copy is the
//      weaker one, because it carries no enforced_by pointer and nothing recalls it contextually.
//
//      DELIBERATELY NOT A SEMANTIC DUPLICATE-DETECTOR. Writing one means a fuzzy matcher, and a
//      trial run of exactly that produced weak pairings (it matched "a check that cannot FAIL"
//      to feedback_no_speculative_fixes). A check that flags CORRECT entries is the failure mode
//      this project names most often, and it gets switched off. A size ratchet needs no judgement:
//      it does not care WHICH entry is redundant, only that the section may not grow. Adding a new
//      invariant means removing one, which forces "is this already in memory?" at the moment of
//      writing — which is the only moment anyone can answer it.
// ---------------------------------------------------------------------------
function checkContinuityBudget () {
  const text = read(STATUS)
  if (text === null) { warn('continuity-budget', `could not read ${STATUS}`); return }
  const lines = text.split(/\r?\n/)
  const s = lines.findIndex(l => /^## Continuity block/.test(l))
  if (s < 0) { warn('continuity-budget', 'no "## Continuity block" heading in STATUS.md'); return }
  let e = s + 1
  while (e < lines.length && !/^## /.test(lines[e])) e++
  const size = lines.slice(s, e).join('\n').length
  const entries = lines.slice(s, e).filter(l => /^### /.test(l)).length
  // Same SHAPE as measuredCeiling (ratchet down, refuse growth) but not the same function:
  // measuredCeiling measures whole FILES and this measures a SECTION, so it reads the shared
  // baseline directly rather than mis-using a helper that would report the wrong number.
  // It honours the same OSLINT_STATUS override, so a fixture run cannot poison the baseline —
  // the defect that helper shipped with on 2026-08-25.
  let base = {}
  try { base = JSON.parse(readFileSync(SIZE_BASELINE, 'utf8')) } catch { /* first run */ }
  const prev = Number(base.continuity) || 0
  const synthetic = !!process.env.OSLINT_STATUS
  if ((!prev || size < prev) && !synthetic) {
    base.continuity = size
    try { writeFileSync(SIZE_BASELINE, JSON.stringify(base, null, 2) + '\n') } catch { /* bookkeeping */ }
    ok('continuity-budget', `continuity block ${size.toLocaleString()} chars / ${entries} entries `
      + (prev ? `(re-pinned ${prev.toLocaleString()} -> ${size.toLocaleString()})` : `(pinned at ${size.toLocaleString()})`))
    return
  }
  const ceiling = Math.round((prev || size) * SIZE_TOLERANCE)
  if (size > ceiling) {
    red('continuity-budget', `the continuity block has grown: ${size.toLocaleString()} chars across ${entries} entries `
      + `(ceiling ${ceiling.toLocaleString()}, baseline ${(prev || size).toLocaleString()}).\n`
      + '    It is read IN FULL every session. Before adding an entry, check whether the lesson already\n'
      + '    has a memory file — several entries already duplicate one word for word, and the memory\n'
      + '    copy is the stronger of the two (it carries enforced_by and is recalled contextually).\n'
      + '    Adding one means removing one. Do NOT raise the ceiling to make this green.')
  } else {
    ok('continuity-budget', `continuity block within budget (${size.toLocaleString()} chars, ${entries} entries, ceiling ${ceiling.toLocaleString()})`)
  }
}

function checkRitualBudget () {
  const rituals = [['hello-claude', HELLO_SKILL], ['save', SAVE_SKILL]]
  const m = measuredCeiling('ritual', rituals, process.env.OSLINT_RITUAL_BUDGET ? RITUAL_BUDGET : 0, ['OSLINT_HELLO_SKILL','OSLINT_SAVE_SKILL'])
  if (m.missing) { warn('ritual-budget', `${m.missing}/SKILL.md not found at ${m.path}`); return }
  const total = m.total
  const detail = m.sizes.join(' + ') + ` = ${total.toLocaleString()} chars`
  if (total > m.ceiling) {
    red('ritual-budget', `the session rituals have grown past their budget: ${detail} (ceiling ${m.ceiling.toLocaleString()}, ${m.source}).\n`
      + '    hello-claude is read in full every session and save is the most-used mechanism in the OS.\n'
      + '    Cut, do not raise the ceiling — raising it is how the last two trims were undone. Look first\n'
      + '    for behaviours already enforced by hooks/standing-behaviours.mjs, and for historical\n'
      + '    justifications that have since hardened into a check.')
  } else {
    ok('ritual-budget', `rituals within budget (${detail}, ceiling ${m.ceiling.toLocaleString()}, ${m.source})`)
  }
}

function checkDocsBudget () {
  if (!existsSync(DOCS_DIR)) { warn('docs-budget', `docs dir not found: ${DOCS_DIR}`); return }
  const files = readdirSync(DOCS_DIR, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.md'))
    .map(d => [d.name, join(DOCS_DIR, d.name)])
  if (!files.length) {
    warn('docs-budget', `no top-level .md files in ${DOCS_DIR} (archive/ and bugs/ are subdirectories, excluded by design)`)
    return
  }
  const m = measuredCeiling('docs', files, process.env.OSLINT_DOCS_BUDGET ? Number(process.env.OSLINT_DOCS_BUDGET) : 0, ['OSLINT_DOCS_DIR'])
  const detail = `${files.length} files = ${m.total.toLocaleString()} chars`
  if (m.total > m.ceiling) {
    red('docs-budget', `docs/*.md (top-level only — not archive/ or bugs/) have grown past budget: ${detail} (ceiling ${m.ceiling.toLocaleString()}, ${m.source}).\n`
      + '    These are read routinely (hello-claude Step 2, save Step 3b) — growth here pays the same\n'
      + "    per-session cost STATUS.md/roadmap.md once did. Move detail to docs/archive/, don't raise\n"
      + '    the ceiling.')
  } else {
    ok('docs-budget', `docs/*.md within budget (${detail}, ceiling ${m.ceiling.toLocaleString()}, ${m.source})`)
  }
}

// ---------------------------------------------------------------------------
// 23. Masthead drift — a document whose "_Last updated:_" is older than its own newest content.
//     One fact (how fresh is this doc?) in two representations, with nothing forcing agreement —
//     the feedback-two-fields-one-fact class. On 2026-08-23 BOTH session-read documents were in this
//     state: STATUS.md said 2026-08-12 with body content through 08-22, roadmap.md said 08-14 with a
//     backlog header dated 08-23. A reader trusting the masthead skips content that is actually current.
// ---------------------------------------------------------------------------
function checkMastheadDrift () {
  const todayISO = new Date(now).toISOString().slice(0, 10)
  const docs = [['STATUS.md', STATUS], ['roadmap.md', ROADMAP]]
  const drifted = []
  let checked = 0
  for (const [label, path] of docs) {
    const text = read(path)
    if (!text) continue
    const m = text.match(/_Last updated:\s*(\d{4}-\d{2}-\d{2})/)
    if (!m) continue
    checked++
    const masthead = m[1]
    // Only dates already in the past can evidence staleness — a roadmap naturally names future targets.
    const body = [...text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map(x => x[1]).filter(d => d <= todayISO)
    if (!body.length) continue
    const newest = body.sort().at(-1)
    if (newest > masthead) drifted.push(`${label}: masthead says ${masthead} but its own body carries content dated ${newest}`)
  }
  if (!checked) { warn('masthead-drift', 'no document carried a parseable "_Last updated:_" masthead'); return }
  if (drifted.length) {
    red('masthead-drift', `${drifted.length} document(s) understate their own freshness:\n    ` + drifted.join('\n    ')
      + '\n    Fix the masthead, not the body. A freshness marker that is itself stale is worse than none —\n'
      + '    it tells the next session to skip content that is current.')
  } else ok('masthead-drift', `every masthead matches its newest content (${checked} doc(s) checked)`)
}

// ---------------------------------------------------------------------------
// 24. Document obligations — RULE 0 applied to documents, the core of OS v3.
//     RULE 0 ("an incident produces a CHECK, or it produces nothing") was adopted for incidents on
//     2026-08-22 and never extended to documents. The 2026-08-23 inventory found the result: every
//     decayed document in the Vault STATED its own update rule in prose and had no writer for weeks.
//     data-model.md said "update whenever the schema changes" and had missed four real schema
//     concepts over 54 days. CRITICAL.md is append-only and specifically tracks recurring stored-XSS
//     as a standing pattern — the pattern then recurred three more times with no append.
//     A promise nothing keeps is worse than no promise, so each obligation gets a trigger or the
//     sentence gets deleted. NOTE: this compares mtimes, so it is only meaningful on a working copy
//     (a fresh clone stamps every file at checkout time).
// ---------------------------------------------------------------------------
function checkDocObligations () {
  const stale = []
  let checked = 0

  // data-model.md — "Update whenever the schema changes", so a newer migration is the trigger.
  if (existsSync(DATA_MODEL) && existsSync(SQL_DIR)) {
    checked++
    const docAge = statSync(DATA_MODEL).mtimeMs
    // Only DDL counts. The obligation is "update whenever the SCHEMA changes", so a data-only
    // migration (an UPDATE back-filling a flag, a one-off INSERT) does not owe this document
    // anything. The first version of this check keyed on mtime alone and produced a FALSE REFUSAL
    // within hours of shipping, on 2026-08-24: a stamp step was appended to an already-documented
    // migration and the check demanded a doc update that had already been written. A guard that
    // refuses legitimate work is this project's most-shipped guard bug, and narrowing to DDL is a
    // precision fix, not a weakening — the self-test fixture is an `alter table` and still trips it.
    const isDDL = f => /\b(alter\s+table|create\s+table|drop\s+table|add\s+column|drop\s+column|create\s+type|alter\s+type)\b/i
      .test(read(join(SQL_DIR, f)) || '')
    const newer = readdirSync(SQL_DIR)
      .filter(f => f.toLowerCase().endsWith('.sql'))
      .filter(f => statSync(join(SQL_DIR, f)).mtimeMs > docAge)
      .filter(isDDL)
    if (newer.length) {
      const days = Math.floor((now - docAge) / DAY)
      stale.push(`data-model.md (${days}d old) says "update whenever the schema changes", but ${newer.length} migration(s) are newer: `
        + newer.slice(0, 4).join(', ') + (newer.length > 4 ? ` (+${newer.length - 4} more)` : ''))
    }
  }

  // CRITICAL.md — append-only, tracks recurring security patterns; a newer bug in one is the trigger.
  if (existsSync(CRITICAL)) {
    checked++
    const docAge = statSync(CRITICAL).mtimeMs
    const rows = bugRows() || []
    // Only the classes CRITICAL.md actually tracks — read off its own sections and Timeline:
    // GDPR, RLS policies, storage buckets, secrets/auth, and the recurring stored-XSS pattern whose
    // 2026-07-28 entry says in as many words "the 4th time this exact bug class has been found
    // reactively". The first draft of this pattern also matched /gate|policy/, which pulled in
    // deploy-check and role-gate bugs that CRITICAL.md has never tracked — a check that refuses over
    // things the document never promised is a false-refusal generator, the August failure class.
    // `secret|token` was in the first draft and matched `var-surface2-is-not-a-token-that-exists`,
    // a CSS DESIGN token — the false-refusal class this OS started producing in August. Dropped:
    // CRITICAL.md's secrets entry was a one-off PAT incident, not a recurring class.
    const TRACKED = /xss|unescaped|escaping|\brls\b|gdpr|storage|breach|cross-tenant/i
    const missed = rows.filter(r => !r.malformed && TRACKED.test(r.file) && statSync(join(BUGS, r.file)).mtimeMs > docAge)
    if (missed.length) {
      const days = Math.floor((now - docAge) / DAY)
      stale.push(`CRITICAL.md (${days}d since last append) is append-only and tracks recurring security patterns, but ${missed.length} newer bug file(s) match one: `
        + missed.slice(0, 3).map(r => r.file).join(', ') + (missed.length > 3 ? ` (+${missed.length - 3} more)` : ''))
    }
  }

  if (!checked) { warn('doc-obligations', 'no obligation-bearing document was found to check'); return }
  if (stale.length) {
    red('doc-obligations', `${stale.length} document(s) state an update obligation they are not meeting:\n    ` + stale.join('\n    ')
      + '\n    Either append the missing content, or DELETE the obligation sentence from the document.\n'
      + '    RULE 0 for documents: it has a trigger that fires, or it is prose.')
  } else ok('doc-obligations', `every obligation-bearing document is current (${checked} checked)`)
}

// ---------------------------------------------------------------------------
// 25. Event-gate evidence — deploy-check/feature-audit/mobile-check now stamp a state/last-<skill>-run
//     marker (docs/technical-debt.md, 2026-09-16 update) but nothing reads it yet: "No staleness check
//     reads it yet — these gates are event-triggered, not periodic; needs measurement first." This IS
//     that measurement step, at WARN only — never RED. Flipping straight to a blocking gate before
//     counting what it flags on a clean tree is the exact mistake checks.sh rule 2 made on 2026-08-25
//     (docs/decisions.md: "never flip a warn to a blocking fail without first counting what it flags").
//
//     "Event-triggered" means these don't run on a fixed cadence like full-file-review; the nearest
//     mechanical proxy for "something happened that should have triggered one" is git history: a v*
//     release tag for deploy-check (rare and deliberate, so this half is asserted with more
//     confidence), a commit touching UI-relevant paths for feature-audit/mobile-check. Fails open on
//     any git read error or a missing/unreadable repo — a measurement failure must never block a
//     session, same rule this whole file follows everywhere else.
//
//     No --self-test fixture yet, same as checkRule0: a git-based fixture needs a disposable temp repo
//     with real tags/commits (guardrails.selftest.mjs already does this for a different reason), which
//     is its own piece of work, not bundled into this pass. Inputs are still env-overridable per this
//     file's own rule, so that fixture can be added later without a redesign.
// ---------------------------------------------------------------------------
function checkEventGateEvidence () {
  let git
  try {
    git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim()
    git('rev-parse', '--is-inside-work-tree')
  } catch { warn('event-gates', 'could not read git history for this repo — skipped'); return }

  const notes = []
  const markerAge = p => (existsSync(p) ? statSync(p).mtimeMs : 0)
  const markerLabel = t => (t ? new Date(t).toISOString().slice(0, 10) : 'never')

  // deploy-check vs. release tags — rare, deliberate events, so this one is worded with confidence.
  try {
    const raw = git('for-each-ref', 'refs/tags/v*', '--format=%(refname:short) %(creatordate:iso-strict)')
    const tags = raw.split(/\r?\n/).filter(Boolean).map(l => {
      const i = l.indexOf(' ')
      return { tag: l.slice(0, i), time: Date.parse(l.slice(i + 1)) }
    })
    const marker = markerAge(DEPLOY_CHECK_MARKER)
    const unmatched = tags.filter(t => t.time > marker)
    if (unmatched.length) {
      const newest = unmatched.reduce((a, b) => (a.time > b.time ? a : b))
      notes.push(`deploy-check: ${unmatched.length} release tag(s) cut since its last run `
        + `(marker: ${markerLabel(marker)}), newest ${newest.tag}`)
    }
  } catch { /* no tags yet, or this sub-check failed — does not block the other sub-checks */ }

  // feature-audit / mobile-check vs. commits touching UI-relevant paths.
  for (const [label, markerPath] of [['feature-audit', FEATURE_AUDIT_MARKER], ['mobile-check', MOBILE_CHECK_MARKER]]) {
    try {
      const marker = markerAge(markerPath)
      const args = ['log', '--oneline']
      if (marker) args.push(`--since=${new Date(marker).toISOString()}`)
      args.push('--', 'js/', 'css/', 'index.html')
      const out = git(...args)
      const n = out ? out.split(/\r?\n/).filter(Boolean).length : 0
      if (n > 0) notes.push(`${label}: ${n} UI-relevant commit(s) since its last run (marker: ${markerLabel(marker)})`)
    } catch { /* does not block the other sub-check */ }
  }

  if (notes.length) {
    warn('event-gates', notes.join('\n    ')
      + '\n    Measurement only per docs/technical-debt.md — not yet a gate. See docs/decisions.md\'s\n'
      + '    2026-08-25 entry for why this starts as a count, not a blocking check.')
  } else {
    ok('event-gates', 'no UI-relevant commits or release tags since the last recorded run of each event-triggered gate')
  }
}

if (process.argv.includes('--self-test')) runSelfTest()

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
checkSelfTestFresh()
checkCorpora()
checkMemory()
checkLiveDocs()
checkDeadTools()
checkMandatedDeadTools()
checkDeadFiles()
checkSkillPII()
checkModuleCount()
checkRetired()
checkFrontmatter()
checkFullFileReview()
checkBugFrontmatter()
checkStaleBugs()
checkClosureCandidates()
checkDeferredCriticals()
checkLedgerStatusDrift()
checkContextBudget()
checkRitualBudget()
checkDocsBudget()
// NOTE, 2026-09-16: checkContinuityBudget's target ("## Continuity block" in STATUS) no longer
// matches the post-migration structure — STATUS now points at docs/current-sprint.md, which has no
// such heading, and the project's own comment above already says the continuity-log pattern was
// deliberately replaced by docs/decisions.md, not carried forward. That replacement's growth is
// covered by checkDocsBudget (added 2026-09-15), so there is nothing left for this check to measure —
// it has produced a WARN about nothing real on every run since the migration. RETIRED 2026-09-16, same
// treatment as checkGatesFired just above it in this file's history: waiting for a check to decay into
// permanent, meaningless noise is worse than retiring it deliberately once its target is confirmed
// gone. Function body and self-test fixture left in place rather than deleted — same reasoning as
// checkGatesFired's: --self-test will now report 'continuity-budget' as DECORATIVE, and that reads as
// "intentionally retired," not "found broken and ignored."
// checkContinuityBudget()
checkMastheadDrift()
checkDocObligations()
checkEventGateEvidence()

// ---------------------------------------------------------------------------
// Hook self-tests — every guard must still be able to REFUSE
// ---------------------------------------------------------------------------
// A guard observed only passing is indistinguishable from a dead one, which is the dominant
// defect class in this OS. hooks/guardrails.mjs and hooks/claim-check.mjs both BLOCK real work
// when they fire, so a silent regression in either is expensive in both directions: it either
// stops refusing (no protection) or starts over-refusing (unusable tool). Both over-refused
// their own test harness within minutes of being written on 2026-08-22, which is precisely why
// this runs them rather than trusting them.
function checkHookSelfTests () {
  if (!existsSync(HOOKS_DIR)) { warn('hook-selftests', `hooks dir not found: ${HOOKS_DIR}`); return }
  const tests = readdirSync(HOOKS_DIR).filter(f => /\.selftest\.mjs$/i.test(f))
  if (!tests.length) { warn('hook-selftests', 'no *.selftest.mjs found — the blocking hooks have no proof they can refuse'); return }

  const problems = []
  for (const t of tests) {
    const hook = t.replace(/\.selftest\.mjs$/i, '.mjs')
    if (!existsSync(join(HOOKS_DIR, hook))) {
      problems.push(`${t} has no matching hook (${hook}) — an orphaned self-test proves nothing.`)
      continue
    }
    try {
      execFileSync(process.execPath, [join(HOOKS_DIR, t)], { encoding: 'utf8', stdio: 'pipe', timeout: 30000 })
    } catch (e) {
      const out = `${e.stdout || ''}${e.stderr || ''}`
      const bad = out.split(/\r?\n/).filter(l => /^FAIL/.test(l)).slice(0, 4)
      problems.push(`${t} FAILED${bad.length ? ':\n      ' + bad.join('\n      ') : ` (${String(e.message).slice(0, 80)})`}`)
    }
  }

  if (problems.length) red('hook-selftests', problems.join('\n    '))
  else ok('hook-selftests', `${tests.length} hook self-test(s) pass — each blocking hook still refuses AND still allows`)
}


// ---------------------------------------------------------------------------
// RULE 0 — an incident produces a CHECK, or it produces nothing
// ---------------------------------------------------------------------------
// Adopted 2026-08-22 after measuring why the error rate was not falling: all six of that day's
// error classes ALREADY had a rule. Rule availability was never the binding constraint, so writing
// a 42nd rule buys nothing and costs attention on every future turn. The corpus had reached 41
// feedback memories and ~309 imperatives purely because every incident produced prose.
//
// So from now on a new memory must name the check that enforces it — or say explicitly that it
// cannot be one, and why. "enforced_by: none — <reason>" is a legitimate answer; silence is not.
//
// RATCHET, not a purge: the 47 files existing on 2026-08-22 are grandfathered via
// state/rule0-baseline.txt. Flagging all of them at once would be alarm fatigue, the failure mode
// this OS guards hardest, and it would bury the one new file that actually matters.
function checkRule0 () {
  if (!existsSync(MEM_DIR)) return
  const baselineFile = `${STATE}/rule0-baseline.txt`
  if (!existsSync(baselineFile)) { warn('rule-0', `no baseline at ${baselineFile} — Rule 0 cannot distinguish new memories from grandfathered ones`); return }

  const baseline = new Set(readFileSync(baselineFile, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean))
  if (!baseline.size) { warn('rule-0', 'baseline file is empty — every memory would read as new'); return }

  const files = readdirSync(MEM_DIR).filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
  const offenders = []
  for (const f of files) {
    if (baseline.has(f)) continue                       // grandfathered
    const text = readFileSync(join(MEM_DIR, f), 'utf8')
    if (!/^enforced_by:/m.test(text)) offenders.push(f)
  }

  if (offenders.length) {
    red('rule-0', `${offenders.length} memory file(s) added since the baseline with no enforced_by::\n    ` +
      offenders.map(f => `· ${f}`).join('\n    ') +
      `\n    RULE 0: an incident produces a CHECK, or it produces nothing. Add either\n` +
      `      enforced_by: hooks/<hook>.mjs (or a checks.sh / os-lint rule)\n` +
      `      enforced_by: none — <why this genuinely cannot be mechanised>\n` +
      `    A rule nobody can fail is a rule that has never fired. If it cannot be a check, consider\n` +
      `    whether it should be a bug-ledger row instead of a standing rule.`)
  } else {
    const newCount = files.filter(f => !baseline.has(f)).length
    ok('rule-0', newCount
      ? `${newCount} memory file(s) added since baseline, all naming an enforced_by`
      : `no new memory files since the baseline (${baseline.size} grandfathered)`)
  }
}

checkRule0()
checkHookSelfTests()
checkHooks()
// NOTE, 2026-09-15: checkGatesFired reads LOG (still the Vault's LOG.md, unchanged, since that file
// still exists) for evidence the 4 tracked gates fired in the last 5 session entries. Going forward,
// nothing appends new entries there (the repo replaced the Vault as system of record — see
// coachapp/docs/decisions.md's 2026-09-15 entry), so this check will most likely start reporting all
// 4 gates as stale within the next several sessions, once the real "last 5" window ages past the
// migration date. RETIRED 2026-09-15 per an external audit's recommendation: waiting for it to
// decay into permanent, meaningless RED is worse than retiring it deliberately now. No replacement
// mechanism was built for evidencing these gates fired from the repo side — that's a real gap, not
// papered over, just no longer masquerading as a working check.
// checkGatesFired()
// NOTE: this means --self-test now reports 'gates-fired' as DECORATIVE (its spec, further down,
// was left untouched rather than removed — deliberately: touching the self-test's own verification
// array is treated as a higher-risk edit than commenting out a Run-section call, and this project's
// own tooling agreed when it refused that exact edit earlier the same session). Read DECORATIVE
// here as "intentionally retired," not "found broken and ignored" — the comment above is the record
// of that distinction for whoever reads the self-test output next.
checkClaudeMd()
checkStalePredictions()

const reds = findings.filter(f => f.severity === 'RED')

if (REPORT) {
  console.log('\n=== os-lint report ===')
  for (const p of passed)   console.log(`  GREEN  ${p.check.padEnd(18)} ${p.msg}`)
  for (const f of findings) console.log(`  ${f.severity.padEnd(5)}  ${f.check.padEnd(18)} ${f.msg}`)
  console.log(`\n${reds.length} RED / ${findings.length - reds.length} WARN / ${passed.length} GREEN\n`)
} else if (findings.length) {
  console.log('🔴 OS-LINT — the operating system has decayed. Fix these before feature work:\n')
  for (const f of findings) console.log(`  [${f.severity}] ${f.check}\n    ${f.msg}\n`)
}

process.exit(0)   // never block the session — speak loudly, but never stop Jake working
