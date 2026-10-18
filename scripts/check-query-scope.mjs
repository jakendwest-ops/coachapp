#!/usr/bin/env node
/**
 * checks.sh rule 2 — unscoped queries on multi-tenant tables.
 *
 * This is the project's most-shipped bug class (four separate solo/coach_id scoping bugs), and until
 * 2026-08-25 the gate that covered it could only ever WARN. Flipping the old shell version to fail
 * was the plan; measuring it first is what stopped that being a disaster.
 *
 * WHAT THE MEASUREMENT FOUND (2026-08-25). The shell rule had three sub-checks. Run against a clean
 * tree they reported four "violations" — every one a FALSE POSITIVE — and one of them could never
 * have fired at all:
 *
 *   sub-check 1 (clients)   VACUOUS. It required `select('*')` near a from('clients') AND that NO
 *                           clients query anywhere in js/ had coach_id within 5 lines. There are 40
 *                           such occurrences, so the second condition was permanently false. The
 *                           check had never been able to fire and never would.
 *   sub-checks 2 & 3        Single-LINE greps against a codebase that chains across lines:
 *                             db.from('programs').select('id')
 *                               .eq('coach_id', currentUser.id)      <- the anchor, on the next line
 *                           Correctly-scoped code was flagged; the anchor was simply out of view.
 *
 * So flipping the shell rule to `fail` would have blocked every push with four refusals of correct
 * code — the false-refusal class this OS keeps shipping, on the rule most likely to then be disabled.
 *
 * Same lesson and same remedy as rules 9a (check-pii-logs.mjs) and 9d (check-escaping.mjs): a rule
 * whose subject spans more than one line cannot live in a line-oriented grep. Read the whole chained
 * expression, then decide.
 *
 * WHAT COUNTS AS SCOPED. Any filter that ties the row to a tenant, or to an entity whose ownership is
 * established elsewhere. Deliberately generous, because a guard's real risk here is refusing the
 * legitimate user: this fires only on a chain with NO anchor of any kind — the shape that would
 * return every coach's rows if RLS ever slipped.
 *
 * `.or(...)` is a first-class anchor, NOT a fallback. `.eq('coach_id', uid)` silently EXCLUDES the
 * solo record (solo's coach_id is NULL) and `.or('coach_id.eq.<uid>,user_id.eq.<uid>')` is the
 * project's prescribed solo-safe form. A rule that accepted only `.eq('coach_id')` would push new
 * code straight into the four-times-shipped solo bug — the gate would manufacture the class it exists
 * to prevent.
 *
 * KNOWN LIMITS (named): a bare .eq('id', x) anchors on every table (a fetch by primary key is the shape the ownership helpers use), so a client-supplied
 * id is only as safe as the helper that vetted it; an insert payload built in a variable is judged by the code between its definition and the query,
 * so an unrelated { client_id } in between would anchor it; the file list is the nine modules in scripts/checks.sh.
 *
 * Usage: node scripts/check-query-scope.mjs js/a.js js/b.js …   (exit 1 = findings, printed to stdout)
 */

import { readFileSync, existsSync } from 'node:fs'
import { collectChain, isCommentLine } from './lib/chains.mjs'
import { blankComments } from './lib/comments.mjs'


// The tenant-owned tables. The original rule covered the first three and was deliberately NOT widened in the
// same change that flipped it to a hard failure (widening the subject and raising the severity at once is how
// a gate becomes a wall). WIDENED 2026-10-18 to every table that holds one person's data, after measuring the
// wider rule on the real tree first: 231 queries on the 22 other tables, 45 open under the old anchors, 8 left
// once the three real rule gaps below were fixed, each of those a read that RLS scopes on purpose (SCOPE-OK).
const ORIGINAL_TABLES = ['clients', 'workout_templates', 'programs']
const TENANT_TABLES = [
  ...ORIGINAL_TABLES,
  'client_1rms', 'client_check_ins', 'client_program_blocks', 'client_program_workouts', 'client_programs',
  'events', 'goal_check_ins', 'goal_milestones', 'goals', 'performance_logs', 'profiles',
  'program_phase_workouts', 'program_phases', 'weight_logs',
  'workout_log_exercises', 'workout_log_sets', 'workout_logs', 'workout_template_exercises'
]
// Queried on purpose WITHOUT an anchor, each for a stated reason. A table in NEITHER list is a finding: a newly queried table must be decided
// (anchor it, or say here why it needs none) - otherwise it silently falls out of scope, which is the "3 of 25 tables" gap this widening closed.
const EXCLUDED_TABLES = {
  exercises: 'a library readable by design (global and per-coach rows)',
  coach_branding: 'one row per coach; RLS returns the caller\'s own (a client reads their coach\'s)',
  app_errors: 'the owner\'s own error console; RLS is owner-only',
  coach_client_summary: 'a security_invoker view: RLS scopes it to the calling coach, and it has no column to anchor on',
}

// Columns that anchor a row to a tenant, or to an entity whose ownership is verified upstream by the
// _verifyXOwnership helpers. `id` counts: a fetch by primary key is the shape those helpers use.
const BASE_ANCHORS = [
  'coach_id', 'client_id', 'user_id', 'id',
  'program_id', 'phase_id', 'generated_from_phase_id', 'template_id'
]
// CHILD-ROW keys (a set belongs to a logged exercise, a milestone to a goal ...): the parent was scoped by its own query, and RLS checks the whole
// chain. Same reasoning as `program_id`/`template_id`. They apply to the NEWLY covered tables only, so a `clients` query filtered by `goal_id` is
// not accepted as anchored just because the list grew.
const CHILD_ANCHORS = [
  'log_id', 'workout_log_id', 'log_exercise_id', 'workout_log_exercise_id', 'goal_id', 'client_program_id',
  'program_phase_id', 'phase_workout_id', 'program_phase_workout_id', 'workout_template_id', 'template_exercise_id', 'milestone_id'
]
const anchorsFor = (table) => ORIGINAL_TABLES.includes(table) ? BASE_ANCHORS : [...BASE_ANCHORS, ...CHILD_ANCHORS]

// A read that is deliberately left to row-level security (the coach's calendar spans every client, so it has no client to filter on) says so, in
// words, on or just above the query.
const WAIVER = /SCOPE-OK:\s*\S[^\n]{10,}/
// How many unanchored reads may be waived in one run. Pinned AT today's one (the coach calendar's read of `events`), not above it: a waiver is a
// permit, and a cap set higher than the measurement is how a permit becomes a habit. It lives here, not in count-baseline.json, because a waiver is
// a comment and that ratchet counts code with comments stripped. A waiver on a query that IS anchored is stale and is itself a finding, so the
// permit shrinks when the read is fixed. Raising the cap is a deliberate edit with a reason in the commit.
const MAX_WAIVERS = 1

// A column may be filtered through an embedded relation: .eq('workout_logs.client_id', cid) restricts the parent
// rows of an !inner join, so the dotted form anchors exactly like the bare one.
const COL = (col) => `(?:[a-z_]+\\.)*${col}`

/** Find the code that built a payload variable (insert(rows)) by looking back to its definition. */
function payloadText (lines, i, ident) {
  const def = new RegExp(`(?:\\b(?:const|let|var)\\s+${ident}\\b|\\b${ident}\\s*=[^=>])`)
  for (let k = i; k >= Math.max(0, i - 150); k--) {
    if (def.test(lines[k])) return lines.slice(k, i + 1).join('\n')
  }
  return ''
}

/** Every `.or('a.eq.x,b.eq.y')` filter in the chain, as its list of clauses. */
function orClauses (chain) {
  const out = []
  for (const m of chain.matchAll(/\.or\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
    const clauses = []; let depth = 0, cur = ''
    for (const ch of m[2]) {
      if (ch === '(') depth++
      if (ch === ')') depth--
      if (ch === ',' && depth === 0) { clauses.push(cur.trim()); cur = '' } else cur += ch
    }
    clauses.push(cur.trim())
    out.push(clauses)
  }
  return out
}

const files = process.argv.slice(2).filter(f => existsSync(f))
const findings = []
let waiversUsed = 0

for (const file of files) {
  const rawText = readFileSync(file, 'utf8')
  // `lines` is the code with comments blanked (same lines, same offsets): a trailing `// .eq('coach_id', uid)` is not an anchor and a `{ client_id }` named in
  // a comment does not anchor an insert. The waiver lives in a comment, so it is read from the raw lines.
  const rawLines = rawText.split(/\r?\n/)
  const lines = blankComments(rawText).split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    // `db.from('t')` on one line, or `db` at the end of a line and `.from('t')` at the start of the next (9 such calls exist in js/).
    let m = lines[i].match(/db\s*\.\s*from\(\s*['"]([a-z_0-9]+)['"]\s*\)/)
    let startAt = m ? lines[i].indexOf(m[0]) : -1
    if (!m && /\bdb\s*$/.test(lines[i]) && lines[i + 1]) {
      const m2 = lines[i + 1].match(/^\s*\.from\(\s*['"]([a-z_0-9]+)['"]\s*\)/)
      if (m2) { m = m2; startAt = lines[i].search(/\bdb\s*$/) }
    }
    if (!m) continue
    const table = m[1]
    if (EXCLUDED_TABLES[table]) continue

    // Comment lines describe queries, they do not run them. Matching them is how a rule ends up
    // refusing its own documentation.
    if (isCommentLine(lines[i])) continue

    if (!TENANT_TABLES.includes(table)) {
      findings.push({ file, line: i + 1, table, chain: `the table "${table}" is in neither TENANT_TABLES nor EXCLUDED_TABLES in scripts/check-query-scope.mjs: decide which, and say why` })
      continue
    }

    // The multi-line chain walker moved to scripts/lib/chains.mjs on 2026-09-04, unchanged, when a
    // third rule needed it. See that file for why a line-oriented grep cannot do this job.
    const chain = collectChain(lines, i, startAt)

    // An INSERT carries no filters by design — it is anchored by the tenant column in its PAYLOAD.
    // Requiring `.eq()` on an insert would refuse every correct write in the codebase, which is
    // precisely what the first run of this checker did (11 findings, all of them legitimate).
    const isInsert = /\.(insert|upsert)\(/.test(chain)

    // insert(rows) / upsert(row): the payload was built above. Read how, and let ITS keys be the anchor.
    const payloadVar = chain.match(/\.(?:insert|upsert)\(\s*([A-Za-z_$][\w$]*)\s*[,)]/)?.[1]
    const built = payloadVar ? payloadText(lines, i, payloadVar) : ''

    const ANCHORS = anchorsFor(table)
    // A DOTTED filter (.eq('clients.coach_id', uid)) restricts the PARENT rows only through an !inner embed; on a plain embed it filters just the embedded
    // object and leaves every parent row. So it counts as an anchor only when the select says !inner - or is a constant (the five real uses build theirs from one).
    const innerOk = /!inner/.test(chain) || /\.select\(\s*[A-Za-z_$]/.test(chain)
    const anchoredByColumn = ANCHORS.some(col =>
      // .eq('coach_id', …) / .in('id', …) / .is('program_id', null) — a filter on an anchor column. (.neq and .not are NOT anchors: they exclude
      // one value, they do not scope to a tenant.)
      new RegExp(`\\.(eq|in|is)\\(\\s*['"]${col}['"]`).test(chain) ||
      (innerOk && new RegExp(`\\.(eq|in|is)\\(\\s*['"][a-z_]+\\.${COL(col)}['"]`).test(chain)) ||
      // .match({ client_id: … }) — the object form of the same filters
      new RegExp(`\\.match\\(\\s*\\{[^}]*\\b${col}\\b`).test(chain) ||
      // insert({ coach_id: …, client_id } ) — the payload IS the anchor (a key, or object shorthand)
      (isInsert && new RegExp(`[{,]\\s*${col}\\s*[:,}]`).test(chain)) ||
      // insert(rows) where rows was built a few lines up with the anchor in it
      (isInsert && built && new RegExp(`[{,]\\s*${col}\\s*[:,}]`).test(built))
    )
    // .or('coach_id.eq.x,user_id.eq.x') — PostgREST filter syntax inside a single string argument. EVERY clause must be an anchor: an OR with an
    // unrelated branch ('client_id.eq.x,status.eq.active') matches rows outside the tenant.
    const anchoredByOr = orClauses(chain).some(clauses => clauses.length > 0 && clauses.every(c => ANCHORS.some(col => new RegExp(`^${col}\\.(eq|in|is)\\.`).test(c))))
    const anchored = anchoredByColumn || anchoredByOr

    // SCOPE-OK: <reason> on the query's line or the three above it - and only if no OTHER query sits between the comment and this one (a waiver
    // belongs to the first query after it; without this a waiver leaked onto the next, anchored, query two lines down).
    let waiverAt = -1
    for (let k = i; k >= Math.max(0, i - 3); k--) if (WAIVER.test(rawLines[k] ?? '')) { waiverAt = k; break }
    const waived = waiverAt !== -1 && !lines.slice(waiverAt + 1, i).some(l => /\.from\(\s*['"]/.test(l))
    if (waived && anchored) { findings.push({ file, line: i + 1, table, chain: 'has a SCOPE-OK waiver but IS anchored: delete the stale waiver (a permit must shrink when the read is fixed)' }); continue }
    if (waived && !anchored) { waiversUsed++; continue }

    if (!anchored) {
      findings.push({ file, line: i + 1, table, chain: chain.slice(0, 160) })
    }
  }
}

if (waiversUsed > MAX_WAIVERS) {
  findings.push({ file: `${waiversUsed} SCOPE-OK waivers (the cap is ${MAX_WAIVERS})`, line: 0, table: '*', chain: 'raising MAX_WAIVERS in scripts/check-query-scope.mjs is a deliberate edit; anchor the new read instead of waiving it.' })
}

if (!findings.length) {
  console.log(`  Every query on the ${TENANT_TABLES.length} tenant tables carries an ownership anchor (${waiversUsed} read(s) waived with a stated reason; ${Object.keys(EXCLUDED_TABLES).length} tables excluded on purpose).`)
  process.exit(0)
}

for (const f of findings) {
  console.log(`    ${f.file}:${f.line}  from('${f.table}') — ${f.chain.startsWith('has a') || f.chain.startsWith('the table') || f.chain.startsWith('raising') ? f.chain : 'no ownership anchor'}`)
  if (!(f.chain.startsWith('has a') || f.chain.startsWith('the table') || f.chain.startsWith('raising'))) console.log(`      ${f.chain}`)
}
console.log('')
console.log(`  An anchor is any filter on: ${BASE_ANCHORS.join(', ')} (and, on the newer tables, the child-row keys ${CHILD_ANCHORS.join(', ')}).`)
console.log('  For anything that must also see the SOLO record, use the .or() form —')
console.log("  .or(`coach_id.eq.${uid},user_id.eq.${uid}`) — never a bare .eq('coach_id'),")
console.log("  which silently excludes solo (solo's coach_id is NULL).")
process.exit(1)
